'use client';


/**
 * S2 System - Audio Engine
 * Handles client-side mixing using Web Audio API.
 * This runs locally on the Host's machine.
 */
export class MixerEngine {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private compressor: DynamicsCompressorNode;
  private destination: MediaStreamAudioDestinationNode;
  
  // Track sources by Participant ID
  private sources: Map<string, {
    sourceNode: MediaStreamAudioSourceNode;
    gainNode: GainNode;
    analyserNode: AnalyserNode;
  }> = new Map();

  constructor() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // 1. Create Master Chain
    this.masterGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.destination = this.ctx.createMediaStreamDestination();

    // 2. Configure Chain: Master Gain -> Compressor (Limiter) -> WebRTC/Recorder Destination
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.destination);
    
    // Compressor Settings for Broadcast Quality
    this.compressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
  }

  public getMixedStream(): MediaStream {
    return this.destination.stream;
  }

  public async addSource(participantId: string, stream: MediaStream) {
    if (this.sources.has(participantId)) return;

    // Wait for stream to be active
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    const sourceNode = this.ctx.createMediaStreamSource(stream);
    const gainNode = this.ctx.createGain();
    const analyserNode = this.ctx.createAnalyser();
    
    analyserNode.fftSize = 64;

    // Chain: Source -> Gain -> Analyser -> Master
    sourceNode.connect(gainNode);
    gainNode.connect(analyserNode);
    gainNode.connect(this.masterGain);

    this.sources.set(participantId, {
      sourceNode,
      gainNode,
      analyserNode
    });
  }

  public removeSource(participantId: string) {
    const source = this.sources.get(participantId);
    if (source) {
      source.gainNode.disconnect();
      source.sourceNode.disconnect();
      this.sources.delete(participantId);
    }
  }

  public setVolume(participantId: string, level: number) {
    const source = this.sources.get(participantId);
    if (source) {
      // Smooth transition to prevent clicking
      source.gainNode.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
    }
  }

  public setMasterVolume(level: number) {
    this.masterGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
  }

  // Returns current levels for visualization loop
  public getLevels(): Record<string, number> {
    const levels: Record<string, number> = {};
    const dataArray = new Uint8Array(64);

    this.sources.forEach((node, id) => {
      node.analyserNode.getByteFrequencyData(dataArray);
      // Simple RMS-like average
      const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
      levels[id] = avg;
    });

    return levels;
  }
}
