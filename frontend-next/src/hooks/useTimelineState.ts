'use client';


import { useReducer, useCallback, useRef, useEffect } from 'react';
import { EditorState, Clip, Track, TrackType } from '../types/editor';

// --- Constants ---
const MIN_CLIP_DURATION = 0.5; // seconds
const DEFAULT_TRACK_HEIGHT = 80;
const SNAP_THRESHOLD_PX = 15;

// --- Actions ---
type Action = 
    | { type: 'SET_PLAYHEAD'; time: number }
    | { type: 'TOGGLE_PLAYBACK' }
    | { type: 'SET_ZOOM'; zoom: number }
    | { type: 'SELECT_CLIP'; id: string; multi: boolean }
    | { type: 'DESELECT_ALL' }
    | { type: 'UPDATE_CLIP_PROP'; id: string; prop: string; value: any }
    | { type: 'UPDATE_CLIP_TRANSFORM'; id: string; transform: any }
    | { type: 'MOVE_CLIP'; id: string; newStart: number; newTrackId?: string }
    | { type: 'RESIZE_CLIP'; id: string; edge: 'left' | 'right'; newTime: number } // newTime is absolute timeline time
    | { type: 'SPLIT_CLIP'; }
    | { type: 'DELETE_SELECTED' }
    | { type: 'ADD_TRACK'; trackType: TrackType }
    | { type: 'TOGGLE_TRACK_MUTE'; trackId: string }
    | { type: 'TOGGLE_TRACK_SOLO'; trackId: string }
    | { type: 'UNDO' }
    | { type: 'REDO' };

// --- Initial State ---
const INITIAL_STATE: EditorState = {
    tracks: [
        { id: 't1', type: 'video', name: 'Video 1', isMuted: false, isSolo: false, isLocked: false, height: 80, clips: ['c1'], volume: 1, pan: 0 },
        { id: 't2', type: 'video', name: 'Video 2', isMuted: false, isSolo: false, isLocked: false, height: 80, clips: ['c2'], volume: 1, pan: 0 },
        { id: 't3', type: 'audio', name: 'Audio 1', isMuted: false, isSolo: false, isLocked: false, height: 60, clips: ['c3'], volume: 1, pan: 0 },
    ],
    clips: {
        'c1': { 
            id: 'c1', trackId: 't1', assetId: 'a1', name: 'Interview_CamA.mp4', type: 'video', 
            start: 0, duration: 15, offset: 0, 
            transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 1 }, 
            audio: { volume: 1, pan: 0, muted: false },
            color: 'bg-indigo-600'
        },
        'c2': { 
            id: 'c2', trackId: 't2', assetId: 'a2', name: 'B-Roll_City.mp4', type: 'video', 
            start: 5, duration: 4, offset: 0, 
            transform: { x: 50, y: -20, scale: 40, rotation: 0, opacity: 1 }, 
            audio: { volume: 1, pan: 0, muted: true },
            color: 'bg-blue-600'
        },
        'c3': { 
            id: 'c3', trackId: 't3', assetId: 'a3', name: 'Background_Music.mp3', type: 'audio', 
            start: 0, duration: 30, offset: 0, 
            transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, 
            audio: { volume: 0.5, pan: 0, muted: false },
            color: 'bg-emerald-600'
        },
    },
    currentTime: 0,
    duration: 60,
    zoom: 50, // Pixels per second
    scrollX: 0,
    selectedClipIds: [],
    isPlaying: false,
    playbackRate: 1,
    activeTool: 'select',
    snappingEnabled: true,
    version: 0
};

// --- History Reducer ---
interface HistoryWrapper {
    past: EditorState[];
    present: EditorState;
    future: EditorState[];
}

const historyReducer = (state: HistoryWrapper, action: Action): HistoryWrapper => {
    const { past, present, future } = state;

    // Actions that do NOT trigger a history save (transient UI states)
    if (['SET_PLAYHEAD', 'TOGGLE_PLAYBACK', 'SET_ZOOM', 'SELECT_CLIP', 'DESELECT_ALL'].includes(action.type)) {
        return { ...state, present: editorReducer(present, action) };
    }

    if (action.type === 'UNDO') {
        if (past.length === 0) return state;
        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        return { past: newPast, present: previous, future: [present, ...future] };
    }

    if (action.type === 'REDO') {
        if (future.length === 0) return state;
        const next = future[0];
        const newFuture = future.slice(1);
        return { past: [...past, present], present: next, future: newFuture };
    }

    // Default: Push to history
    const newPresent = editorReducer(present, action);
    if (newPresent === present) return state;
    
    return {
        past: [...past, present],
        present: newPresent,
        future: []
    };
};

