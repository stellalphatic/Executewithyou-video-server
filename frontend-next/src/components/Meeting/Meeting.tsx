'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp,
    MessageSquare, Users, MoreHorizontal, Smile, Hand,
    LayoutGrid, Maximize, ShieldCheck, Lock, UserCheck, X,
    FileText, UserMinus, Pin, CircleDot, ChevronDown, Send,
    Download, AlertCircle, CheckCircle2, MoreVertical, PinOff,
    ChevronUp, Pause, Play, Link as LinkIcon, Check, Unlock,
    Settings, Upload, ImageIcon, Monitor, ChevronLeft, ChevronRight,
    Minimize, Move, StopCircle as StopIcon, Trash2
} from 'lucide-react';
import { useAllstrm } from '@/hooks/useAllstrm';
import { StudioConfiguration, MeetingLayout, VisualConfigType } from '@/types';
import { Scene, SceneItem } from '../../types/layout';
import { WebGLGallery } from './WebGLGallery';
import { Button } from '../Button';
import { useMeetingUI } from '@/hooks/useMeetingUI';
import { useMeetingMedia } from '@/hooks/useMeetingMedia';

interface MeetingProps {
    config: StudioConfiguration;
    onLeave: () => void;
}

const SettingsToggle = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: () => void }) => (
    <div className="flex items-center justify-between cursor-pointer py-2 group" onClick={onChange}>
        <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{label}</span>
        <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors duration-300 ${checked ? 'bg-indigo-500' : 'bg-gray-700'}`}>
            <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-300 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
    </div>
);

const ControlButton = ({ icon, label, active, danger, accent, badge, onClick, className }: any) => (
    <div className="relative group">
        <button
            onClick={onClick}
            className={`
                w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 border relative
                ${active
                    ? danger
                        ? 'bg-red-500 text-white border-red-600 hover:bg-red-600 shadow-lg shadow-red-900/20'
                        : accent === 'green'
                            ? 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20'
                            : 'bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-500 shadow-lg shadow-indigo-900/20'
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700 hover:text-white hover:border-gray-600'
                }
                ${className || ''}
            `}
        >
            {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { className: "w-5 h-5" }) : icon}
            {badge !== undefined && badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-[#1a1a1a]">
                    {badge}
                </span>
            )}
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-gray-900 text-white text-xs font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-gray-800 shadow-xl z-50">
            {label}
        </div>
    </div>
);

export const Meeting: React.FC<MeetingProps> = ({ config, onLeave }) => {
    // 1. Core Logic & Stable Options
    const allstrmOptions = useMemo(() => ({
        roomId: config.roomId,
        displayName: config.displayName,
        initialConfig: config
    }), [config]); // config includes role, roomId, etc.

    const allstrm = useAllstrm(allstrmOptions);
    const {
        connect, disconnect, participants, localStream, remoteStreams, screenStream,
        toggleVideo, toggleAudio, startScreenShare, stopScreenShare,
        muteParticipant, muteAllParticipants, unmuteAllParticipants, unmuteParticipant,
        stopParticipantVideo, startParticipantVideo, stopAllVideo, allowAllVideo,
        startRecording, stopRecording, pauseRecording, resumeRecording,
        replaceVideoTrack, removeParticipant,
        sendReaction, toggleHandRaise,
        chatMessages, sendChatMessage, admitParticipant, startFilePresentation,
        globalMuteState, globalVideoState, activeRecordings, pausedRecordings,
        nextSlide, prevSlide, presentationState,
        setMixerLayout, updateRecordingScene, isLocalInWaitingRoom
    } = allstrm;

    useEffect(() => {
        console.log(`%c[Meeting] participants count: ${participants.length}`, 'color: #a855f7; font-weight: bold', participants);
    }, [participants]);

    const activeParticipants = useMemo(() => participants.filter(p => !p.is_in_waiting_room), [participants]);

    useEffect(() => {
        console.log(`%c[Meeting] activeParticipants count: ${activeParticipants.length}`, 'color: #ec4899; font-weight: bold', activeParticipants);
    }, [activeParticipants]);

    // 2. Specialized State Hooks
    const ui = useMeetingUI();
    const media = useMeetingMedia(
        localStream,
        config.audioEnabled, // Initial from config, we'll sync with UI state below
        config.visualConfig,
        replaceVideoTrack
    );

    // Sync UI audio/video state with config/init
    const [audioEnabled, setAudioEnabled] = useState(config.audioEnabled);
    const [videoEnabled, setVideoEnabled] = useState(config.videoEnabled);

    // 3. Additional Local States
    const [meetingDuration, setMeetingDuration] = useState(0);
    const [recordingTime, setRecordingTime] = useState(0);
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [chatInput, setChatInput] = useState("");
    const chatEndRef = useRef<HTMLDivElement>(null);
    const bottomBarTimerRef = useRef<number | null>(null);

    // 4. Constants
    const customBackgrounds = useMemo(() => [
        'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400',
        'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400'
    ], []);

    // 5. Handlers
    const handleToggleAudio = useCallback(() => {
        setAudioEnabled(prev => !prev);
        toggleAudio();
    }, [toggleAudio]);

    const handleToggleVideo = useCallback(() => {
        setVideoEnabled(prev => !prev);
        toggleVideo();
    }, [toggleVideo]);

    const handleToggleScreenShare = useCallback(async () => {
        if (screenStream) stopScreenShare();
        else await startScreenShare();
        ui.setActiveMenu(null);
    }, [screenStream, stopScreenShare, startScreenShare, ui]);

    const handleReaction = useCallback((emoji: string) => {
        sendReaction(emoji);
        ui.setActiveMenu(null);
    }, [sendReaction, ui]);

    const handlePin = useCallback((id: string) => {
        if (ui.pinnedId === id) {
            ui.setPinnedId(null);
            ui.setLayout('gallery');
            setMixerLayout('grid');
        } else {
            ui.setPinnedId(id);
            ui.setLayout('speaker');
            setMixerLayout('speaker', id);
        }
    }, [ui, setMixerLayout]);

    const handleToggleRecording = useCallback((type: 'mixed' | 'iso') => {
        if (activeRecordings.includes(type)) stopRecording(type);
        else {
            startRecording(type);
            setRecordingTime(0);
        }
    }, [activeRecordings, startRecording, stopRecording]);

    // 6. Effects
    useEffect(() => {
        connect();
        navigator.mediaDevices.enumerateDevices().then(devices => {
            setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
            setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
        });
        return () => {
            disconnect();
        };
    }, []); // Only once

    useEffect(() => {
        const interval = setInterval(() => setMeetingDuration(p => p + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let interval: any;
        if (activeRecordings.length > 0) {
            interval = setInterval(() => setRecordingTime(p => p + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [activeRecordings.length]);

    useEffect(() => {
        if (ui.activeMenu === 'chat') {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, ui.activeMenu]);

    // Bottom Bar Timer
    const resetBottomBarTimer = useCallback(() => {
        if (ui.bottomBarDocked) return;
        ui.setBottomBarVisible(true);
        if (bottomBarTimerRef.current) clearTimeout(bottomBarTimerRef.current);
        bottomBarTimerRef.current = window.setTimeout(() => ui.setBottomBarVisible(false), 3000);
    }, [ui.bottomBarDocked, ui.setBottomBarVisible]);

    useEffect(() => {
        if (ui.bottomBarDocked) {
            ui.setBottomBarVisible(true);
            if (bottomBarTimerRef.current) clearTimeout(bottomBarTimerRef.current);
        } else {
            resetBottomBarTimer();
        }
    }, [ui.bottomBarDocked, resetBottomBarTimer]);

    // Recording Scene Update

    useEffect(() => {
        if (!activeRecordings.includes('mixed')) return;
        const generateScene = (): Scene => {
            const items: SceneItem[] = [];
            const sources = ['local'];
            if (screenStream) sources.unshift('screen');
            activeParticipants.forEach(p => sources.push(p.id));

            const count = sources.length;
            const layoutMode: any = ui.layout === 'gallery' ? 'grid' : ui.layout;

            if (ui.layout === 'speaker' && ui.pinnedId) {
                const focus = ui.pinnedId === 'local' ? 'local' : ui.pinnedId;
                const others = sources.filter(s => s !== focus);
                items.push({ id: `it-${focus}`, sourceId: focus, type: focus === 'screen' ? 'screenshare' : 'participant', x: 0, y: 0, width: 80, height: 100, zIndex: 1, fit: 'cover' });
                const sh = 100 / Math.max(others.length, 1);
                others.forEach((s, i) => items.push({ id: `it-${s}`, sourceId: s, type: s === 'screen' ? 'screenshare' : 'participant', x: 80, y: i * sh, width: 20, height: sh, zIndex: 2, fit: 'cover' }));
            } else {
                const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
                const rows = Math.ceil(count / cols);
                const cw = 100 / cols; const ch = 100 / rows;
                sources.forEach((s, i) => {
                    const c = i % cols; const r = Math.floor(i / cols);
                    items.push({ id: `it-${s}`, sourceId: s, type: s === 'screen' ? 'screenshare' : 'participant', x: c * cw, y: r * ch, width: cw, height: ch, zIndex: i + 1, fit: 'cover' });
                });
            }
            return { id: 'rec-scene', name: 'Meeting', mode: layoutMode, items, background: { type: 'color', value: '#000000' }, overlays: [] };
        };
        updateRecordingScene(generateScene());
    }, [activeRecordings, activeParticipants, ui.layout, ui.pinnedId, screenStream, updateRecordingScene]);

    // Helpers
    const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
    const waitingRoomParticipants = useMemo(() => participants.filter(p => p.is_in_waiting_room), [participants]);
    const recordingLabel = activeRecordings.length === 2 ? 'REC ALL' : activeRecordings.includes('mixed') ? 'REC MIX' : activeRecordings.includes('iso') ? 'REC ISO' : 'REC';

    // 7. Render
    if (isLocalInWaitingRoom) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-black text-white p-6">
                <div className="max-w-md text-center animate-fade-in">
                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Users className="w-8 h-8 text-indigo-400" />
                    </div>
                    <h1 className="text-2xl font-bold mb-4">Waiting for host</h1>
                    <p className="text-gray-400 mb-8 font-sans">The host will let you in shortly. Please stay on this page.</p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 rounded-full border border-gray-800 text-sm text-gray-500">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                        <span>Connected to room</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-black text-white font-sans overflow-hidden relative" onMouseMove={resetBottomBarTimer}>
            <div className="flex-1 flex flex-col min-w-0 relative">
                {/* Top Bar */}
                <div className="h-14 bg-[#1a1a1a] flex items-center justify-between px-4 z-20 border-b border-gray-800 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">
                            <ShieldCheck className="w-3 h-3" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Encrypted</span>
                        </div>
                        <div className="h-4 w-px bg-gray-700" />
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-gray-200">{config.roomName || `Meeting ${config.roomId.slice(0, 8)}`}</span>
                            <span className="text-[10px] text-gray-500 font-mono">ID: {config.roomId}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {activeRecordings.length > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded text-red-500 animate-pulse">
                                <CircleDot className="w-3 h-3 fill-current" />
                                <span className="text-[10px] font-bold">{recordingLabel} {formatTime(recordingTime)}</span>
                            </div>
                        )}
                        <div className="px-3 py-1 bg-gray-800 rounded text-xs font-mono text-gray-300 min-w-[60px] text-center">
                            {formatTime(meetingDuration)}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="bg-gray-800 rounded p-0.5 flex gap-0.5 border border-gray-700">
                            <button onClick={() => { ui.setLayout('gallery'); ui.setPinnedId(null); setMixerLayout('grid'); }} className={`p-1.5 rounded hover:bg-gray-700 ${ui.layout === 'gallery' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}>
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button onClick={() => ui.setLayout('speaker')} className={`p-1.5 rounded hover:bg-gray-700 ${ui.layout === 'speaker' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}>
                                <Maximize className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Grid */}
                <div className="flex-1 relative overflow-hidden bg-[#121212]">
                    <WebGLGallery
                        participants={activeParticipants}
                        remoteStreams={remoteStreams}
                        localStream={media.processedLocalStream || localStream}
                        screenStream={screenStream}
                        layout={ui.layout}
                        pinnedId={ui.pinnedId}
                        onPin={handlePin}
                        onContextMenu={(e, i, pid) => ui.setContextMenu({ x: e.clientX, y: e.clientY, itemId: i, participantId: pid })}
                        viewPrefs={ui.viewPrefs}
                        onCropMouseDown={(e, id) => { if (!ui.isLayoutLocked) ui.setViewPrefs(p => ({ ...p, [id]: { ...(p[id] || { fit: 'cover', pan: { x: 50, y: 50 }, zoom: 1 }) } })); }}
                        onZoom={(id, delta) => ui.setViewPrefs(prev => { const c = prev[id] || { fit: 'cover', pan: { x: 50, y: 50 }, zoom: 1 }; return { ...prev, [id]: { ...c, zoom: Math.max(1, Math.min(3, c.zoom + delta)) } }; })}
                        audioLevels={media.audioLevels}
                        isLayoutLocked={ui.isLayoutLocked}
                    />
                    {presentationState.isPresentingFile && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-4 animate-slide-up">
                            <button onClick={prevSlide} className="p-2 hover:bg-white/20 rounded-full"><ChevronLeft className="w-5 h-5 text-white" /></button>
                            <span className="text-sm font-bold font-mono text-white">Slide {presentationState.currentSlide} / {presentationState.totalSlides}</span>
                            <button onClick={nextSlide} className="p-2 hover:bg-white/20 rounded-full"><ChevronRight className="w-5 h-5 text-white" /></button>
                        </div>
                    )}
                </div>

                {/* Bottom Controls */}
                <div className={`${ui.bottomBarDocked ? 'relative bg-[#1a1a1a] z-30' : 'absolute bottom-0 left-0 right-0 z-30 transition-transform duration-300 ' + (!ui.bottomBarVisible ? 'translate-y-full' : 'translate-y-0')} flex justify-center`}>
                    <div className={`bg-[#1a1a1a] border-t border-gray-800 px-6 py-2 shadow-2xl flex items-center gap-4 relative ${!ui.bottomBarDocked ? 'rounded-t-xl' : ''}`}>
                        <button className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-gray-800 border-b-0 rounded-t-lg px-2 py-0.5 text-gray-400 hover:text-white flex items-center gap-1.5" onClick={() => ui.setBottomBarDocked(!ui.bottomBarDocked)}>
                            {ui.bottomBarDocked ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                            <span className="text-[9px] font-medium uppercase tracking-wider">{ui.bottomBarDocked ? 'Docked' : 'Auto-Hide'}</span>
                        </button>
                        <div className="flex items-center gap-2">
                            <ControlButton icon={audioEnabled ? <Mic /> : <MicOff />} label={audioEnabled ? "Mute" : "Unmute"} active={!audioEnabled} onClick={handleToggleAudio} danger={!audioEnabled} />
                            <ControlButton icon={videoEnabled ? <Video /> : <VideoOff />} label={videoEnabled ? "Stop" : "Start"} active={!videoEnabled} onClick={handleToggleVideo} danger={!videoEnabled} />
                        </div>
                        <div className="h-8 w-px bg-gray-700" />
                        <div className="flex items-center gap-2">
                            <ControlButton icon={<Users />} label="Participants" badge={waitingRoomParticipants.length} onClick={() => ui.toggleMenu('participants')} active={ui.activeMenu === 'participants'} />
                            <ControlButton icon={<MessageSquare />} label="Chat" onClick={() => ui.toggleMenu('chat')} active={ui.activeMenu === 'chat'} />
                            <div className="relative">
                                <ControlButton icon={<MonitorUp />} label="Share" accent="green" active={ui.activeMenu === 'share' || !!screenStream} onClick={() => ui.toggleMenu('share')} />
                                {ui.activeMenu === 'share' && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-56 bg-[#222] border border-gray-700 rounded-xl shadow-2xl z-50 animate-scale-in origin-bottom">
                                        <button className="w-full text-left px-4 py-3 hover:bg-gray-700 flex items-center gap-3" onClick={handleToggleScreenShare}>{screenStream ? <X className="w-4 h-4 text-red-400" /> : <MonitorUp className="w-4 h-4 text-emerald-400" />} {screenStream ? 'Stop Share' : 'Share Screen'}</button>
                                        <button className="w-full text-left px-4 py-3 hover:bg-gray-700 flex items-center gap-3" onClick={() => document.getElementById('fs')?.click()}><FileText className="w-4 h-4 text-indigo-400" /> Present File</button>
                                        <button className="w-full text-left px-4 py-3 hover:bg-gray-700 flex items-center gap-3" onClick={() => ui.handleCopyLink(config.roomId)}>{ui.copiedLink ? <Check className="w-4 h-4 text-emerald-500" /> : <LinkIcon className="w-4 h-4 text-gray-400" />} Copy Link</button>
                                    </div>
                                )}
                                <input id="fs" type="file" className="hidden" accept=".pdf,.pptx" onChange={(e) => { if (e.target.files?.[0]) { startFilePresentation(e.target.files[0]); ui.setActiveMenu(null); } }} />
                            </div>
                            <div className="relative">
                                <ControlButton icon={<CircleDot />} label="Record" active={ui.activeMenu === 'record' || activeRecordings.length > 0} danger={activeRecordings.length > 0} onClick={() => ui.toggleMenu('record')} />
                                {ui.activeMenu === 'record' && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-[#222] border border-gray-700 rounded-xl shadow-2xl z-50 animate-scale-in">
                                        <div className="p-3 border-b border-gray-700/50">
                                            <div className="flex justify-between items-center mb-2"><span className="text-xs font-bold">Meeting (Mixed)</span> {activeRecordings.includes('mixed') && <span className="text-[9px] text-red-500 font-bold">REC</span>}</div>
                                            <div className="flex gap-2">
                                                <button className={`flex-1 py-1 rounded text-xs font-bold ${activeRecordings.includes('mixed') ? 'bg-red-500' : 'bg-gray-700'}`} onClick={() => handleToggleRecording('mixed')}>{activeRecordings.includes('mixed') ? 'STOP' : 'START'}</button>
                                                {activeRecordings.includes('mixed') && <button className="w-12 bg-gray-700 rounded" onClick={() => pausedRecordings.includes('mixed') ? resumeRecording('mixed') : pauseRecording('mixed')}>{pausedRecordings.includes('mixed') ? <Play className="w-3 h-3 mx-auto" /> : <Pause className="w-3 h-3 mx-auto" />}</button>}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="relative">
                                <ControlButton icon={<Smile />} label="React" active={ui.activeMenu === 'reactions'} onClick={() => ui.toggleMenu('reactions')} />
                                {ui.activeMenu === 'reactions' && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-[#222] border border-gray-700 rounded-full shadow-xl p-2 flex gap-2 animate-scale-in">
                                        {['👏', '👍', '❤️', '😂', '😮', '🎉'].map(emoji => <button key={emoji} onClick={() => handleReaction(emoji)} className="text-2xl hover:scale-125 transition-transform p-1">{emoji}</button>)}
                                        <button onClick={toggleHandRaise} className="text-xl p-1 text-amber-500"><Hand className="w-6 h-6 fill-current" /></button>
                                    </div>
                                )}
                            </div>
                            <div className="relative">
                                <ControlButton icon={<MoreVertical />} label="More" active={ui.activeMenu === 'more'} onClick={() => ui.toggleMenu('more')} />
                                {ui.activeMenu === 'more' && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-52 bg-[#222] border border-gray-700 rounded-xl shadow-xl z-50">
                                        <button onClick={() => { globalMuteState ? unmuteAllParticipants() : muteAllParticipants(); ui.setActiveMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 text-red-400"><MicOff className="w-4 h-4" /> Mute All</button>
                                        <button onClick={() => { ui.toggleMenu('settings'); }} className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"><Settings className="w-4 h-4" /> Settings</button>
                                    </div>
                                )}
                            </div>
                            <ControlButton icon={ui.isLayoutLocked ? <Lock /> : <Unlock />} label="Lock View" active={ui.isLayoutLocked} accent={ui.isLayoutLocked ? undefined : 'green'} onClick={() => ui.setIsLayoutLocked(!ui.isLayoutLocked)} />
                        </div>
                        <div className="h-8 w-px bg-gray-700" />
                        <Button variant="danger" className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 h-12" onClick={() => ui.setShowEndConfirmation(true)}>End</Button>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {ui.showEndConfirmation && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => ui.setShowEndConfirmation(false)} />
                    <div className="relative bg-[#1a1a1a] border border-gray-700 rounded-xl p-6 max-w-sm w-full shadow-2xl animate-scale-in text-center">
                        <h3 className="text-lg font-bold mb-2">End Meeting?</h3>
                        <p className="text-sm text-gray-400 mb-6">Are you sure you want to end this meeting for everyone?</p>
                        <div className="flex gap-3"><button onClick={() => ui.setShowEndConfirmation(false)} className="flex-1 py-2 bg-gray-800 rounded-lg">Cancel</button><button onClick={onLeave} className="flex-1 py-2 bg-red-600 rounded-lg font-bold">End</button></div>
                    </div>
                </div>
            )}

            {/* Sidebar Participants */}
            {ui.activeMenu === 'participants' && (
                <div className="w-80 bg-[#1a1a1a] border-l border-gray-800 flex flex-col z-20 shadow-2xl">
                    <div className="h-14 flex items-center justify-between px-4 border-b border-gray-800 bg-[#202020]"><span className="font-bold text-sm">Participants ({participants.length + 1})</span><button onClick={() => ui.setActiveMenu(null)}><X className="w-4 h-4 text-gray-400" /></button></div>
                    <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                        {waitingRoomParticipants.map(p => <div key={p.id} className="flex items-center justify-between p-3 bg-gray-800/30 rounded mb-1"><span>{p.display_name}</span><button onClick={() => admitParticipant(p.id)} className="text-xs text-indigo-400 font-bold">Admit</button></div>)}
                        <div className="space-y-1">
                            <div className="flex items-center justify-between p-2 hover:bg-gray-800 rounded-lg group"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold">YO</div><span className="text-sm">You (Host)</span></div><div className="flex gap-2">{audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-red-500" />}</div></div>
                            {activeParticipants.map(p => <div key={p.id} className="flex items-center justify-between p-2 hover:bg-gray-800 rounded-lg"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">{p.display_name.substring(0, 2).toUpperCase()}</div><span className="text-sm">{p.display_name}</span></div><div className="flex gap-2 shrink-0">{p.media_state.audio_enabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-red-500" />}</div></div>)}
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar Chat */}
            {ui.activeMenu === 'chat' && (
                <div className="w-80 bg-[#1a1a1a] border-l border-gray-800 flex flex-col z-20 shadow-2xl">
                    <div className="h-14 flex items-center justify-between px-4 border-b border-gray-800 bg-[#202020]"><span className="font-bold text-sm">Chat</span><button onClick={() => ui.setActiveMenu(null)}><X className="w-4 h-4 text-gray-400" /></button></div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {chatMessages.map((msg, i) => (
                            <div key={msg.id} className={`flex flex-col ${msg.senderId === 'local' ? 'items-end' : 'items-start'}`}>
                                {msg.isSystem ? <div className="text-[10px] text-gray-500 text-center w-full">{msg.text}</div> : <div className={`text-sm py-2 px-3 rounded-xl ${msg.senderId === 'local' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-200'}`}>{msg.text}</div>}
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>
                    <div className="p-4 border-t border-gray-800">
                        <form onSubmit={e => { e.preventDefault(); if (chatInput.trim()) { sendChatMessage(chatInput); setChatInput(""); } }} className="relative"><input type="text" className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white" placeholder="Type..." value={chatInput} onChange={e => setChatInput(e.target.value)} /><button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2"><Send className="w-4 h-4 text-indigo-500" /></button></form>
                    </div>
                </div>
            )}

            {/* Settings */}
            {(ui.activeMenu === 'settings' || ui.showSettings) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => { ui.setActiveMenu(null); ui.setShowSettings(false); }} />
                    <div className="relative bg-[#1a1a1a] border border-gray-700 rounded-2xl w-full max-w-2xl h-[500px] flex overflow-hidden shadow-2xl">
                        <div className="w-40 bg-[#121212] border-r border-gray-800 p-4 flex flex-col gap-2">
                            <button onClick={() => ui.setSettingsTab('general')} className={`text-left px-3 py-2 rounded text-sm ${ui.settingsTab === 'general' ? 'bg-indigo-600' : 'text-gray-400'}`}>Audio/Video</button>
                            <button onClick={() => ui.setSettingsTab('effects')} className={`text-left px-3 py-2 rounded text-sm ${ui.settingsTab === 'effects' ? 'bg-indigo-600' : 'text-gray-400'}`}>Effects</button>
                        </div>
                        <div className="flex-1 p-8 overflow-y-auto">
                            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold">{ui.settingsTab === 'general' ? 'Audio & Video' : 'Visual Effects'}</h2><button onClick={() => { ui.setActiveMenu(null); ui.setShowSettings(false); }}><X className="w-5 h-5" /></button></div>
                            {ui.settingsTab === 'general' ? (
                                <div className="space-y-4">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">CAMERA</label><select className="w-full bg-[#121212] border border-gray-700 rounded p-2 text-sm">{videoDevices.map(d => <option key={d.deviceId}>{d.label}</option>)}</select></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">MIC</label><select className="w-full bg-[#121212] border border-gray-700 rounded p-2 text-sm">{audioDevices.map(d => <option key={d.deviceId}>{d.label}</option>)}</select></div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-[#121212] p-4 rounded-lg border border-gray-800">
                                        <SettingsToggle label="Enhance skin" checked={media.visualConfig.skinEnhance} onChange={() => media.setVisualConfig(p => ({ ...p, skinEnhance: !p.skinEnhance }))} />
                                        <SettingsToggle label="Green Screen" checked={media.visualConfig.greenScreen} onChange={() => media.setVisualConfig(p => ({ ...p, greenScreen: !p.greenScreen }))} />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button onClick={() => media.setVisualConfig(p => ({ ...p, backgroundType: 'none' }))} className={`aspect-video rounded border ${media.visualConfig.backgroundType === 'none' ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-800'}`}>None</button>
                                        <button onClick={() => media.setVisualConfig(p => ({ ...p, backgroundType: 'blur' }))} className={`aspect-video rounded border ${media.visualConfig.backgroundType === 'blur' ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-800'}`}>Blur</button>
                                        {customBackgrounds.map(bg => <button key={bg} onClick={() => media.setVisualConfig(p => ({ ...p, backgroundType: 'image', backgroundImage: bg }))} className={`aspect-video rounded border bg-cover bg-center ${media.visualConfig.backgroundImage === bg ? 'border-indigo-500' : 'border-gray-800'}`} style={{ backgroundImage: `url(${bg})` }} />)}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
