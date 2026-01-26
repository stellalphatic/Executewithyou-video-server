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
    FileVideo, Clock, CircleDot, UserX, Camera, FileText, ChevronLeft, ChevronRight, Maximize, Minimize, Move, StopCircle as StopIcon, ZoomIn, ZoomOut, Minus, Plus as PlusIcon, RotateCcw,
    ArrowRight, Globe, AlertTriangle, Shield
} from 'lucide-react';
import { useAllstrmLiveKit } from '@/hooks/useAllstrmLiveKit';
import { useStudioEngines } from '@/hooks/useStudioEngines';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { Button } from './Button';
import { Participant, StudioConfiguration, BrandConfig, Banner, LayoutState, OverlayScope, Tier, BRANDING_TIER_REQUIREMENTS, LogoPosition, LogoSize, OverlayType, TickerSpeed } from '@/types';
import { Scene as EngineScene, SceneItem } from '../types/layout';
import { Destinations } from './Destinations';
import { VideoProcessor } from '@/utils/VideoProcessor';
import { isFeatureEnabled, hasHostPermissions, getUpgradeMessage, FeatureId, GuestPermissionConfig, DEFAULT_GUEST_PERMISSIONS, PerGuestPermissions } from '@/utils/permissions';
import { GreenRoom } from './GreenRoom/GreenRoom';
import { UploadQueue } from './UploadQueue';
import { calculateLayout } from '@/utils/layoutEngine';
import { BrandingPanel } from './studio/BrandingPanel';
import { OverlayPanel } from './studio/OverlayPanel';
import { AllstrmWatermark } from './studio/AllstrmWatermark';
import { DraggableOverlay } from './studio/DraggableOverlay';
import { PrivateChatPanel } from './studio/PrivateChatPanel';
import { StreamHealthMonitor } from './studio/StreamHealthMonitor';
import { GuestPermissionsPanel } from './studio/GuestPermissionsPanel';

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
                    {participants.length > 0 ? participants.slice(0, 4).map((_: unknown, i: number) => <div key={i} className="bg-indigo-500/40 rounded-[1px]" />) : <div className="bg-content-low/20 col-span-2 row-span-2" />}
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