const editorReducer = (state: EditorState, action: Action): EditorState => {
    switch (action.type) {
        case 'SET_PLAYHEAD':
            return { ...state, currentTime: Math.max(0, Math.min(state.duration, action.time)) };
        
        case 'TOGGLE_PLAYBACK':
            return { ...state, isPlaying: !state.isPlaying };

        case 'SET_ZOOM':
            return { ...state, zoom: Math.max(10, Math.min(200, action.zoom)) };

        case 'SELECT_CLIP':
            return { 
                ...state, 
                selectedClipIds: action.multi 
                    ? (state.selectedClipIds.includes(action.id) 
                        ? state.selectedClipIds.filter(id => id !== action.id) 
                        : [...state.selectedClipIds, action.id])
                    : [action.id] 
            };

        case 'DESELECT_ALL':
            return { ...state, selectedClipIds: [] };

        case 'UPDATE_CLIP_PROP':
            const clipToUpdate = state.clips[action.id];
            if (!clipToUpdate) return state;
            
            // Handle nested props like 'audio.volume' or 'transform.scale'
            let updatedClip = { ...clipToUpdate };
            if (action.prop.includes('.')) {
                const [parent, child] = action.prop.split('.');
                // @ts-ignore
                updatedClip[parent] = { ...updatedClip[parent], [child]: action.value };
            } else {
                // @ts-ignore
                updatedClip[action.prop] = action.value;
            }

            return {
                ...state,
                clips: { ...state.clips, [action.id]: updatedClip }
            };

        case 'UPDATE_CLIP_TRANSFORM':
             return {
                ...state,
                clips: {
                    ...state.clips,
                    [action.id]: {
                        ...state.clips[action.id],
                        transform: { ...state.clips[action.id].transform, ...action.transform }
                    }
                }
            };

        case 'MOVE_CLIP': {
            const clip = state.clips[action.id];
            if (!clip) return state;

            // 1. Calculate ideal position
            let start = Math.max(0, action.newStart);
            
            // 2. Snapping Logic
            if (state.snappingEnabled) {
                const threshold = SNAP_THRESHOLD_PX / state.zoom;
                let closestDist = threshold;
                let snapTo = -1;

                // Snap to 0
                if (Math.abs(start) < threshold) snapTo = 0;

                // Snap to Playhead
                if (Math.abs(start - state.currentTime) < threshold) snapTo = state.currentTime;
                if (Math.abs((start + clip.duration) - state.currentTime) < threshold) {
                    // Snap end to playhead -> adjust start
                    snapTo = state.currentTime - clip.duration; 
                }

                // Snap to other clips (Simple implementation)
                Object.values(state.clips).forEach(c => {
                    if (c.id === clip.id) return;
                    // Snap start to clip end
                    if (Math.abs(start - (c.start + c.duration)) < closestDist) {
                        closestDist = Math.abs(start - (c.start + c.duration));
                        snapTo = c.start + c.duration;
                    }
                    // Snap start to clip start
                    if (Math.abs(start - c.start) < closestDist) {
                        closestDist = Math.abs(start - c.start);
                        snapTo = c.start;
                    }
                });

                if (snapTo !== -1) start = snapTo;
            }

            // 3. Track Logic (Reassign Track ID if provided)
            let trackId = clip.trackId;
            if (action.newTrackId && state.tracks.some(t => t.id === action.newTrackId)) {
                trackId = action.newTrackId;
            }

            // 4. Update References
            const oldTrack = state.tracks.find(t => t.id === clip.trackId);
            const newTrack = state.tracks.find(t => t.id === trackId);
            
            // If track changed, remove from old, add to new
            let tracks = state.tracks;
            if (oldTrack && newTrack && oldTrack.id !== newTrack.id) {
                tracks = tracks.map(t => {
                    if (t.id === oldTrack.id) return { ...t, clips: t.clips.filter(id => id !== clip.id) };
                    if (t.id === newTrack.id) return { ...t, clips: [...t.clips, clip.id] };
                    return t;
                });
            }

            return {
                ...state,
                tracks,
                clips: {
                    ...state.clips,
                    [action.id]: { ...clip, start, trackId }
                }
            };
        }

        case 'RESIZE_CLIP': {
            const clip = state.clips[action.id];
            if (!clip) return state;

            let newStart = clip.start;
            let newDuration = clip.duration;
            let newOffset = clip.offset;

            if (action.edge === 'left') {
                // Dragging left edge:
                // New Time > Start Time = Shrink = Increase Offset
                // New Time < Start Time = Grow = Decrease Offset (if offset > 0)
                
                // Max left drag limited by offset (cannot go before media start)
                // Max right drag limited by duration (min duration)
                
                const delta = action.newTime - clip.start;
                
                // Clamp delta so offset doesn't go below 0
                const actualDelta = Math.max(-clip.offset, delta); 
                
                // Clamp delta so duration doesn't go below MIN
                // If we move start right (positive delta), duration shrinks
                if (clip.duration - actualDelta < MIN_CLIP_DURATION) {
                    return state; // Prevent invert
                }

                newStart = clip.start + actualDelta;
                newDuration = clip.duration - actualDelta;
                newOffset = clip.offset + actualDelta;

            } else {
                // Dragging right edge
                // Only affects duration. Start/Offset stay same.
                // Duration = NewTime - Start
                newDuration = Math.max(MIN_CLIP_DURATION, action.newTime - clip.start);
                // In real app, we'd also check against Asset Source Duration here
            }

            return {
                ...state,
                clips: {
                    ...state.clips,
                    [action.id]: { ...clip, start: newStart, duration: newDuration, offset: newOffset }
                }
            };
        }

        case 'SPLIT_CLIP': {
            // Find clip under playhead that is selected
            const clipId = state.selectedClipIds[0];
            if (!clipId) return state;
            const clip = state.clips[clipId];
            
            // Check if playhead intersects
            if (state.currentTime <= clip.start || state.currentTime >= clip.start + clip.duration) return state;

            const splitPoint = state.currentTime;
            const firstDuration = splitPoint - clip.start;
            const secondDuration = clip.duration - firstDuration;

            // Create second clip
            const newClipId = `${clip.id}_split_${Date.now()}`;
            const newClip: Clip = {
                ...clip,
                id: newClipId,
                start: splitPoint,
                duration: secondDuration,
                offset: clip.offset + firstDuration
            };

            // Update first clip
            const updatedFirstClip = {
                ...clip,
                duration: firstDuration
            };

            // Add to Track
            const trackIndex = state.tracks.findIndex(t => t.id === clip.trackId);
            const newTracks = [...state.tracks];
            newTracks[trackIndex] = {
                ...newTracks[trackIndex],
                clips: [...newTracks[trackIndex].clips, newClipId]
            };

            return {
                ...state,
                tracks: newTracks,
                clips: {
                    ...state.clips,
                    [clip.id]: updatedFirstClip,
                    [newClipId]: newClip
                },
                selectedClipIds: [newClipId] // Select new part
            };
        }

        case 'DELETE_SELECTED': {
            const newClips = { ...state.clips };
            const newTracks = state.tracks.map(t => ({
                ...t,
                clips: t.clips.filter(id => !state.selectedClipIds.includes(id))
            }));
            
            state.selectedClipIds.forEach(id => delete newClips[id]);
            
            return {
                ...state,
                tracks: newTracks,
                clips: newClips,
                selectedClipIds: []
            };
        }

        case 'ADD_TRACK':
            const newTrackId = `t-${Date.now()}`;
            const newTrack: Track = {
                id: newTrackId,
                type: action.trackType,
                name: `${action.trackType.charAt(0).toUpperCase() + action.trackType.slice(1)} ${state.tracks.filter(t => t.type === action.trackType).length + 1}`,
                isMuted: false,
                isSolo: false,
                isLocked: false,
                height: action.trackType === 'audio' ? 60 : 80,
                clips: [],
                volume: 1,
                pan: 0
            };
            return { ...state, tracks: [...state.tracks, newTrack] };

        case 'TOGGLE_TRACK_MUTE':
            return { ...state, tracks: state.tracks.map(t => t.id === action.trackId ? { ...t, isMuted: !t.isMuted } : t) };

        case 'TOGGLE_TRACK_SOLO':
            return { ...state, tracks: state.tracks.map(t => t.id === action.trackId ? { ...t, isSolo: !t.isSolo } : t) };

        default:
            return state;
    }
};

