'use client';


import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
    Play, Pause, SkipBack, SkipForward, Scissors, Hand, MousePointer2, 
    ZoomIn, ZoomOut, Undo2, Redo2, Settings, Monitor, Volume2, 
    Layers, Type, Music, Image as ImageIcon, ChevronRight, ChevronDown,
    Lock, Eye, EyeOff, MoreHorizontal, Grid, Magnet, MonitorUp,
    Download, Share2, X, Move, Split, Video, Mic, Film, Copy, Trash2
} from 'lucide-react';
import { useTimelineState } from '@/hooks/useTimelineState';
import { Clip, Track, TrackType } from '../../types/editor';
import { Button } from '../Button';

// --- Sub-Components ---

// 1. Time Ruler
const TimeRuler: React.FC<{ duration: number; zoom: number; currentTime: number; onScrub: (t: number) => void }> = ({ duration, zoom, currentTime, onScrub }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Auto-resize
        const resizeObserver = new ResizeObserver(() => {
            canvas.width = canvas.parentElement?.clientWidth || duration * zoom;
            canvas.height = 32;
            draw();
        });
        resizeObserver.observe(canvas.parentElement!);

        const draw = () => {
            const width = canvas.width;
            const height = canvas.height;
            ctx.clearRect(0, 0, width, height);

            ctx.fillStyle = '#18181b';
            ctx.fillRect(0, 0, width, height);
            
            ctx.strokeStyle = '#27272a';
            ctx.beginPath();
            ctx.moveTo(0, height);
            ctx.lineTo(width, height);
            ctx.stroke();

            ctx.font = '10px Inter';
            ctx.fillStyle = '#71717a';
            ctx.textAlign = 'left';

            // Adaptive Ticks
            const secPerScreen = width / zoom;
            let tickInterval = 1; 
            if (secPerScreen > 120) tickInterval = 30;
            else if (secPerScreen > 60) tickInterval = 10;
            else if (secPerScreen > 30) tickInterval = 5;
            else if (secPerScreen < 5) tickInterval = 0.5;

            // Draw Ticks
            // Optimization: Only draw visible range if we had scroll info (mocked here assuming 0 start for simplicity or horizontal scroll sync)
            for (let t = 0; t <= duration; t += tickInterval) {
                const x = t * zoom;
                if (x > width) break; // Simple culling
                
                const isMajor = t % (tickInterval * 5) === 0;
                const heightTick = isMajor ? 12 : 6;
                
                ctx.fillStyle = '#52525b';
                ctx.fillRect(x, height - heightTick, 1, heightTick);

                if (isMajor || t === 0) {
                    ctx.fillStyle = '#a1a1aa';
                    const mins = Math.floor(t / 60);
                    const secs = Math.floor(t % 60);
                    const label = `${mins}:${secs.toString().padStart(2, '0')}`;
                    ctx.fillText(label, x + 4, height - 14);
                }
            }
        };
        
        draw();
        return () => resizeObserver.disconnect();
    }, [duration, zoom]);

    return (
        <div 
            className="h-8 bg-[#18181b] relative cursor-pointer border-b border-[#27272a] select-none"
            onMouseDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const handleMove = (ev: MouseEvent) => {
                    const x = ev.clientX - rect.left + (e.currentTarget.scrollLeft || 0); // basic correction
                    onScrub(Math.max(0, x / zoom));
                };
                handleMove(e.nativeEvent);
                window.addEventListener('mousemove', handleMove);
                window.addEventListener('mouseup', () => window.removeEventListener('mousemove', handleMove), { once: true });
            }}
        >
            <canvas ref={canvasRef} className="absolute top-0 left-0" style={{ width: '100%', height: '100%' }} />
            {/* Playhead */}
            <div className="absolute top-0 bottom-0 w-px bg-red-500 z-10 pointer-events-none" style={{ left: currentTime * zoom }}>
                <div className="w-3 h-3 -ml-1.5 bg-red-500 transform rotate-45 -mt-1.5 rounded-sm shadow-sm" />
                <div className="absolute top-0 bottom-0 w-px bg-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
            </div>
        </div>
    );
};

