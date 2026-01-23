'use client';


import React, { useEffect, useRef, memo, useState } from 'react';
import { Participant } from '@/types';
import { MicOff, MonitorUp, Pin, MoreHorizontal, Hand, Move, ZoomIn, ZoomOut, Minus, Plus } from 'lucide-react';

interface ParticipantTileProps {
    item: any;
    isPinned: boolean;
    onPin: (id: string) => void;
    onContextMenu?: (e: React.MouseEvent, itemId: string, participantId: string) => void;
    className?: string;
    objectFit?: 'contain' | 'cover';
    objectPosition?: string;
    zoom?: number;
    audioLevel?: number;
    onCropMouseDown?: (e: React.MouseEvent, id: string) => void;
    onZoom?: (id: string, delta: number) => void;
    // Drag Props
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
}

export const ParticipantTile: React.FC<ParticipantTileProps> = memo(({ 
    item, 
    isPinned, 
    onPin, 
    onContextMenu,
    className,
    objectFit = 'contain',
    objectPosition = 'center',
    zoom = 1,
    audioLevel = 0,
    onCropMouseDown,
    onZoom,
    draggable,
    onDragStart,
    onDragOver,
    onDrop
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const p = item.participant as Participant;
    const [reaction, setReaction] = useState<{ emoji: string, id: number } | null>(null);
    
    // Derived States
    const isLocal = item.isLocal;
    const isScreen = item.isScreen;
    const isCover = objectFit === 'cover';
    const isSpeaking = audioLevel > 0.05; // Threshold for visual indicator
    
    const isVideoEnabled = isLocal 
        ? item.stream?.getVideoTracks()[0]?.enabled 
        : p.media_state.video_enabled;

    const isAudioEnabled = isLocal
        ? item.stream?.getAudioTracks()[0]?.enabled
        : p.media_state.audio_enabled;

    const isVideoVisible = isScreen || (isVideoEnabled && item.stream);

    // Watch for reaction changes in participant state
    useEffect(() => {
        if (p.current_reaction && p.reaction_timestamp) {
            if (Date.now() - p.reaction_timestamp < 3000) {
                setReaction({ emoji: p.current_reaction, id: p.reaction_timestamp });
                const timer = setTimeout(() => setReaction(null), 2500);
                return () => clearTimeout(timer);
            }
        }
    }, [p.current_reaction, p.reaction_timestamp]);

    // Attach Stream to Video
    useEffect(() => {
        const videoEl = videoRef.current;
        if (videoEl && item.stream) {
            // For canvas streams (screen share), we must ensure it's not set to null inadvertently
            if (videoEl.srcObject !== item.stream) {
                videoEl.srcObject = item.stream;
                videoEl.onloadedmetadata = () => {
                    videoEl.play().catch(e => console.warn("Autoplay blocked", e));
                };
            }
        } else if (videoEl && !item.stream) {
            videoEl.srcObject = null;
        }
    }, [item.stream, isVideoVisible]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isCover && onCropMouseDown) {
            onCropMouseDown(e, item.participantId);
        }
    };

    return (
        <div 
            className={`relative bg-[#202020] rounded-xl overflow-hidden shadow-sm group/tile transition-all duration-200 ${className || ''} 
                ${isPinned ? 'ring-2 ring-indigo-500' : ''} 
                ${isSpeaking && !isScreen ? 'ring-2 ring-indigo-500 shadow-[0_0_20px_-5px_rgba(99,102,241,0.6)] z-10' : 'border border-white/5'}
                ${isCover ? 'cursor-move' : ''}
                ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}
            `}
            onContextMenu={(e) => onContextMenu?.(e, item.id, item.participantId)}
            onMouseDown={handleMouseDown}
            draggable={draggable && !isCover} // Disable tile dragging if cropping/panning
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            {/* Video Layer */}
            {isVideoVisible ? (
                <video 
                    ref={videoRef}
                    autoPlay 
                    muted={isLocal || isScreen} // Always mute local to prevent echo, mute screen to prevent loopback
                    playsInline 
                    className={`w-full h-full pointer-events-none select-none ${isLocal && !isScreen ? 'scale-x-[-1]' : ''}`}
                    style={{
                        objectFit: objectFit,
                        objectPosition: objectPosition,
                        transform: `scale(${zoom})`,
                        transition: 'transform 0.1s ease-out'
                    }}
                    draggable={false}
                />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[#181818]">
                    <div className="relative">
                        <div className={`w-24 h-24 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-3xl font-bold text-white shadow-2xl ring-4 ring-black/20 ${isSpeaking ? 'animate-pulse' : ''}`}>
                            {item.display_name.substring(0, 2).toUpperCase()}
                        </div>
                        {!isAudioEnabled && (
                            <div className="absolute bottom-0 right-0 bg-red-500 p-1.5 rounded-full border-2 border-[#181818]">
                                <MicOff className="w-4 h-4 text-white" />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Reaction Overlay */}
            {reaction && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 animate-slide-up">
                    <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 shadow-2xl">
                        <span className="text-3xl">{reaction.emoji}</span>
                        <span className="text-sm font-bold text-white max-w-[100px] truncate">{item.display_name}</span>
                    </div>
                </div>
            )}

            {/* Raised Hand Indicator */}
            {p.is_raised_hand && (
                <div className="absolute top-3 left-3 z-20 bg-amber-500 text-black px-2 py-1 rounded-lg flex items-center gap-1 font-bold text-[10px] shadow-lg animate-bounce">
                    <Hand className="w-3 h-3 fill-current" />
                    <span>HAND RAISED</span>
                </div>
            )}

            {/* Info Layer (Bottom Left) */}
            <div className="absolute bottom-3 left-3 z-10 max-w-[80%] pointer-events-none">
                <div className="flex items-center gap-2">
                    <div className="bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/5 flex items-center gap-2">
                        {!isAudioEnabled && !isScreen && (
                            <MicOff className="w-3 h-3 text-red-500" />
                        )}
                        {isScreen && <MonitorUp className="w-3 h-3 text-emerald-400" />}
                        <span className="text-[11px] font-bold text-white truncate">{item.display_name} {isLocal ? '(You)' : ''}</span>
                    </div>
                </div>
            </div>

            {/* Zoom & Crop Controls (Bottom Right) */}
            {isCover && (
                <div className="absolute bottom-3 right-3 z-30 flex flex-col gap-2 items-end opacity-0 group-hover/tile:opacity-100 transition-opacity">
                    {/* Drag Hint */}
                    <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg text-[9px] font-bold text-white/70 border border-white/10 flex items-center gap-1 pointer-events-none">
                        <Move className="w-3 h-3" /> DRAG
                    </div>
                    
                    {/* Zoom Pill */}
                    {onZoom && (
                        <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-lg p-1 border border-white/10">
                            <button 
                                className="p-1 hover:bg-white/20 rounded text-white disabled:opacity-50"
                                onClick={(e) => { e.stopPropagation(); onZoom(item.participantId, -0.1); }}
                                disabled={zoom <= 1}
                            >
                                <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-[10px] font-mono text-white min-w-[30px] text-center select-none">
                                {Math.round(zoom * 100)}%
                            </span>
                            <button 
                                className="p-1 hover:bg-white/20 rounded text-white disabled:opacity-50"
                                onClick={(e) => { e.stopPropagation(); onZoom(item.participantId, 0.1); }}
                                disabled={zoom >= 3}
                            >
                                <Plus className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Hover Controls (Top Right) */}
            <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover/tile:opacity-100 transition-all duration-200 z-20 translate-y-1 group-hover/tile:translate-y-0">
                <button 
                    onClick={(e) => { e.stopPropagation(); onPin(item.id); }}
                    className={`p-2 rounded-lg backdrop-blur-md border border-white/10 text-white transition-colors ${isPinned ? 'bg-indigo-600 border-indigo-500' : 'bg-black/60 hover:bg-black/80'}`}
                    title={isPinned ? "Unpin" : "Pin"}
                >
                    <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
                </button>
                <button 
                    onClick={(e) => onContextMenu?.(e, item.id, item.participantId)}
                    className="p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 hover:bg-black/80 text-white transition-colors"
                >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
});

ParticipantTile.displayName = 'ParticipantTile';
