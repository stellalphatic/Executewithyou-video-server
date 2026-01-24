'use client';

/**
 * ALLSTRM Studio Store - Zustand State Management
 * 
 * Centralized state management for the Studio component with:
 * - Single session enforcement (WhatsApp Web style)
 * - Tier-based limits validation
 * - Clean separation of concerns
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  Participant, 
  Destination, 
  BroadcastStatus, 
  ChatMessage, 
  LayoutState,
  BrandConfig,
  Banner,
  Tier,
  StudioConfiguration,
  VisualConfigType
} from '@/types';
import { Scene, SceneItem } from '@/types/layout';
import { getTierLimits, validateTierAction, TierLimits } from '@/lib/tierConfig';
import { sessionManager, SessionInfo } from '@/lib/sessionManager';

// ============================================================================
// Types
// ============================================================================

export interface ViewPreference {
  fit: 'contain' | 'cover';
  pan: { x: number; y: number };
  zoom: number;
}

export interface BrandProfile {
  id: string;
  name: string;
  config: BrandConfig;
}

export interface StudioScene {
  id: string;
  name: string;
  layout: string;
  participants: string[];
  activeBanners: string[];
  background: string;
  brandConfig: BrandConfig;
  bannerPositions: Record<string, { x: number; y: number }>;
}

export type SettingsTab = 'general' | 'camera' | 'audio' | 'visual_effects' | 'recording' | 'hotkeys' | 'guests' | 'diagnostics';
export type RightPanelTab = 'brand' | 'comments' | 'banners' | 'private_chat' | 'visual_effects' | 'recording' | 'mixer' | 'backstage';
export type RecordingStatus = 'idle' | 'recording' | 'paused';

export interface RecordingState {
  program: RecordingStatus;
  iso: RecordingStatus;
  duration: number;
  activeTypes: ('mixed' | 'iso')[];
  pausedTypes: ('mixed' | 'iso')[];
}

export interface AudioMixerChannel {
  volume: number;
  muted: boolean;
  peak: number;
}

// ============================================================================
// Store State
// ============================================================================

interface StudioState {
  // Session
  sessionId: string | null;
  sessionActive: boolean;
  sessionTakenOver: boolean;
  
  // Configuration
  config: StudioConfiguration | null;
  tier: Tier;
  limits: TierLimits;
  
  // Connection
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  
  // Participants
  participants: Participant[];
  onStageParticipants: Participant[];
  waitingRoomParticipants: Participant[];
  myParticipantId: string | null;
  
  // Media
  localStream: MediaStream | null;
  processedStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  audioEnabled: boolean;
  videoEnabled: boolean;
  
  // Layout
  layoutState: LayoutState | null;
  layoutLocked: boolean;
  viewPreferences: Record<string, ViewPreference>;
  stageBackground: string;
  
  // Scenes
  scenes: StudioScene[];
  activeSceneId: string;
  
  // Branding
  brands: BrandProfile[];
  selectedBrandId: string;
  banners: Banner[];
  
  // Broadcast
  broadcastStatus: BroadcastStatus;
  destinations: Destination[];
  
  // Recording
  recording: RecordingState;
  
  // Chat
  chatMessages: ChatMessage[];
  chatInput: string;
  
  // Audio Mixer
  audioMixer: Record<string, AudioMixerChannel>;
  
  // UI State
  activeRightTab: RightPanelTab;
  activeSettingsTab: SettingsTab;
  isSettingsOpen: boolean;
  isDestinationModalOpen: boolean;
  isShareMenuOpen: boolean;
  isRecordingMenuOpen: boolean;
  
  // Visual Effects
  visualConfig: VisualConfigType;
  processorBackend: 'webgl' | 'webcodecs' | 'canvas' | 'none';
  
  // Context Menu
  contextMenu: { x: number; y: number; participantId: string } | null;
  
  // Presentation
  presentationState: {
    currentSlide: number;
    totalSlides: number;
    isPresentingFile: boolean;
  };
  
  // Guest Permissions (configurable by host)
  guestPermissions: {
    canToggleAudio: boolean;
    canToggleVideo: boolean;
    canShareScreen: boolean;
    canSendChat: boolean;
    canRaiseHand: boolean;
  };
}

interface StudioActions {
  // Session
  initSession: (config: StudioConfiguration, onTakeover: () => void) => string | null;
  releaseSession: () => void;
  
  // Configuration
  setConfig: (config: StudioConfiguration) => void;
  setTier: (tier: Tier) => void;
  
  // Connection
  setConnectionState: (isConnected: boolean, isConnecting: boolean, error?: string | null) => void;
  
  // Participants
  setParticipants: (participants: Participant[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  updateParticipant: (participantId: string, updates: Partial<Participant>) => void;
  setMyParticipantId: (id: string | null) => void;
  
  // Stage Management
  addToStage: (participantId: string) => { success: boolean; error?: string };
  removeFromStage: (participantId: string) => void;
  reorderStage: (fromIndex: number, toIndex: number) => void;
  setOnStageParticipants: (participants: Participant[]) => void;
  
  // Media
  setLocalStream: (stream: MediaStream | null) => void;
  setProcessedStream: (stream: MediaStream | null) => void;
  setScreenStream: (stream: MediaStream | null) => void;
  setRemoteStream: (participantId: string, stream: MediaStream | null) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  setAudioEnabled: (enabled: boolean) => void;
  setVideoEnabled: (enabled: boolean) => void;
  
  // Layout
  setLayoutState: (state: LayoutState | null) => void;
  setPresetLayout: (preset: string) => void;
  toggleLayoutLock: () => void;
  resetLayout: () => void;
  setViewPreference: (participantId: string, pref: Partial<ViewPreference>) => void;
  setStageBackground: (color: string) => void;
  
  // Scenes
  addScene: () => { success: boolean; error?: string; sceneId?: string };
  removeScene: (sceneId: string) => void;
  updateScene: (sceneId: string, updates: Partial<StudioScene>) => void;
  setActiveScene: (sceneId: string) => void;
  loadScene: (scene: StudioScene) => void;
  
  // Branding
  addBrand: () => string;
  removeBrand: (brandId: string) => void;
  updateBrand: (brandId: string, updates: Partial<BrandConfig>) => void;
  setSelectedBrand: (brandId: string) => void;
  
  // Banners
  addBanner: (text: string, options?: Partial<Banner>) => string;
  removeBanner: (bannerId: string) => void;
  updateBanner: (bannerId: string, updates: Partial<Banner>) => void;
  toggleBannerVisibility: (bannerId: string) => void;
  
  // Broadcast
  setBroadcastStatus: (status: BroadcastStatus) => void;
  setDestinations: (destinations: Destination[]) => void;
  addDestination: (destination: Omit<Destination, 'id' | 'enabled' | 'status'>) => { success: boolean; error?: string; destinationId?: string };
  removeDestination: (destinationId: string) => void;
  toggleDestination: (destinationId: string) => void;
  
  // Recording
  setRecordingState: (updates: Partial<RecordingState>) => void;
  startRecording: (type: 'mixed' | 'iso') => { success: boolean; error?: string };
  stopRecording: (type?: 'mixed' | 'iso') => void;
  pauseRecording: (type?: 'mixed' | 'iso') => void;
  resumeRecording: (type?: 'mixed' | 'iso') => void;
  incrementRecordingDuration: () => void;
  
  // Chat
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setChatInput: (input: string) => void;
  clearChat: () => void;
  
  // Audio Mixer
  setChannelVolume: (channelId: string, volume: number) => void;
  setChannelMuted: (channelId: string, muted: boolean) => void;
  setChannelPeak: (channelId: string, peak: number) => void;
  
  // UI
  setActiveRightTab: (tab: RightPanelTab) => void;
  setActiveSettingsTab: (tab: SettingsTab) => void;
  setSettingsOpen: (open: boolean) => void;
  setDestinationModalOpen: (open: boolean) => void;
  setShareMenuOpen: (open: boolean) => void;
  setRecordingMenuOpen: (open: boolean) => void;
  
  // Visual Effects
  setVisualConfig: (config: Partial<VisualConfigType>) => void;
  setProcessorBackend: (backend: 'webgl' | 'webcodecs' | 'canvas' | 'none') => void;
  
  // Context Menu
  openContextMenu: (x: number, y: number, participantId: string) => void;
  closeContextMenu: () => void;
  
  // Presentation
  setPresentationState: (state: Partial<StudioState['presentationState']>) => void;
  
  // Guest Permissions
  setGuestPermissions: (permissions: Partial<StudioState['guestPermissions']>) => void;
  
  // Reset
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const DEFAULT_VISUAL_CONFIG: VisualConfigType = {
  skinEnhance: false,
  greenScreen: false,
  backgroundType: 'none',
  backgroundImage: '',
  blurAmount: 10,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  keyThreshold: 0.4,
  keySmoothness: 0.1,
};

const DEFAULT_BRAND_CONFIG: BrandConfig = {
  color: '#0a4cc7',
  theme: 'bubble',
  showDisplayNames: true,
  showHeadlines: false,
  position: { x: 90, y: 10 },
  scope: 'global',
  logoLocked: false,
  // New fields for enhanced branding
  logoPosition: 'top-right',
  logoSize: 'medium',
  logoBackgroundEnabled: false,
  logoPadding: 8,
  logoOpacity: 100,
  showWatermark: true, // Default to true for FREE tier
  watermarkPosition: 'bottom-right',
  watermarkOpacity: 50,
};

const initialState: StudioState = {
  // Session
  sessionId: null,
  sessionActive: false,
  sessionTakenOver: false,
  
  // Configuration
  config: null,
  tier: Tier.FREE,
  limits: getTierLimits(Tier.FREE),
  
  // Connection
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  
  // Participants
  participants: [],
  onStageParticipants: [],
  waitingRoomParticipants: [],
  myParticipantId: null,
  
  // Media
  localStream: null,
  processedStream: null,
  screenStream: null,
  remoteStreams: {},
  audioEnabled: true,
  videoEnabled: true,
  
  // Layout
  layoutState: null,
  layoutLocked: false,
  viewPreferences: {},
  stageBackground: '#000000',
  
  // Scenes
  scenes: [{
    id: 'scene-1',
    name: 'Default Scene',
    layout: 'grid',
    participants: [],
    activeBanners: [],
    background: '#000000',
    brandConfig: DEFAULT_BRAND_CONFIG,
    bannerPositions: {},
  }],
  activeSceneId: 'scene-1',
  
  // Branding
  brands: [{
    id: 'brand-1',
    name: 'Brand 1',
    config: DEFAULT_BRAND_CONFIG,
  }],
  selectedBrandId: 'brand-1',
  banners: [],
  
  // Broadcast
  broadcastStatus: 'idle',
  destinations: [],
  
  // Recording
  recording: {
    program: 'idle',
    iso: 'idle',
    duration: 0,
    activeTypes: [],
    pausedTypes: [],
  },
  
  // Chat
  chatMessages: [],
  chatInput: '',
  
  // Audio Mixer
  audioMixer: {
    local: { volume: 100, muted: false, peak: 0 },
    master: { volume: 100, muted: false, peak: 0 },
  },
  
  // UI State
  activeRightTab: 'brand',
  activeSettingsTab: 'general',
  isSettingsOpen: false,
  isDestinationModalOpen: false,
  isShareMenuOpen: false,
  isRecordingMenuOpen: false,
  
  // Visual Effects
  visualConfig: DEFAULT_VISUAL_CONFIG,
  processorBackend: 'none',
  
  // Context Menu
  contextMenu: null,
  
  // Presentation
  presentationState: {
    currentSlide: 1,
    totalSlides: 1,
    isPresentingFile: false,
  },
  
  // Guest Permissions (configurable by host)
  guestPermissions: {
    canToggleAudio: true,
    canToggleVideo: true,
    canShareScreen: false, // Disabled by default for guests
    canSendChat: true,
    canRaiseHand: true,
  },
};

// ============================================================================
// Store
// ============================================================================

export const useStudioStore = create<StudioState & StudioActions>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,
    
    // ========================================================================
    // Session
    // ========================================================================
    
    initSession: (config, onTakeover) => {
      if (!sessionManager) return null;
      
      const userId = config.userId || 'anonymous';
      const roomId = config.roomId;
      
      const sessionId = sessionManager.claimSession(roomId, userId, () => {
        set({ sessionTakenOver: true, sessionActive: false });
        onTakeover();
      });
      
      set({
        sessionId,
        sessionActive: true,
        sessionTakenOver: false,
        config,
        tier: config.tier,
        limits: getTierLimits(config.tier),
        audioEnabled: config.audioEnabled,
        videoEnabled: config.videoEnabled,
        visualConfig: config.visualConfig || DEFAULT_VISUAL_CONFIG,
      });
      
      return sessionId;
    },
    
    releaseSession: () => {
      if (sessionManager) {
        sessionManager.releaseSession();
      }
      set({ sessionId: null, sessionActive: false });
    },
    
    // ========================================================================
    // Configuration
    // ========================================================================
    
    setConfig: (config) => {
      set({
        config,
        tier: config.tier,
        limits: getTierLimits(config.tier),
        audioEnabled: config.audioEnabled,
        videoEnabled: config.videoEnabled,
        visualConfig: config.visualConfig || DEFAULT_VISUAL_CONFIG,
      });
    },
    
    setTier: (tier) => {
      set({ tier, limits: getTierLimits(tier) });
    },
    
    // ========================================================================
    // Connection
    // ========================================================================
    
    setConnectionState: (isConnected, isConnecting, error = null) => {
      set({ isConnected, isConnecting, connectionError: error });
    },
    
    // ========================================================================
    // Participants
    // ========================================================================
    
    setParticipants: (participants) => {
      const waitingRoom = participants.filter(p => p.is_in_waiting_room);
      set({ participants, waitingRoomParticipants: waitingRoom });
    },
    
    addParticipant: (participant) => {
      set((state) => ({
        participants: state.participants.some(p => p.id === participant.id)
          ? state.participants
          : [...state.participants, participant],
      }));
    },
    
    removeParticipant: (participantId) => {
      set((state) => ({
        participants: state.participants.filter(p => p.id !== participantId),
        onStageParticipants: state.onStageParticipants.filter(p => p.id !== participantId),
      }));
    },
    
    updateParticipant: (participantId, updates) => {
      set((state) => ({
        participants: state.participants.map(p =>
          p.id === participantId ? { ...p, ...updates } : p
        ),
        onStageParticipants: state.onStageParticipants.map(p =>
          p.id === participantId ? { ...p, ...updates } : p
        ),
      }));
    },
    
    setMyParticipantId: (id) => {
      set({ myParticipantId: id });
    },
    
    // ========================================================================
    // Stage Management
    // ========================================================================
    
    addToStage: (participantId) => {
      const state = get();
      
      // Validate tier limits
      const validation = validateTierAction(state.tier, 'ADD_STAGE_PARTICIPANT', {
        currentCount: state.onStageParticipants.length,
      });
      
      if (!validation.allowed) {
        return { success: false, error: validation.reason };
      }
      
      // Check if already on stage
      if (state.onStageParticipants.some(p => p.id === participantId)) {
        return { success: false, error: 'Already on stage' };
      }
      
      // Find participant
      const participant = participantId === 'local'
        ? {
            id: 'local',
            room_id: state.config?.roomId || '',
            display_name: state.config?.displayName || 'You',
            role: state.config?.role || 'guest',
            ingest_type: 'webrtc' as const,
            is_on_stage: true,
            media_state: {
              audio_enabled: state.audioEnabled,
              video_enabled: state.videoEnabled,
              screen_sharing: false,
              connection_quality: 'excellent' as const,
            },
          }
        : state.participants.find(p => p.id === participantId);
      
      if (!participant) {
        return { success: false, error: 'Participant not found' };
      }
      
      set((state) => ({
        onStageParticipants: [...state.onStageParticipants, { ...participant, is_on_stage: true }],
      }));
      
      return { success: true };
    },
    
    removeFromStage: (participantId) => {
      set((state) => ({
        onStageParticipants: state.onStageParticipants.filter(p => p.id !== participantId),
      }));
    },
    
    reorderStage: (fromIndex, toIndex) => {
      set((state) => {
        const newStage = [...state.onStageParticipants];
        const [moved] = newStage.splice(fromIndex, 1);
        newStage.splice(toIndex, 0, moved);
        return { onStageParticipants: newStage };
      });
    },
    
    setOnStageParticipants: (participants) => {
      set({ onStageParticipants: participants });
    },
    
    // ========================================================================
    // Media
    // ========================================================================
    
    setLocalStream: (stream) => {
      set({ localStream: stream });
    },
    
    setProcessedStream: (stream) => {
      set({ processedStream: stream });
    },
    
    setScreenStream: (stream) => {
      set({ screenStream: stream });
    },
    
    setRemoteStream: (participantId, stream) => {
      set((state) => {
        if (stream) {
          return { remoteStreams: { ...state.remoteStreams, [participantId]: stream } };
        } else {
          const { [participantId]: _, ...rest } = state.remoteStreams;
          return { remoteStreams: rest };
        }
      });
    },
    
    toggleAudio: () => {
      set((state) => {
        const newState = !state.audioEnabled;
        return {
          audioEnabled: newState,
          onStageParticipants: state.onStageParticipants.map(p =>
            p.id === 'local'
              ? { ...p, media_state: { ...p.media_state, audio_enabled: newState } }
              : p
          ),
        };
      });
    },
    
    toggleVideo: () => {
      set((state) => {
        const newState = !state.videoEnabled;
        return {
          videoEnabled: newState,
          onStageParticipants: state.onStageParticipants.map(p =>
            p.id === 'local'
              ? { ...p, media_state: { ...p.media_state, video_enabled: newState } }
              : p
          ),
        };
      });
    },
    
    setAudioEnabled: (enabled) => {
      set({ audioEnabled: enabled });
    },
    
    setVideoEnabled: (enabled) => {
      set({ videoEnabled: enabled });
    },
    
    // ========================================================================
    // Layout
    // ========================================================================
    
    setLayoutState: (state) => {
      set({ layoutState: state });
    },
    
    setPresetLayout: (preset) => {
      set((state) => ({
        layoutState: state.layoutState
          ? { ...state.layoutState, preset_name: preset }
          : null,
      }));
    },
    
    toggleLayoutLock: () => {
      set((state) => ({ layoutLocked: !state.layoutLocked }));
    },
    
    resetLayout: () => {
      set((state) => ({
        layoutState: state.layoutState
          ? { ...state.layoutState, preset_name: 'grid' }
          : null,
        layoutLocked: false,
        viewPreferences: {},
      }));
    },
    
    setViewPreference: (participantId, pref) => {
      set((state) => {
        const existing = state.viewPreferences[participantId] || {
          fit: 'contain' as const,
          pan: { x: 50, y: 50 },
          zoom: 1,
        };
        return {
          viewPreferences: {
            ...state.viewPreferences,
            [participantId]: {
              ...existing,
              ...pref,
            },
          },
        };
      });
    },
    
    setStageBackground: (color) => {
      set({ stageBackground: color });
    },
    
    // ========================================================================
    // Scenes
    // ========================================================================
    
    addScene: () => {
      const state = get();
      
      const validation = validateTierAction(state.tier, 'ADD_SCENE', {
        currentCount: state.scenes.length,
      });
      
      if (!validation.allowed) {
        return { success: false, error: validation.reason };
      }
      
      const sceneId = `scene-${Date.now()}`;
      const activeBrand = state.brands.find(b => b.id === state.selectedBrandId);
      
      const newScene: StudioScene = {
        id: sceneId,
        name: `Scene ${state.scenes.length + 1}`,
        layout: 'grid',
        participants: [],
        activeBanners: [],
        background: '#000000',
        brandConfig: activeBrand?.config || DEFAULT_BRAND_CONFIG,
        bannerPositions: {},
      };
      
      set((state) => ({
        scenes: [...state.scenes, newScene],
      }));
      
      return { success: true, sceneId };
    },
    
    removeScene: (sceneId) => {
      set((state) => {
        if (state.scenes.length <= 1) return state; // Keep at least one scene
        const newScenes = state.scenes.filter(s => s.id !== sceneId);
        return {
          scenes: newScenes,
          activeSceneId: state.activeSceneId === sceneId
            ? newScenes[0]?.id || 'scene-1'
            : state.activeSceneId,
        };
      });
    },
    
    updateScene: (sceneId, updates) => {
      set((state) => ({
        scenes: state.scenes.map(s =>
          s.id === sceneId ? { ...s, ...updates } : s
        ),
      }));
    },
    
    setActiveScene: (sceneId) => {
      set({ activeSceneId: sceneId });
    },
    
    loadScene: (scene) => {
      // This would trigger layout changes, banner toggles, etc.
      set({
        activeSceneId: scene.id,
        stageBackground: scene.background,
      });
    },
    
    // ========================================================================
    // Branding
    // ========================================================================
    
    addBrand: () => {
      const brandId = `brand-${Date.now()}`;
      const state = get();
      
      set({
        brands: [
          ...state.brands,
          {
            id: brandId,
            name: `Brand ${state.brands.length + 1}`,
            config: DEFAULT_BRAND_CONFIG,
          },
        ],
      });
      
      return brandId;
    },
    
    removeBrand: (brandId) => {
      set((state) => {
        if (state.brands.length <= 1) return state;
        const newBrands = state.brands.filter(b => b.id !== brandId);
        return {
          brands: newBrands,
          selectedBrandId: state.selectedBrandId === brandId
            ? newBrands[0]?.id || 'brand-1'
            : state.selectedBrandId,
        };
      });
    },
    
    updateBrand: (brandId, updates) => {
      set((state) => ({
        brands: state.brands.map(b =>
          b.id === brandId ? { ...b, config: { ...b.config, ...updates } } : b
        ),
      }));
    },
    
    setSelectedBrand: (brandId) => {
      set({ selectedBrandId: brandId });
    },
    
    // ========================================================================
    // Banners
    // ========================================================================
    
    addBanner: (text, options = {}) => {
      const bannerId = `banner-${Date.now()}`;
      const isTicker = options.isTicker || false;
      
      const newBanner: Banner = {
        id: bannerId,
        text,
        type: isTicker ? 'ticker' : 'banner',
        isTicker: isTicker,
        isVisible: options.isVisible ?? true,
        scope: options.scope || 'global',
        locked: options.locked || false,
        // Color fields
        backgroundColor: options.customColor || '#0a4cc7',
        backgroundOpacity: 100,
        textColor: options.customTextColor || '#ffffff',
        customColor: options.customColor,
        customTextColor: options.customTextColor,
        // Size and layout
        fullWidth: isTicker,
        verticalOnly: isTicker,
        style: options.style || 'standard',
        position: options.position,
        // Ticker-specific
        tickerSpeed: 'medium',
        minY: isTicker ? 70 : undefined,
        maxY: isTicker ? 100 : undefined,
      };
      
      set((state) => ({
        banners: [newBanner, ...state.banners],
      }));
      
      return bannerId;
    },
    
    removeBanner: (bannerId) => {
      set((state) => ({
        banners: state.banners.filter(b => b.id !== bannerId),
      }));
    },
    
    updateBanner: (bannerId, updates) => {
      set((state) => ({
        banners: state.banners.map(b =>
          b.id === bannerId ? { ...b, ...updates } : b
        ),
      }));
    },
    
    toggleBannerVisibility: (bannerId) => {
      set((state) => ({
        banners: state.banners.map(b =>
          b.id === bannerId ? { ...b, isVisible: !b.isVisible } : b
        ),
      }));
    },
    
    // ========================================================================
    // Broadcast
    // ========================================================================
    
    setBroadcastStatus: (status) => {
      set({ broadcastStatus: status });
    },
    
    setDestinations: (destinations) => {
      set({ destinations });
    },
    
    addDestination: (destination) => {
      const state = get();
      
      const validation = validateTierAction(state.tier, 'ADD_DESTINATION', {
        currentCount: state.destinations.length,
      });
      
      if (!validation.allowed) {
        return { success: false, error: validation.reason };
      }
      
      const destinationId = `dest-${Date.now()}`;
      
      set((state) => ({
        destinations: [
          ...state.destinations,
          { ...destination, id: destinationId, enabled: true, status: 'idle' },
        ],
      }));
      
      return { success: true, destinationId };
    },
    
    removeDestination: (destinationId) => {
      set((state) => ({
        destinations: state.destinations.filter(d => d.id !== destinationId),
      }));
    },
    
    toggleDestination: (destinationId) => {
      set((state) => ({
        destinations: state.destinations.map(d =>
          d.id === destinationId ? { ...d, enabled: !d.enabled } : d
        ),
      }));
    },
    
    // ========================================================================
    // Recording
    // ========================================================================
    
    setRecordingState: (updates) => {
      set((state) => ({
        recording: { ...state.recording, ...updates },
      }));
    },
    
    startRecording: (type) => {
      const state = get();
      
      if (type === 'iso') {
        const validation = validateTierAction(state.tier, 'START_ISO_RECORDING', {});
        if (!validation.allowed) {
          return { success: false, error: validation.reason };
        }
      } else {
        const validation = validateTierAction(state.tier, 'START_RECORDING', {});
        if (!validation.allowed) {
          return { success: false, error: validation.reason };
        }
      }
      
      set((state) => ({
        recording: {
          ...state.recording,
          [type === 'iso' ? 'iso' : 'program']: 'recording',
          activeTypes: [...state.recording.activeTypes, type],
          pausedTypes: state.recording.pausedTypes.filter(t => t !== type),
        },
      }));
      
      return { success: true };
    },
    
    stopRecording: (type) => {
      set((state) => {
        if (type) {
          return {
            recording: {
              ...state.recording,
              [type === 'iso' ? 'iso' : 'program']: 'idle',
              activeTypes: state.recording.activeTypes.filter(t => t !== type),
              pausedTypes: state.recording.pausedTypes.filter(t => t !== type),
              duration: state.recording.activeTypes.length <= 1 ? 0 : state.recording.duration,
            },
          };
        }
        return {
          recording: {
            program: 'idle',
            iso: 'idle',
            duration: 0,
            activeTypes: [],
            pausedTypes: [],
          },
        };
      });
    },
    
    pauseRecording: (type) => {
      set((state) => ({
        recording: {
          ...state.recording,
          [type === 'iso' ? 'iso' : 'program']: 'paused',
          pausedTypes: type
            ? [...state.recording.pausedTypes, type]
            : state.recording.activeTypes,
        },
      }));
    },
    
    resumeRecording: (type) => {
      set((state) => ({
        recording: {
          ...state.recording,
          [type === 'iso' ? 'iso' : 'program']: 'recording',
          pausedTypes: type
            ? state.recording.pausedTypes.filter(t => t !== type)
            : [],
        },
      }));
    },
    
    incrementRecordingDuration: () => {
      set((state) => ({
        recording: {
          ...state.recording,
          duration: state.recording.duration + 1,
        },
      }));
    },
    
    // ========================================================================
    // Chat
    // ========================================================================
    
    addChatMessage: (message) => {
      const chatMessage: ChatMessage = {
        ...message,
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      };
      
      set((state) => ({
        chatMessages: [...state.chatMessages, chatMessage],
      }));
    },
    
    setChatInput: (input) => {
      set({ chatInput: input });
    },
    
    clearChat: () => {
      set({ chatMessages: [] });
    },
    
    // ========================================================================
    // Audio Mixer
    // ========================================================================
    
    setChannelVolume: (channelId, volume) => {
      set((state) => ({
        audioMixer: {
          ...state.audioMixer,
          [channelId]: {
            ...state.audioMixer[channelId],
            volume,
          },
        },
      }));
    },
    
    setChannelMuted: (channelId, muted) => {
      set((state) => ({
        audioMixer: {
          ...state.audioMixer,
          [channelId]: {
            ...state.audioMixer[channelId],
            muted,
          },
        },
      }));
    },
    
    setChannelPeak: (channelId, peak) => {
      set((state) => ({
        audioMixer: {
          ...state.audioMixer,
          [channelId]: {
            ...state.audioMixer[channelId],
            peak,
          },
        },
      }));
    },
    
    // ========================================================================
    // UI
    // ========================================================================
    
    setActiveRightTab: (tab) => {
      set({ activeRightTab: tab });
    },
    
    setActiveSettingsTab: (tab) => {
      set({ activeSettingsTab: tab });
    },
    
    setSettingsOpen: (open) => {
      set({ isSettingsOpen: open });
    },
    
    setDestinationModalOpen: (open) => {
      set({ isDestinationModalOpen: open });
    },
    
    setShareMenuOpen: (open) => {
      set({ isShareMenuOpen: open });
    },
    
    setRecordingMenuOpen: (open) => {
      set({ isRecordingMenuOpen: open });
    },
    
    // ========================================================================
    // Visual Effects
    // ========================================================================
    
    setVisualConfig: (config) => {
      set((state) => ({
        visualConfig: { ...state.visualConfig, ...config },
      }));
    },
    
    setProcessorBackend: (backend) => {
      set({ processorBackend: backend });
    },
    
    // ========================================================================
    // Context Menu
    // ========================================================================
    
    openContextMenu: (x, y, participantId) => {
      set({ contextMenu: { x, y, participantId } });
    },
    
    closeContextMenu: () => {
      set({ contextMenu: null });
    },
    
    // ========================================================================
    // Presentation
    // ========================================================================
    
    setPresentationState: (state) => {
      set((s) => ({
        presentationState: { ...s.presentationState, ...state },
      }));
    },
    
    // ========================================================================
    // Guest Permissions
    // ========================================================================
    
    setGuestPermissions: (permissions) => {
      set((s) => ({
        guestPermissions: { ...s.guestPermissions, ...permissions },
      }));
    },
    
    // ========================================================================
    // Reset
    // ========================================================================
    
    reset: () => {
      const state = get();
      state.releaseSession();
      set(initialState);
    },
  }))
);

// ============================================================================
// Selectors (for optimized subscriptions)
// ============================================================================

export const selectIsHost = (state: StudioState) => {
  const role = state.config?.role;
  return role === 'owner' || role === 'host' || role === 'co_host';
};

export const selectIsGuest = (state: StudioState) => {
  return state.config?.role === 'guest';
};

export const selectCanGuestShareScreen = (state: StudioState) => {
  return state.guestPermissions.canShareScreen;
};

export const selectActiveBrand = (state: StudioState) => {
  return state.brands.find(b => b.id === state.selectedBrandId) || state.brands[0];
};

export const selectActiveScene = (state: StudioState) => {
  return state.scenes.find(s => s.id === state.activeSceneId) || state.scenes[0];
};

export const selectVisibleBanners = (state: StudioState) => {
  return state.banners.filter(b => b.isVisible);
};

export const selectBackstageParticipants = (state: StudioState) => {
  return state.participants.filter(
    p => !p.is_on_stage && !p.is_in_waiting_room
  );
};

export const selectIsRecording = (state: StudioState) => {
  return state.recording.activeTypes.length > 0;
};

export const selectCanAddToStage = (state: StudioState) => {
  return state.onStageParticipants.length < state.limits.maxStageParticipants;
};

export const selectCanAddDestination = (state: StudioState) => {
  const limit = state.limits.maxDestinations;
  return limit === -1 || state.destinations.length < limit;
};
