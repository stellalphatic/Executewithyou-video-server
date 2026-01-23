'use client';


export interface RecordingConfig {
    mimeType: string;
    videoBitsPerSecond?: number;
    filenamePrefix?: string;
    autoSaveToDisk?: boolean;
}

interface RecorderSession {
    id: string;
    recorder: MediaRecorder;
    chunks: Blob[];
    startTime: number;
    pausedDuration: number;
    lastPauseTime: number | null;
    state: 'recording' | 'paused' | 'inactive';
    config: RecordingConfig;
}

type RecordingCompleteCallback = (blob: Blob, meta: { id: string, filename: string, mimeType: string }) => void;

/**
 * S2 System - Recording Engine
 * Handles Program (Mix) and ISO (Source) recording.
 * Manages MediaRecorder lifecycle and file export.
 */
export class RecordingEngine {
    private sessions: Map<string, RecorderSession> = new Map();
    private completionListeners: Set<RecordingCompleteCallback> = new Set();
    
    // Robust MIME type detection
    private getSupportedMimeType(preferred?: string): string {
        const types = [
            preferred,
            'video/webm; codecs=vp9',
            'video/webm; codecs=vp8',
            'video/webm; codecs=h264',
            'video/webm',
            'video/mp4',
            'video/x-matroska;codecs=avc1'
        ];

        for (const type of types) {
            if (type && MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return '';
    }

    public on(event: 'complete', callback: RecordingCompleteCallback) {
        if (event === 'complete') {
            this.completionListeners.add(callback);
        }
    }

    public off(event: 'complete', callback: RecordingCompleteCallback) {
        if (event === 'complete') {
            this.completionListeners.delete(callback);
        }
    }

    public start(id: string, stream: MediaStream, config: RecordingConfig): boolean {
        if (this.sessions.has(id)) {
            console.warn(`[RecordingEngine] Session ${id} already exists.`);
            return false;
        }

        // Validate Stream
        if (!stream.active || stream.getTracks().length === 0) {
            console.error(`[RecordingEngine] Stream for ${id} is inactive or has no tracks.`);
            return false;
        }

        const mimeType = this.getSupportedMimeType(config.mimeType);
        if (!mimeType) {
            console.error('[RecordingEngine] No supported MIME type found by browser.');
            return false;
        }

        try {
            const recorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: config.videoBitsPerSecond || 5000000 // 5 Mbps default
            });

            const session: RecorderSession = {
                id,
                recorder,
                chunks: [],
                startTime: Date.now(),
                pausedDuration: 0,
                lastPauseTime: null,
                state: 'recording',
                config
            };

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    session.chunks.push(e.data);
                }
            };

            recorder.onerror = (e) => {
                console.error(`[RecordingEngine] Recorder error for ${id}:`, e);
            };

            recorder.onstop = () => {
                this.finalizeRecording(session);
                this.sessions.delete(id);
            };

            // Start recording - capturing chunks every 1000ms ensures data is available if it crashes
            recorder.start(1000); 
            this.sessions.set(id, session);
            console.log(`[RecordingEngine] Started recording ${id} using ${mimeType}`);
            return true;

        } catch (e) {
            console.error(`[RecordingEngine] Failed to start recorder for ${id}`, e);
            return false;
        }
    }

    public stop(id: string) {
        const session = this.sessions.get(id);
        if (session && session.recorder.state !== 'inactive') {
            session.recorder.stop();
            session.state = 'inactive';
        }
    }

    public pause(id: string) {
        const session = this.sessions.get(id);
        if (session && session.recorder.state === 'recording') {
            session.recorder.pause();
            session.state = 'paused';
            session.lastPauseTime = Date.now();
        }
    }

    public resume(id: string) {
        const session = this.sessions.get(id);
        if (session && session.recorder.state === 'paused') {
            session.recorder.resume();
            session.state = 'recording';
            if (session.lastPauseTime) {
                session.pausedDuration += Date.now() - session.lastPauseTime;
                session.lastPauseTime = null;
            }
        }
    }

    public getDuration(id: string): number {
        const session = this.sessions.get(id);
        if (!session) return 0;
        
        let now = Date.now();
        // If currently paused, don't count time since pause start
        if (session.state === 'paused' && session.lastPauseTime) {
            now = session.lastPauseTime;
        }
        return Math.max(0, now - session.startTime - session.pausedDuration);
    }

    public isRecording(id: string): boolean {
        const session = this.sessions.get(id);
        return !!session && session.state !== 'inactive';
    }

    public isPaused(id: string): boolean {
        const session = this.sessions.get(id);
        return !!session && session.state === 'paused';
    }

    private finalizeRecording(session: RecorderSession) {
        if (session.chunks.length === 0) {
            console.warn(`[RecordingEngine] No data recorded for ${session.id}`);
            return;
        }

        const blob = new Blob(session.chunks, { type: session.recorder.mimeType });
        
        // Determine extension based on actual mime type used
        let ext = 'webm';
        if (session.recorder.mimeType.includes('mp4')) ext = 'mp4';
        else if (session.recorder.mimeType.includes('matroska')) ext = 'mkv';
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${session.config.filenamePrefix || 'rec'}-${session.id}-${timestamp}.${ext}`;
        
        // 1. Notify listeners (for Upload Queue)
        if (this.completionListeners.size > 0) {
            this.completionListeners.forEach(cb => cb(blob, {
                id: session.id,
                filename,
                mimeType: session.recorder.mimeType
            }));
        }

        // 2. Auto-save to disk if enabled or no listeners (fallback)
        if (session.config.autoSaveToDisk !== false) {
             // If explicit false is set, skip. Otherwise default to download if no listeners, OR if user requested.
             // For now, let's default to saving unless we add logic to disable it.
             this.downloadBlob(blob, filename);
        }
    }

    private downloadBlob(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        a.click();
        
        // Cleanup
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 100);
        
        console.log(`[RecordingEngine] Exported ${filename} (${blob.size} bytes)`);
    }
}
