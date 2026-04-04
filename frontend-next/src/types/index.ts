
// types/allstrm.ts

export enum Tier {
  FREE = 1,       // Tier 1: Creator Essentials
  CREATOR = 2,    // Tier 2: Advanced Streamers
  PRO = 3,        // Tier 3: Studio Pro
  BROADCAST = 4,  // Tier 4: Broadcast Master
  ENTERPRISE = 5  // Tier 5: Ultra / AI
}

export type BillingTier = 'free' | 'creator' | 'professional' | 'broadcast' | 'enterprise';
export type RoomStatus = 'idle' | 'preparing' | 'live' | 'recording' | 'paused' | 'ending' | 'ended';
export type ParticipantRole = 'owner' | 'host' | 'co_host' | 'guest' | 'viewer';
export type IngestType = 'webrtc' | 'srt' | 'rtmp' | 'ndi';
export type RecordingStatus = 'pending' | 'recording' | 'processing' | 'uploading' | 'completed' | 'failed';
export type BroadcastStatus = 'idle' | 'starting' | 'live' | 'ending' | 'stopping' | 'error';

// NEW: Meeting Specific Types
export type RoomMode = 'studio' | 'meeting';
export type MeetingLayout = 'gallery' | 'speaker' | 'spotlight';

// --- API SPEC TYPES ---

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface AuthSession {
  wsUrl: string;
  roomId: string;
  token: string;
  iceServers: IceServer[];
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

// WebSocket Message Payloads
export type ClientMessageType =
  | 'JOIN_REQUEST' | 'LEAVE_REQUEST' | 'OFFER' | 'ANSWER' | 'ICE_CANDIDATE'
  | 'PARTICIPANT_UPDATE' | 'MEDIA_STATE_UPDATE' | 'LAYOUT_UPDATE'
  | 'BROADCAST_CONTROL' | 'STAGE_CONTROL' | 'CHAT_MESSAGE' | 'RECORDING_CONTROL' | 'PARTICIPANT_UPDATE';

export type ServerMessageType =
  | 'JOIN_ACCEPTED' | 'JOIN_REJECTED' | 'PARTICIPANT_JOINED' | 'PARTICIPANT_LEFT' | 'PARTICIPANT_UPDATED'
  | 'OFFER_RECEIVED' | 'ANSWER_RECEIVED' | 'ICE_CANDIDATE_RECEIVED' | 'ROOM_STATE_UPDATE' | 'LAYOUT_STATE_UPDATE'
  | 'CHAT_MESSAGE_RECEIVED' | 'ERROR' | 'RECORDING_STARTED' | 'RECORDING_STOPPED' | 'MEDIA_STATE_UPDATE';

// ----------------------

export interface Organization {
  id: string;
  name: string;
  slug: string;
  billing_tier: BillingTier;
  tier_level: Tier;
  max_rooms: number;
  max_guests_per_room: number;
}

export type DestinationStatus = 'idle' | 'connecting' | 'live' | 'unstable' | 'reconnecting' | 'offline' | 'error' | 'stopped';

export interface DestinationHealth {
  bitrate: number; // kbps
  fps: number;
  droppedFrames: number;
  cpuLoad?: number;
}

export interface Destination {
  id: string;
  platform: string;
  name: string;
  url?: string;
  streamKey?: string;
  enabled: boolean;
  status: DestinationStatus; // Real-time status
  health?: DestinationHealth; // Real-time telemetry
  errorMessage?: string;
}

export interface Room {
  id: string;
  organization_id: string;
  owner_id: string;
  name: string;
  status: RoomStatus;
  mode: RoomMode;
  layout_state: LayoutState;
  audio_config: AudioConfig;
  stream_config: StreamConfig;
  metrics: RoomMetrics;
  created_at?: string;
  updated_at?: string;
  description?: string;
  thumbnail_url?: string;
}

export interface LayoutState {
  canvas: { width: number; height: number; fps: number; background: string };
  sources: Record<string, SourceConfig>;
  overlays: Record<string, OverlayConfig>;
  preset_name: string;
  version: number;
  last_changed_by?: string;
}

export interface SourceConfig {
  participant_id: string;
  type: 'camera' | 'screenshare' | 'image' | 'video' | 'browser';
  label: string;
  position: { x: number; y: number; width: number; height: number; z: number };
  style?: { border_radius: number; border_width: number; border_color: string };
  crop?: { x: number; y: number; width: number; height: number };
  effects?: { blur: number; brightness: number; saturation: number };
  audio: { volume: number; muted: boolean; pan?: number };
  enabled: boolean;
  transition?: { type: 'cut' | 'fade' | 'slide'; duration_ms: number };
}

export interface OverlayConfig {
  type: "image" | "text" | "logo" | "lower_third" | "timer" | "chat";
  position: { x: number; y: number; width: number; height: number; z: number };
  content: {
    text?: string;
    font?: string;
    size?: number;
    color?: string;
    image_url?: string;
  };
  enabled: boolean;
}

export interface Participant {
  id: string;
  room_id: string;
  user_id?: string;
  display_name: string;
  role: ParticipantRole;
  ingest_type: IngestType;
  source_id?: string;
  media_state: MediaState;
  // Guest Management (Studio)
  is_on_stage: boolean;
  is_banned?: boolean;
  // Meeting Specifics
  is_in_waiting_room?: boolean;
  is_raised_hand?: boolean;
  is_pinned?: boolean;
  current_reaction?: string; // e.g., '👍', '❤️'
  reaction_timestamp?: number;
  joinedAt?: string; // API
  metadata?: string;
}

export interface MediaState {
  video_enabled: boolean;
  audio_enabled: boolean;
  screen_sharing: boolean;
  connection_quality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface AudioConfig {
  master_volume?: number;
}
export interface StreamConfig {
  rtmp_url?: string;
}
export interface RoomMetrics {
  viewers?: number;
}

export interface LayoutPosition {
  source_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

// Visual Configuration Type
export interface VisualConfigType {
  skinEnhance: boolean;
  greenScreen: boolean;
  backgroundType: 'none' | 'blur' | 'image';
  backgroundImage: string;
  blurAmount: number;
  brightness: number;
  contrast: number;
  saturation: number;
  keyThreshold: number;
  keySmoothness: number;
}

// Recording Configuration Type
export type RecordingDestination = 'local' | 'cloud' | 'both';

export interface RecordingConfig {
  enableMixedRecording: boolean;  // Records final composed output
  enableIsoRecording: boolean;    // Records individual participant tracks
  autoStartMode: 'none' | 'on_live' | 'from_start'; // When to auto-start recording
  showHostName: boolean;          // Display host name overlay
  destination: RecordingDestination; // Where recordings are saved
  cloudAutoUpload: boolean;       // Auto-upload local recordings to cloud when connection available
}

// Brand Configuration
export type BrandTheme = 'bubble' | 'classic' | 'minimal' | 'block';
export type OverlayScope = 'global' | 'host_only'; // Global = Whole Screen, Host Only = Host Region
export type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type LogoSize = 'small' | 'medium' | 'large';

// Tier-based feature access for branding
export const BRANDING_TIER_REQUIREMENTS = {
  removeWatermark: Tier.CREATOR,       // FREE tier always shows ALLSTRM watermark
  customLogo: Tier.CREATOR,            // Upload custom logo
  logoBackground: Tier.PRO,            // Add background behind logo
  advancedOverlays: Tier.PRO,          // Ticker, lower thirds
  customFonts: Tier.BROADCAST,         // Custom fonts for overlays
  animatedOverlays: Tier.ENTERPRISE,   // Animated transitions
} as const;

export interface BrandConfig {
  color: string;
  theme: BrandTheme;
  logoUrl?: string;
  logoFile?: File;                     // For upload handling
  logoPosition: LogoPosition;
  logoSize: LogoSize;
  logoBackground?: string;             // Background color behind logo
  logoBackgroundEnabled: boolean;
  logoPadding: number;                 // Padding around logo (px)
  logoOpacity: number;                 // 0-100
  showDisplayNames: boolean;
  showHeadlines: boolean;
  position?: { x: number, y: number }; // Percentage 0-100
  scope: OverlayScope;
  logoLocked?: boolean;
  // Watermark settings (enforced for FREE tier)
  showWatermark: boolean;              // Always true for FREE tier
  watermarkPosition: LogoPosition;
  watermarkOpacity: number;            // 0-100
}

export type OverlayType = 'banner' | 'ticker' | 'lower_third' | 'custom';
export type TickerSpeed = 'slow' | 'medium' | 'fast';
export type OverlayAnimation = 'none' | 'fade' | 'slide_left' | 'slide_right' | 'slide_up' | 'slide_down';

export interface Banner {
  id: string;
  text: string;
  type: OverlayType;                   // banner | ticker | lower_third | custom
  isTicker: boolean;                   // Legacy - kept for compat
  isVisible: boolean;
  position?: { x: number, y: number }; // Percentage 0-100
  // Color settings
  backgroundColor: string;             // Background color
  backgroundOpacity: number;           // 0-100 (100 = solid, 0 = transparent)
  textColor: string;                   // Text color
  // Legacy color fields (kept for compat)
  customColor?: string;
  customTextColor?: string;
  // Size and layout
  fullWidth: boolean;                  // Full width ticker
  height?: number;                     // Height in pixels (for tickers)
  verticalOnly: boolean;               // Restrict drag to vertical axis only (for tickers)
  minY?: number;                       // Minimum Y position (percentage)
  maxY?: number;                       // Maximum Y position (percentage)
  // Style settings
  scope: OverlayScope;
  locked?: boolean;
  style?: 'standard' | 'lower_third';
  fontSize?: number;                   // Font size in px
  fontWeight?: 'normal' | 'medium' | 'bold';
  // Ticker-specific
  tickerSpeed?: TickerSpeed;
  tickerDirection?: 'left' | 'right';
  // Animation
  animation?: OverlayAnimation;
  animationDuration?: number;          // ms
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface StudioConfiguration {
  roomId: string;
  roomName: string; // Display name for the room/meeting
  userId?: string; // User ID for OAuth and API calls
  displayName: string;
  hostName?: string; // Name of the host (for waiting room display)
  role: ParticipantRole;
  tier: Tier;
  audioEnabled: boolean;
  videoEnabled: boolean;
  videoDeviceId: string;
  audioDeviceId: string;
  audioOutputDeviceId?: string;
  resolution: '1080p' | '720p' | '360p' | '4k';
  frameRate: number;
  visualConfig: VisualConfigType;
  mode: RoomMode; // Studio or Meeting
  preGeneratedToken?: string;
}

export interface UseAllstrmOptions {
  roomId: string;
  displayName: string;
  initialConfig?: Partial<StudioConfiguration>;
  onParticipantJoined?: (participant: Participant) => void;
  onParticipantLeft?: (participantId: string) => void;
  onLayoutChanged?: (layoutState: LayoutState) => void;
  onError?: (error: { code: string; message: string }) => void;
}

export interface StreamConfigParams {
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface UseAllstrmReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  participants: Participant[];
  myParticipantId: string | null;
  mySourceId: string | null;
  layoutState: LayoutState | null;
  localStream: MediaStream | null;
  screenStream: MediaStream | null; // NEW
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleVideo: () => void;
  toggleAudio: () => void;
  startScreenShare: () => Promise<void>; // NEW
  stopScreenShare: () => void; // NEW
  updateLayout: (positions: LayoutPosition[]) => Promise<void>;
  setPresetLayout: (preset: string) => Promise<void>;
  muteParticipant: (participantId: string) => void;
  muteAllParticipants: () => void; // NEW
  stopParticipantVideo: (participantId: string) => void; // NEW
  startRecording: (type?: 'mixed' | 'iso', stageElement?: HTMLDivElement | null) => void;
  stopRecording: (recordingId: string) => void;
  prepareCamera: () => Promise<MediaStream | null | void>;
  switchDevice: (kind: 'audio' | 'video' | 'videoinput' | 'audioinput' | 'audiooutput', deviceId: string) => Promise<void>;
  getActiveDevice: (kind: 'videoinput' | 'audioinput' | 'audiooutput') => string;
  updateVideoConfig: (config: StreamConfigParams) => Promise<void>;
  replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>;
  // Guest Management Actions
  toggleStageStatus: (participantId: string, isOnStage: boolean) => void;
  removeParticipant: (participantId: string) => void;
  sendReaction: (emoji: string) => void; // NEW
  toggleHandRaise: () => void; // NEW
  // Broadcast Actions
  broadcastStatus: BroadcastStatus;
  destinations: Destination[];
  startBroadcast: () => Promise<void>;
  stopBroadcast: () => Promise<void>;
  addDestination: (destination: Omit<Destination, 'id' | 'enabled' | 'status'>) => Promise<void>;
  removeDestination: (destinationId: string) => Promise<void>;
  toggleDestination: (destinationId: string, enabled: boolean) => Promise<void>;
  // Chat
  chatMessages: ChatMessage[];
  sendChatMessage: (text: string) => void;
  // Meeting Actions
  admitParticipant: (participantId: string) => void;
  startFilePresentation: (file: File) => void;
  globalMuteState: boolean;
  globalVideoState: boolean;
  // Kick notification
  wasKicked: boolean;
  // Session ended (host left)
  sessionEnded: boolean;
}

// Upload Queue Types
export interface UploadItem {
  id: string;
  file: Blob;
  filename: string;
  mimeType: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  url?: string;
  timestamp: number;
}

// --- S4: POST-PRODUCTION TYPES ---

export interface MediaAsset {
  id: string;
  title: string;
  thumbnail: string;
  duration: string; // "MM:SS"
  date: string;
  size: string;
  type: 'video' | 'audio' | 'image';
  status: 'ready' | 'processing' | 'error';
  url?: string; // Mock URL
}

export interface AIClip {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  viralScore: number; // 0-100
  transcript?: string;
  layout: 'portrait' | 'landscape' | 'square';
}

export type EditorAspectRatio = '16:9' | '9:16' | '1:1';

// --- Billing & Settings ---

export interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: 'paid' | 'pending' | 'failed';
  pdfUrl: string;
}

export interface PaymentMethod {
  last4: string;
  brand: string; // Visa, Mastercard
  expiry: string;
}
