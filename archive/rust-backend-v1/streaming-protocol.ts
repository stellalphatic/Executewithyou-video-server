/**
 * ALLSTRM Streaming WebSocket Protocol Types
 * 
 * These types define the WebSocket message protocol between
 * the frontend BroadcastEngine and the Rust backend.
 * 
 * Architecture: Push-Based Telemetry
 * - Backend PUSHES destination status updates (no polling)
 * - Frontend sends commands for destination management
 * 
 * Supported Platforms (Enterprise Suite - 13 platforms):
 * - YouTube, Facebook, LinkedIn, Twitter/X, Twitch
 * - Instagram (vertical), TikTok (vertical), Kick
 * - Brightcove, Hopin, Vimeo, Amazon Live, Custom RTMP
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Enterprise Destination Suite - 13 supported streaming platforms
 * Note: Values must match Rust backend snake_case serialization
 */
export type Platform = 
  | 'youtube'       // Standard RTMP
  | 'facebook'      // RTMPS required
  | 'linked_in'     // RTMPS required (note: snake_case)
  | 'twitter'       // X/Twitter - RTMPS via Media Studio
  | 'twitch'        // Strict ingest requirements
  | 'instagram'     // RTMPS, vertical 9:16 preferred
  | 'kick'          // RTMP/RTMPS
  | 'brightcove'    // Enterprise RTMP
  | 'hopin'         // Virtual Event RTMP
  | 'custom'        // Generic fallback (was custom_rtmp)
  | 'tik_tok'       // RTMPS, vertical 9:16 required (note: snake_case)
  | 'vimeo'         // RTMPS
  | 'amazon_live';  // RTMPS, strict bitrate limits (note: snake_case)

/**
 * Platform display names for UI
 */
export const PLATFORM_DISPLAY_NAMES: Record<Platform, string> = {
  youtube: 'YouTube',
  facebook: 'Facebook Live',
  linked_in: 'LinkedIn Live',
  twitter: 'X (Twitter)',
  twitch: 'Twitch',
  instagram: 'Instagram Live',
  kick: 'Kick',
  brightcove: 'Brightcove',
  hopin: 'Hopin',
  custom: 'Custom RTMP',
  tik_tok: 'TikTok',
  vimeo: 'Vimeo',
  amazon_live: 'Amazon Live',
};

/**
 * Platforms that require/prefer vertical video (9:16)
 */
export const VERTICAL_PLATFORMS: Platform[] = ['instagram', 'tik_tok'];

/**
 * Platforms that require RTMPS (TLS)
 */
export const RTMPS_REQUIRED: Platform[] = [
  'facebook', 'linked_in', 'twitter', 'instagram', 
  'kick', 'tik_tok', 'vimeo', 'amazon_live'
];

export type DestinationStatus = 
  | 'idle'
  | 'connecting'
  | 'live'
  | 'unstable'
  | 'reconnecting'
  | 'error'
  | 'offline';

export type UserRole = 'host' | 'guest' | 'viewer';

export type StreamOverallStatus = 'healthy' | 'degraded' | 'critical' | 'offline';

// ============================================================================
// Platform Configuration
// ============================================================================

export interface PlatformConfig {
  platform: Platform;
  displayName: string;
  defaultServerUrl?: string;
  requiresVertical: boolean;
  maxBitrateKbps?: number;
  requiresTls: boolean;
}

/**
 * Platform information returned from server
 */
export interface PlatformInfo {
  platform: Platform;
  display_name: string;
  default_server_url?: string;
  requires_vertical: boolean;
  max_bitrate_kbps?: number;
  requires_tls: boolean;
}

// ============================================================================
// Health & Status Types
// ============================================================================

export interface DestinationHealth {
  bitrate: number;      // kbps
  fps: number;
  dropped_frames: number;
  rtt_ms?: number;
}

export interface DestinationInfo {
  id: string;
  platform: Platform;
  name: string;
  enabled: boolean;
  status: DestinationStatus;
  health: DestinationHealth;
}

// ============================================================================
// Client → Server Messages
// ============================================================================

export type ClientMessage =
  | { type: 'join'; payload: JoinPayload }
  | { type: 'stream:destination:add'; payload: AddDestinationPayload }
  | { type: 'stream:destination:remove'; payload: { id: string } }
  | { type: 'stream:destination:toggle'; payload: ToggleDestinationPayload }
  | { type: 'stream:start'; payload: StartBroadcastPayload }
  | { type: 'stream:stop'; payload: Record<string, never> }
  | { type: 'stream:status'; payload: Record<string, never> }
  | { type: 'platforms:list'; payload: Record<string, never> }
  | { type: 'platforms:validate'; payload: ValidateDestinationPayload }
  | { type: 'ping'; payload: { timestamp: number } };

export interface JoinPayload {
  room_id: string;
  user_id: string;
  role: UserRole;
}

export interface AddDestinationPayload {
  id: string;
  platform: Platform;
  name: string;
  rtmp_url: string;
  stream_key: string;
  enabled: boolean;
}

export interface ToggleDestinationPayload {
  id: string;
  enabled: boolean;
}