// 2. Interactive Clip
const ClipItem: React.FC<{ 
    clip: Clip; 
    zoom: number; 
    isSelected: boolean; 
    onSelect: (e: React.MouseEvent) => void;
    onDragStart: (e: React.MouseEvent) => void;
    onResizeStart: (e: React.MouseEvent, edge: 'left' | 'right') => void;
}> = ({ clip, zoom, isSelected, onSelect, onDragStart, onResizeStart }) => {
    // Determine Color
    const getBgColor = () => {
        if (clip.type === 'video') return 'bg-indigo-600/80 border-indigo-400';
        if (clip.type === 'audio') return 'bg-emerald-600/80 border-emerald-400';
        if (clip.type === 'text') return 'bg-amber-600/80 border-amber-400';
        return 'bg-gray-600 border-gray-400';
    };

    return (
        <div
            className={`absolute top-1 bottom-1 rounded-md overflow-hidden border border-opacity-50 cursor-grab active:cursor-grabbing select-none group transition-shadow ${getBgColor()} ${isSelected ? 'ring-2 ring-white z-20 shadow-lg' : 'z-10'}`}
            style={{
                left: clip.start * zoom,
                width: Math.max(2, clip.duration * zoom),
            }}
            onMouseDown={(e) => { e.stopPropagation(); onSelect(e); onDragStart(e); }}
        >
            {/* Waveform/Thumbs Mock */}
            <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden">
                {clip.type === 'audio' ? (
                    <svg className="w-full h-full" preserveAspectRatio="none">
                        <path d="M0,50 Q20,0 40,50 T80,50 T120,50" stroke="white" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
                    </svg>
                ) : (
                    <div className="w-full h-full bg-gradient-to-r from-black/20 to-transparent" />
                )}
            </div>

            {/* Label */}
            <div className="relative px-2 py-1 text-[10px] font-bold text-white shadow-sm flex items-center gap-1 truncate max-w-full">
                {clip.type === 'video' ? <Video className="w-3 h-3" /> : clip.type === 'audio' ? <Music className="w-3 h-3" /> : <Type className="w-3 h-3" />}
                <span className="truncate">{clip.name}</span>
            </div>

            {/* Handles */}
            {isSelected && (
                <>
                    <div 
                        className="absolute top-0 bottom-0 left-0 w-3 cursor-ew-resize hover:bg-white/50 z-30 flex items-center justify-center group/handle transition-colors"
                        onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, 'left'); }}
                    >
                        <div className="h-4 w-1 bg-white/50 rounded-full group-hover/handle:bg-white" />
                    </div>
                    <div 
                        className="absolute top-0 bottom-0 right-0 w-3 cursor-ew-resize hover:bg-white/50 z-30 flex items-center justify-center group/handle transition-colors"
                        onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, 'right'); }}
                    >
                        <div className="h-4 w-1 bg-white/50 rounded-full group-hover/handle:bg-white" />
                    </div>
                </>
            )}
        </div>
    );
};

// --- Main Editor ---

