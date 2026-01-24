//! Configuration for the Stream service

use anyhow::Result;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub rtmp_port: u16,
    pub hls_output_dir: PathBuf,
    pub ffmpeg_path: String,
    pub segment_duration: u32,
    pub playlist_size: u32,
    pub core_service_url: String,
    pub storage_service_url: String,
    pub max_bitrate: u32,
    pub default_resolution: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            port: std::env::var("STREAM_PORT")
                .unwrap_or_else(|_| "8083".to_string())
                .parse()?,
            rtmp_port: std::env::var("RTMP_PORT")
                .unwrap_or_else(|_| "1935".to_string())
                .parse()?,
            hls_output_dir: PathBuf::from(
                std::env::var("HLS_OUTPUT_DIR").unwrap_or_else(|_| "/tmp/allstrm/hls".to_string()),
            ),
            ffmpeg_path: std::env::var("FFMPEG_PATH").unwrap_or_else(|_| "ffmpeg".to_string()),
            segment_duration: std::env::var("HLS_SEGMENT_DURATION")
                .unwrap_or_else(|_| "2".to_string())
                .parse()?,
            playlist_size: std::env::var("HLS_PLAYLIST_SIZE")
                .unwrap_or_else(|_| "6".to_string())
                .parse()?,
            core_service_url: std::env::var("CORE_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:8081".to_string()),
            storage_service_url: std::env::var("STORAGE_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:8084".to_string()),
            max_bitrate: std::env::var("MAX_BITRATE")
                .unwrap_or_else(|_| "6000".to_string())
                .parse()?,
            default_resolution: std::env::var("DEFAULT_RESOLUTION")
                .unwrap_or_else(|_| "1920x1080".to_string()),
        })
    }
}