export interface StartBroadcastPayload {
  destination_ids: string[];
}

export interface ValidateDestinationPayload {
  platform: Platform;
  rtmp_url: string;
  stream_key: string;
}

// ============================================================================
// Server → Client Messages
// ============================================================================

export type ServerMessage =
  | { type: 'joined'; payload: JoinedPayload }
  | { type: 'streaming'; payload: StreamingEvent }
  | { type: 'destination:added'; payload: { id: string } }
  | { type: 'destination:removed'; payload: { id: string } }
  | { type: 'broadcast:started'; payload: { active_destinations: string[] } }
  | { type: 'broadcast:stopped'; payload: Record<string, never> }
  | { type: 'status'; payload: StatusPayload }
  | { type: 'error'; payload: ErrorPayload }
  | { type: 'pong'; payload: PongPayload }
  | { type: 'platforms:list'; payload: PlatformsListPayload }
  | { type: 'platforms:validated'; payload: DestinationValidatedPayload };

export interface JoinedPayload {
  room_id: string;
  user_id: string;
  destinations: DestinationInfo[];
  is_broadcasting: boolean;
}

export interface StatusPayload {
  is_broadcasting: boolean;
  destinations: DestinationInfo[];
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface PongPayload {
  timestamp: number;
  server_time: number;
}

export interface PlatformsListPayload {
  platforms: PlatformInfo[];
}

export interface DestinationValidatedPayload {
  platform: Platform;
  valid: boolean;
  error?: string;
  warnings: string[];
}

// ============================================================================
// Streaming Events (Push-Based Telemetry)
// ============================================================================

export type StreamingEvent =
  | DestinationUpdateEvent
  | StreamHealthEvent
  | BroadcastStartedEvent
  | BroadcastEndedEvent;

export interface DestinationUpdateEvent {
  type: 'DESTINATION_UPDATE';
  payload: {
    id: string;
    status: DestinationStatus;
    health: DestinationHealth;
    error?: string;
    reconnect_attempt?: number;
    max_attempts?: number;
  };
}

export interface StreamHealthEvent {
  type: 'STREAM_HEALTH';
  payload: {
    overall: StreamOverallStatus;
    active_destinations: number;
    total_bitrate: number;
  };
}

export interface BroadcastStartedEvent {
  type: 'BROADCAST_STARTED';
  payload: {
    room_id: string;
    destinations: string[];
  };
}

export interface BroadcastEndedEvent {
  type: 'BROADCAST_ENDED';
  payload: {
    room_id: string;
    duration_seconds: number;
  };
}

// ============================================================================
// Helper Type Guards
// ============================================================================

export function isDestinationUpdate(event: StreamingEvent): event is DestinationUpdateEvent {
  return event.type === 'DESTINATION_UPDATE';
}

export function isStreamHealth(event: StreamingEvent): event is StreamHealthEvent {
  return event.type === 'STREAM_HEALTH';
}

export function isBroadcastStarted(event: StreamingEvent): event is BroadcastStartedEvent {
  return event.type === 'BROADCAST_STARTED';
}

export function isBroadcastEnded(event: StreamingEvent): event is BroadcastEndedEvent {
  return event.type === 'BROADCAST_ENDED';
}

// ============================================================================
// WebSocket Client Class
// ============================================================================

export type StreamingEventHandler = (event: StreamingEvent) => void;
export type ConnectionHandler = () => void;
export type ErrorHandler = (error: Error) => void;

export interface StreamingWebSocketConfig {
  url: string;
  roomId: string;
  userId: string;
  role: UserRole;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

/**
 * WebSocket client for streaming destination management.
 * 
 * Usage:
 * ```ts
 * const ws = new StreamingWebSocket({
 *   url: 'ws://localhost:8081/ws',
 *   roomId: 'room-123',
 *   userId: 'user-456',
 *   role: 'host'
 * });
 * 
 * ws.on('streaming', (event) => {
 *   if (isDestinationUpdate(event)) {
 *     console.log(`Destination ${event.payload.id}: ${event.payload.status}`);
 *   }
 * });
 * 
 * await ws.connect();
 * 
 * // Add destination
 * await ws.addDestination({
 *   id: 'dest-1',
 *   platform: 'youtube',
 *   name: 'My YouTube',
 *   rtmp_url: 'rtmp://a.rtmp.youtube.com/live2',
 *   stream_key: 'your-key',
 *   enabled: true
 * });
 * 
 * // Start broadcasting
 * await ws.startBroadcast(['dest-1']);
 * ```
 */
export class StreamingWebSocket {
  private socket: WebSocket | null = null;
  private config: Required<StreamingWebSocketConfig>;
  private reconnectAttempts = 0;
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();
  private pingInterval: number | null = null;

  constructor(config: StreamingWebSocketConfig) {
    this.config = {
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      ...config,
    };
  }

  // Event handlers
  on(event: 'streaming', handler: StreamingEventHandler): void;
  on(event: 'connected' | 'disconnected', handler: ConnectionHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: Function): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private emit(event: string, data?: any): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  // Connection management
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = `${this.config.url}/${this.config.roomId}`;
        this.socket = new WebSocket(url);

