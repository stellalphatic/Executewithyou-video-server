'use client';

/**
 * WebSocket Signal Client for ALLSTRM SFU
 * Handles WebRTC signaling: SDP offers/answers, ICE candidates
 */

// Message types matching backend
export type ServerMessageType =
    | 'join_accepted'
    | 'participant_joined'
    | 'participant_left'
    | 'sdp_offer'
    | 'sdp_answer'
    | 'ice_candidate'
    | 'track_updated'
    | 'chat'
    | 'reaction'
    | 'error'
    | 'room_closed';

export type ClientMessageType =
    | 'JOIN_REQUEST'
    | 'LEAVE_REQUEST'
    | 'OFFER'
    | 'ANSWER'
    | 'ICE_CANDIDATE'
    | 'PARTICIPANT_UPDATE'
    | 'MEDIA_STATE_UPDATE'
    | 'LAYOUT_UPDATE'
    | 'BROADCAST_CONTROL'
    | 'STAGE_CONTROL'
    | 'CHAT_MESSAGE'
    | 'RECORDING_CONTROL'
    | 'PARTICIPANT_UPDATE' // Allow both
    | 'sdp_offer'
    | 'sdp_answer'
    | 'ice_candidate'
    | 'track_update'
    | 'chat'
    | 'reaction'
    | 'leave';

type SignalEventHandler = (payload: any) => void;

