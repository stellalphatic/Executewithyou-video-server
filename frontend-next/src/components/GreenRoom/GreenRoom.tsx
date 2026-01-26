'use client';


import React, { useEffect, useRef } from 'react';
import { Participant } from '@/types';
import { Mic, MicOff, Video, VideoOff, Wifi, Plus, MonitorUp, UserCheck, Clock } from 'lucide-react';
import { CueSystem } from './CueSystem';
import { useBackstage } from '@/hooks/useBackstage';

interface GreenRoomProps {
    participants: Participant[];
    waitingParticipants?: Participant[]; // Participants in waiting room
    localParticipantId: string;
    onToggleAudio: () => void;
    onToggleVideo: () => void;
    onAddToStage?: (participantId: string) => void;
    onAdmitParticipant?: (participantId: string) => void; // Admit from waiting room
    onContextMenu?: (e: React.MouseEvent, participantId: string) => void;
    localStream: MediaStream | null;
    remoteStreams?: Record<string, MediaStream>; // Remote participant streams for preview
    isLocalOnStage?: boolean; // New prop
    isHost?: boolean; // Is current user a host
}

const GreenRoomVideo = ({ stream, isLocal }: { stream: MediaStream | null, isLocal?: boolean }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        } else if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, [stream]);

    if (!stream) {
        return (
            <div className="absolute inset-0 flex items-center justify-center text-content-low bg-app-surface/10">
                <div className="flex flex-col items-center gap-2">
                    <VideoOff className="w-6 h-6 opacity-50" />
                    <span className="text-[10px] uppercase font-bold">Camera Off</span>
                </div>
            </div>
        );
    }

    return (
        <video 
            ref={videoRef}
            autoPlay 
            muted 
            playsInline 
            className={`w-full h-full object-cover ${isLocal ? 'transform scale-x-[-1]' : ''}`} 
        />
    );
};