        this.socket.onopen = () => {
          console.log('[StreamingWS] Connected');
          this.reconnectAttempts = 0;
          this.startPing();
          
          // Auto-join on connect
          this.send({
            type: 'join',
            payload: {
              room_id: this.config.roomId,
              user_id: this.config.userId,
              role: this.config.role,
            },
          });
          
          this.emit('connected');
          resolve();
        };

        this.socket.onclose = () => {
          console.log('[StreamingWS] Disconnected');
          this.stopPing();
          this.emit('disconnected');
          
          if (this.config.reconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[StreamingWS] Reconnecting (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), this.config.reconnectInterval);
          }
        };

        this.socket.onerror = (event) => {
          console.error('[StreamingWS] Error:', event);
          this.emit('error', new Error('WebSocket error'));
          reject(new Error('WebSocket connection failed'));
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.config.reconnect = false;
    this.stopPing();
    this.socket?.close();
    this.socket = null;
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn('[StreamingWS] Cannot send, socket not open');
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as ServerMessage;
      
      switch (message.type) {
        case 'joined':
          console.log('[StreamingWS] Joined room:', message.payload.room_id);
          break;
          
        case 'streaming':
          this.emit('streaming', message.payload);
          break;
          
        case 'destination:added':
        case 'destination:removed':
        case 'broadcast:started':
        case 'broadcast:stopped':
        case 'status':
        case 'platforms:list':
        case 'platforms:validated':
          // Resolve pending request if any
          const requestId = message.type;
          const pending = this.pendingRequests.get(requestId);
          if (pending) {
            pending.resolve(message.payload);
            this.pendingRequests.delete(requestId);
          }
          break;
          
        case 'error':
          console.error('[StreamingWS] Error:', message.payload);
          // Reject all pending requests
          this.pendingRequests.forEach(({ reject }) => {
            reject(new Error(message.payload.message));
          });
          this.pendingRequests.clear();
          break;
          
        case 'pong':
          // RTT = server_time - timestamp (approximately)
          break;
      }
    } catch (error) {
      console.error('[StreamingWS] Failed to parse message:', error);
    }
  }

  // Ping/keepalive
  private startPing(): void {
    this.pingInterval = window.setInterval(() => {
      this.send({
        type: 'ping',
        payload: { timestamp: Date.now() },
      });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // API Methods
  async addDestination(destination: AddDestinationPayload): Promise<void> {
    this.send({
      type: 'stream:destination:add',
      payload: destination,
    });
  }

  async removeDestination(id: string): Promise<void> {
    this.send({
      type: 'stream:destination:remove',
      payload: { id },
    });
  }

  async toggleDestination(id: string, enabled: boolean): Promise<void> {
    this.send({
      type: 'stream:destination:toggle',
      payload: { id, enabled },
    });
  }

  async startBroadcast(destinationIds: string[]): Promise<void> {
    this.send({
      type: 'stream:start',
      payload: { destination_ids: destinationIds },
    });
  }

  async stopBroadcast(): Promise<void> {
    this.send({
      type: 'stream:stop',
      payload: {},
    });
  }

  async getStatus(): Promise<StatusPayload> {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set('status', { resolve, reject });
      this.send({
        type: 'stream:status',
        payload: {},
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has('status')) {
          this.pendingRequests.delete('status');
          reject(new Error('Status request timed out'));
        }
      }, 5000);
    });
  }

  /**
   * Get all available platforms and their configurations
   */
  async listPlatforms(): Promise<PlatformsListPayload> {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set('platforms:list', { resolve, reject });
      this.send({
        type: 'platforms:list',
        payload: {},
      });
      
      setTimeout(() => {
        if (this.pendingRequests.has('platforms:list')) {
          this.pendingRequests.delete('platforms:list');
          reject(new Error('Platforms list request timed out'));
        }
      }, 5000);
    });
  }

  /**
   * Validate a destination before adding it
   * Returns validation result with warnings for vertical video, bitrate limits, etc.
   */
  async validateDestination(
    platform: Platform,
    rtmpUrl: string,
    streamKey: string
  ): Promise<DestinationValidatedPayload> {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set('platforms:validated', { resolve, reject });
      this.send({
        type: 'platforms:validate',
        payload: {
          platform,
          rtmp_url: rtmpUrl,
          stream_key: streamKey,
        },
      });
      
      setTimeout(() => {
        if (this.pendingRequests.has('platforms:validated')) {
          this.pendingRequests.delete('platforms:validated');
          reject(new Error('Validation request timed out'));
        }
      }, 5000);
    });
  }

  /**
   * Helper: Check if a platform requires vertical video
   */
  static requiresVertical(platform: Platform): boolean {
    return VERTICAL_PLATFORMS.includes(platform);
  }

  /**
   * Helper: Check if a platform requires RTMPS
   */
  static requiresRtmps(platform: Platform): boolean {
    return RTMPS_REQUIRED.includes(platform);
  }

  /**
   * Helper: Get display name for platform
   */
  static getDisplayName(platform: Platform): string {
    return PLATFORM_DISPLAY_NAMES[platform] || platform;
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default StreamingWebSocket;
