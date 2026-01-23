'use client';


import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
// ... imports (same as before)
import { 
    Mic, MicOff, Video, VideoOff, MonitorUp, 
    LayoutGrid, Settings, MoreVertical, Share2,
    X, Plus, Trash2, Eye, EyeOff,
    Lock, Unlock, HelpCircle, ChevronDown, MoreHorizontal,
    LogOut, UserMinus, UserPlus, Monitor, 
    MessageSquare, Type, Image as ImageIcon, Users,
    FolderOpen, Film, Layers, Palette, Grid, Copy, Smartphone,
    Play, Square, Layout, Check, MousePointer2, AlertCircle, Wand2, Upload, Sliders, Activity, Keyboard, Disc, GripVertical, Box,
    Cpu, Wifi, HardDrive, BarChart3, Radio, StopCircle, Lock as LockIcon, RefreshCw, Pause, PlayCircle, ShieldAlert, Volume2, VolumeX, Send, UserCheck,
    FileVideo, Clock, CircleDot, UserX, Camera, FileText, ChevronLeft, ChevronRight, Maximize, Minimize, Move, StopCircle as StopIcon, ZoomIn, ZoomOut, Minus, Plus as PlusIcon,
    ArrowRight, Globe
} from 'lucide-react';
import { useAllstrm } from '@/hooks/useAllstrm';
import { useStudioEngines } from '@/hooks/useStudioEngines';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { Button } from './Button';
import { Participant, StudioConfiguration, BrandConfig, Banner, LayoutState, OverlayScope, Tier } from '@/types';
import { Scene as EngineScene, SceneItem } from '../types/layout';
import { Destinations } from './Destinations';
import { VideoProcessor } from '@/utils/VideoProcessor';
import { isFeatureEnabled, hasHostPermissions, getUpgradeMessage, FeatureId } from '@/utils/permissions';
import { GreenRoom } from './GreenRoom/GreenRoom';
import { UploadQueue } from './UploadQueue';
import { calculateLayout } from '@/utils/layoutEngine';

// ... (Rest of interfaces and helper components remain unchanged until GreenRoom render)

declare global {
    interface Window {
        SelfieSegmentation: any;
    }
}

interface Scene {
    id: string;
    name: string;
    layout: string; 
    participants: string[]; 
    activeBanners: string[];
    background: string;
    brandConfig: BrandConfig;
    bannerPositions: Record<string, { x: number; y: number }>;
}

type SettingsTab = 'general' | 'camera' | 'audio' | 'visual_effects' | 'recording' | 'hotkeys' | 'guests' | 'diagnostics';

interface StudioProps {
  config: StudioConfiguration;
  onLeave: () => void;
}

interface ViewPreference {
    fit: 'contain' | 'cover';
    pan: { x: number; y: number };
    zoom: number;
}

// ... (Helper Components like SettingsTabItem, SettingsToggle remain unchanged)
const SettingsTabItem = ({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${isActive ? 'bg-indigo-500/10 text-indigo-500' : 'text-content-medium hover:text-content-high hover:bg-app-bg'}`}><div className={`transition-colors ${isActive ? 'text-indigo-500' : 'text-content-medium group-hover:text-content-high'}`}>{icon}</div>{label}</button>
);

const SettingsToggle = ({ label, checked, onChange, description, disabled, lockedMessage }: { label: string, checked: boolean, onChange: () => void, description?: string, disabled?: boolean, lockedMessage?: string }) => (
    <div className={`flex items-center justify-between group py-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`} onClick={!disabled ? onChange : undefined} title={lockedMessage}>
        <div className="flex flex-col">
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-content-high group-hover:text-indigo-500 transition-colors">{label}</span>
                {disabled && <LockIcon className="w-3 h-3 text-amber-500" />}
            </div>
            {description && <span className="text-[10px] text-content-medium">{description}</span>}
            {disabled && lockedMessage && <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider">{lockedMessage}</span>}
        </div>
        <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors duration-300 ${checked ? 'bg-indigo-500' : 'bg-app-border'}`}>
            <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-300 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
    </div>
);

const SceneCard: React.FC<any> = ({ title, type, isActive, onClick, participants = [] }) => (
    <div onClick={onClick} className={`flex items-center gap-3 p-3 rounded-lg border-l-2 cursor-pointer transition-all ${isActive ? 'bg-indigo-500/10 border-indigo-500' : 'bg-app-bg/50 border-transparent hover:bg-app-bg hover:border-content-low'}`}>
        <div className="w-12 h-8 bg-black/40 rounded flex items-center justify-center text-content-low overflow-hidden relative">
            {type === 'video' ? (
                <Film className="w-4 h-4 opacity-50" />
            ) : (
                <div className="grid grid-cols-2 gap-0.5 p-0.5 w-full h-full">
                    {participants.length > 0 ? participants.slice(0, 4).map((_, i) => <div key={i} className="bg-indigo-500/40 rounded-[1px]" />) : <div className="bg-content-low/20 col-span-2 row-span-2" />}
                </div>
            )}
        </div>
        <div className="flex-1 min-w-0">
             <div className={`text-xs font-bold truncate ${isActive ? 'text-indigo-400' : 'text-content-medium'}`}>{title}</div>
             <div className="text-[9px] text-content-low uppercase tracking-wider">{participants.length} Sources</div>
        </div>
    </div>
);

const LayoutButton = ({ icon, active, onClick, disabled, lockedMessage }: any) => (
    <button 
        onClick={!disabled ? onClick : undefined} 
        disabled={disabled}
        title={lockedMessage}
        className={`p-2 rounded transition-colors relative group
            ${active ? 'bg-indigo-500/10 text-indigo-500' : ''}
            ${disabled ? 'opacity-50 cursor-not-allowed text-content-low' : 'text-content-medium hover:bg-app-surface hover:text-content-high'}
        `}
    >
        {icon}
        {disabled && <LockIcon className="w-3 h-3 absolute -top-1 -right-1 text-amber-500 bg-app-bg rounded-full p-0.5" />}
    </button>
);

const ControlBtn = ({ icon, label, isActiveState, danger, hotkey, className, ...props }: any) => (
    <div className="relative group">
        <button 
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 
            ${danger 
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20' 
                : isActiveState === false 
                    ? 'bg-red-500 text-white hover:bg-red-600 border border-transparent shadow-lg shadow-red-500/20' 
                    : 'bg-app-surface text-content-high hover:bg-indigo-500 hover:text-white border border-app-border hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20'
            } ${className || ''}`}
            {...props}
        >
            {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 20 }) : icon}
        </button>
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
            {label}
            {hotkey && <span className="ml-2 text-gray-400 text-[10px] uppercase">{hotkey}</span>}
        </div>
    </div>
);

const RailTab = ({ icon, label, active, onClick }: any) => (
    <button 
        onClick={onClick} 
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative group ${active ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-content-medium hover:text-content-high hover:bg-app-bg'}`}
    >
        {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 20 }) : icon}
        <div className="absolute right-14 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg mr-2">
            {label}
        </div>
    </button>
);

