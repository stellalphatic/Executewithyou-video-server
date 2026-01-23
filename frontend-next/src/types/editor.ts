
export type TrackType = 'video' | 'audio' | 'text' | 'overlay' | 'graphics';

export interface Keyframe {
    id: string;
    time: number; // Relative to clip start in seconds
    value: number;
    easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bezier';
}

export interface Transformation {
    x: number; // %
    y: number; // %
    scale: number; // %
    rotation: number; // degrees
    opacity: number; // 0-1
    crop?: { top: number; bottom: number; left: number; right: number };
}

export interface AudioProperties {
    volume: number; // 0-1
    pan: number; // -1 to 1
    muted: boolean;
}

export interface Clip {
    id: string;
    trackId: string;
    assetId: string; // Reference to source media
    name: string;
    type: TrackType;
    
    // Timing (Seconds)
    start: number; // Position on timeline
    duration: number; // Length on timeline
    offset: number; // Start point within the source media
    
    // Visual Properties
    transform: Transformation;
    
    // Audio Properties
    audio: AudioProperties;
    
    // State
    isSelected?: boolean;
    isLinked?: boolean; // Linked audio/video
    
    // Color/Label
    color?: string;
}

export interface Track {
    id: string;
    type: TrackType;
    name: string;
    isMuted: boolean;
    isSolo: boolean;
    isLocked: boolean;
    height: number;
    clips: string[]; // Array of Clip IDs (Reference)
    volume: number; // Master track volume
    pan: number;
}

export interface EditorState {
    tracks: Track[];
    clips: Record<string, Clip>; // Normalized data
    
    // Global Timeline State
    currentTime: number; // Playhead position in seconds
    duration: number; // Total project duration
    zoom: number; // Pixels per second
    scrollX: number;
    
    // Selection
    selectedClipIds: string[];
    
    // Playback
    isPlaying: boolean;
    playbackRate: number;
    
    // Tools & UX
    activeTool: 'select' | 'razor' | 'slip' | 'slide' | 'hand' | 'zoom';
    snappingEnabled: boolean;
    
    // Meta
    version: number;
}

export interface HistoryState {
    past: EditorState[];
    present: EditorState;
    future: EditorState[];
}