export const VideoEditor: React.FC<{ asset: any; onClose: () => void }> = ({ asset, onClose }) => {
    const { state, dispatch, canUndo, canRedo } = useTimelineState();
    const { tracks, clips, currentTime, zoom, duration, selectedClipIds, activeTool, snappingEnabled } = state;
    
    // Refs for Drag Operations
    const timelineRef = useRef<HTMLDivElement>(null);
    const dragData = useRef<{ 
        isDragging: boolean; 
        isResizing: boolean; 
        edge?: 'left' | 'right'; 
        clipId?: string; 
        startX: number; 
        initialTime?: number;
        initialDuration?: number;
        trackId?: string;
    }>({ isDragging: false, isResizing: false, startX: 0 });

    const [activeInspectorTab, setActiveInspectorTab] = useState<'video' | 'audio' | 'motion'>('video');

    // 1. Interaction Handlers
    const handleTimelineMouseMove = useCallback((e: MouseEvent) => {
        if (!timelineRef.current) return;
        
        if (dragData.current.isDragging && dragData.current.clipId) {
            const deltaX = e.clientX - dragData.current.startX;
            const deltaSec = deltaX / zoom;
            
            // Calculate new Track based on Y position (Snap to tracks)
            // Simplified: Assuming fixed track height. 
            // In production: Use elementFromPoint or track bounds calculation
            
            dispatch({
                type: 'MOVE_CLIP',
                id: dragData.current.clipId,
                newStart: (dragData.current.initialTime || 0) + deltaSec
            });
        }

        if (dragData.current.isResizing && dragData.current.clipId && dragData.current.edge) {
            const rect = timelineRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left + timelineRef.current.scrollLeft;
            const timeAtMouse = Math.max(0, mouseX / zoom);
            
            dispatch({
                type: 'RESIZE_CLIP',
                id: dragData.current.clipId,
                edge: dragData.current.edge,
                newTime: timeAtMouse
            });
        }
    }, [zoom, dispatch]);

    const handleTimelineMouseUp = useCallback(() => {
        if (dragData.current.isDragging || dragData.current.isResizing) {
            dragData.current = { isDragging: false, isResizing: false, startX: 0 };
        }
        window.removeEventListener('mousemove', handleTimelineMouseMove);
        window.removeEventListener('mouseup', handleTimelineMouseUp);
    }, [handleTimelineMouseMove]);

    const startDrag = (e: React.MouseEvent, clipId: string) => {
        if (activeTool !== 'select') return;
        const clip = clips[clipId];
        dragData.current = {
            isDragging: true,
            isResizing: false,
            clipId,
            startX: e.clientX,
            initialTime: clip.start,
            trackId: clip.trackId
        };
        window.addEventListener('mousemove', handleTimelineMouseMove);
        window.addEventListener('mouseup', handleTimelineMouseUp);
    };

    const startResize = (e: React.MouseEvent, clipId: string, edge: 'left' | 'right') => {
        dragData.current = {
            isDragging: false,
            isResizing: true,
            clipId,
            edge,
            startX: e.clientX
        };
        window.addEventListener('mousemove', handleTimelineMouseMove);
        window.addEventListener('mouseup', handleTimelineMouseUp);
    };

    // 2. Playback Simulation (Simple)
    // The Preview Window simply renders the frame of the top-most visible video clip at currentTime
    const getActiveVideoFrame = () => {
        // Find visible video clips at currentTime, sorted by track order (z-index)
        const visibleClips = tracks
            .filter(t => !t.isMuted && t.type === 'video')
            .flatMap(t => t.clips.map(id => clips[id]))
            .filter(c => c && currentTime >= c.start && currentTime < c.start + c.duration)
            .reverse(); // Top tracks usually render on top? Or bottom? Let's assume Track 1 is top.
        
        return visibleClips[0]; // Simple single-layer compositor for now
    };

    const activeClip = getActiveVideoFrame();
    const primarySelected = selectedClipIds.length === 1 ? clips[selectedClipIds[0]] : null;

    return (
        <div className="fixed inset-0 z-[100] bg-[#09090b] text-zinc-100 font-sans flex flex-col overflow-hidden animate-fade-in">
            
            {/* HEADER */}
            <header className="h-14 border-b border-[#27272a] bg-[#121212] flex items-center justify-between px-4 shrink-0 z-20">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 hover:bg-[#27272a] rounded-lg text-zinc-400 hover:text-white"><X className="w-5 h-5"/></button>
                    <div>
                        <h2 className="text-sm font-bold tracking-tight">{asset.title}</h2>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                            <span className="bg-[#27272a] px-1.5 py-0.5 rounded font-mono">1920x1080</span>
                            <span>•</span>
                            <span>30 FPS</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center bg-[#18181b] border border-[#27272a] rounded-lg p-1">
                    <div className="px-4 py-1 text-xs font-mono text-zinc-300 border-r border-[#27272a]">{new Date(currentTime * 1000).toISOString().substr(11, 8)}</div>
                    <div className="px-4 py-1 text-xs font-mono text-zinc-500">{new Date(duration * 1000).toISOString().substr(11, 8)}</div>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => dispatch({type: 'ADD_TRACK', trackType: 'video'})}>+ Track</Button>
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/20" icon={<Share2 className="w-3 h-3"/>}>Export</Button>
                </div>
            </header>

            {/* WORKSPACE */}
            <div className="flex-1 grid grid-cols-[300px_1fr_320px] min-h-0 bg-[#000]">
                
                {/* LEFT: Browser / Assets */}
                <div className="border-r border-[#27272a] bg-[#121212] flex flex-col">
                    <div className="flex border-b border-[#27272a]">
                        <button className="flex-1 py-3 text-xs font-bold text-white border-b-2 border-indigo-500">Media</button>
                        <button className="flex-1 py-3 text-xs font-bold text-zinc-500 hover:text-zinc-300">Effects</button>
                        <button className="flex-1 py-3 text-xs font-bold text-zinc-500 hover:text-zinc-300">Text</button>
                    </div>
                    <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-2 gap-2">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="aspect-square bg-[#1f1f22] rounded-lg border border-[#27272a] hover:border-zinc-500 p-2 flex flex-col group cursor-grab active:cursor-grabbing transition-all">
                                    <div className="flex-1 bg-black/40 rounded overflow-hidden relative mb-2">
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Play className="w-8 h-8 text-white drop-shadow-md" />
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-medium truncate text-zinc-300">Source_Clip_{i}.mp4</div>
                                    <div className="text-[9px] text-zinc-600 font-mono">00:04:12</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* CENTER: Viewport & Timeline */}
                <div className="flex flex-col min-w-0">
                    
                    {/* Viewport */}
                    <div className="h-[55%] bg-[#09090b] relative flex flex-col border-b border-[#27272a]">
                        <div className="flex-1 flex items-center justify-center p-8 relative overflow-hidden bg-dot-pattern">
                            {/* Canvas Simulation */}
                            <div className="aspect-video h-full bg-black shadow-2xl relative overflow-hidden ring-1 ring-[#27272a]">
                                {activeClip ? (
                                    <div 
                                        className="w-full h-full relative origin-center transition-transform duration-75"
                                        style={{
                                            opacity: activeClip.transform.opacity,
                                            transform: `translate(${activeClip.transform.x}%, ${activeClip.transform.y}%) rotate(${activeClip.transform.rotation}deg) scale(${activeClip.transform.scale / 100})`
                                        }}
                                    >
                                        <img src={asset.thumbnail} className="w-full h-full object-cover" />
                                        {/* Overlay Name for Debug */}
                                        <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-1">{activeClip.name}</div>
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-700 font-mono text-sm">
                                        BLACK
                                    </div>
                                )}
                                
                                {/* Safe Zones */}
                                <div className="absolute inset-8 border border-white/10 pointer-events-none" />
                                <div className="absolute inset-16 border border-white/5 pointer-events-none" />
                            </div>
                        </div>

                        {/* Transport Controls */}
                        <div className="h-12 bg-[#121212] border-t border-[#27272a] flex items-center justify-center gap-4">
                            <button className="p-2 hover:bg-[#27272a] rounded text-zinc-400 hover:text-white" onClick={() => dispatch({type: 'SET_PLAYHEAD', time: 0})}><SkipBack className="w-4 h-4" /></button>
                            <button className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform" onClick={() => dispatch({type: 'TOGGLE_PLAYBACK'})}>
                                {state.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                            </button>
                            <button className="p-2 hover:bg-[#27272a] rounded text-zinc-400 hover:text-white" onClick={() => dispatch({type: 'SET_PLAYHEAD', time: duration})}><SkipForward className="w-4 h-4" /></button>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="flex-1 bg-[#121212] flex flex-col min-h-0 relative select-none">
                        {/* Toolbar */}
                        <div className="h-9 border-b border-[#27272a] flex items-center px-2 justify-between bg-[#18181b]">
                            <div className="flex items-center gap-1">
                                {[
                                    { id: 'select', icon: MousePointer2, label: 'Select (V)' },
                                    { id: 'razor', icon: Scissors, label: 'Razor (C)' },
                                    { id: 'hand', icon: Hand, label: 'Hand (H)' },
                                ].map(tool => (
                                    <button 
                                        key={tool.id}
                                        className={`p-1.5 rounded transition-all ${activeTool === tool.id ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-400 hover:text-white hover:bg-[#27272a]'}`}
                                        title={tool.label}
                                        onClick={() => dispatch({ type: 'UPDATE_CLIP_PROP', id: 'ignore', prop: 'ignore', value: 'ignore' })} // Just mocking tool switch dispatch
                                    >
                                        <tool.icon className="w-3.5 h-3.5" />
                                    </button>
                                ))}
                                <div className="w-px h-4 bg-[#27272a] mx-2" />
                                <button className={`p-1.5 rounded transition-all ${snappingEnabled ? 'text-indigo-400' : 'text-zinc-500'}`} title="Snap (S)">
                                    <Magnet className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <button disabled={!canUndo} onClick={() => dispatch({type: 'UNDO'})} className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30"><Undo2 className="w-3.5 h-3.5" /></button>
                                <button disabled={!canRedo} onClick={() => dispatch({type: 'REDO'})} className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30"><Redo2 className="w-3.5 h-3.5" /></button>
                                <div className="w-px h-4 bg-[#27272a] mx-2" />
                                <input 
                                    type="range" min="10" max="200" value={zoom} 
                                    onChange={(e) => dispatch({type: 'SET_ZOOM', zoom: parseInt(e.target.value)})}
                                    className="w-24 h-1 bg-[#27272a] rounded-lg appearance-none cursor-pointer accent-zinc-500" 
                                />
                            </div>
                        </div>

                        {/* Tracks */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Headers */}
                            <div className="w-64 bg-[#18181b] border-r border-[#27272a] flex flex-col pt-8 shrink-0 z-20 shadow-md">
                                {tracks.map(track => (
                                    <div key={track.id} className="border-b border-[#27272a] px-3 py-2 flex flex-col justify-center group" style={{ height: track.height }}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                {track.type === 'video' ? <Video className="w-3.5 h-3.5 text-indigo-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                                                <span className="text-xs font-bold text-zinc-400 group-hover:text-zinc-200 cursor-text">{track.name}</span>
                                            </div>
                                            <div className="flex gap-1">
                                                <button onClick={() => dispatch({type: 'TOGGLE_TRACK_MUTE', trackId: track.id})} className={`text-[9px] w-5 h-5 flex items-center justify-center rounded border ${track.isMuted ? 'bg-red-500/20 border-red-500 text-red-500' : 'border-[#27272a] text-zinc-500 hover:border-zinc-500'}`}>M</button>
                                                <button onClick={() => dispatch({type: 'TOGGLE_TRACK_SOLO', trackId: track.id})} className={`text-[9px] w-5 h-5 flex items-center justify-center rounded border ${track.isSolo ? 'bg-amber-500/20 border-amber-500 text-amber-500' : 'border-[#27272a] text-zinc-500 hover:border-zinc-500'}`}>S</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Scrollable Timeline */}
                            <div 
                                className="flex-1 overflow-auto relative custom-scrollbar bg-[#141414]" 
                                ref={timelineRef}
                                onClick={() => dispatch({type: 'DESELECT_ALL'})}
                            >
                                <div className="sticky top-0 z-30" style={{ width: duration * zoom }}>
                                    <TimeRuler duration={duration} zoom={zoom} currentTime={currentTime} onScrub={(t) => dispatch({type: 'SET_PLAYHEAD', time: t})} />
                                </div>
                                
                                <div className="relative min-w-full pb-8" style={{ width: duration * zoom }}>
                                    {/* Tracks */}
                                    {tracks.map(track => (
                                        <div key={track.id} className="border-b border-[#27272a] relative bg-[#141414] hover:bg-[#181818] transition-colors" style={{ height: track.height }}>
                                            {track.clips.map(clipId => {
                                                const clip = clips[clipId];
                                                if (!clip) return null;
                                                return (
                                                    <ClipItem 
                                                        key={clipId} 
                                                        clip={clip} 
                                                        zoom={zoom}
                                                        isSelected={selectedClipIds.includes(clipId)}
                                                        onSelect={(e) => dispatch({ type: 'SELECT_CLIP', id: clipId, multi: e.shiftKey })}
                                                        onDragStart={(e) => startDrag(e, clipId)}
                                                        onResizeStart={(e, edge) => startResize(e, clipId, edge)}
                                                    />
                                                );
                                            })}
                                        </div>
                                    ))}

                                    {/* Playhead Line */}
                                    <div className="absolute top-0 bottom-0 w-px bg-red-500 z-40 pointer-events-none" style={{ left: currentTime * zoom }} />
                                    
                                    {/* Time Marker Overlay on Scrub */}
                                    {state.isPlaying && (
                                        <div className="fixed bottom-4 right-4 bg-black/80 text-white px-3 py-1 rounded font-mono text-xs border border-white/20 z-50">
                                            {currentTime.toFixed(2)}s
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Inspector */}
                <div className="border-l border-[#27272a] bg-[#18181b] flex flex-col">
                    <div className="flex border-b border-[#27272a]">
                        <button onClick={() => setActiveInspectorTab('video')} className={`flex-1 py-3 text-xs font-bold transition-colors ${activeInspectorTab === 'video' ? 'text-white border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'}`}>Video</button>
                        <button onClick={() => setActiveInspectorTab('audio')} className={`flex-1 py-3 text-xs font-bold transition-colors ${activeInspectorTab === 'audio' ? 'text-white border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'}`}>Audio</button>
                        <button onClick={() => setActiveInspectorTab('motion')} className={`flex-1 py-3 text-xs font-bold transition-colors ${activeInspectorTab === 'motion' ? 'text-white border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'}`}>Motion</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {primarySelected ? (
                            <div className="space-y-6 animate-slide-up">
                                {/* Header */}
                                <div>
                                    <h3 className="text-sm font-bold text-white mb-1 truncate">{primarySelected.name}</h3>
                                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                                        <span>ID: {primarySelected.id}</span>
                                        <span className="px-1.5 py-0.5 bg-[#27272a] rounded">{primarySelected.duration.toFixed(2)}s</span>
                                    </div>
                                </div>

                                {/* Controls */}
                                {activeInspectorTab === 'video' && (
                                    <div className="space-y-4">
                                        <div className="space-y-3 p-3 bg-[#202023] rounded-lg border border-[#27272a]">
                                            <div className="flex items-center justify-between text-xs font-bold text-zinc-300 uppercase tracking-wider">
                                                <span>Transform</span>
                                                <Move className="w-3 h-3 text-zinc-500" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] text-zinc-500 font-bold">X POSITION</label>
                                                    <input type="number" className="w-full bg-[#121212] border border-[#27272a] rounded px-2 py-1 text-xs text-white focus:border-indigo-500 outline-none" 
                                                        value={primarySelected.transform.x} 
                                                        onChange={(e) => dispatch({type: 'UPDATE_CLIP_TRANSFORM', id: primarySelected.id, transform: { x: parseFloat(e.target.value) }})}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] text-zinc-500 font-bold">Y POSITION</label>
                                                    <input type="number" className="w-full bg-[#121212] border border-[#27272a] rounded px-2 py-1 text-xs text-white focus:border-indigo-500 outline-none" 
                                                        value={primarySelected.transform.y} 
                                                        onChange={(e) => dispatch({type: 'UPDATE_CLIP_TRANSFORM', id: primarySelected.id, transform: { y: parseFloat(e.target.value) }})}
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] text-zinc-500 font-bold">SCALE (%)</label>
                                                <div className="flex gap-2 items-center">
                                                    <input type="range" min="0" max="200" className="flex-1 h-1 bg-[#27272a] rounded-lg appearance-none cursor-pointer accent-indigo-500" 
                                                        value={primarySelected.transform.scale}
                                                        onChange={(e) => dispatch({type: 'UPDATE_CLIP_TRANSFORM', id: primarySelected.id, transform: { scale: parseFloat(e.target.value) }})}
                                                    />
                                                    <input type="number" className="w-12 bg-[#121212] border border-[#27272a] rounded px-1 py-1 text-xs text-white text-center outline-none" 
                                                        value={primarySelected.transform.scale}
                                                        onChange={(e) => dispatch({type: 'UPDATE_CLIP_TRANSFORM', id: primarySelected.id, transform: { scale: parseFloat(e.target.value) }})}
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] text-zinc-500 font-bold">ROTATION (DEG)</label>
                                                <div className="flex gap-2 items-center">
                                                    <input type="range" min="-180" max="180" className="flex-1 h-1 bg-[#27272a] rounded-lg appearance-none cursor-pointer accent-indigo-500" 
                                                        value={primarySelected.transform.rotation}
                                                        onChange={(e) => dispatch({type: 'UPDATE_CLIP_TRANSFORM', id: primarySelected.id, transform: { rotation: parseFloat(e.target.value) }})}
                                                    />
                                                    <input type="number" className="w-12 bg-[#121212] border border-[#27272a] rounded px-1 py-1 text-xs text-white text-center outline-none" 
                                                        value={primarySelected.transform.rotation}
                                                        onChange={(e) => dispatch({type: 'UPDATE_CLIP_TRANSFORM', id: primarySelected.id, transform: { rotation: parseFloat(e.target.value) }})}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3 p-3 bg-[#202023] rounded-lg border border-[#27272a]">
                                            <div className="flex items-center justify-between text-xs font-bold text-zinc-300 uppercase tracking-wider">
                                                <span>Opacity</span>
                                                <Eye className="w-3 h-3 text-zinc-500" />
                                            </div>
                                            <input type="range" min="0" max="1" step="0.01" className="w-full h-1 bg-[#27272a] rounded-lg appearance-none cursor-pointer accent-indigo-500" 
                                                value={primarySelected.transform.opacity}
                                                onChange={(e) => dispatch({type: 'UPDATE_CLIP_TRANSFORM', id: primarySelected.id, transform: { opacity: parseFloat(e.target.value) }})}
                                            />
                                        </div>
                                    </div>
                                )}

                                {activeInspectorTab === 'audio' && (
                                    <div className="space-y-4">
                                        <div className="space-y-3 p-3 bg-[#202023] rounded-lg border border-[#27272a]">
                                            <div className="flex items-center justify-between text-xs font-bold text-zinc-300 uppercase tracking-wider">
                                                <span>Volume</span>
                                                <Volume2 className="w-3 h-3 text-zinc-500" />
                                            </div>
                                            <div className="flex gap-3 items-center">
                                                <input type="range" min="0" max="2" step="0.01" className="flex-1 h-1 bg-[#27272a] rounded-lg appearance-none cursor-pointer accent-emerald-500" 
                                                    value={primarySelected.audio?.volume || 1}
                                                    onChange={(e) => dispatch({type: 'UPDATE_CLIP_PROP', id: primarySelected.id, prop: 'audio.volume', value: parseFloat(e.target.value)})}
                                                />
                                                <span className="text-xs font-mono w-8 text-right">{Math.round((primarySelected.audio?.volume || 1) * 100)}%</span>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-[#202023] rounded-lg border border-[#27272a] flex items-center justify-between">
                                            <span className="text-xs font-bold text-zinc-300">Mute Clip</span>
                                            <input type="checkbox" className="accent-indigo-500" 
                                                checked={primarySelected.audio?.muted || false}
                                                onChange={(e) => dispatch({type: 'UPDATE_CLIP_PROP', id: primarySelected.id, prop: 'audio.muted', value: e.target.checked})}
                                            />
                                        </div>
                                    </div>
                                )}
                                
                                <div className="pt-4 border-t border-[#27272a]">
                                    <Button variant="danger" size="sm" className="w-full" onClick={() => dispatch({type: 'DELETE_SELECTED'})} icon={<Trash2 className="w-3 h-3" />}>Delete Clip</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-64 text-zinc-600 opacity-60">
                                <MousePointer2 className="w-8 h-8 mb-2" />
                                <p className="text-xs font-medium">Select a clip to edit</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