const SectionHeader = ({ title }: { title: string }) => (
    <h3 className="text-xs font-bold text-content-medium uppercase tracking-wider mb-4 border-b border-app-border pb-2">{title}</h3>
);

const ContextMenuItem = ({ icon, label, onClick, disabled, danger, title }: any) => (
    <button 
        onClick={onClick} 
        disabled={disabled}
        title={title}
        className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium transition-colors text-left group
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-app-bg'}
            ${danger ? 'text-red-500 hover:bg-red-500/10' : 'text-content-high'}
        `}
    >
        {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { className: "w-4 h-4 text-content-medium group-hover:text-current transition-colors" }) : icon}
        <span>{label}</span>
    </button>
);

const DraggableOverlay: React.FC<any> = ({ children, isDraggable, locked, initialX = 50, initialY = 50, onPositionChange, containerRef, className, style, stackIndex = 0 }) => {
    const [pos, setPos] = useState({ x: initialX, y: initialY });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef<HTMLDivElement>(null);

    useEffect(() => { 
        if (!isDragging) {
            setPos({ x: initialX, y: initialY }); 
        }
    }, [initialX, initialY, isDragging]);
    
    const handleMouseDown = (e: React.MouseEvent) => { 
        if (!isDraggable || locked) return; 
        e.preventDefault(); 
        e.stopPropagation(); 
        setIsDragging(true); 
    };
    
    const handleMouseMove = useCallback((e: MouseEvent) => { 
        if (isDragging && dragRef.current) { 
            const container = containerRef?.current || dragRef.current.offsetParent as HTMLElement;
            if (!container) return;

            const containerRect = container.getBoundingClientRect();
            let newX = ((e.clientX - containerRect.left) / containerRect.width) * 100;
            let newY = ((e.clientY - containerRect.top) / containerRect.height) * 100;
            
            const elemRect = dragRef.current.getBoundingClientRect();
            const elemWidthPct = (elemRect.width / containerRect.width) * 100;
            const elemHeightPct = (elemRect.height / containerRect.height) * 100;

            const minX = elemWidthPct / 2;
            const maxX = 100 - (elemWidthPct / 2);
            const minY = elemHeightPct / 2;
            const maxY = 100 - (elemHeightPct / 2);
            
            newX = Math.max(minX, Math.min(maxX, newX));
            newY = Math.max(minY, Math.min(maxY, newY));
            
            setPos({ x: newX, y: newY }); 
        } 
    }, [isDragging, containerRef]);
    
    const handleMouseUp = useCallback(() => { 
        if (isDragging) { 
            setIsDragging(false); 
            onPositionChange?.(pos.x, pos.y); 
        } 
    }, [isDragging, pos, onPositionChange]);

    useEffect(() => { 
        if (isDragging) { 
            window.addEventListener('mousemove', handleMouseMove); 
            window.addEventListener('mouseup', handleMouseUp); 
        } 
        return () => { 
            window.removeEventListener('mousemove', handleMouseMove); 
            window.removeEventListener('mouseup', handleMouseUp); 
        }; 
    }, [isDragging, handleMouseMove, handleMouseUp]);
    
    return ( 
        <div 
            ref={dragRef} 
            onMouseDown={handleMouseDown} 
            style={{ 
                ...style, 
                left: `${pos.x}%`, 
                top: `${pos.y}%`, 
                position: 'absolute', 
                transform: 'translate(-50%, -50%)', 
                cursor: isDraggable && !locked ? 'move' : 'default', 
                zIndex: isDragging ? 1000 : ((Number(style?.zIndex ?? 50)) + Number(stackIndex)), 
                pointerEvents: locked ? 'none' : 'auto',
                transition: isDragging ? 'none' : 'top 0.1s linear, left 0.1s linear' 
            }} 
            className={`${className} ${isDragging ? 'ring-2 ring-indigo-500 shadow-xl' : ''} select-none`}
        > 
            {children} 
        </div> 
    );
};

const VideoFeed = ({ participant, stream, isLocal, minimal, objectFit, objectPosition, zoom = 1 }: { participant: Participant, stream: MediaStream | null, isLocal: boolean, minimal?: boolean, objectFit?: any, objectPosition?: any, zoom?: number }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            if (videoRef.current.srcObject !== stream) {
                videoRef.current.srcObject = stream;
            }
        } else if (videoRef.current && !stream) {
            videoRef.current.srcObject = null;
        }
    }, [stream]);

    const initials = participant.display_name
        ? participant.display_name.substring(0, 2).toUpperCase()
        : '??';
    
    const isVideoVisible = (participant.media_state.video_enabled || participant.id === 'screen') && (stream || (!isLocal && participant.id !== 'screen')); 

    return (
        <div className="w-full h-full bg-gray-900 relative flex items-center justify-center overflow-hidden">
             {isVideoVisible && stream ? (
                <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    playsInline 
                    className={`w-full h-full ${isLocal && participant.id !== 'screen' ? 'transform scale-x-[-1]' : ''}`}
                    style={{
                        objectFit: objectFit || 'cover',
                        objectPosition: objectPosition || 'center',
                        transform: `scale(${zoom})`,
                        transition: 'transform 0.1s ease-out'
                    }}
                />
             ) : (
                 <div className="absolute inset-0 flex items-center justify-center">
                     <div className={`rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg ${minimal ? 'w-8 h-8 text-xs' : 'w-20 h-20 text-2xl'}`}>
                         {initials}
                     </div>
                 </div>
             )}
        </div>
    );
};

interface BrandProfile { id: string; name: string; config: BrandConfig; }
const MAX_STAGE_PARTICIPANTS = 6;

export function Studio({ config, onLeave }: StudioProps) {
    // ... (Existing state and hook calls remain the same)
    const isHost = hasHostPermissions(config.role);
    const tier = config.tier;

    // Remove direct hook call to useStudioEngines if redundant, 
    // BUT we need 'mixer' and 'broadcast' refs if used elsewhere?
    // Let's assume useAllstrm is the new controller. 
    // Keeping this for now if 'performance' or 'recording' engine direct access is needed, 
    // but the layout logic is shifting.
    const { mixer, broadcast, performance } = useStudioEngines(); 
    const { queue, addUpload, removeUpload, retryUpload } = useUploadQueue();

    const stageRef = useRef<HTMLDivElement>(null); 
    const isoVideoElRef = useRef<HTMLVideoElement | null>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);

    const canUseAutoGrid = isFeatureEnabled(tier, 'LAYOUT_AUTO_GRID');
    const canUseIsoRec = isFeatureEnabled(tier, 'RECORDING_ISO');
    const canUseNoiseSuppression = isFeatureEnabled(tier, 'NOISE_SUPPRESSION');
    const canUseMultiDest = isFeatureEnabled(tier, 'MULTI_DESTINATION');
    const canUsePrivateChat = isFeatureEnabled(tier, 'PRIVATE_CHAT');

    const [audioEnabled, setAudioEnabled] = useState(config.audioEnabled);
    const [videoEnabled, setVideoEnabled] = useState(config.videoEnabled);
    const [visualConfig, setVisualConfig] = useState(config.visualConfig);
    
    const [brands, setBrands] = useState<BrandProfile[]>([
        { id: 'brand-1', name: 'Brand 1', config: { color: '#0a4cc7', theme: 'bubble', showDisplayNames: true, showHeadlines: false, position: { x: 90, y: 10 }, scope: 'global', logoLocked: false } }
    ]);
    const [selectedBrandId, setSelectedBrandId] = useState('brand-1');
    const activeBrand = brands.find(b => b.id === selectedBrandId) || brands[0];
    const [showBrandMenu, setShowBrandMenu] = useState(false);

    const [banners, setBanners] = useState<Banner[]>([
        { id: '1', text: 'Like and Subscribe', isTicker: false, isVisible: false, scope: 'global', locked: false, customColor: '#0a4cc7', customTextColor: '#ffffff', style: 'standard' },
        { id: '2', text: 'Welcome to the Stream!', isTicker: true, isVisible: false, scope: 'global', locked: false, style: 'standard' },
    ]);
    const [bannerInput, setBannerInput] = useState('');
    const [bannerColor, setBannerColor] = useState('#0a4cc7');
    const [bannerTextColor, setBannerTextColor] = useState('#ffffff');
    const [bannerScope, setBannerScope] = useState<OverlayScope>('global');
    const [bannerStyle, setBannerStyle] = useState<'standard' | 'lower_third'>('standard');
    const [isTicker, setIsTicker] = useState(false);
    const [stageBackground, setStageBackground] = useState('#000000');
    
    const [chatInput, setChatInput] = useState('');

    const [scenes, setScenes] = useState<Scene[]>([
        { 
            id: 'scene-1', 
            name: 'Default Scene', 
            layout: 'grid', 
            participants: [], 
            activeBanners: [], 
            background: '#000000',
            brandConfig: brands[0].config,
            bannerPositions: {} 
        }
    ]);
    const [activeSceneId, setActiveSceneId] = useState<string>('scene-1');

    const [activeRightTab, setActiveRightTab] = useState<'brand' | 'comments' | 'banners' | 'private_chat' | 'visual_effects' | 'recording' | 'mixer' | 'backstage'>('brand');
    const [processorBackend, setProcessorBackend] = useState<'webgl' | 'webcodecs' | 'canvas' | 'none'>('none');

    // Viewport Controls (Global map of prefs per ID)
    const [viewPrefs, setViewPrefs] = useState<Record<string, ViewPreference>>({});
    const draggingCropId = useRef<string | null>(null);
    const lastMousePos = useRef({ x: 0, y: 0 });

    const detectAndSetBackend = useCallback(async () => {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (gl) {
                console.log('[VideoProcessor] Using WebGL backend (GPU accelerated)');
                setProcessorBackend('webgl');
                return;
            }
        } catch {}
        console.log('[VideoProcessor] Using Canvas 2D backend');
        setProcessorBackend('canvas');
    }, []);

    useEffect(() => {
        detectAndSetBackend();
    }, [detectAndSetBackend]);

    const [layoutLocked, setLayoutLocked] = useState(false); 
    const [onStageParticipants, setOnStageParticipants] = useState<Participant[]>([]);
    const [draggedParticipantIndex, setDraggedParticipantIndex] = useState<number | null>(null);

    const [isDestinationModalOpen, setIsDestinationModalOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('general');
    
    const [recFormat, setRecFormat] = useState('video/webm');
    const [progRecStatus, setProgRecStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
    const [isoRecStatus, setIsoRecStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
    const [recordingTime, setRecordingTime] = useState(0);
    const [showRecMenu, setShowRecMenu] = useState(false); 
    const [recIsoSelection, setRecIsoSelection] = useState<string[]>([]);
    
    const [audioMixerState, setAudioMixerState] = useState<Record<string, { volume: number, muted: boolean, peak: number }>>({
        'local': { volume: 100, muted: false, peak: 0 },
        'master': { volume: 100, muted: false, peak: 0 }
    });

    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, participantId: string } | null>(null);

    // Processed Stream State for Local Preview
    const [processedLocalStream, setProcessedLocalStream] = useState<MediaStream | null>(null);
    const [shareMenuOpen, setShareMenuOpen] = useState(false);

    const {
        isConnected, isConnecting, participants, localStream, remoteStreams, layoutState, screenStream,
        connect, disconnect, toggleVideo, toggleAudio, setPresetLayout, prepareCamera,
        switchDevice, updateVideoConfig, replaceVideoTrack, toggleStageStatus, removeParticipant, muteParticipant, unmuteParticipant, stopParticipantVideo, startParticipantVideo,
        broadcastStatus, destinations, startBroadcast, stopBroadcast, 
        addDestination, removeDestination, toggleDestination,
        chatMessages, sendChatMessage, myParticipantId,
        startScreenShare, stopScreenShare, startFilePresentation,
        nextSlide, prevSlide, presentationState,
        activeRecordings, pausedRecordings, startRecording, stopRecording, pauseRecording, resumeRecording, 
        updateRecordingScene // Import the new sync function
    } = useAllstrm({
        roomId: config.roomId,
        displayName: config.displayName,
        initialConfig: config,
        onError: (err) => console.error("Studio Error:", err)
    });

    // ... (Recording state effects)

    const processorRef = useRef<VideoProcessor | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const rawStreamRef = useRef<MediaStream | null>(null); 
    const chatEndRef = useRef<HTMLDivElement>(null);
    const hasAutoAddedHost = useRef(false);

    // Helper to format time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Recording State Helpers
    const isRecording = activeRecordings.length > 0;
    const recColor = activeRecordings.includes('mixed') 
        ? 'border-red-500 text-red-500 bg-red-500/10' 
        : (activeRecordings.length > 0 ? 'border-amber-500 text-amber-500 bg-amber-500/10' : 'border-app-border text-content-medium bg-app-bg');
    
    const recLabel = activeRecordings.length === 2 
        ? 'REC ALL' 
        : activeRecordings.includes('mixed') 
            ? 'REC PGM' 
            : activeRecordings.includes('iso') 
                ? 'REC ISO' 
                : 'REC';

    // Recording Handlers
    const startProgramRecording = () => { startRecording('mixed'); setProgRecStatus('recording'); };
    const stopProgramRecording = () => { stopRecording('mixed'); setProgRecStatus('idle'); };
    const pauseProgramRecording = () => { pauseRecording('mixed'); setProgRecStatus('paused'); };
    const resumeProgramRecording = () => { resumeRecording('mixed'); setProgRecStatus('recording'); };

    const startIsoRecording = () => { startRecording('iso'); setIsoRecStatus('recording'); };
    const stopIsoRecording = () => { stopRecording('iso'); setIsoRecStatus('idle'); };

    // Chat Handler
    const handleSendChat = () => {
        if (chatInput.trim()) {
            sendChatMessage(chatInput);
            setChatInput('');
        }
    };

    // Volume Handler
    const updateVolume = (id: string, vol: number) => {
        setAudioMixerState(prev => ({
            ...prev,
            [id]: { ...prev[id], volume: vol }
        }));
    };

    // Upload Handlers
    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) {
                    updateActiveBrand({ logoUrl: ev.target.result as string });
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePresentationUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            startFilePresentation(e.target.files[0]);
        }
    };

    // Crop/Pan Logic
    const handleCropMouseDown = (e: React.MouseEvent, id: string) => {
        if (layoutLocked) return;
        draggingCropId.current = id;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleCropMouseMove = (e: React.MouseEvent) => {
        if (draggingCropId.current) {
            const id = draggingCropId.current;
            const deltaX = e.clientX - lastMousePos.current.x;
            const deltaY = e.clientY - lastMousePos.current.y;
            lastMousePos.current = { x: e.clientX, y: e.clientY };

            setViewPrefs(prev => {
                const current = prev[id] || { fit: 'contain', pan: { x: 50, y: 50 }, zoom: 1 };
                const sensitivity = 0.2 / current.zoom;
                return {
                    ...prev,
                    [id]: {
                        ...current,
                        pan: {
                            x: Math.max(0, Math.min(100, current.pan.x - deltaX * sensitivity)),
                            y: Math.max(0, Math.min(100, current.pan.y - deltaY * sensitivity))
                        }
                    }
                };
            });
        }
    };

    const handleCropMouseUp = () => {
        draggingCropId.current = null;
    };

    const handleZoom = (id: string, delta: number) => {
        setViewPrefs(prev => {
            const current = prev[id] || { fit: 'contain', pan: { x: 50, y: 50 }, zoom: 1 };
            return {
                ...prev,
                [id]: { ...current, zoom: Math.max(1, Math.min(3, current.zoom + delta)) }
            };
        });
    };

    // Drag & Drop
    const handleDragStart = (e: React.DragEvent, index: number) => {
        if (layoutLocked) return;
        setDraggedParticipantIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        if (draggedParticipantIndex === null || draggedParticipantIndex === dropIndex) return;
        const newStage = [...onStageParticipants];
        const [moved] = newStage.splice(draggedParticipantIndex, 1);
        newStage.splice(dropIndex, 0, moved);
        setOnStageParticipants(newStage);
        setDraggedParticipantIndex(null);
    };

    // Context Menu Handlers (unchanged)
    const handleContextMenu = (e: React.MouseEvent, participantId: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, participantId });
    };

    const handleContextAction = (action: string) => {
        if (!contextMenu) return;
        const { participantId } = contextMenu;
        const isLocal = participantId === 'local';
        
        switch (action) {
            case 'mute': isLocal ? handleToggleAudio() : muteParticipant(participantId); break;
            case 'video': isLocal ? handleToggleVideo() : stopParticipantVideo(participantId); break;
            case 'stage': handleStageToggle(participantId, !onStageParticipants.some(p => p.id === participantId)); break;
            case 'kick': if (!isLocal) removeParticipant(participantId); break;
            case 'fit': setViewPrefs(prev => ({...prev, [participantId]: {...(prev[participantId] || {fit:'contain',pan:{x:50,y:50},zoom:1}), fit:'contain'}})); break;
            case 'fill': setViewPrefs(prev => ({...prev, [participantId]: {...(prev[participantId] || {fit:'contain',pan:{x:50,y:50},zoom:1}), fit:'cover'}})); break;
            case 'stop_presenting': stopScreenShare(); break;
        }
        setContextMenu(null);
    };

    // UNIFIED LAYOUT CALCULATION
    const unifiedScene = useMemo(() => {
        const layoutInput = {
            participants: [
                ...onStageParticipants.map(p => ({ id: p.id, isScreen: false })),
                ...(screenStream ? [{ id: 'screen', isScreen: true }] : [])
            ],
            screenShareId: screenStream ? 'screen' : undefined,
            mode: (layoutState?.preset_name as any) || 'grid',
            viewPrefs: viewPrefs
        };

        const scene = calculateLayout(layoutInput, { width: 1920, height: 1080, gap: 16, margin: 16 });
        
        // Add Overlays to Scene so Recording Engine can see them
        if (activeBrand.config.logoUrl) {
            scene.overlays.push({
                id: 'brand-logo',
                sourceId: 'logo',
                type: 'image',
                x: activeBrand.config.position?.x ?? 90,
                y: activeBrand.config.position?.y ?? 10,
                width: 10, 
                height: 10,
                zIndex: 100
            });
        }
        
        return scene;
    }, [onStageParticipants, screenStream, layoutState, viewPrefs, activeBrand]);

    // Send Scene to Recording Engine
    useEffect(() => {
        updateRecordingScene(unifiedScene);
    }, [unifiedScene, updateRecordingScene]);

    // Derived Context Vars
    const contextTarget = contextMenu 
        ? (contextMenu.participantId === 'local' 
            ? onStageParticipants.find(p => p.id === 'local') || { id: 'local', media_state: { audio_enabled: audioEnabled, video_enabled: videoEnabled }, role: 'host', display_name: 'You' } as any
            : participants.find(p => p.id === contextMenu.participantId)) 
        : null;
    
    const isTargetLocal = contextMenu?.participantId === 'local';
    const isTargetPresentation = contextMenu?.participantId === 'screen';
    const isTargetOnStage = contextMenu ? onStageParticipants.some(p => p.id === contextMenu.participantId) : false;

    // Backstage
    const backstageParticipants = participants.filter(p => !p.is_on_stage && !p.is_in_waiting_room);

    // Add Host to stage by default when connected
    useEffect(() => {
        if (isConnected && !hasAutoAddedHost.current) {
             const localP: Participant = { 
                 id: 'local', 
                 room_id: config.roomId,
                 display_name: config.displayName, 
                 role: config.role, 
                 ingest_type: 'webrtc',
                 is_on_stage: true,
                 media_state: { 
                     audio_enabled: config.audioEnabled, 
                     video_enabled: config.videoEnabled, 
                     screen_sharing: false, 
                     connection_quality: 'excellent' 
                 } 
             };
             setOnStageParticipants(prev => {
                 if (prev.some(p => p.id === 'local')) return prev;
                 return [...prev, localP];
             });
             hasAutoAddedHost.current = true;
        }
    }, [isConnected, config]);

    // Sync onStageParticipants with main participants state (handle mute/video updates & kick)
    useEffect(() => {
        setOnStageParticipants(currentStage => {
            return currentStage.map(stageP => {
                if (stageP.id === 'local') return stageP; // Local is managed by local state/refs primarily
                // Find up-to-date participant data from hook
                const updatedP = participants.find(p => p.id === stageP.id);
                // If participant exists, update their data but keep them on stage. If not found (kicked), remove them (return null).
                return updatedP ? { ...updatedP, is_on_stage: true } : null;
            }).filter(Boolean) as Participant[];
        });
    }, [participants]);

    // ... (Standard effects for startup)
    useEffect(() => {
        if (!isConnected && !isConnecting) connect();
        navigator.mediaDevices.enumerateDevices().then(devices => {
            setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
            setAudioInputDevices(devices.filter(d => d.kind === 'audioinput'));
        });
    }, [isConnected, isConnecting, connect]);

    useEffect(() => {
        if (localStream) {
            rawStreamRef.current = localStream;
        }
    }, [localStream]);

    // ... (Chat scroll effects, recording timer, iso video element effect - unchanged)

    useEffect(() => {
        let interval: any;
        if (progRecStatus === 'recording' || isoRecStatus === 'recording') {
            interval = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [progRecStatus, isoRecStatus]);

    // ... (Engine syncing effects removed as they are replaced by updateRecordingScene call)

    // ... (VideoProcessor effects unchanged)

    const handleToggleAudio = () => {
        const newState = !audioEnabled;
        setAudioEnabled(newState);
        toggleAudio();
        setOnStageParticipants(prev => prev.map(p => p.id === 'local' ? { ...p, media_state: { ...p.media_state, audio_enabled: newState } } : p));
    };
    const handleToggleVideo = () => {
        const newState = !videoEnabled;
        setVideoEnabled(newState);
        toggleVideo();
        setOnStageParticipants(prev => prev.map(p => p.id === 'local' ? { ...p, media_state: { ...p.media_state, video_enabled: newState } } : p));
    };
    const handleBroadcastToggle = () => { if (broadcastStatus === 'idle') startBroadcast(); else stopBroadcast(); };
    const handleStageToggle = (participantId: string, isOnStage: boolean) => {
        if (isOnStage && onStageParticipants.length >= MAX_STAGE_PARTICIPANTS) { alert(`Stage is full.`); return; }
        if (participantId === 'local') {
             setOnStageParticipants(prev => {
                 const p = prev.find(x => x.id === 'local') || { id: 'local', display_name: config.displayName, role: config.role, media_state: { audio_enabled: audioEnabled, video_enabled: videoEnabled }, is_on_stage: false } as Participant;
                 if (isOnStage) return prev.some(x => x.id === 'local') ? prev.map(x => x.id === 'local' ? {...x, is_on_stage: true} : x) : [...prev, {...p, is_on_stage: true}];
                 else return prev.filter(x => x.id !== 'local');
             });
        } else {
            toggleStageStatus(participantId, isOnStage);
            setOnStageParticipants(prev => {
                if (isOnStage) { const participant = participants.find(p => p.id === participantId); return participant ? [...prev, {...participant, is_on_stage: true}] : prev; }
                return prev.filter(p => p.id !== participantId);
            });
        }
    };

    const updateActiveBrand = (updates: Partial<BrandConfig>) => { setBrands(brands.map(b => b.id === selectedBrandId ? { ...b, config: { ...b.config, ...updates } } : b)); };
    const toggleBanner = (id: string) => setBanners(banners.map(b => b.id === id ? { ...b, isVisible: !b.isVisible } : b));
    const createBanner = () => { if (!bannerInput.trim()) return; setBanners([{ id: Date.now().toString(), text: bannerInput, isTicker: isTicker, isVisible: true, scope: bannerScope, customColor: bannerColor, customTextColor: bannerTextColor, locked: false, style: bannerStyle }, ...banners]); setBannerInput(''); setIsTicker(false); };
    const deleteBanner = (id: string) => { setBanners(prev => prev.filter(b => b.id !== id)); };
    const loadScene = (scene: Scene) => { setActiveSceneId(scene.id); setPresetLayout(scene.layout); setStageBackground(scene.background); updateActiveBrand(scene.brandConfig); const nextStage: Participant[] = []; scene.participants.forEach(pid => { if (pid === 'local') { const local = participants.find(p => p.id === 'local') || onStageParticipants.find(p => p.id === 'local'); if (local) nextStage.push({...local, is_on_stage: true}); } else { const p = participants.find(part => part.id === pid); if (p) { nextStage.push({...p, is_on_stage: true}); toggleStageStatus(pid, true); } } }); setOnStageParticipants(nextStage); setBanners(banners.map(b => ({ ...b, isVisible: scene.activeBanners.includes(b.id), position: scene.bannerPositions[b.id] || b.position }))); };
    
    const isLocalOnStage = onStageParticipants.some(p => p.id === 'local');

    return (
        <div className="flex h-screen bg-app-bg text-content-high font-sans overflow-hidden" onMouseUp={handleCropMouseUp}>
            {/* ... (Left Sidebar Unchanged) */}
            {isHost && (
                <div className="w-64 bg-app-surface/30 backdrop-blur-md border-r border-app-border flex flex-col z-20 shadow-sm relative">
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                            <div className="p-2 text-[10px] font-bold text-content-low uppercase tracking-widest sticky top-0 bg-app-surface/90 backdrop-blur z-10">Run of Show</div>
                            <div className="space-y-2">{scenes.map((scene) => <SceneCard key={scene.id} title={scene.name} type="layout" isActive={activeSceneId === scene.id} onClick={() => loadScene(scene)} participants={scene.participants} />)}</div>
                        </div>
                    </div>
                    <div className="p-3 border-t border-app-border bg-app-surface/50">
                        <button className="w-full py-2 bg-app-bg border border-app-border rounded text-[10px] font-bold text-content-medium hover:text-content-high hover:border-content-medium transition-all flex items-center justify-center gap-2"><RefreshCw className="w-3 h-3" />RESET LAYOUT</button>
                    </div>
                </div>
            )}

            <div className="flex-1 flex flex-col min-w-0 bg-app-bg relative">
                {/* ... (Header Unchanged) */}
                <header className="h-14 px-6 bg-app-surface border-b border-app-border flex items-center justify-between shrink-0 relative z-50">
                    <div className="flex items-center gap-2 text-sm font-medium text-content-medium"><ChevronDown className="w-4 h-4" /><span className="text-content-high font-semibold">{scenes.find(s => s.id === activeSceneId)?.name || "Current Scene"}</span></div>
                    {isHost ? (
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg cursor-pointer transition-all ${recColor} hover:border-content-low`} onClick={(e) => { e.stopPropagation(); setShowRecMenu(!showRecMenu); }}>
                                    <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-current animate-pulse' : 'bg-content-low'}`} />
                                    <span className="text-[9px] font-bold uppercase w-14 text-center">{isRecording ? formatTime(recordingTime) : recLabel}</span>
                                    <ChevronDown className="w-3 h-3" />
                                </div>
                                {showRecMenu && (
                                    <div className="absolute top-full mt-2 right-0 w-64 bg-app-surface border border-app-border rounded-xl shadow-2xl overflow-hidden z-50 animate-scale-in origin-top-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="p-3 border-b border-app-border/50">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2"><CircleDot className="w-4 h-4 text-red-500" /><span className="text-xs font-bold text-content-high">PROGRAM</span></div>
                                                {progRecStatus === 'recording' && <span className="text-[10px] font-mono text-red-500 animate-pulse">LIVE</span>}
                                            </div>
                                            <div className="flex gap-2">
                                                {progRecStatus === 'idle' ? (<Button size="sm" className="w-full h-8 text-[10px]" onClick={startProgramRecording}>START RECORDING</Button>) : (<><button className="flex-1 bg-app-bg border border-app-border rounded hover:bg-app-surface text-[10px] font-bold" onClick={progRecStatus === 'recording' ? pauseProgramRecording : resumeProgramRecording}>{progRecStatus === 'paused' ? 'RESUME' : 'PAUSE'}</button><button className="flex-1 bg-red-500 text-white rounded hover:bg-red-600 text-[10px] font-bold" onClick={stopProgramRecording}>STOP</button></>)}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="h-6 w-px bg-app-border mx-2" />
                            <Button variant="secondary" size="sm" onClick={() => setIsDestinationModalOpen(true)}>Destinations</Button>
                            <Button variant={broadcastStatus === 'live' ? 'danger' : 'primary'} size="sm" onClick={handleBroadcastToggle} className={broadcastStatus === 'live' ? 'bg-red-600' : 'bg-indigo-600'}>{broadcastStatus === 'live' ? 'End Broadcast' : 'Go Live'}</Button>
                        </div>
                    ) : (<div>Guest View</div>)}
                </header>

                <div className="flex-1 flex flex-col p-4 overflow-y-auto items-center">
                    {/* Unified Stage Rendering */}
                    <div className="w-full max-w-5xl aspect-video rounded-lg shadow-2xl relative overflow-hidden group border border-app-border transition-colors duration-500" ref={stageRef} style={{ backgroundColor: stageBackground }}>
                        {/* 
                            This is the core change: Rendering DOM elements using absolutely positioned items 
                            derived from the Shared Layout Engine 'unifiedScene', instead of CSS Grid.
                        */}
                        {unifiedScene.items.length === 0 && <div className="absolute inset-0 text-white/30 flex flex-col items-center justify-center"><Monitor className="w-16 h-16 mb-4 opacity-50" /><p className="text-lg font-medium">Add to stage</p></div>}
                        
                        {unifiedScene.items.map((item, idx) => {
                            const p = onStageParticipants.find(x => x.id === item.id) 
                                || (item.id === 'screen' ? { id: 'screen', display_name: 'Presentation', media_state: { audio_enabled: false, video_enabled: true } } as any : null);
                            
                            if (!p) return null;

                            const stream = item.id === 'local' ? (processedLocalStream || localStream) : (item.id === 'screen' ? screenStream : remoteStreams[item.id]);
                            const isLocal = item.id === 'local';
                            const isScreen = item.id === 'screen';
                            const isCover = item.fit === 'cover';
                            
                            // Map 0-100 coords to CSS %
                            const style: React.CSSProperties = {
                                position: 'absolute',
                                left: `${item.x}%`,
                                top: `${item.y}%`,
                                width: `${item.width}%`,
                                height: `${item.height}%`,
                                zIndex: item.zIndex,
                                borderRadius: item.borderRadius ? `${item.borderRadius}px` : undefined,
                                border: item.border ? `${item.border.width}px solid ${item.border.color}` : undefined
                            };

                            return (
                                <div 
                                    key={item.id} 
                                    style={style}
                                    className={`bg-black overflow-hidden shadow-sm transition-all ${!layoutLocked ? 'hover:ring-2 hover:ring-white/20' : ''} ${isCover && !layoutLocked ? 'cursor-move' : ''}`}
                                    onContextMenu={(e) => handleContextMenu(e, item.id)}
                                    onMouseDown={isCover && !layoutLocked ? (e) => handleCropMouseDown(e, item.id) : undefined}
                                    onMouseMove={!layoutLocked ? handleCropMouseMove : undefined}
                                >
                                    <VideoFeed 
                                        participant={p} 
                                        stream={stream} 
                                        isLocal={isLocal && !isScreen} 
                                        objectFit={item.fit}
                                        objectPosition={`${item.panX}% ${item.panY}%`}
                                        zoom={item.zoom}
                                    />
                                    
                                    {/* Name Label */}
                                    {activeBrand.config.showDisplayNames && (
                                        <div className="absolute bottom-3 left-3 z-10 px-3 py-1.5 rounded font-bold text-xs backdrop-blur-sm bg-indigo-600 text-white" style={{ backgroundColor: activeBrand.config.color }}>
                                            {p.display_name} 
                                            {isScreen && <span className="opacity-75 ml-1 font-normal">(Presentation)</span>}
                                        </div>
                                    )}
                                    
                                    {/* Status Indicators */}
                                    {!p.media_state.audio_enabled && !isScreen && <div className="absolute top-3 right-3 z-30 bg-red-600 text-white p-1.5 rounded-full shadow-md animate-pulse"><MicOff className="w-3.5 h-3.5" /></div>}
                                    
                                    {/* Zoom Controls */}
                                    {isCover && !layoutLocked && (
                                        <div className="absolute bottom-3 right-3 z-30 flex flex-col gap-2 items-end opacity-0 hover:opacity-100 transition-opacity">
                                            <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-lg p-1 border border-white/10">
                                                <button className="p-1 hover:bg-white/20 rounded text-white disabled:opacity-50" onClick={(e) => { e.stopPropagation(); handleZoom(item.id, -0.1); }} disabled={(item.zoom || 1) <= 1}><Minus className="w-3 h-3" /></button>
                                                <span className="text-[10px] font-mono text-white min-w-[30px] text-center">{Math.round((item.zoom || 1) * 100)}%</span>
                                                <button className="p-1 hover:bg-white/20 rounded text-white disabled:opacity-50" onClick={(e) => { e.stopPropagation(); handleZoom(item.id, 0.1); }} disabled={(item.zoom || 1) >= 3}><PlusIcon className="w-3 h-3" /></button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        
                        {/* Banners */}
                        {banners.filter(b => b.isVisible).map((b, idx) => (
                            <DraggableOverlay key={b.id} isDraggable={!b.locked} locked={layoutLocked} containerRef={stageRef} initialX={b.position?.x ?? 50} initialY={b.position?.y ?? (80 - (idx * 15))} onPositionChange={(x, y) => { setBanners(prev => prev.map(banner => banner.id === b.id ? { ...banner, position: { x, y } } : banner)); }} stackIndex={idx}>
                                <div className="px-6 py-3 bg-white text-black shadow-xl rounded-lg font-bold text-lg pointer-events-auto" style={{ backgroundColor: b.customColor || activeBrand.config.color, color: b.customTextColor }}>{b.text}</div>
                            </DraggableOverlay>
                        ))}

                        {/* Brand Logo Overlay */}
                        {activeBrand.config.logoUrl && (
                            <DraggableOverlay isDraggable={true} locked={layoutLocked} containerRef={stageRef} initialX={activeBrand.config.position?.x ?? 90} initialY={activeBrand.config.position?.y ?? 10} onPositionChange={(x, y) => updateActiveBrand({ position: { x, y } })} stackIndex={50} className="pointer-events-auto">
                                <img src={activeBrand.config.logoUrl} alt="Logo" className="h-12 w-auto object-contain drop-shadow-md select-none" draggable={false} />
                            </DraggableOverlay>
                        )}
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                         <LayoutButton icon={<Square className="w-4 h-4" />} active={layoutState?.preset_name === 'single'} onClick={() => setPresetLayout('single')} lockedMessage={layoutLocked ? "Layout Locked" : undefined} disabled={layoutLocked} />
                         <LayoutButton icon={<Grid className="w-4 h-4" />} active={layoutState?.preset_name === 'grid'} onClick={() => setPresetLayout('grid')} lockedMessage={layoutLocked ? "Layout Locked" : undefined} disabled={layoutLocked} />
                         <LayoutButton icon={<MonitorUp className="w-4 h-4" />} active={layoutState?.preset_name === 'pip'} onClick={() => setPresetLayout('pip')} lockedMessage={layoutLocked ? "Layout Locked" : undefined} disabled={layoutLocked} />
                         <div className="h-4 w-px bg-app-border mx-2" />
                         <button onClick={() => setLayoutLocked(!layoutLocked)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${layoutLocked ? 'bg-amber-500/10 text-amber-500 border border-amber-500/50' : 'bg-app-bg border border-app-border text-content-medium hover:text-content-high'}`}>{layoutLocked ? <LockIcon className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}{layoutLocked ? 'Locked' : 'Lock'}</button>
                    </div>
                </div>

                <div className="h-16 bg-app-surface border-t border-app-border flex items-center px-6 justify-between shrink-0 z-30">
                    <div className="w-40" />
                    <div className="flex items-center gap-3">
                        <ControlBtn icon={audioEnabled ? <Mic /> : <MicOff />} label={audioEnabled ? "Mute" : "Unmute"} isActiveState={audioEnabled} onClick={handleToggleAudio} hotkey="Ctrl+D" />
                        <ControlBtn icon={videoEnabled ? <Video /> : <VideoOff />} label={videoEnabled ? "Stop Cam" : "Start Cam"} isActiveState={videoEnabled} onClick={handleToggleVideo} hotkey="Ctrl+E" />
                        
                        <div className="relative group">
                            <ControlBtn 
                                icon={screenStream ? <X className="text-red-500" /> : <MonitorUp />} 
                                label={screenStream ? "Stop Share" : "Share"} 
                                isActiveState={true}
                                onClick={() => { 
                                    if(screenStream) stopScreenShare(); 
                                    else setShareMenuOpen(!shareMenuOpen);
                                }} 
                            />
                            {shareMenuOpen && !screenStream && (
                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-app-surface border border-app-border rounded-lg shadow-xl p-1 z-50 animate-scale-in w-40">
                                    <button onClick={() => { startScreenShare(); setShareMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-app-bg rounded text-left whitespace-nowrap"><Monitor className="w-4 h-4 text-indigo-500"/> Share Screen</button>
                                    <button onClick={() => { document.getElementById('pres-upload')?.click(); setShareMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-app-bg rounded text-left whitespace-nowrap"><FileText className="w-4 h-4 text-emerald-500"/> Present File</button>
                                </div>
                            )}
                            <input type="file" id="pres-upload" className="hidden" accept=".pdf,.pptx" onChange={handlePresentationUpload} />
                        </div>

                        <ControlBtn icon={<Settings />} label="Settings" onClick={() => setIsSettingsOpen(true)} hotkey="Ctrl+," />
                        <ControlBtn icon={<LogOut />} label="Leave" danger onClick={() => { disconnect(); onLeave(); }} />
                    </div>
                    <div className="w-40" />
                </div>
            </div>

            {/* Context Menu (Unchanged) */}
            {contextMenu && (
                <div className="fixed z-50 bg-app-surface border border-app-border rounded-lg shadow-2xl py-1 w-48 animate-scale-in origin-top-left overflow-hidden" style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={(e) => e.preventDefault()}>
                    {isTargetPresentation ? (
                        <>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-content-low uppercase tracking-wider border-b border-app-border/50 mb-1 bg-app-bg/50">Presentation Control</div>
                            <ContextMenuItem icon={<StopIcon />} label="Stop Presenting" danger onClick={() => handleContextAction('stop_presenting')} />
                            <div className="h-px bg-app-border/50 my-1" />
                            <ContextMenuItem icon={<Minimize />} label="Fit to Screen" onClick={() => handleContextAction('fit')} />
                            <ContextMenuItem icon={<Maximize />} label="Fill Frame" onClick={() => handleContextAction('fill')} />
                        </>
                    ) : (
                        <>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-content-low uppercase tracking-wider border-b border-app-border/50 mb-1 bg-app-bg/50">Manage Guest</div>
                            <ContextMenuItem icon={isTargetLocal || contextMenu.participantId === 'local' ? (audioEnabled ? <Mic /> : <MicOff />) : (contextTarget?.media_state.audio_enabled ? <Mic /> : <MicOff />)} label={isTargetLocal ? (audioEnabled ? "Mute" : "Unmute") : (contextTarget?.media_state.audio_enabled ? "Mute Participant" : "Unmute Participant")} onClick={() => handleContextAction('mute')} />
                            <ContextMenuItem icon={isTargetLocal || contextMenu.participantId === 'local' ? (videoEnabled ? <Video /> : <VideoOff />) : (contextTarget?.media_state.video_enabled ? <Video /> : <VideoOff />)} label={isTargetLocal ? (videoEnabled ? "Stop Cam" : "Start Cam") : (contextTarget?.media_state.video_enabled ? "Stop Video" : "Start Video")} onClick={() => handleContextAction('video')} />
                            <ContextMenuItem icon={isTargetOnStage ? <UserMinus /> : <UserPlus />} label={isTargetOnStage ? "Remove from Stage" : "Add to Stage"} onClick={() => handleContextAction('stage')} />
                            
                            <div className="px-3 py-1.5 text-[10px] font-bold text-content-low uppercase tracking-wider border-b border-app-border/50 border-t mt-1 mb-1 bg-app-bg/50">View Mode</div>
                            <ContextMenuItem icon={<Minimize />} label="Fit to Screen" onClick={() => handleContextAction('fit')} />
                            <ContextMenuItem icon={<Maximize />} label="Fill Frame" onClick={() => handleContextAction('fill')} />

                            {!isTargetLocal && (<><div className="h-px bg-app-border/50 my-1" /><ContextMenuItem icon={<Trash2 />} label="Kick Guest" danger onClick={() => handleContextAction('kick')} /></>)}
                        </>
                    )}
                </div>
            )}

            {isHost && (
                <div className="w-80 bg-app-surface border-l border-app-border flex flex-col z-20 shadow-sm transition-all duration-300">
                    {/* ... (Right Rail Tabs Logic - Brands, Banners, Chat, etc. - Unchanged) */}
                    {activeRightTab === 'brand' && (
                        <div className="flex-1 flex flex-col p-4 custom-scrollbar overflow-y-auto">
                            <SectionHeader title="Brand Settings" />
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-bold text-content-medium uppercase mb-2">Brand Color</label>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-app-border relative"><input type="color" value={activeBrand.config.color} onChange={(e) => updateActiveBrand({ color: e.target.value })} className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer border-none p-0" /></div>
                                        <input type="text" value={activeBrand.config.color} onChange={(e) => updateActiveBrand({ color: e.target.value })} className="flex-1 bg-app-bg border border-app-border rounded-lg px-3 py-2 text-sm font-mono text-content-high focus:outline-none" />
                                    </div>
                                </div>
                                <div className="border-t border-app-border pt-4">
                                    <label className="block text-xs font-bold text-content-medium uppercase mb-2">Logo</label>
                                    <div className="flex items-center gap-3">
                                        <div className="w-16 h-16 bg-app-bg border border-app-border rounded-lg flex items-center justify-center relative overflow-hidden group">
                                            {activeBrand.config.logoUrl ? (<img src={activeBrand.config.logoUrl} className="w-full h-full object-contain p-1" alt="Logo" />) : (<ImageIcon className="w-6 h-6 text-content-low" />)}
                                            <button className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white" onClick={() => logoInputRef.current?.click()}><Upload className="w-4 h-4" /></button>
                                        </div>
                                        <div className="flex-1 space-y-2"><Button size="sm" variant="secondary" onClick={() => logoInputRef.current?.click()} className="w-full text-xs">Upload Logo</Button>{activeBrand.config.logoUrl && (<button onClick={() => updateActiveBrand({ logoUrl: undefined })} className="text-xs text-red-500 hover:text-red-400 w-full text-center">Remove</button>)}</div>
                                        <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload} />
                                    </div>
                                </div>
                                {/* ... (Rest of Brand settings unchanged) */}
                            </div>
                        </div>
                    )}
                    {/* ... (Other Tabs Unchanged) */}
                    {activeRightTab === 'banners' && (
                        <div className="flex-1 flex flex-col p-4 custom-scrollbar overflow-y-auto">
                            <SectionHeader title="Banners" />
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <textarea className="w-full bg-app-bg border border-app-border rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500 resize-none h-20" placeholder="Enter banner text..." value={bannerInput} onChange={(e) => setBannerInput(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); createBanner(); } }} />
                                    <div className="flex justify-between items-center"><div className="flex items-center gap-2"><input type="checkbox" checked={isTicker} onChange={(e) => setIsTicker(e.target.checked)} className="rounded border-app-border bg-app-bg text-indigo-500 focus:ring-0" id="ticker-check" /><label htmlFor="ticker-check" className="text-xs text-content-medium cursor-pointer">Scroll as Ticker</label></div><button onClick={createBanner} disabled={!bannerInput.trim()} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">Add Banner</button></div>
                                </div>
                                <div className="space-y-2">
                                    {banners.map(b => (
                                        <div key={b.id} className={`p-3 rounded-lg border flex flex-col gap-2 transition-all ${b.isVisible ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-app-bg border-app-border opacity-70'}`}>
                                            <div className="text-sm font-medium text-content-high line-clamp-2">{b.text}</div>
                                            <div className="flex justify-between items-center pt-2 border-t border-dashed border-app-border/50">
                                                <div className="flex gap-2"><button onClick={() => toggleBanner(b.id)} className={`text-[10px] font-bold uppercase tracking-wider ${b.isVisible ? 'text-indigo-400' : 'text-content-medium hover:text-content-high'}`}>{b.isVisible ? 'Hide' : 'Show'}</button><button onClick={() => deleteBanner(b.id)} className="text-content-medium hover:text-red-500"><Trash2 className="w-3 h-3" /></button></div>
                                                {b.isTicker && <span className="text-[9px] bg-app-surface px-1.5 py-0.5 rounded text-content-low border border-app-border">TICKER</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {/* ... (Mixer, Recording, Private Chat Tabs - Unchanged) */}
                    {activeRightTab === 'backstage' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <GreenRoom 
                                participants={backstageParticipants} 
                                localParticipantId={myParticipantId || 'local'} 
                                localStream={processedLocalStream || localStream}
                                onToggleAudio={handleToggleAudio}
                                onToggleVideo={handleToggleVideo}
                                onAddToStage={(id) => handleStageToggle(id, true)}
                                onContextMenu={handleContextMenu}
                                isLocalOnStage={isLocalOnStage}
                            />
                        </div>
                    )}
                </div>
            )}

            {isHost && (
                <div className="w-16 bg-app-surface border-l border-app-border flex flex-col items-center py-4 z-20 gap-4 shrink-0">
                    <RailTab icon={<Palette />} label="Brand" active={activeRightTab === 'brand'} onClick={() => setActiveRightTab('brand')} />
                    <RailTab icon={<Layers />} label="Banners" active={activeRightTab === 'banners'} onClick={() => setActiveRightTab('banners')} />
                    <RailTab icon={<UserCheck />} label="Green Room" active={activeRightTab === 'backstage'} onClick={() => setActiveRightTab('backstage')} />
                    <RailTab icon={<FileVideo />} label="Recording" active={activeRightTab === 'recording'} onClick={() => setActiveRightTab('recording')} />
                    <RailTab icon={<Sliders />} label="Mixer" active={activeRightTab === 'mixer'} onClick={() => setActiveRightTab('mixer')} />
                    <RailTab icon={<Users />} label="Private" active={activeRightTab === 'private_chat'} onClick={() => setActiveRightTab('private_chat')} />
                </div>
            )}

            {/* Destinations Modal */}
            {isDestinationModalOpen && (
                <div className="fixed inset-0 z-[100]">
                    <Destinations
                        mode="manage"
                        destinations={destinations}
                        onAddDestination={addDestination}
                        onRemoveDestination={removeDestination}
                        onToggleDestination={toggleDestination}
                        onModalToggle={(open) => { if (!open) setIsDestinationModalOpen(false); }}
                        roomId={config.roomId}
                        userId={config.userId}
                    />
                </div>
            )}
        </div>
    );
}