const ControlBtn = ({ icon, label, isActiveState, danger, hotkey, className, locked, lockedMessage, ...props }: any) => (
    <div className="relative group">
        <button
            disabled={locked}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 relative
            ${locked
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700 opacity-60'
                    : danger
                        ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20'
                        : isActiveState === false
                            ? 'bg-red-500 text-white hover:bg-red-600 border border-transparent shadow-lg shadow-red-500/20'
                            : 'bg-app-surface text-content-high hover:bg-indigo-500 hover:text-white border border-app-border hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20'
                } ${className || ''}`}
            {...props}
        >
            {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 20 }) : icon}
            {locked && <LockIcon className="w-3.5 h-3.5 absolute -top-1 -right-1 text-amber-500 bg-gray-900 rounded-full p-0.5 border border-amber-500/30" />}
        </button>
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
            {locked ? (lockedMessage || 'Restricted by host') : label}
            {!locked && hotkey && <span className="ml-2 text-gray-400 text-[10px] uppercase">{hotkey}</span>}
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

// Permission toggle for per-guest context menu
const PermissionToggleItem = ({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (v: boolean) => void }) => (
    <button
        onClick={(e) => { e.stopPropagation(); onChange(!enabled); }}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium transition-colors hover:bg-app-bg text-content-high"
    >
        <span>{label}</span>
        <div className={`w-8 h-4 rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-zinc-600'} relative`}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
    </button>
);

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
                    className="w-full h-full"
                    style={{
                        objectFit: objectFit || 'cover',
                        objectPosition: objectPosition || 'center',
                        transform: isLocal && participant.id !== 'screen' ? `scale(${zoom}) scaleX(-1)` : `scale(${zoom})`,
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
        { id: 'brand-1', name: 'Brand 1', config: { 
            color: '#0a4cc7', 
            theme: 'bubble', 
            showDisplayNames: true, 
            showHeadlines: false, 
            position: { x: 90, y: 10 }, 
            scope: 'global', 
            logoLocked: false,
            // New fields
            logoPosition: 'top-right' as LogoPosition,
            logoSize: 'medium' as LogoSize,
            logoBackgroundEnabled: false,
            logoPadding: 8,
            logoOpacity: 100,
            showWatermark: tier < BRANDING_TIER_REQUIREMENTS.removeWatermark, // Enforced for FREE tier
            watermarkPosition: 'bottom-right' as LogoPosition,
            watermarkOpacity: 50,
        } }
    ]);
    const [selectedBrandId, setSelectedBrandId] = useState('brand-1');
    const activeBrand = brands.find(b => b.id === selectedBrandId) || brands[0];
    const [showBrandMenu, setShowBrandMenu] = useState(false);

    const [banners, setBanners] = useState<Banner[]>([
        { 
            id: '1', 
            text: 'Like and Subscribe', 
            type: 'banner' as OverlayType,
            isTicker: false, 
            isVisible: false, 
            scope: 'global', 
            locked: false, 
            backgroundColor: '#0a4cc7',
            backgroundOpacity: 100,
            textColor: '#ffffff',
            customColor: '#0a4cc7', 
            customTextColor: '#ffffff', 
            style: 'standard',
            fullWidth: false,
            verticalOnly: false,
        },
        { 
            id: '2', 
            text: 'Welcome to the Stream!', 
            type: 'ticker' as OverlayType,
            isTicker: true, 
            isVisible: false, 
            scope: 'global', 
            locked: false, 
            style: 'standard',
            backgroundColor: '#0a4cc7',
            backgroundOpacity: 100,
            textColor: '#ffffff',
            fullWidth: true,
            verticalOnly: true,
            tickerSpeed: 'medium' as TickerSpeed,
            minY: 70,
            maxY: 100,
        },
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

    const [activeRightTab, setActiveRightTab] = useState<'brand' | 'comments' | 'banners' | 'private_chat' | 'visual_effects' | 'recording' | 'mixer' | 'backstage' | 'stream_health' | 'guests'>('brand');
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
        } catch { }
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
    const [showNoDestinationsPrompt, setShowNoDestinationsPrompt] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('general');

    const [recFormat, setRecFormat] = useState('video/webm');
    const [progRecStatus, setProgRecStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
    const [isoRecStatus, setIsoRecStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
    const [recordingTime, setRecordingTime] = useState(0);
    const [showRecMenu, setShowRecMenu] = useState(false);
    const [recIsoSelection, setRecIsoSelection] = useState<string[]>([]);
    const [recordingDestination, setRecordingDestination] = useState<'local' | 'cloud' | 'both'>('local');

    const [audioMixerState, setAudioMixerState] = useState<Record<string, { volume: number, muted: boolean, peak: number }>>({
        'local': { volume: 100, muted: false, peak: 0 },
        'master': { volume: 100, muted: false, peak: 0 }
    });

    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, participantId: string } | null>(null);
    
    // Sidebar collapsed states
    const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
    const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
    // Guest right tab (chat placeholder)
    const [guestRightTab, setGuestRightTab] = useState<'chat' | 'private_chat'>('chat');
    
    // Presentation pinning (fullscreen with PIP for participants)
    const [pinnedPresentation, setPinnedPresentation] = useState(false);
    const presentationZoomRef = useRef(1);
    const zoomDisplayRef = useRef<HTMLSpanElement>(null); // For display text without rerenders
    const presentationVideoRef = useRef<HTMLVideoElement>(null);
    // Drag state for pinned presentation (using ref to avoid rerenders)
    const pinnedDragRef = useRef({ isDragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

    // Streaming state - modals & health
    const [activeDestinations, setActiveDestinations] = useState<Array<{id: string; name: string; platform: string; enabled: boolean; status: 'connected'|'reconnecting'|'failed'; bitrate: number}>>([]);
    const [showNerdMetrics, setShowNerdMetrics] = useState(false);
    const [destToDisable, setDestToDisable] = useState<string | null>(null);
    // Simulated subscription tier for demo (in production, fetch from auth/billing)
    const [subscriptionTier] = useState<'free' | 'creator' | 'pro' | 'enterprise'>('pro');

    // Close context menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu) {
                setContextMenu(null);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [contextMenu]);

    // Processed Stream State for Local Preview
    const [processedLocalStream, setProcessedLocalStream] = useState<MediaStream | null>(null);
    const [shareMenuOpen, setShareMenuOpen] = useState(false);
    const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
    
    // Guest Permissions (configurable by host)
    const [guestPermissions, setGuestPermissions] = useState<GuestPermissionConfig>(DEFAULT_GUEST_PERMISSIONS);
    // Per-guest permissions (host can set different permissions for each guest)
    const [perGuestPermissions, setPerGuestPermissions] = useState<PerGuestPermissions>({});
    // My permissions as a guest (received from host)
    const [myPermissions, setMyPermissions] = useState<GuestPermissionConfig>(DEFAULT_GUEST_PERMISSIONS);
    
    const handleUpdateGuestPermissions = useCallback((updates: Partial<GuestPermissionConfig>) => {
        setGuestPermissions(prev => ({ ...prev, ...updates }));
        console.log('[GuestPermissions] Updated global:', updates);
    }, []);

    // Copy invite link to clipboard - includes mode=studio so guests join the studio
    const copyInviteLink = useCallback(() => {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const inviteUrl = `${origin}/join/${config.roomId}?mode=studio`;
        navigator.clipboard.writeText(inviteUrl).then(() => {
            setInviteLinkCopied(true);
            setTimeout(() => setInviteLinkCopied(false), 2000);
        }).catch(err => console.error('Failed to copy invite link:', err));
    }, [config.roomId]);

    // Memoize the error handler to prevent infinite re-renders
    const handleAllstrmError = useCallback((err: { code: string; message: string }) => {
        console.error("Studio Error:", err.code, err.message);
    }, []);

    // Memoize initialConfig to prevent identity changes
    const memoizedConfig = useMemo(() => config, [
        config.roomId,
        config.displayName,
        config.role,
        config.tier,
        config.audioEnabled,
        config.videoEnabled,
        config.videoDeviceId,
        config.audioDeviceId,
        config.resolution,
        config.frameRate,
        config.mode
    ]);

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
        updateRecordingScene, // Import the new sync function
        admitParticipant, // For green room guest admission
        isLocalInWaitingRoom, // For guest waiting room overlay
        sendDataMessage, // For host-authoritative stage sync
        receivedStageState, // Stage state from host (for guests)
        stageStateVersion, // Version counter to detect any stage changes
        receivedPermissions, // Permissions from host (for guests)
        wasKicked, // Whether guest was kicked by host
        sessionEnded, // Whether host left and session ended
    } = useAllstrmLiveKit({
        roomId: config.roomId,
        displayName: config.displayName,
        initialConfig: memoizedConfig,
        onError: handleAllstrmError
    });

    // Guest management callbacks (must be after useAllstrm to access participants)
    const handleMuteAllGuests = useCallback(() => {
        const guests = participants.filter(p => p.role === 'guest');
        guests.forEach(guest => {
            if (guest.media_state.audio_enabled) {
                muteParticipant?.(guest.id);
            }
        });
    }, [participants, muteParticipant]);
    
    const handleDisableAllGuestVideo = useCallback(() => {
        const guests = participants.filter(p => p.role === 'guest');
        guests.forEach(guest => {
            if (guest.media_state.video_enabled) {
                stopParticipantVideo?.(guest.id);
            }
        });
    }, [participants, stopParticipantVideo]);

    // Update permissions for a specific guest (must be after hook to access sendDataMessage)
    const handleUpdatePerGuestPermissions = useCallback((participantId: string, updates: Partial<GuestPermissionConfig>) => {
        const newPerms = { ...(perGuestPermissions[participantId] || DEFAULT_GUEST_PERMISSIONS), ...updates };
        setPerGuestPermissions(prev => ({
            ...prev,
            [participantId]: newPerms
        }));
        
        // AUTO-STOP MEDIA when permission revoked
        if (updates.canToggleVideo === false) {
            stopParticipantVideo(participantId);
            console.log('[GuestPermissions] Auto-stopped video for', participantId);
        }
        if (updates.canToggleAudio === false) {
            muteParticipant(participantId);
            console.log('[GuestPermissions] Auto-muted', participantId);
        }
        
        // Broadcast permission change to the specific guest via data message
        if (sendDataMessage && isConnected) {
            sendDataMessage({ 
                type: 'permission', 
                targetId: participantId,
                permissions: newPerms
            });
        }
        console.log('[GuestPermissions] Updated for', participantId, ':', updates);
    }, [sendDataMessage, isConnected, perGuestPermissions, stopParticipantVideo, muteParticipant]);

    // Guest: Sync myPermissions with receivedPermissions from host
    // Also auto-stop local media if permission is revoked
    const prevPermissionsRef = useRef<GuestPermissionConfig | null>(null);
    const [permissionNotification, setPermissionNotification] = useState<string | null>(null);
    
    useEffect(() => {
        if (!isHost && receivedPermissions) {
            const newPerms = receivedPermissions as GuestPermissionConfig;
            const prev = prevPermissionsRef.current;
            
            // Check if permissions were revoked (transitioned from true to false)
            if (prev) {
                if (prev.canToggleVideo && !newPerms.canToggleVideo) {
                    // Video permission revoked - stop local video
                    if (videoEnabled) {
                        toggleVideo();
                        setPermissionNotification('Host disabled your camera');
                    }
                }
                if (prev.canToggleAudio && !newPerms.canToggleAudio) {
                    // Audio permission revoked - mute local audio  
                    if (audioEnabled) {
                        toggleAudio();
                        setPermissionNotification('Host muted your microphone');
                    }
                }
                if (prev.canShareScreen && !newPerms.canShareScreen && screenStream) {
                    // Screen share revoked
                    stopScreenShare();
                    setPermissionNotification('Host disabled your screen share');
                }
            }
            
            setMyPermissions(newPerms);
            prevPermissionsRef.current = newPerms;
            console.log('[GuestPermissions] Received permissions from host:', receivedPermissions);
        }
    }, [isHost, receivedPermissions, videoEnabled, audioEnabled, toggleVideo, toggleAudio, screenStream, stopScreenShare]);

    // Clear permission notification after 3 seconds
    useEffect(() => {
        if (permissionNotification) {
            const timer = setTimeout(() => setPermissionNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [permissionNotification]);

    // ... (Recording state effects)

    const processorRef = useRef<VideoProcessor | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const rawStreamRef = useRef<MediaStream | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const hasAutoAddedHost = useRef(false);

    // --- HOST AUTHORITATIVE WIRING ---
    useEffect(() => {
        if (!isHost || !broadcast || !isConnected) return;

        // Ensure broadcast engine is running
        broadcast.startRendering();

        // Get the composed stream (Program Feed)
        const composedStream = broadcast.getStream();
        if (composedStream) {
            const videoTrack = composedStream.getVideoTracks()[0];
            if (videoTrack) {
                console.log('[Studio] Sending Composed Stream (Host Authoritative)');
                replaceVideoTrack(videoTrack).catch(e => console.warn("Failed to replace video track", e));
            }
        }
    }, [isHost, broadcast, isConnected, replaceVideoTrack]);

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
    const startProgramRecording = () => { startRecording('mixed', stageRef.current); setProgRecStatus('recording'); };
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

    // Context Menu Handlers - Only hosts can use context menu on other participants
    const handleContextMenu = (e: React.MouseEvent, participantId: string) => {
        e.preventDefault();
        // Guests can only access context menu for themselves (to toggle their own audio/video)
        if (!isHost && participantId !== 'local') return;
        setContextMenu({ x: e.clientX, y: e.clientY, participantId });
    };

    const handleContextAction = (action: string) => {
        if (!contextMenu) return;
        const { participantId } = contextMenu;
        const isLocal = participantId === 'local';

        // If guest, only allow toggling own audio/video (no stage control)
        if (!isHost && !isLocal) {
            setContextMenu(null);
            return;
        }

        // Get per-guest permissions for the target
        const targetPermissions = perGuestPermissions[participantId] || guestPermissions;

        switch (action) {
            case 'mute': 
                if (isLocal) {
                    // Check if guest has permission to toggle their own audio
                    if (!isHost && !targetPermissions.canToggleAudio) {
                        console.log('[Permissions] Guest cannot toggle audio - disabled by host');
                        break;
                    }
                    handleToggleAudio();
                } else {
                    muteParticipant(participantId);
                }
                break;
            case 'video': 
                if (isLocal) {
                    // Check if guest has permission to toggle their own video
                    if (!isHost && !targetPermissions.canToggleVideo) {
                        console.log('[Permissions] Guest cannot toggle video - disabled by host');
                        break;
                    }
                    handleToggleVideo();
                } else {
                    stopParticipantVideo(participantId);
                }
                break;
            case 'stage': 
                // ONLY HOST can control stage - guests cannot add/remove themselves or others
                if (!isHost) {
                    console.log('[Permissions] Only host can control stage');
                    break;
                }
                handleStageToggle(participantId, !onStageParticipants.some(p => p.id === participantId)); 
                break;
            case 'kick': if (!isLocal) removeParticipant(participantId); break;
            case 'fit': setViewPrefs(prev => ({ ...prev, [participantId]: { ...(prev[participantId] || { fit: 'contain', pan: { x: 50, y: 50 }, zoom: 1 }), fit: 'contain' } })); break;
            case 'fill': setViewPrefs(prev => ({ ...prev, [participantId]: { ...(prev[participantId] || { fit: 'contain', pan: { x: 50, y: 50 }, zoom: 1 }), fit: 'cover' } })); break;
            case 'stop_presenting': stopScreenShare(); break;
            case 'pin_presentation': setPinnedPresentation(p => !p); break;
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

    // Backstage: participants not on stage but already admitted (exclude local which is managed separately)
    const backstageParticipants = participants.filter(p => 
        p.id !== 'local' && !p.is_on_stage && !p.is_in_waiting_room
    );
    
    // Waiting Room: participants who need host approval
    const waitingRoomParticipants = participants.filter(p => p.is_in_waiting_room);

    // Debug logging for participants state
    useEffect(() => {
        console.log('[Studio] Participants state:', {
            total: participants.length,
            backstage: backstageParticipants.length,
            waitingRoom: waitingRoomParticipants.length,
            onStage: onStageParticipants.length,
            isLocalInWaitingRoom, // ADD THIS
            configRole: config.role, // ADD THIS
            participants: participants.map(p => ({
                id: p.id,
                name: p.display_name,
                role: p.role,
                is_on_stage: p.is_on_stage,
                is_in_waiting_room: p.is_in_waiting_room
            }))
        });
    }, [participants, backstageParticipants, waitingRoomParticipants, onStageParticipants, isLocalInWaitingRoom, config.role]);

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

    // HOST: Broadcast stage state to all guests when it changes
    // NOTE: Removed duplicate - using broadcastStageState effect instead

    // GUEST: Receive stage state from host and sync local view
    // Triggered by stageStateVersion to catch empty arrays too
    useEffect(() => {
        // Only run for guests, and only when we've received at least one sync (version > 0)
        if (isHost || stageStateVersion === 0) return;
        
        console.log('[Studio] Guest received stage sync (v' + stageStateVersion + '):', receivedStageState);
        console.log('[Studio] Guest available participants:', participants.map(p => ({ id: p.id, name: p.display_name })));
        console.log('[Studio] Guest available remoteStreams:', Object.keys(remoteStreams));
        console.log('[Studio] Guest myParticipantId:', myParticipantId);
        
        // Handle empty stage (host removed everyone)
        if (!receivedStageState || receivedStageState.length === 0) {
            console.log('[Studio] Guest: Stage cleared by host');
            setOnStageParticipants([]);
            return;
        }
        
        // Deduplicate received IDs
        const uniqueIds = [...new Set(receivedStageState)];
        
        setOnStageParticipants(currentStage => {
            // Check if local participant exists or needs to be created
            const localOnStage = currentStage.find(p => p.id === 'local');
            const newStage: Participant[] = [];
            const addedIds = new Set<string>();
            
            // Check if guest's own ID or 'local' is in the sync list
            const shouldGuestBeOnStage = uniqueIds.includes('local') || uniqueIds.includes(myParticipantId || '');
            
            if (shouldGuestBeOnStage) {
                if (localOnStage) {
                    // Use existing local participant
                    newStage.push({ ...localOnStage, is_on_stage: true });
                } else {
                    // CREATE local participant (guest's own camera)
                    const localP: Participant = {
                        id: 'local',
                        room_id: config.roomId || '',
                        display_name: config.displayName || 'Guest',
                        role: config.role || 'guest',
                        ingest_type: 'webrtc',
                        media_state: { 
                            audio_enabled: audioEnabled, 
                            video_enabled: videoEnabled,
                            screen_sharing: false,
                            connection_quality: 'excellent'
                        },
                        is_on_stage: true,
                        is_in_waiting_room: false
                    };
                    newStage.push(localP);
                    console.log('[Studio] Guest: Created local participant for stage');
                }
                addedIds.add('local');
                addedIds.add(myParticipantId || '');
            }
            
            // Add remote participants that host says are on stage
            uniqueIds.forEach((id: string) => {
                if (id === 'local' || id === myParticipantId || addedIds.has(id)) return;
                
                // Try to find in participants array first
                let participant = participants.find(p => p.id === id);
                
                // If not found but we have a stream, create a placeholder participant
                if (!participant && remoteStreams[id]) {
                    console.log('[Studio] Guest: Creating participant for remote ID:', id);
                    participant = {
                        id: id,
                        room_id: config.roomId || '',
                        display_name: id.split('_').slice(-1)[0] || 'Participant', // Extract name from identity
                        role: 'host', // Assume host if not found (they broadcast the sync)
                        ingest_type: 'webrtc',
                        media_state: { 
                            audio_enabled: true, 
                            video_enabled: true,
                            screen_sharing: false,
                            connection_quality: 'excellent'
                        },
                        is_on_stage: true,
                        is_in_waiting_room: false
                    };
                }
                
                if (participant) {
                    newStage.push({ ...participant, is_on_stage: true });
                    addedIds.add(id);
                } else {
                    console.warn('[Studio] Guest: Could not find participant for ID:', id);
                }
            });
            
            console.log('[Studio] Guest updated stage:', newStage.map(p => p.id));
            return newStage;
        });
    }, [isHost, stageStateVersion, receivedStageState, participants, remoteStreams, myParticipantId, config.displayName, config.role, config.roomId, audioEnabled, videoEnabled]);

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
    
    // Enhanced broadcast toggle with destination check
    const handleBroadcastToggle = () => { 
        if (broadcastStatus === 'idle') {
            // Check if there are enabled destinations
            const enabledDestinations = destinations.filter(d => d.enabled);
            if (enabledDestinations.length === 0) {
                // Show prompt to add destinations
                setShowNoDestinationsPrompt(true);
                return;
            }
            startBroadcast(); 
        } else {
            stopBroadcast(); 
        }
    };
    
    // Handle adding destinations from the prompt
    const handleAddDestinationsFromPrompt = () => {
        setShowNoDestinationsPrompt(false);
        setIsDestinationModalOpen(true);
    };
    
    // Admit participant to backstage (host manually adds to stage)
    const handleAdmitToBackstage = async (participantId: string) => {
        console.log('[Studio] Admitting to backstage:', participantId);
        await admitParticipant(participantId);
        // Guest goes to backstage, not directly on stage
        // Host can then add them to stage from GreenRoom
    };
    
    // Broadcast stage state to all guests (host-authoritative)
    const broadcastStageState = useCallback(() => {
        if (!isHost) return;
        // Map 'local' to actual participant ID so guests can find the host
        const stageIds = [...new Set(onStageParticipants.map(p => 
            p.id === 'local' ? (myParticipantId || 'local') : p.id
        ))];
        console.log('[Studio] Broadcasting stage state:', stageIds);
        sendDataMessage({
            type: 'stageSync',
            onStageIds: stageIds,
            timestamp: Date.now()
        });
    }, [isHost, onStageParticipants, sendDataMessage, myParticipantId]);
    
    // Broadcast stage changes whenever host updates the stage
    useEffect(() => {
        if (isHost && isConnected) {
            broadcastStageState();
        }
    }, [isHost, isConnected, onStageParticipants, broadcastStageState]);
    
    // Re-broadcast stage state when new participants join (so they get current state)
    useEffect(() => {
        if (isHost && isConnected && participants.length > 0) {
            // Debounce slightly to avoid rapid re-broadcasts
            const timer = setTimeout(() => {
                console.log('[Studio] Re-broadcasting stage state for new participants');
                broadcastStageState();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isHost, isConnected, participants.length, broadcastStageState]);
    
    const handleStageToggle = (participantId: string, isOnStage: boolean) => {
        if (isOnStage && onStageParticipants.length >= MAX_STAGE_PARTICIPANTS) { alert(`Stage is full.`); return; }
        if (participantId === 'local') {
            setOnStageParticipants(prev => {
                const p = prev.find(x => x.id === 'local') || { id: 'local', display_name: config.displayName, role: config.role, media_state: { audio_enabled: audioEnabled, video_enabled: videoEnabled }, is_on_stage: false } as Participant;
                if (isOnStage) return prev.some(x => x.id === 'local') ? prev.map(x => x.id === 'local' ? { ...x, is_on_stage: true } : x) : [...prev, { ...p, is_on_stage: true }];
                else return prev.filter(x => x.id !== 'local');
            });
        } else {
            toggleStageStatus(participantId, isOnStage);
            setOnStageParticipants(prev => {
                if (isOnStage) { 
                    // Check for duplicates before adding
                    if (prev.some(p => p.id === participantId)) {
                        console.log('[Studio] Participant already on stage, skipping duplicate:', participantId);
                        return prev;
                    }
                    const participant = participants.find(p => p.id === participantId); 
                    return participant ? [...prev, { ...participant, is_on_stage: true }] : prev; 
                }
                return prev.filter(p => p.id !== participantId);
            });
        }
    };

    const updateActiveBrand = (updates: Partial<BrandConfig>) => { setBrands(brands.map(b => b.id === selectedBrandId ? { ...b, config: { ...b.config, ...updates } } : b)); };
    const toggleBanner = (id: string) => setBanners(banners.map(b => b.id === id ? { ...b, isVisible: !b.isVisible } : b));
    const addBanner = (banner: Omit<Banner, 'id'>) => {
        setBanners([{ ...banner, id: Date.now().toString() }, ...banners]);
    };
    const updateBanner = (id: string, updates: Partial<Banner>) => {
        setBanners(banners.map(b => b.id === id ? { ...b, ...updates } : b));
    };
    const createBanner = () => { 
        if (!bannerInput.trim()) return; 
        const newBanner: Banner = {
            id: Date.now().toString(),
            text: bannerInput,
            type: isTicker ? 'ticker' : 'banner',
            isTicker: isTicker,
            isVisible: true,
            scope: bannerScope,
            backgroundColor: bannerColor,
            backgroundOpacity: 100,
            textColor: bannerTextColor,
            customColor: bannerColor,
            customTextColor: bannerTextColor,
            locked: false,
            style: bannerStyle,
            fullWidth: isTicker,
            verticalOnly: isTicker,
            tickerSpeed: 'medium',
            minY: isTicker ? 70 : undefined,
            maxY: isTicker ? 100 : undefined,
        };
        setBanners([newBanner, ...banners]);
        setBannerInput('');
        setIsTicker(false);
    };
    const deleteBanner = (id: string) => { setBanners(prev => prev.filter(b => b.id !== id)); };
    const loadScene = (scene: Scene) => { setActiveSceneId(scene.id); setPresetLayout(scene.layout); setStageBackground(scene.background); updateActiveBrand(scene.brandConfig); const nextStage: Participant[] = []; scene.participants.forEach(pid => { if (pid === 'local') { const local = participants.find(p => p.id === 'local') || onStageParticipants.find(p => p.id === 'local'); if (local) nextStage.push({ ...local, is_on_stage: true }); } else { const p = participants.find(part => part.id === pid); if (p) { nextStage.push({ ...p, is_on_stage: true }); toggleStageStatus(pid, true); } } }); setOnStageParticipants(nextStage); setBanners(banners.map(b => ({ ...b, isVisible: scene.activeBanners.includes(b.id), position: scene.bannerPositions[b.id] || b.position }))); };

    const isLocalOnStage = onStageParticipants.some(p => p.id === 'local');

    // DEBUG: Log waiting room state at render
    console.log('[Studio] Render check - isLocalInWaitingRoom:', isLocalInWaitingRoom, 'role:', config.role);
    
    // Show waiting room overlay for guests who haven't been admitted yet
    if (isLocalInWaitingRoom) {
        console.log('[Studio] Rendering waiting room overlay');
        return (
            <div className="flex h-screen w-full items-center justify-center bg-app-bg text-content-high p-6">
                <div className="max-w-md text-center animate-fade-in">
                    <div className="w-20 h-20 bg-app-surface rounded-full flex items-center justify-center mx-auto mb-8 border border-app-border">
                        <Users className="w-10 h-10 text-primary-500" />
                    </div>
                    <h1 className="text-3xl font-bold mb-4">Waiting to join</h1>
                    <p className="text-content-medium mb-8 text-lg">The host will let you in shortly. Please stay on this page.</p>
                    <div className="inline-flex items-center gap-3 px-5 py-3 bg-app-surface rounded-full border border-app-border text-sm text-content-medium">
                        <div className="w-2.5 h-2.5 bg-primary-500 rounded-full animate-pulse" />
                        <span>Connected to studio</span>
                    </div>
                    {localStream && (
                        <div className="mt-8 rounded-xl overflow-hidden border border-app-border shadow-lg max-w-xs mx-auto">
                            {(!isHost && !myPermissions.canToggleVideo) ? (
                                <div className="w-full aspect-video bg-app-surface-dark flex flex-col items-center justify-center">
                                    <VideoOff className="w-12 h-12 text-content-low mb-2" />
                                    <span className="text-sm text-content-low">Video disabled by host</span>
                                </div>
                            ) : (
                                <video
                                    ref={(el) => { if (el && localStream) el.srcObject = localStream; }}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full aspect-video object-cover bg-black"
                                />
                            )}
                            <div className="bg-app-surface px-4 py-2 text-sm text-content-medium">
                                {(!isHost && !myPermissions.canToggleVideo) ? 'Your camera is disabled' : 'Preview - your camera is ready'}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-app-bg text-content-high font-sans overflow-hidden" onMouseUp={handleCropMouseUp}>
            {/* ... (Left Sidebar Unchanged) */}
            {isHost && (
                <div className={`${leftSidebarCollapsed ? 'w-12' : 'w-64'} bg-app-surface/30 backdrop-blur-md border-r border-app-border flex flex-col z-20 shadow-sm relative transition-all duration-300`}>
                    {/* Collapse toggle button */}
                    <button 
                        className="absolute -right-3 top-4 w-6 h-6 bg-app-surface border border-app-border rounded-full flex items-center justify-center z-30 hover:bg-app-bg transition-colors"
                        onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
                    >
                        {leftSidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                    </button>
                    {!leftSidebarCollapsed ? (
                        <>
                            <div className="flex-1 flex flex-col min-h-0">
                                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                                    <div className="p-2 text-[10px] font-bold text-content-low uppercase tracking-widest sticky top-0 bg-app-surface/90 backdrop-blur z-10">Run of Show</div>
                                    <div className="space-y-2">{scenes.map((scene) => <SceneCard key={scene.id} title={scene.name} type="layout" isActive={activeSceneId === scene.id} onClick={() => loadScene(scene)} participants={scene.participants} />)}</div>
                                </div>
                            </div>
                            <div className="p-3 border-t border-app-border bg-app-surface/50">
                                <button className="w-full py-2 bg-app-bg border border-app-border rounded text-[10px] font-bold text-content-medium hover:text-content-high hover:border-content-medium transition-all flex items-center justify-center gap-2"><RefreshCw className="w-3 h-3" />RESET LAYOUT</button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center py-4 gap-2">
                            <div className="w-8 h-8 rounded bg-app-bg border border-app-border flex items-center justify-center" title="Run of Show">
                                <Layers className="w-4 h-4 text-content-medium" />
                            </div>
                        </div>
                    )}
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
                                    <div className="absolute top-full mt-2 right-0 w-72 bg-app-surface border border-app-border rounded-xl shadow-2xl overflow-hidden z-50 animate-scale-in origin-top-right" onClick={(e) => e.stopPropagation()}>
                                        {/* Program (Mixed) Recording */}
                                        <div className="p-3 border-b border-app-border/50">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2"><CircleDot className="w-4 h-4 text-red-500" /><span className="text-xs font-bold text-content-high">PROGRAM</span></div>
                                                {progRecStatus === 'recording' && <span className="text-[10px] font-mono text-red-500 animate-pulse">LIVE</span>}
                                            </div>
                                            <div className="flex gap-2">
                                                {progRecStatus === 'idle' ? (<Button size="sm" className="w-full h-8 text-[10px]" onClick={startProgramRecording}>START RECORDING</Button>) : (<><button className="flex-1 bg-app-bg border border-app-border rounded hover:bg-app-surface text-[10px] font-bold h-8" onClick={progRecStatus === 'recording' ? pauseProgramRecording : resumeProgramRecording}>{progRecStatus === 'paused' ? 'RESUME' : 'PAUSE'}</button><button className="flex-1 bg-red-500 text-white rounded hover:bg-red-600 text-[10px] font-bold h-8" onClick={stopProgramRecording}>STOP</button></>)}
                                            </div>
                                        </div>
                                        
                                        {/* ISO (Individual Tracks) Recording */}
                                        <div className="p-3 border-b border-app-border/50">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500" /><span className="text-xs font-bold text-content-high">ISO TRACKS</span></div>
                                                {isoRecStatus === 'recording' && <span className="text-[10px] font-mono text-indigo-500 animate-pulse">LIVE</span>}
                                            </div>
                                            <div className="flex gap-2">
                                                {isoRecStatus === 'idle' ? (<Button size="sm" variant="secondary" className="w-full h-8 text-[10px]" onClick={startIsoRecording}>START ISO REC</Button>) : (<><button className="flex-1 bg-app-bg border border-app-border rounded hover:bg-app-surface text-[10px] font-bold h-8" onClick={() => { pauseRecording('iso'); setIsoRecStatus('paused'); }}>{isoRecStatus === 'paused' ? 'RESUME' : 'PAUSE'}</button><button className="flex-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 text-[10px] font-bold h-8" onClick={stopIsoRecording}>STOP</button></>)}
                                            </div>
                                            <p className="text-[9px] text-content-low mt-1.5">Records each participant separately for post-production</p>
                                        </div>
                                        

                                    </div>
                                )}
                            </div>
                            <div className="h-6 w-px bg-app-border mx-2" />
                            <Button variant="secondary" size="sm" onClick={() => setIsDestinationModalOpen(true)}>Destinations</Button>
                            <Button variant={broadcastStatus === 'live' ? 'danger' : 'primary'} size="sm" onClick={handleBroadcastToggle} className={broadcastStatus === 'live' ? 'bg-red-600' : 'bg-indigo-600'}>{broadcastStatus === 'live' ? 'End Broadcast' : 'Go Live'}</Button>
                            
                            {/* Stream Health Panel - Creator+ tier */}
                            {(subscriptionTier === 'creator' || subscriptionTier === 'pro' || subscriptionTier === 'enterprise') && broadcastStatus === 'live' && (
                                <div className="flex items-center gap-2 ml-2 px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                    <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                                    <span className="text-xs text-emerald-400 font-semibold">LIVE</span>
                                    {activeDestinations.map(dest => (
                                        <div key={dest.id} className="flex items-center gap-1.5 ml-2 px-2 py-0.5 bg-app-surface/40 rounded" title={`${dest.name}: ${dest.bitrate} kbps`}>
                                            <span className={`w-2 h-2 rounded-full ${dest.status === 'connected' ? 'bg-emerald-500' : dest.status === 'reconnecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-500'}`} />
                                            <span className="text-xs text-content-med">{dest.platform}</span>
                                            <button 
                                                onClick={() => setDestToDisable(dest.id)} 
                                                className="opacity-60 hover:opacity-100 ml-0.5 p-0.5 hover:bg-red-500/20 rounded"
                                                title="Stop streaming to this destination"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                    {(subscriptionTier === 'pro' || subscriptionTier === 'enterprise') && (
                                        <button 
                                            onClick={() => setShowNerdMetrics(true)} 
                                            className="ml-1 px-2 py-0.5 text-xs bg-app-surface/50 rounded hover:bg-app-surface/80 text-content-low hover:text-content-med flex items-center gap-1"
                                            title="View detailed streaming metrics"
                                        >
                                            <BarChart3 className="w-3 h-3" />
                                            Stats
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-app-bg border border-app-border rounded-lg">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-xs font-medium text-content-medium">Connected as Guest</span>
                            </div>
                        </div>
                    )}
                </header>

                <div className="flex-1 flex flex-col p-4 overflow-y-auto items-center">
                    {/* Permission Notification for Guests */}
                    {permissionNotification && (
                        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slide-in">
                            <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/90 text-black rounded-lg shadow-lg backdrop-blur-sm border border-amber-400">
                                <Lock className="w-5 h-5" />
                                <span className="font-medium text-sm">{permissionNotification}</span>
                            </div>
                        </div>
                    )}

                    {/* Kick Overlay - shown when guest is removed by host */}
                    {wasKicked && (
                        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center">
                            <div className="bg-app-surface border border-red-500/30 rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30">
                                    <UserMinus className="w-8 h-8 text-red-500" />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">You've Been Removed</h2>
                                <p className="text-content-medium mb-6">The host has removed you from this session.</p>
                                <button
                                    onClick={onLeave}
                                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors"
                                >
                                    Back to Dashboard
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Session Ended Overlay - shown when host leaves */}
                    {sessionEnded && !wasKicked && (
                        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center">
                            <div className="bg-app-surface border border-amber-500/30 rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/30">
                                    <LogOut className="w-8 h-8 text-amber-500" />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">Session Ended</h2>
                                <p className="text-content-medium mb-6">The host has ended this session. Thank you for joining!</p>
                                <button
                                    onClick={onLeave}
                                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors"
                                >
                                    Back to Dashboard
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {/* Unified Stage Rendering */}
                    <div className="w-full max-w-5xl aspect-video rounded-lg shadow-2xl relative overflow-hidden group border border-app-border transition-colors duration-500" ref={stageRef} style={{ backgroundColor: stageBackground }}>
                        {/* 
                            This is the core change: Rendering DOM elements using absolutely positioned items 
                            derived from the Shared Layout Engine 'unifiedScene', instead of CSS Grid.
                        */}
                        
                        {/* PINNED PRESENTATION MODE - Fullscreen with PIP */}
                        {pinnedPresentation && screenStream ? (
                            <>
                                {/* Fullscreen Presentation - Draggable */}
                                <div 
                                    className="absolute inset-0 bg-black overflow-hidden cursor-grab active:cursor-grabbing"
                                    onMouseDown={(e) => {
                                        if (e.button !== 0) return;
                                        const d = pinnedDragRef.current;
                                        pinnedDragRef.current = { isDragging: true, startX: e.clientX, startY: e.clientY, offsetX: d.offsetX, offsetY: d.offsetY };
                                    }}
                                    onMouseMove={(e) => {
                                        const d = pinnedDragRef.current;
                                        if (!d.isDragging) return;
                                        const dx = e.clientX - d.startX;
                                        const dy = e.clientY - d.startY;
                                        if (presentationVideoRef.current) {
                                            presentationVideoRef.current.style.transform = `scale(${presentationZoomRef.current}) translate(${(d.offsetX + dx) / presentationZoomRef.current}px, ${(d.offsetY + dy) / presentationZoomRef.current}px)`;
                                        }
                                    }}
                                    onMouseUp={(e) => {
                                        const d = pinnedDragRef.current;
                                        if (!d.isDragging) return;
                                        const dx = e.clientX - d.startX;
                                        const dy = e.clientY - d.startY;
                                        pinnedDragRef.current = { isDragging: false, startX: 0, startY: 0, offsetX: d.offsetX + dx, offsetY: d.offsetY + dy };
                                    }}
                                    onMouseLeave={() => {
                                        if (pinnedDragRef.current.isDragging) {
                                            pinnedDragRef.current.isDragging = false;
                                        }
                                    }}
                                >
                                    <video 
                                        ref={(el) => { 
                                            presentationVideoRef.current = el;
                                            if (el && screenStream) el.srcObject = screenStream; 
                                        }}
                                        autoPlay muted playsInline
                                        className="w-full h-full"
                                        style={{ 
                                            objectFit: 'contain',
                                            transform: `scale(${presentationZoomRef.current}) translate(${pinnedDragRef.current.offsetX / presentationZoomRef.current}px, ${pinnedDragRef.current.offsetY / presentationZoomRef.current}px)`,
                                            transformOrigin: 'center center',
                                            pointerEvents: 'none'
                                        }}
                                        onContextMenu={(e) => handleContextMenu(e, 'screen')}
                                    />
                                </div>
                                {/* Zoom Controls */}
                                <div className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-black/70 backdrop-blur-md rounded-lg p-2 border border-white/10">
                                    <button className="p-1.5 hover:bg-white/20 rounded text-white" onClick={() => {
                                        presentationZoomRef.current = Math.max(presentationZoomRef.current - 0.1, 0.5);
                                        const d = pinnedDragRef.current;
                                        if (presentationVideoRef.current) {
                                            presentationVideoRef.current.style.transform = `scale(${presentationZoomRef.current}) translate(${d.offsetX / presentationZoomRef.current}px, ${d.offsetY / presentationZoomRef.current}px)`;
                                        }
                                        if (zoomDisplayRef.current) zoomDisplayRef.current.textContent = `${Math.round(presentationZoomRef.current * 100)}%`;
                                    }}><Minus className="w-4 h-4" /></button>
                                    <span ref={zoomDisplayRef} className="text-xs font-mono text-white min-w-[45px] text-center">100%</span>
                                    <button className="p-1.5 hover:bg-white/20 rounded text-white" onClick={() => {
                                        presentationZoomRef.current = Math.min(presentationZoomRef.current + 0.1, 3);
                                        const d = pinnedDragRef.current;
                                        if (presentationVideoRef.current) {
                                            presentationVideoRef.current.style.transform = `scale(${presentationZoomRef.current}) translate(${d.offsetX / presentationZoomRef.current}px, ${d.offsetY / presentationZoomRef.current}px)`;
                                        }
                                        if (zoomDisplayRef.current) zoomDisplayRef.current.textContent = `${Math.round(presentationZoomRef.current * 100)}%`;
                                    }}><PlusIcon className="w-4 h-4" /></button>
                                    <button className="p-1 hover:bg-white/20 rounded text-white" onClick={() => {
                                        presentationZoomRef.current = 1;
                                        pinnedDragRef.current = { isDragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 };
                                        if (presentationVideoRef.current) {
                                            presentationVideoRef.current.style.transform = 'scale(1) translate(0px, 0px)';
                                        }
                                        if (zoomDisplayRef.current) zoomDisplayRef.current.textContent = '100%';
                                    }} title="Reset"><RotateCcw className="w-3.5 h-3.5" /></button>
                                    <div className="w-px h-4 bg-white/20 mx-1" />
                                    <button className="p-1.5 hover:bg-white/20 rounded text-white" onClick={() => setPinnedPresentation(false)} title="Unpin"><X className="w-4 h-4" /></button>
                                </div>
                                {/* PIP Overlay for Participants */}
                                <div className="absolute bottom-3 right-3 z-20 flex gap-2">
                                    {onStageParticipants.filter(p => p.id !== 'screen').map(p => {
                                        const pipStream = p.id === 'local' ? (processedLocalStream || localStream) : remoteStreams[p.id];
                                        return (
                                            <div key={p.id} className="w-32 aspect-video rounded-lg overflow-hidden shadow-xl border-2 border-white/20 bg-black relative">
                                                <VideoFeed participant={p} stream={pipStream} isLocal={p.id === 'local'} objectFit="cover" />
                                                {activeBrand.config.showDisplayNames && (
                                                    <div className="absolute bottom-1 left-1 z-10 px-1.5 py-0.5 rounded text-[10px] font-bold backdrop-blur-sm bg-indigo-600/80 text-white">{p.display_name}</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <>
                                {/* NORMAL MODE - Layout Engine Rendering */}
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
                            </>
                        )}

                        {/* Banners/Overlays */}
                        {banners.filter(b => b.isVisible).map((b, idx) => {
                            const isTicker = b.type === 'ticker' || b.isTicker;
                            const bgOpacity = (b.backgroundOpacity ?? 100) / 100;
                            const bgColor = b.backgroundColor || b.customColor || activeBrand.config.color;
                            
                            return (
                                <DraggableOverlay 
                                    key={b.id} 
                                    isDraggable={!b.locked} 
                                    locked={layoutLocked} 
                                    containerRef={stageRef} 
                                    initialX={b.fullWidth ? 50 : (b.position?.x ?? 50)} 
                                    initialY={b.position?.y ?? (isTicker ? 90 : (80 - (idx * 15)))} 
                                    onPositionChange={(x, y) => { setBanners(prev => prev.map(banner => banner.id === b.id ? { ...banner, position: { x, y } } : banner)); }} 
                                    stackIndex={idx}
                                    verticalOnly={b.verticalOnly}
                                    fullWidth={b.fullWidth}
                                    minY={b.minY}
                                    maxY={b.maxY}
                                >
                                    {isTicker ? (
                                        // Ticker rendering with scrolling animation
                                        <div 
                                            className="overflow-hidden pointer-events-auto"
                                            style={{ 
                                                backgroundColor: bgOpacity < 1 
                                                    ? `rgba(${parseInt(bgColor.slice(1,3),16)}, ${parseInt(bgColor.slice(3,5),16)}, ${parseInt(bgColor.slice(5,7),16)}, ${bgOpacity})`
                                                    : bgColor,
                                                color: b.textColor || b.customTextColor || '#ffffff',
                                            }}
                                        >
                                            <div 
                                                className="whitespace-nowrap py-2 px-4 font-bold text-base animate-ticker"
                                                style={{
                                                    animationDuration: b.tickerSpeed === 'slow' ? '20s' : b.tickerSpeed === 'fast' ? '8s' : '12s',
                                                }}
                                            >
                                                {b.text} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {b.text} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {b.text}
                                            </div>
                                        </div>
                                    ) : (
                                        // Standard banner rendering
                                        <div 
                                            className="px-6 py-3 shadow-xl rounded-lg font-bold text-lg pointer-events-auto" 
                                            style={{ 
                                                backgroundColor: bgOpacity < 1 
                                                    ? `rgba(${parseInt(bgColor.slice(1,3),16)}, ${parseInt(bgColor.slice(3,5),16)}, ${parseInt(bgColor.slice(5,7),16)}, ${bgOpacity})`
                                                    : bgColor,
                                                color: b.textColor || b.customTextColor || '#ffffff',
                                            }}
                                        >
                                            {b.text}
                                        </div>
                                    )}
                                </DraggableOverlay>
                            );
                        })}

                        {/* Brand Logo Overlay */}
                        {activeBrand.config.logoUrl && (
                            <DraggableOverlay isDraggable={true} locked={layoutLocked} containerRef={stageRef} initialX={activeBrand.config.position?.x ?? 90} initialY={activeBrand.config.position?.y ?? 10} onPositionChange={(x, y) => updateActiveBrand({ position: { x, y } })} stackIndex={50} className="pointer-events-auto">
                                <div 
                                    className="flex items-center justify-center"
                                    style={{
                                        backgroundColor: activeBrand.config.logoBackgroundEnabled 
                                            ? activeBrand.config.logoBackground 
                                            : 'transparent',
                                        padding: activeBrand.config.logoBackgroundEnabled 
                                            ? `${activeBrand.config.logoPadding}px` 
                                            : 0,
                                        borderRadius: activeBrand.config.logoBackgroundEnabled ? '8px' : 0,
                                    }}
                                >
                                    <img 
                                        src={activeBrand.config.logoUrl} 
                                        alt="Logo" 
                                        className={`object-contain drop-shadow-md select-none ${
                                            activeBrand.config.logoSize === 'small' ? 'h-8' :
                                            activeBrand.config.logoSize === 'large' ? 'h-20' : 'h-12'
                                        }`}
                                        style={{ opacity: activeBrand.config.logoOpacity / 100 }}
                                        draggable={false} 
                                    />
                                </div>
                            </DraggableOverlay>
                        )}

                        {/* ALLSTRM Watermark - Always shown for FREE tier */}
                        <AllstrmWatermark
                            tier={tier}
                            showWatermark={activeBrand.config.showWatermark}
                            position={activeBrand.config.watermarkPosition}
                            opacity={activeBrand.config.watermarkOpacity}
                        />
                    </div>

                    {/* Layout Controls - Host only */}
                    {isHost && (
                        <div className="mt-4 flex items-center gap-2">
                            <LayoutButton icon={<Square className="w-4 h-4" />} active={layoutState?.preset_name === 'single'} onClick={() => setPresetLayout('single')} lockedMessage={layoutLocked ? "Layout Locked" : undefined} disabled={layoutLocked} />
                            <LayoutButton icon={<Grid className="w-4 h-4" />} active={layoutState?.preset_name === 'grid'} onClick={() => setPresetLayout('grid')} lockedMessage={layoutLocked ? "Layout Locked" : undefined} disabled={layoutLocked} />
                            <LayoutButton icon={<MonitorUp className="w-4 h-4" />} active={layoutState?.preset_name === 'pip'} onClick={() => setPresetLayout('pip')} lockedMessage={layoutLocked ? "Layout Locked" : undefined} disabled={layoutLocked} />
                            <div className="h-4 w-px bg-app-border mx-2" />
                            <button onClick={() => setLayoutLocked(!layoutLocked)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${layoutLocked ? 'bg-amber-500/10 text-amber-500 border border-amber-500/50' : 'bg-app-bg border border-app-border text-content-medium hover:text-content-high'}`}>{layoutLocked ? <LockIcon className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}{layoutLocked ? 'Locked' : 'Lock'}</button>
                        </div>
                    )}
                </div>

                <div className="h-16 bg-app-surface border-t border-app-border flex items-center px-6 justify-between shrink-0 z-30">
                    <div className="w-40" />
                    <div className="flex items-center gap-3">
                        <ControlBtn 
                            icon={audioEnabled ? <Mic /> : <MicOff />} 
                            label={audioEnabled ? "Mute" : "Unmute"} 
                            isActiveState={audioEnabled} 
                            onClick={handleToggleAudio} 
                            hotkey="Ctrl+D"
                            locked={!isHost && !myPermissions.canToggleAudio}
                            lockedMessage="Audio restricted by host"
                        />
                        <ControlBtn 
                            icon={videoEnabled ? <Video /> : <VideoOff />} 
                            label={videoEnabled ? "Stop Cam" : "Start Cam"} 
                            isActiveState={videoEnabled} 
                            onClick={handleToggleVideo} 
                            hotkey="Ctrl+E"
                            locked={!isHost && !myPermissions.canToggleVideo}
                            lockedMessage="Camera restricted by host"
                        />

                        <div className="relative group">
                            <ControlBtn
                                icon={screenStream ? <X className="text-red-500" /> : <MonitorUp />}
                                label={screenStream ? "Stop Share" : "Share"}
                                isActiveState={true}
                                onClick={() => {
                                    if (screenStream) stopScreenShare();
                                    else setShareMenuOpen(!shareMenuOpen);
                                }}
                            />
                            {shareMenuOpen && !screenStream && (
                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-app-surface border border-app-border rounded-lg shadow-xl p-1 z-50 animate-scale-in w-48">
                                    <button onClick={() => { startScreenShare(); setShareMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-app-bg rounded text-left whitespace-nowrap"><Monitor className="w-4 h-4 text-indigo-500" /> Share Screen</button>
                                    <button onClick={() => { document.getElementById('pres-upload')?.click(); setShareMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-app-bg rounded text-left whitespace-nowrap"><FileText className="w-4 h-4 text-emerald-500" /> Present File</button>
                                    <div className="h-px bg-app-border my-1" />
                                    <button onClick={() => { copyInviteLink(); setShareMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-app-bg rounded text-left whitespace-nowrap">
                                        {inviteLinkCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-amber-500" />}
                                        {inviteLinkCopied ? 'Link Copied!' : 'Copy Invite Link'}
                                    </button>
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

            {/* Context Menu - Permission-based */}
            {contextMenu && (
                <div className="fixed z-50 bg-app-surface border border-app-border rounded-lg shadow-2xl py-1 w-56 animate-scale-in origin-top-left overflow-hidden" style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={(e) => e.preventDefault()}>
                    {isTargetPresentation ? (
                        <>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-content-low uppercase tracking-wider border-b border-app-border/50 mb-1 bg-app-bg/50">Presentation Control</div>
                            <ContextMenuItem icon={<StopIcon />} label="Stop Presenting" danger onClick={() => handleContextAction('stop_presenting')} />
                            <div className="h-px bg-app-border/50 my-1" />
                            <ContextMenuItem icon={pinnedPresentation ? <X /> : <Maximize />} label={pinnedPresentation ? "Unpin Fullscreen" : "Pin Fullscreen"} onClick={() => handleContextAction('pin_presentation')} />
                            <ContextMenuItem icon={<Minimize />} label="Fit to Screen" onClick={() => handleContextAction('fit')} />
                            <ContextMenuItem icon={<Maximize />} label="Fill Frame" onClick={() => handleContextAction('fill')} />
                        </>
                    ) : (
                        <>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-content-low uppercase tracking-wider border-b border-app-border/50 mb-1 bg-app-bg/50">
                                {isTargetLocal ? 'My Controls' : 'Manage Guest'}
                            </div>
                            
                            {/* Audio Toggle - Permission-based for guests */}
                            {(isHost || (isTargetLocal && myPermissions.canToggleAudio)) && (
                                <ContextMenuItem 
                                    icon={isTargetLocal || contextMenu.participantId === 'local' ? (audioEnabled ? <Mic /> : <MicOff />) : (contextTarget?.media_state.audio_enabled ? <Mic /> : <MicOff />)} 
                                    label={isTargetLocal ? (audioEnabled ? "Mute" : "Unmute") : (contextTarget?.media_state.audio_enabled ? "Mute Participant" : "Unmute Participant")} 
                                    onClick={() => handleContextAction('mute')} 
                                />
                            )}
                            
                            {/* Video Toggle - Permission-based for guests */}
                            {(isHost || (isTargetLocal && myPermissions.canToggleVideo)) && (
                                <ContextMenuItem 
                                    icon={isTargetLocal || contextMenu.participantId === 'local' ? (videoEnabled ? <Video /> : <VideoOff />) : (contextTarget?.media_state.video_enabled ? <Video /> : <VideoOff />)} 
                                    label={isTargetLocal ? (videoEnabled ? "Stop Cam" : "Start Cam") : (contextTarget?.media_state.video_enabled ? "Stop Video" : "Start Video")} 
                                    onClick={() => handleContextAction('video')} 
                                />
                            )}
                            
                            {/* Stage Control - HOST ONLY */}
                            {isHost && (
                                <ContextMenuItem 
                                    icon={isTargetOnStage ? <UserMinus /> : <UserPlus />} 
                                    label={isTargetOnStage ? "Remove from Stage" : "Add to Stage"} 
                                    onClick={() => handleContextAction('stage')} 
                                />
                            )}

                            <div className="px-3 py-1.5 text-[10px] font-bold text-content-low uppercase tracking-wider border-b border-app-border/50 border-t mt-1 mb-1 bg-app-bg/50">View Mode</div>
                            <ContextMenuItem icon={<Minimize />} label="Fit to Screen" onClick={() => handleContextAction('fit')} />
                            <ContextMenuItem icon={<Maximize />} label="Fill Frame" onClick={() => handleContextAction('fill')} />

                            {/* Per-Guest Permissions - HOST ONLY, for remote participants */}
                            {isHost && !isTargetLocal && contextMenu.participantId && (
                                <>
                                    <div className="px-3 py-1.5 text-[10px] font-bold text-content-low uppercase tracking-wider border-b border-app-border/50 border-t mt-1 mb-1 bg-app-bg/50">
                                        Guest Permissions
                                    </div>
                                    <PermissionToggleItem 
                                        label="Can Toggle Audio" 
                                        enabled={(perGuestPermissions[contextMenu.participantId] || guestPermissions).canToggleAudio}
                                        onChange={(v) => handleUpdatePerGuestPermissions(contextMenu.participantId, { canToggleAudio: v })}
                                    />
                                    <PermissionToggleItem 
                                        label="Can Toggle Video" 
                                        enabled={(perGuestPermissions[contextMenu.participantId] || guestPermissions).canToggleVideo}
                                        onChange={(v) => handleUpdatePerGuestPermissions(contextMenu.participantId, { canToggleVideo: v })}
                                    />
                                    <PermissionToggleItem 
                                        label="Can Share Screen" 
                                        enabled={(perGuestPermissions[contextMenu.participantId] || guestPermissions).canShareScreen}
                                        onChange={(v) => handleUpdatePerGuestPermissions(contextMenu.participantId, { canShareScreen: v })}
                                    />
                                    <PermissionToggleItem 
                                        label="Can Send Chat" 
                                        enabled={(perGuestPermissions[contextMenu.participantId] || guestPermissions).canSendChat}
                                        onChange={(v) => handleUpdatePerGuestPermissions(contextMenu.participantId, { canSendChat: v })}
                                    />
                                </>
                            )}

                            {/* Kick - HOST ONLY, for remote participants */}
                            {isHost && !isTargetLocal && (
                                <>
                                    <div className="h-px bg-app-border/50 my-1" />
                                    <ContextMenuItem icon={<Trash2 />} label="Kick Guest" danger onClick={() => handleContextAction('kick')} />
                                </>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Host Right Sidebar - Collapsible */}
            {isHost && !rightSidebarCollapsed && (
                <div className="w-80 bg-app-surface border-l border-app-border flex flex-col z-20 shadow-sm transition-all duration-300 relative">
                    {/* Collapse toggle button */}
                    <button 
                        className="absolute -left-3 top-4 w-6 h-6 bg-app-surface border border-app-border rounded-full flex items-center justify-center z-30 hover:bg-app-bg transition-colors"
                        onClick={() => setRightSidebarCollapsed(true)}
                    >
                        <ChevronRight className="w-3 h-3" />
                    </button>
                    
                    {/* Brand Panel - New enterprise-grade component */}
                    {activeRightTab === 'brand' && (
                        <BrandingPanel
                            tier={tier}
                            brandConfig={activeBrand.config}
                            onUpdate={updateActiveBrand}
                        />
                    )}
                    
                    {/* Overlays Panel - New enterprise-grade component */}
                    {activeRightTab === 'banners' && (
                        <OverlayPanel
                            tier={tier}
                            banners={banners}
                            onAdd={addBanner}
                            onUpdate={updateBanner}
                            onRemove={deleteBanner}
                            onToggleVisibility={toggleBanner}
                        />
                    )}
                    
                    {/* Green Room / Backstage */}
                    {activeRightTab === 'backstage' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <GreenRoom
                                participants={backstageParticipants}
                                waitingParticipants={waitingRoomParticipants}
                                localParticipantId={myParticipantId || 'local'}
                                localStream={processedLocalStream || localStream}
                                remoteStreams={remoteStreams}
                                onToggleAudio={handleToggleAudio}
                                onToggleVideo={handleToggleVideo}
                                onAddToStage={(id) => handleStageToggle(id, true)}
                                onAdmitParticipant={handleAdmitToBackstage}
                                onContextMenu={handleContextMenu}
                                isLocalOnStage={isLocalOnStage}
                                isHost={isHost}
                            />
                        </div>
                    )}
                    
                    {/* Private Chat Panel */}
                    {activeRightTab === 'private_chat' && (
                        <div className="flex-1 flex flex-col overflow-hidden relative">
                            {canUsePrivateChat ? (
                                <PrivateChatPanel
                                    localParticipantId={myParticipantId || 'local'}
                                    localParticipantName={config.displayName}
                                    participants={participants.filter(p => !p.is_in_waiting_room)}
                                    onSendMessage={(recipientId, message, isPrivate) => {
                                        // TODO: Integrate with WebSocket signaling to send messages
                                        console.log('[PrivateChat] Send:', { recipientId, message, isPrivate });
                                    }}
                                />
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                                    <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                                        <Users className="w-8 h-8 text-amber-500" />
                                    </div>
                                    <h3 className="text-sm font-bold text-content-high mb-2">Private Chat</h3>
                                    <p className="text-xs text-content-medium mb-4">
                                        {getUpgradeMessage('PRIVATE_CHAT')}
                                    </p>
                                    <span className="text-[9px] font-bold text-amber-500 uppercase">Requires Creator Tier</span>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Stream Health Panel */}
                    {activeRightTab === 'stream_health' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <StreamHealthMonitor
                                destinations={destinations}
                                tier={tier}
                                onRetry={(id) => {
                                    console.log('[StreamHealth] Retry destination:', id);
                                    // Would reconnect to the destination
                                }}
                                onToggle={(id, enabled) => {
                                    toggleDestination(id, enabled);
                                }}
                                onHotSwitch={(fromId, toId) => {
                                    console.log('[StreamHealth] Hot switch:', fromId, '->', toId);
                                    // Would handle seamless failover
                                }}
                            />
                        </div>
                    )}
                    
                    {/* Guest Permissions Panel */}
                    {activeRightTab === 'guests' && (
                        <div className="flex-1 flex flex-col overflow-hidden p-4">
                            <GuestPermissionsPanel
                                isHost={isHost}
                                participants={participants}
                                guestPermissions={guestPermissions}
                                onUpdatePermissions={handleUpdateGuestPermissions}
                                onMuteAllGuests={handleMuteAllGuests}
                                onDisableAllGuestVideo={handleDisableAllGuestVideo}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Host Tab Rail - Always visible */}
            {isHost && (
                <div className="w-16 bg-app-surface border-l border-app-border flex flex-col items-center py-4 z-20 gap-4 shrink-0 relative">
                    {/* Expand button when collapsed */}
                    {rightSidebarCollapsed && (
                        <button 
                            className="absolute -left-3 top-4 w-6 h-6 bg-app-surface border border-app-border rounded-full flex items-center justify-center z-30 hover:bg-app-bg transition-colors"
                            onClick={() => setRightSidebarCollapsed(false)}
                        >
                            <ChevronLeft className="w-3 h-3" />
                        </button>
                    )}
                    <RailTab icon={<Palette />} label="Brand" active={activeRightTab === 'brand'} onClick={() => { setActiveRightTab('brand'); setRightSidebarCollapsed(false); }} />
                    <RailTab icon={<Layers />} label="Overlays" active={activeRightTab === 'banners'} onClick={() => { setActiveRightTab('banners'); setRightSidebarCollapsed(false); }} />
                    <RailTab icon={<UserCheck />} label="Green Room" active={activeRightTab === 'backstage'} onClick={() => { setActiveRightTab('backstage'); setRightSidebarCollapsed(false); }} />
                    <RailTab icon={<FileVideo />} label="Recording" active={activeRightTab === 'recording'} onClick={() => { setActiveRightTab('recording'); setRightSidebarCollapsed(false); }} />
                    <RailTab icon={<Sliders />} label="Mixer" active={activeRightTab === 'mixer'} onClick={() => { setActiveRightTab('mixer'); setRightSidebarCollapsed(false); }} />
                    <RailTab icon={<Users />} label="Private" active={activeRightTab === 'private_chat'} onClick={() => { setActiveRightTab('private_chat'); setRightSidebarCollapsed(false); }} />
                    <RailTab icon={<Activity />} label="Health" active={activeRightTab === 'stream_health'} onClick={() => { setActiveRightTab('stream_health'); setRightSidebarCollapsed(false); }} />
                    <RailTab icon={<Shield />} label="Guests" active={activeRightTab === 'guests'} onClick={() => { setActiveRightTab('guests'); setRightSidebarCollapsed(false); }} />
                </div>
            )}

            {/* Guest Right Sidebar - Chat placeholder */}
            {!isHost && !rightSidebarCollapsed && (
                <div className="w-72 bg-app-surface border-l border-app-border flex flex-col z-20 shadow-sm transition-all duration-300 relative">
                    {/* Collapse toggle button */}
                    <button 
                        className="absolute -left-3 top-4 w-6 h-6 bg-app-surface border border-app-border rounded-full flex items-center justify-center z-30 hover:bg-app-bg transition-colors"
                        onClick={() => setRightSidebarCollapsed(true)}
                    >
                        <ChevronRight className="w-3 h-3" />
                    </button>
                    
                    {/* Guest Chat Panel */}
                    {guestRightTab === 'chat' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="p-3 border-b border-app-border">
                                <h3 className="text-xs font-bold text-content-high uppercase tracking-wider">Session Chat</h3>
                            </div>
                            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                                <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                                    <MessageSquare className="w-8 h-8 text-indigo-500" />
                                </div>
                                <h3 className="text-sm font-bold text-content-high mb-2">Chat Coming Soon</h3>
                                <p className="text-xs text-content-medium">
                                    Send messages to everyone in the session. This feature will be available in an upcoming update.
                                </p>
                            </div>
                        </div>
                    )}
                    
                    {/* Guest Private Chat Panel */}
                    {guestRightTab === 'private_chat' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="p-3 border-b border-app-border">
                                <h3 className="text-xs font-bold text-content-high uppercase tracking-wider">Private Chat</h3>
                            </div>
                            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                                <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                                    <Lock className="w-8 h-8 text-purple-500" />
                                </div>
                                <h3 className="text-sm font-bold text-content-high mb-2">Private Chat Coming Soon</h3>
                                <p className="text-xs text-content-medium">
                                    Send private messages to the host or other participants. This feature will be available in an upcoming update.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Guest Tab Rail */}
            {!isHost && (
                <div className="w-12 bg-app-surface border-l border-app-border flex flex-col items-center py-4 z-20 gap-3 shrink-0 relative">
                    {/* Expand button when collapsed */}
                    {rightSidebarCollapsed && (
                        <button 
                            className="absolute -left-3 top-4 w-6 h-6 bg-app-surface border border-app-border rounded-full flex items-center justify-center z-30 hover:bg-app-bg transition-colors"
                            onClick={() => setRightSidebarCollapsed(false)}
                        >
                            <ChevronLeft className="w-3 h-3" />
                        </button>
                    )}
                    <button 
                        className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${guestRightTab === 'chat' ? 'bg-indigo-500/20 text-indigo-400' : 'text-content-medium hover:text-content-high hover:bg-app-bg'}`}
                        onClick={() => { setGuestRightTab('chat'); setRightSidebarCollapsed(false); }}
                        title="Session Chat"
                    >
                        <MessageSquare className="w-4 h-4" />
                    </button>
                    <button 
                        className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${guestRightTab === 'private_chat' ? 'bg-purple-500/20 text-purple-400' : 'text-content-medium hover:text-content-high hover:bg-app-bg'}`}
                        onClick={() => { setGuestRightTab('private_chat'); setRightSidebarCollapsed(false); }}
                        title="Private Chat"
                    >
                        <Lock className="w-4 h-4" />
                    </button>
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
            
            {/* No Destinations Prompt Modal */}
            {showNoDestinationsPrompt && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowNoDestinationsPrompt(false)} />
                    <div className="relative w-full max-w-md bg-app-surface border border-app-border rounded-2xl shadow-2xl p-6 animate-scale-in">
                        <div className="text-center">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                <AlertTriangle className="w-8 h-8 text-amber-500" />
                            </div>
                            <h3 className="text-xl font-bold text-content-high mb-2">No Destinations Added</h3>
                            <p className="text-content-medium text-sm mb-6">
                                You need to add at least one streaming destination before going live. 
                                Add platforms like YouTube, Twitch, or Facebook to start broadcasting.
                            </p>
                            <div className="flex gap-3">
                                <Button 
                                    variant="secondary" 
                                    className="flex-1"
                                    onClick={() => setShowNoDestinationsPrompt(false)}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                                    onClick={handleAddDestinationsFromPrompt}
                                >
                                    Add Destination
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Nerd Metrics Modal - Pro+ tier */}
            {showNerdMetrics && (subscriptionTier === 'pro' || subscriptionTier === 'enterprise') && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowNerdMetrics(false)} />
                    <div className="relative w-full max-w-lg bg-app-surface border border-app-border rounded-2xl shadow-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-indigo-400" />
                                Streaming Metrics
                            </h3>
                            <button onClick={() => setShowNerdMetrics(false)} className="p-1 hover:bg-app-surface-alt rounded">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-4 font-mono text-sm">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-app-bg/50 rounded-lg p-3">
                                    <span className="text-content-low text-xs">Video Bitrate</span>
                                    <div className="text-emerald-400 font-semibold">3,500 kbps</div>
                                </div>
                                <div className="bg-app-bg/50 rounded-lg p-3">
                                    <span className="text-content-low text-xs">Audio Bitrate</span>
                                    <div className="text-emerald-400 font-semibold">128 kbps</div>
                                </div>
                                <div className="bg-app-bg/50 rounded-lg p-3">
                                    <span className="text-content-low text-xs">Frame Rate</span>
                                    <div className="text-emerald-400 font-semibold">30 fps</div>
                                </div>
                                <div className="bg-app-bg/50 rounded-lg p-3">
                                    <span className="text-content-low text-xs">Resolution</span>
                                    <div className="text-emerald-400 font-semibold">1920×1080</div>
                                </div>
                                <div className="bg-app-bg/50 rounded-lg p-3">
                                    <span className="text-content-low text-xs">Dropped Frames</span>
                                    <div className="text-amber-400 font-semibold">12 (0.01%)</div>
                                </div>
                                <div className="bg-app-bg/50 rounded-lg p-3">
                                    <span className="text-content-low text-xs">Encoder</span>
                                    <div className="text-content-med font-semibold">H.264 (Main)</div>
                                </div>
                            </div>
                            <div className="border-t border-app-border pt-4">
                                <h4 className="text-sm font-semibold mb-2">Destination Health</h4>
                                {activeDestinations.length > 0 ? (
                                    <div className="space-y-2">
                                        {activeDestinations.map(dest => (
                                            <div key={dest.id} className="flex items-center justify-between bg-app-bg/50 rounded-lg p-3">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${dest.status === 'connected' ? 'bg-emerald-500' : dest.status === 'reconnecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-500'}`} />
                                                    <span className="font-semibold">{dest.platform}</span>
                                                    <span className="text-content-low">- {dest.name}</span>
                                                </div>
                                                <div className="text-content-med">{dest.bitrate} kbps</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-content-low text-xs">No active destinations</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Disable Destination Warning Modal */}
            {destToDisable && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setDestToDisable(null)} />
                    <div className="relative w-full max-w-md bg-app-surface border border-app-border rounded-2xl shadow-2xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-amber-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold">Stop Streaming?</h3>
                                <p className="text-content-low text-sm">
                                    {activeDestinations.find(d => d.id === destToDisable)?.platform} - {activeDestinations.find(d => d.id === destToDisable)?.name}
                                </p>
                            </div>
                        </div>
                        <p className="text-content-medium text-sm mb-6">
                            This will immediately stop streaming to this destination. Viewers on this platform will see your stream end.
                            Other destinations will continue streaming.
                        </p>
                        <div className="flex gap-3">
                            <Button 
                                variant="secondary" 
                                className="flex-1"
                                onClick={() => setDestToDisable(null)}
                            >
                                Cancel
                            </Button>
                            <Button 
                                variant="danger"
                                className="flex-1"
                                onClick={() => {
                                    setActiveDestinations(prev => prev.filter(d => d.id !== destToDisable));
                                    // TODO: Call API to stop specific egress
                                    setDestToDisable(null);
                                }}
                            >
                                Stop Stream
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