export function useTimelineState() {
    const [state, dispatch] = useReducer(historyReducer, {
        past: [],
        present: INITIAL_STATE,
        future: []
    });

    // --- Interaction Refs ---
    const isDragging = useRef(false);
    
    // Playback Loop
    useEffect(() => {
        let raf: number;
        let lastTime = performance.now();

        const loop = () => {
            if (state.present.isPlaying) {
                const now = performance.now();
                const dt = (now - lastTime) / 1000;
                lastTime = now;
                
                let nextTime = state.present.currentTime + (dt * state.present.playbackRate);
                if (nextTime >= state.present.duration) {
                    nextTime = state.present.duration;
                    dispatch({ type: 'TOGGLE_PLAYBACK' });
                }
                
                dispatch({ type: 'SET_PLAYHEAD', time: nextTime });
                raf = requestAnimationFrame(loop);
            }
        };

        if (state.present.isPlaying) {
            lastTime = performance.now();
            raf = requestAnimationFrame(loop);
        }

        return () => cancelAnimationFrame(raf);
    }, [state.present.isPlaying, state.present.currentTime, state.present.duration]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if input focused
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) dispatch({ type: 'REDO' });
                else dispatch({ type: 'UNDO' });
            }
            if (e.code === 'Space') {
                e.preventDefault();
                dispatch({ type: 'TOGGLE_PLAYBACK' });
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                dispatch({ type: 'DELETE_SELECTED' });
            }
            if (e.key === 'c' && !e.metaKey && !e.ctrlKey) {
                dispatch({ type: 'SPLIT_CLIP' }); // C for Cut/Razor
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return {
        state: state.present,
        canUndo: state.past.length > 0,
        canRedo: state.future.length > 0,
        dispatch
    };
}
