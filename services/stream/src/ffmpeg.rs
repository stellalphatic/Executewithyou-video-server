//! FFmpeg process management for transcoding and relaying

use crate::config::Config;
use crate::session::{LayoutConfig, StreamSession};
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};
use uuid::Uuid;

/// Manages FFmpeg processes for streaming
pub struct FfmpegManager {
    config: Config,
    /// Active FFmpeg processes (process_id -> Child)
    processes: RwLock<HashMap<u32, Child>>,
    /// Latest stats from each process (process_id -> stats)
    stats: std::sync::Arc<RwLock<HashMap<u32, FfmpegStats>>>,
}

impl FfmpegManager {
    pub fn new(config: Config) -> Self {
        Self {
            config,
            processes: RwLock::new(HashMap::new()),
            stats: std::sync::Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Spawn an FFmpeg process and start stats collection
    #[allow(dead_code)]
    async fn spawn_with_stats(&self, mut cmd: Command) -> Result<u32> {
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn()?;
        let pid = child.id().ok_or_else(|| anyhow!("Failed to get process ID"))?;

        // Take stderr for stats parsing
        if let Some(stderr) = child.stderr.take() {
            let stats = self.stats.clone();
            tokio::spawn(async move {
                Self::parse_ffmpeg_output(pid, stderr, stats).await;
            });
        }

        let mut processes = self.processes.write().await;
        processes.insert(pid, child);

        Ok(pid)
    }

    /// Parse FFmpeg progress output from stderr
    #[allow(dead_code)]
    async fn parse_ffmpeg_output(
        pid: u32,
        stderr: tokio::process::ChildStderr,
        stats: std::sync::Arc<RwLock<HashMap<u32, FfmpegStats>>>,
    ) {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            // FFmpeg outputs progress like:
            // frame=  123 fps=30.0 q=28.0 size=    1024kB time=00:00:04.10 bitrate=2048.0kbits/s speed=1.00x
            if let Some(parsed) = Self::parse_progress_line(&line) {
                let mut stats_map = stats.write().await;
                stats_map.insert(pid, parsed);
            } else if line.contains("error") || line.contains("Error") {
                warn!(pid = pid, "FFmpeg error: {}", line);
            }
        }

        debug!(pid = pid, "FFmpeg stderr reader ended");
    }

    /// Parse a single FFmpeg progress line
    #[allow(dead_code)]
    fn parse_progress_line(line: &str) -> Option<FfmpegStats> {
        // Only parse lines that look like progress output
        if !line.contains("frame=") && !line.contains("fps=") {
            return None;
        }

        let mut stats = FfmpegStats {
            fps: 0.0,
            bitrate: String::new(),
            speed: 0.0,
            frame: 0,
            time: String::new(),
            size_kb: 0,
        };

        // Parse frame=N
        if let Some(start) = line.find("frame=") {
            let rest = &line[start + 6..];
            if let Some(end) = rest.find(char::is_whitespace) {
                if let Ok(f) = rest[..end].trim().parse() {
                    stats.frame = f;
                }
            }
        }

        // Parse fps=N
        if let Some(start) = line.find("fps=") {
            let rest = &line[start + 4..];
            if let Some(end) = rest.find(char::is_whitespace) {
                if let Ok(f) = rest[..end].trim().parse() {
                    stats.fps = f;
                }
            }
        }

        // Parse size=NkB
        if let Some(start) = line.find("size=") {
            let rest = &line[start + 5..];
            if let Some(end) = rest.find("kB") {
                if let Ok(s) = rest[..end].trim().parse() {
                    stats.size_kb = s;
                }
            }
        }

        // Parse time=HH:MM:SS.ss
        if let Some(start) = line.find("time=") {
            let rest = &line[start + 5..];
            if let Some(end) = rest.find(char::is_whitespace) {
                stats.time = rest[..end].trim().to_string();
            }
        }

        // Parse bitrate=NNNkbits/s
        if let Some(start) = line.find("bitrate=") {
            let rest = &line[start + 8..];
            if let Some(end) = rest.find("kbits/s") {
                stats.bitrate = format!("{}kbps", rest[..end].trim());
            }
        }

        // Parse speed=Nx
        if let Some(start) = line.find("speed=") {
            let rest = &line[start + 6..];
            if let Some(end) = rest.find('x') {
                if let Ok(s) = rest[..end].trim().parse() {
                    stats.speed = s;
                }
            }
        }

        // Only return if we parsed something meaningful
        if stats.frame > 0 || stats.fps > 0.0 {
            Some(stats)
        } else {
            None
        }
    }

    /// Start HLS transcoding from RTMP input
    pub async fn start_hls_transcoding(
        &self,
        room_id: Uuid,
        stream_key: &str,
    ) -> Result<u32> {
        let hls_dir = self.config.hls_output_dir.join(room_id.to_string());
        std::fs::create_dir_all(&hls_dir)?;

        let playlist_path = hls_dir.join("playlist.m3u8");
        let segment_pattern = hls_dir.join("segment%03d.ts");

        // Build FFmpeg command for HLS output
        let mut cmd = Command::new(&self.config.ffmpeg_path);
        cmd.args([
            // Input from RTMP
            "-i",
            &format!("rtmp://localhost:{}/live/{}", self.config.rtmp_port, stream_key),
            // Video encoding
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-tune", "zerolatency",
            "-b:v", &format!("{}k", self.config.max_bitrate),
            "-maxrate", &format!("{}k", self.config.max_bitrate),
            "-bufsize", &format!("{}k", self.config.max_bitrate * 2),
            "-g", "60",
            // Audio encoding
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", "44100",
            // HLS output
            "-f", "hls",
            "-hls_time", &self.config.segment_duration.to_string(),
            "-hls_list_size", &self.config.playlist_size.to_string(),
            "-hls_flags", "delete_segments+append_list",
            "-hls_segment_filename", segment_pattern.to_str().unwrap(),
            playlist_path.to_str().unwrap(),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

        let child = cmd.spawn()?;
        let pid = child.id().ok_or_else(|| anyhow!("Failed to get process ID"))?;

        info!("Started HLS transcoding for room {} (pid: {})", room_id, pid);

        let mut processes = self.processes.write().await;
        processes.insert(pid, child);

        Ok(pid)
    }

    /// Start RTMP relay to a destination
    pub async fn start_destination_relay(
        &self,
        room_id: Uuid,
        stream_key: &str,
        destination_rtmp_url: &str,
        destination_stream_key: &str,
    ) -> Result<u32> {
        let output_url = format!("{}/{}", destination_rtmp_url.trim_end_matches('/'), destination_stream_key);

        // Build FFmpeg command for RTMP relay
        let mut cmd = Command::new(&self.config.ffmpeg_path);
        cmd.args([
            // Input from local RTMP
            "-i",
            &format!("rtmp://localhost:{}/live/{}", self.config.rtmp_port, stream_key),
            // Copy streams (no re-encoding for relay)
            "-c", "copy",
            // RTMP output
            "-f", "flv",
            &output_url,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

        let child = cmd.spawn()?;
        let pid = child.id().ok_or_else(|| anyhow!("Failed to get process ID"))?;

        info!(
            "Started RTMP relay for room {} to {} (pid: {})",
            room_id, destination_rtmp_url, pid
        );

        let mut processes = self.processes.write().await;
        processes.insert(pid, child);

        Ok(pid)
    }

    /// Start compositing FFmpeg process with layout
    pub async fn start_compositor(
        &self,
        room_id: Uuid,
        _layout: &LayoutConfig,
        input_streams: Vec<String>,
    ) -> Result<u32> {
        if input_streams.is_empty() {
            return Err(anyhow!("No input streams provided"));
        }

        // Build FFmpeg filter complex for compositing
        // This is a simplified version - real implementation would build complex filter graphs
        let mut cmd = Command::new(&self.config.ffmpeg_path);
        
        // Add all inputs
        for stream in &input_streams {
            cmd.args(["-i", stream]);
        }

        // Build filter graph based on number of inputs
        let filter = match input_streams.len() {
            1 => "null".to_string(),
            2 => "hstack=inputs=2".to_string(),
            3 | 4 => {
                // 2x2 grid
                "[0:v][1:v]hstack=inputs=2[top];[2:v][3:v]hstack=inputs=2[bottom];[top][bottom]vstack=inputs=2".to_string()
            }
            _ => {
                // For more inputs, use xstack (requires recent FFmpeg)
                let _cols = (input_streams.len() as f64).sqrt().ceil() as usize;
                format!("xstack=inputs={}:layout=", input_streams.len()) // Simplified
            }
        };

        cmd.args([
            "-filter_complex", &filter,
            // Output settings
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-tune", "zerolatency",
            "-b:v", &format!("{}k", self.config.max_bitrate),
            "-c:a", "aac",
            "-b:a", "128k",
            // Output to RTMP for further processing
            "-f", "flv",
            &format!("rtmp://localhost:{}/live/composed_{}", self.config.rtmp_port, room_id),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

        let child = cmd.spawn()?;
        let pid = child.id().ok_or_else(|| anyhow!("Failed to get process ID"))?;

        info!("Started compositor for room {} (pid: {})", room_id, pid);

        let mut processes = self.processes.write().await;
        processes.insert(pid, child);

        Ok(pid)
    }

    /// Start recording to file
    pub async fn start_recording(
        &self,
        room_id: Uuid,
        stream_key: &str,
        output_path: &str,
    ) -> Result<u32> {
        let mut cmd = Command::new(&self.config.ffmpeg_path);
        cmd.args([
            "-i",
            &format!("rtmp://localhost:{}/live/{}", self.config.rtmp_port, stream_key),
            // Record with good quality
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            output_path,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

        let child = cmd.spawn()?;
        let pid = child.id().ok_or_else(|| anyhow!("Failed to get process ID"))?;

        info!("Started recording for room {} (pid: {})", room_id, pid);

        let mut processes = self.processes.write().await;
        processes.insert(pid, child);

        Ok(pid)
    }

    /// Stop a specific FFmpeg process
    pub async fn stop_process(&self, pid: u32) -> Result<()> {
        let mut processes = self.processes.write().await;
        if let Some(mut child) = processes.remove(&pid) {
            info!("Stopping FFmpeg process (pid: {})", pid);
            child.kill().await?;
        }
        // Clear stats for this process
        self.clear_stats(pid).await;
        Ok(())
    }

    /// Stop all processes for a room
    pub async fn stop_all_for_room(&self, session: &StreamSession) -> Result<()> {
        // Stop ingest process
        if let Some(pid) = session.ingest_process_id {
            self.stop_process(pid).await?;
        }

        // Stop all destination relays
        for dest in session.destinations.values() {
            if let Some(pid) = dest.process_id {
                self.stop_process(pid).await?;
            }
        }

        Ok(())
    }

    /// Check if a process is still running
    pub async fn is_running(&self, pid: u32) -> bool {
        let processes = self.processes.read().await;
        if let Some(_child) = processes.get(&pid) {
            // Try to get status without blocking
            // If we can't, assume it's running
            true
        } else {
            false
        }
    }

    /// Get FFmpeg stats for a process
    pub async fn get_stats(&self, pid: u32) -> Option<FfmpegStats> {
        let stats = self.stats.read().await;
        stats.get(&pid).cloned()
    }

    /// Get all stats for active processes
    pub async fn get_all_stats(&self) -> HashMap<u32, FfmpegStats> {
        let stats = self.stats.read().await;
        stats.clone()
    }

    /// Clear stats for a stopped process
    async fn clear_stats(&self, pid: u32) {
        let mut stats = self.stats.write().await;
        stats.remove(&pid);
    }
}

#[derive(Debug, Clone, Default)]
pub struct FfmpegStats {
    pub fps: f32,
    pub bitrate: String,
    pub speed: f32,
    pub frame: u64,
    pub time: String,
    pub size_kb: u64,
}

impl FfmpegStats {
    /// Check if the stream is healthy (encoding in real-time or faster)
    pub fn is_healthy(&self) -> bool {
        self.speed >= 0.9 && self.fps > 0.0
    }

    /// Get estimated total bytes output
    pub fn total_bytes(&self) -> u64 {
        self.size_kb * 1024
    }
}