const WS_BASE = (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8080';

export class SignalClient {
    private ws: WebSocket | null = null;
    private url: string;
    private roomId: string | null = null;
    private token: string | null = null;
    private listeners: Map<ServerMessageType, Set<SignalEventHandler>> = new Map();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private heartbeatInterval: number | null = null;
    private pendingMessages: Array<{ type: ClientMessageType; payload: any }> = [];

    public isConnected = false;
    public isMock = false;

    constructor(url: string = WS_BASE) {
        this.url = url;
    }

    /**
     * Connect to the WebSocket server
     * @param token JWT token for authentication
     * @param roomId Room to join after connection
     */
    public connect(token: string, roomId?: string): Promise<void> {
        this.token = token;
        this.roomId = roomId || null;

        return new Promise((resolve, reject) => {
            try {
                // Build WebSocket URL with auth
                const params = new URLSearchParams({ token });
                if (roomId) params.append('room_id', roomId);
                const wsUrl = `${this.url}/ws?${params}`;

                console.log('[SignalClient] Connecting to', wsUrl);
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    this.isConnected = true;
                    this.isMock = false;
                    this.reconnectAttempts = 0;
                    this.startHeartbeat();
                    console.log('[SignalClient] Connected');

                    // Send any pending messages
                    this.pendingMessages.forEach(msg => this.send(msg.type, msg.payload));
                    this.pendingMessages = [];

                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        // Handle ping/pong
                        if (event.data === 'pong') return;

                        const message = JSON.parse(event.data);
                        const type = message.type.toLowerCase() as ServerMessageType;
                        console.log('[SignalClient] Received:', type);
                        this.emit(type, message.payload);
                    } catch (e) {
                        console.error('[SignalClient] Failed to parse message', e);
                    }
                };

                this.ws.onclose = (event) => {
                    this.stopHeartbeat();
                    const wasConnected = this.isConnected;
                    this.isConnected = false;

                    if (wasConnected) {
                        console.warn('[SignalClient] Disconnected, code:', event.code);
                        this.emit('error', { code: 'disconnected', message: 'Connection lost' });
                        this.handleReconnect();
                    } else {
                        // Initial connection failed
                        console.warn('[SignalClient] Connection failed.');
                        reject(new Error('Connection failed'));
                    }
                };

                this.ws.onerror = (err) => {
                    console.error('[SignalClient] WebSocket error', err);
                };

            } catch (e) {
                console.warn('[SignalClient] Init failed.', e);
                reject(e);
            }
        });
    }

    private stopConnecting() {
        this.isConnected = false;
        this.isMock = false;
    }

    /**
     * Send a message to the server
     */
    public send(type: ClientMessageType, payload: any) {

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = {
                type,
                payload,
                timestamp: Date.now(),
                id: crypto.randomUUID()
            };
            this.ws.send(JSON.stringify(message));
        } else if (!this.isConnected) {
            // Queue message to send after reconnect
            this.pendingMessages.push({ type, payload });
        } else {
            console.warn('[SignalClient] Cannot send, socket not open:', type);
        }
    }


    /**
     * Subscribe to a message type
     */
    public on(type: ServerMessageType, handler: SignalEventHandler) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type)?.add(handler);
    }

    /**
     * Unsubscribe from a message type
     */
    public off(type: ServerMessageType, handler: SignalEventHandler) {
        this.listeners.get(type)?.delete(handler);
    }

    private emit(type: ServerMessageType, payload: any) {
        this.listeners.get(type)?.forEach(handler => {
            try {
                handler(payload);
            } catch (e) {
                console.error('[SignalClient] Handler error for', type, e);
            }
        });
    }

    private startHeartbeat() {
        this.heartbeatInterval = window.setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send('ping');
            }
        }, 30000);
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[SignalClient] Max reconnect attempts reached');
            this.emit('error', { code: 'max_reconnects', message: 'Failed to reconnect' });
            return;
        }

        const timeout = Math.pow(2, this.reconnectAttempts) * 1000;
        this.reconnectAttempts++;
        console.log(`[SignalClient] Reconnecting in ${timeout}ms... (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            if (this.token) {
                this.connect(this.token, this.roomId || undefined);
            }
        }, timeout);
    }

    /**
  * Get media capabilities (device availability)
  */
    private async getMediaCapabilities(): Promise<{
        video: boolean;
        audio: boolean;
        screenShare: boolean;
    }> {
        try {
            // Check if getUserMedia is available
            if (!navigator.mediaDevices?.getUserMedia) {
                return { video: false, audio: false, screenShare: false };
            }

            // Check device enumeration (doesn't require permissions)
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasVideo = devices.some(d => d.kind === 'videoinput');
            const hasAudio = devices.some(d => d.kind === 'audioinput');
            const hasScreenShare = 'getDisplayMedia' in navigator.mediaDevices;

            return {
                video: hasVideo,
                audio: hasAudio,
                screenShare: hasScreenShare,
            };
        } catch (e) {
            console.warn('[SignalClient] Failed to detect media capabilities', e);
            // Assume capabilities exist if detection fails
            return { video: true, audio: true, screenShare: true };
        }
    }

    /**
     * Join a room (send join message)
     */
    public async join(roomId: string, displayName: string, role: string = 'guest') {
        this.roomId = roomId;

        // Detect device capabilities
        const mediaCapabilities = await this.getMediaCapabilities();

        console.log('[SignalClient] Joining with capabilities:', mediaCapabilities);

        this.send('JOIN_REQUEST', {
            room_id: roomId,
            displayName,
            role,
            mode: "meeting",
            mediaCapabilities
        });
    }

    /**
     * Send SDP offer to publish tracks
     */
    public sendOffer(sdp: string, participantId?: string) {
        this.send('sdp_offer', { sdp, participant_id: participantId });
    }

    /**
     * Send SDP answer for subscription
     */
    public sendAnswer(sdp: string, participantId: string) {
        this.send('sdp_answer', { sdp, participant_id: participantId });
    }

    /**
     * Send ICE candidate
     */
    public sendIceCandidate(candidate: RTCIceCandidate, participantId?: string) {
        this.send('ice_candidate', {
            participant_id: participantId,
            candidate: candidate.candidate,
            sdp_mid: candidate.sdpMid,
            sdp_m_line_index: candidate.sdpMLineIndex
        });
    }

    /**
     * Leave the room
     */
    public leave() {
        this.send('leave', {});
    }

    /**
     * Disconnect from WebSocket
     */
    public disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.isMock = false;
        this.roomId = null;
        this.token = null;
        this.listeners.clear();
    }
}

// Singleton instance for easy access
export const signalClient = new SignalClient();