export const GreenRoom: React.FC<GreenRoomProps> = ({ 
    participants, 
    waitingParticipants = [],
    localParticipantId, 
    localStream,
    remoteStreams = {},
    onToggleAudio,
    onToggleVideo,
    onAddToStage,
    onAdmitParticipant,
    onContextMenu,
    isLocalOnStage = false,
    isHost = true
}) => {
    // In a real app, token would come from auth context
    const { isReady, cueState, toggleReady } = useBackstage(localParticipantId, "mock-token");

    return (
        <div className="flex flex-col h-full bg-app-surface/50 border-r border-app-border">
            <div className="p-4 border-b border-app-border flex justify-between items-center bg-app-surface">
                <h3 className="text-xs font-bold text-content-medium uppercase tracking-wider">
                    Backstage
                </h3>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-mono text-content-medium">LIVE LINK</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                
                {/* Local User Card - Only show if NOT on stage */}
                {!isLocalOnStage && (
                    <div 
                        className="bg-app-bg border border-indigo-500/30 rounded-lg overflow-hidden shadow-sm group relative"
                        onContextMenu={(e) => isHost && onContextMenu?.(e, 'local')}
                    >
                        {/* Video Area */}
                        <div className="aspect-video bg-black relative">
                            <GreenRoomVideo stream={localStream} isLocal={true} />
                            <div className="absolute top-2 left-2 bg-indigo-600 px-2 py-0.5 rounded text-[9px] font-bold text-white uppercase tracking-wider z-10">
                                You
                            </div>

                            {/* Local Add To Stage Overlay - Only for hosts */}
                            {isHost && (
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px] z-20">
                                    {onAddToStage && (
                                        <button 
                                            onClick={() => onAddToStage('local')}
                                            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg transform scale-95 group-hover:scale-100 transition-transform"
                                        >
                                            <MonitorUp className="w-3 h-3" />
                                            ADD TO STAGE
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Controls Area */}
                        <div className="p-3 space-y-3 bg-app-surface border-t border-app-border relative z-30">
                            <div className="flex items-center justify-center gap-4">
                                <button 
                                    onClick={onToggleAudio}
                                    className={`p-2 rounded-full border transition-all ${localStream?.getAudioTracks()[0]?.enabled ? 'bg-app-bg border-app-border text-content-high hover:border-indigo-500' : 'bg-red-500/10 border-red-500 text-red-500'}`}
                                    title="Toggle Mic"
                                >
                                    {localStream?.getAudioTracks()[0]?.enabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                                </button>
                                <button 
                                    onClick={onToggleVideo}
                                    className={`p-2 rounded-full border transition-all ${localStream?.getVideoTracks()[0]?.enabled ? 'bg-app-bg border-app-border text-content-high hover:border-indigo-500' : 'bg-red-500/10 border-red-500 text-red-500'}`}
                                    title="Toggle Camera"
                                >
                                    {localStream?.getVideoTracks()[0]?.enabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                                </button>
                            </div>
                            
                            <CueSystem 
                                state={cueState} 
                                isReady={isReady} 
                                onToggleReady={toggleReady} 
                            />
                        </div>
                    </div>
                )}

                {!isLocalOnStage && <div className="h-px bg-app-border w-full my-2" />}
                
                <div className="text-[10px] font-bold text-content-low uppercase tracking-wider mb-2">Guests ({participants.length})</div>

                {participants.map(p => (
                    <div 
                        key={p.id} 
                        className="bg-app-bg border border-app-border rounded-lg overflow-hidden shadow-sm group relative opacity-90 hover:opacity-100 transition-all hover:border-content-medium/30"
                        onContextMenu={(e) => isHost && onContextMenu?.(e, p.id)}
                    >
                        <div className="aspect-video bg-black relative">
                            {remoteStreams[p.id] ? (
                                <GreenRoomVideo stream={remoteStreams[p.id]} isLocal={false} />
                            ) : p.media_state.video_enabled ? (
                                // Placeholder for remote stream rendering when video enabled but no stream yet
                                <div className="w-full h-full bg-gray-900 flex items-center justify-center relative overflow-hidden">
                                     <div className="absolute inset-0 opacity-20 bg-noise"></div>
                                     <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold text-white relative z-10">
                                        {p.display_name.substring(0, 2)}
                                    </div>
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-content-low">
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                                        <span className="font-bold text-xs">{p.display_name.substring(0, 2)}</span>
                                    </div>
                                </div>
                            )}
                            
                            <div className="absolute top-2 right-2 flex gap-1 z-10">
                                {!p.media_state.audio_enabled && <div className="p-1 bg-red-500/90 rounded text-white"><MicOff className="w-3 h-3" /></div>}
                                <div className={`p-1 rounded text-white ${p.media_state.connection_quality === 'excellent' ? 'bg-emerald-500/80' : 'bg-amber-500/80'}`}>
                                    <Wifi className="w-3 h-3" />
                                </div>
                            </div>

                            {/* Hover Overlay Action - Only for hosts */}
                            {isHost && (
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px] z-20">
                                    {onAddToStage && (
                                        <button 
                                            onClick={() => onAddToStage(p.id)}
                                            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg transform scale-95 group-hover:scale-100 transition-transform"
                                        >
                                            <MonitorUp className="w-3 h-3" />
                                            ADD TO STAGE
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-2 flex items-center justify-between bg-app-surface border-t border-app-border">
                            <span className="text-xs font-bold text-content-high truncate max-w-[100px]">{p.display_name}</span>
                            <span className="text-[9px] font-mono text-content-medium px-1.5 py-0.5 border border-app-border rounded uppercase">{p.role}</span>
                        </div>
                    </div>
                ))}
                
                {participants.length === 0 && (
                    <div className="text-center py-8 text-content-low text-xs italic">
                        No other guests backstage.
                    </div>
                )}

                {/* Waiting Room Section - Only visible to hosts */}
                {isHost && waitingParticipants.length > 0 && (
                    <>
                        <div className="h-px bg-app-border w-full my-4" />
                        <div className="flex items-center gap-2 mb-3">
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                                Waiting Room ({waitingParticipants.length})
                            </span>
                        </div>
                        
                        {waitingParticipants.map(p => (
                            <div 
                                key={p.id} 
                                className="bg-amber-500/5 border border-amber-500/30 rounded-lg overflow-hidden shadow-sm group relative"
                                onContextMenu={(e) => onContextMenu?.(e, p.id)}
                            >
                                <div className="aspect-video bg-black relative">
                                    {remoteStreams[p.id] ? (
                                        <GreenRoomVideo stream={remoteStreams[p.id]} isLocal={false} />
                                    ) : (
                                        <div className="w-full h-full bg-gray-900 flex items-center justify-center relative overflow-hidden">
                                            <div className="absolute inset-0 opacity-20 bg-noise"></div>
                                            <div className="w-10 h-10 rounded-full bg-amber-500/30 flex items-center justify-center text-sm font-bold text-amber-300 relative z-10">
                                                {p.display_name.substring(0, 2).toUpperCase()}
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="absolute top-2 left-2 bg-amber-600 px-2 py-0.5 rounded text-[9px] font-bold text-white uppercase tracking-wider z-10">
                                        Waiting
                                    </div>

                                    {/* Hover Overlay - Admit Button */}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px] z-20">
                                        {onAdmitParticipant && (
                                            <button 
                                                onClick={() => onAdmitParticipant(p.id)}
                                                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-lg transform scale-95 group-hover:scale-100 transition-transform"
                                            >
                                                <UserCheck className="w-3 h-3" />
                                                ADMIT
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="p-2 flex items-center justify-between bg-app-surface border-t border-amber-500/20">
                                    <span className="text-xs font-bold text-content-high truncate max-w-[100px]">{p.display_name}</span>
                                    <span className="text-[9px] font-mono text-amber-500 px-1.5 py-0.5 border border-amber-500/30 rounded uppercase">{p.role}</span>
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
};
