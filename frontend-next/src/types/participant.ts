
// types/participant.ts

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'critical' | 'disconnected';

export interface EngineParticipant {
  id: string;
  displayName: string;
  role: 'host' | 'co_host' | 'guest';
  isLocal: boolean;
  
  // Media State (S2 Source of Truth)
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSpeaking: boolean;
  volume: number; // 0-100 (Gain applied by Mixer)
  
  // Technical State
  connectionQuality: ConnectionQuality;
  latencyMs: number;
  
  // Tracks (Not serialized over WS, local references only)
  tracks?: {
    audio?: MediaStreamTrack;
    video?: MediaStreamTrack;
  };
}
