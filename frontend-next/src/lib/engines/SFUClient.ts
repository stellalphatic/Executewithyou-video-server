'use client';

/**
 * SFU REST Client for ALLSTRM
 * Handles WebRTC signaling via REST API calls to the SFU backend
 */

const SFU_BASE = process.env.NEXT_PUBLIC_SFU_URL || 'http://localhost:8080/api/v1/sfu';

export interface IceServer {
    urls: string[];
    username?: string;
    credential?: string;
}

export interface TrackInfo {
    track_id: string;
    participant_id: string;
    kind: string;
    codec: string;
}

export interface ParticipantInfo {
    id: string;
    display_name: string;
    role: string;
}

export interface JoinResponse {
    success: boolean;
    participant_id: string;
    is_in_waiting_room: boolean;
    ice_servers: IceServer[];
    existing_participants: ParticipantInfo[];
    available_tracks: TrackInfo[];
}

export interface AnswerResponse {
    success: boolean;
    sdp?: string;
    error?: string;
}

export interface GenericResponse {
    success: boolean;
    error?: string;
}

type SFUEventHandler = (data: any) => void;

export class SFUClient {
    private baseUrl: string;
    private token: string | null = null;
    public roomId: string | null = null;  // Made public for external access
    private participantId: string | null = null;
    private listeners: Map<string, Set<SFUEventHandler>> = new Map();
    private pollInterval: number | null = null;

    constructor(url: string = SFU_BASE) {
        this.baseUrl = url;
    }

    /**
     * Set room ID manually (useful when creating client for specific operations)
     */
    public setRoomId(roomId: string): void {
        this.roomId = roomId;
    }

    /**
     * Join a room via REST API
     */
    public async join(
        roomId: string,
        participantId: string,
        displayName: string,
        role: string = 'guest',
        mode: string = 'meeting'
    ): Promise<JoinResponse> {
        this.roomId = roomId;
        this.participantId = participantId;

        const response = await fetch(`${this.baseUrl}/rooms/${roomId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
            },
            body: JSON.stringify({
                participant_id: participantId,
                display_name: displayName,
                role,
                mode
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `Failed to join room: ${response.status}`);
        }

        const data: JoinResponse = await response.json();
        console.log('[SFUClient] Join response:', data);
        this.emit('joined', {
            participantId: data.participant_id,
            roomId,
            isInWaitingRoom: data.is_in_waiting_room,
            iceServers: data.ice_servers,
            participants: data.existing_participants,
            availableTracks: data.available_tracks
        });

        return data;
    }

    /**
     * Send SDP offer and receive answer
     */
    public async sendOffer(sdp: string, trackTypes: string[] = []): Promise<AnswerResponse> {
        if (!this.roomId || !this.participantId) {
            throw new Error('Not connected to a room');
        }

        const response = await fetch(`${this.baseUrl}/rooms/${this.roomId}/offer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
            },
            body: JSON.stringify({
                participant_id: this.participantId,
                sdp,
                track_types: trackTypes
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `Failed to send offer: ${response.status}`);
        }

        const data: AnswerResponse = await response.json();
        if (data.success && data.sdp) {
            this.emit('answer', { sdp: data.sdp });
        }
        return data;
    }

    /**
     * Send SDP answer (for subscriptions)
     */
    public async sendAnswer(sdp: string): Promise<GenericResponse> {
        if (!this.roomId || !this.participantId) {
            throw new Error('Not connected to a room');
        }

        const response = await fetch(`${this.baseUrl}/rooms/${this.roomId}/answer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
            },
            body: JSON.stringify({
                participant_id: this.participantId,
                sdp
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `Failed to send answer: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Send ICE candidate
     */
    public async sendIceCandidate(candidate: RTCIceCandidate): Promise<GenericResponse> {
        if (!this.roomId || !this.participantId) {
            throw new Error('Not connected to a room');
        }

        const response = await fetch(`${this.baseUrl}/rooms/${this.roomId}/ice`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
            },
            body: JSON.stringify({
                participant_id: this.participantId,
                candidate: candidate.candidate,
                sdp_mid: candidate.sdpMid,
                sdp_m_line_index: candidate.sdpMLineIndex
            })
        });

        // ICE candidate failures are often not critical
        if (!response.ok) {
            console.warn('[SFUClient] ICE candidate send failed, continuing...');
        }

        return response.json();
    }

    /**
     * Subscribe to a track from another participant
     */
    public async subscribe(
        targetParticipantId: string,
        trackKind: 'audio' | 'video' | 'screen',
        trackId: string
    ): Promise<GenericResponse> {
        if (!this.roomId || !this.participantId) {
            throw new Error('Not connected to a room');
        }

        const response = await fetch(`${this.baseUrl}/rooms/${this.roomId}/subscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
            },
            body: JSON.stringify({
                participant_id: this.participantId,
                target_participant_id: targetParticipantId,
                track_kind: trackKind,
                track_id: trackId
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `Failed to subscribe: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Unsubscribe from a track
     */
    public async unsubscribe(
        targetParticipantId: string,
        trackKind: 'audio' | 'video' | 'screen',
        trackId: string
    ): Promise<GenericResponse> {
        if (!this.roomId || !this.participantId) {
            throw new Error('Not connected to a room');
        }

        const response = await fetch(`${this.baseUrl}/rooms/${this.roomId}/unsubscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
            },
            body: JSON.stringify({
                participant_id: this.participantId,
                target_participant_id: targetParticipantId,
                track_kind: trackKind,
                track_id: trackId
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `Failed to unsubscribe: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Get current participants in room
     */
    public async getParticipants(): Promise<{ participants: any[] }> {
        if (!this.roomId) {
            throw new Error('Not connected to a room');
        }

        const response = await fetch(`${this.baseUrl}/rooms/${this.roomId}/participants`, {
            headers: {
                ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get participants: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Get participants in the waiting room
     */
    public async getWaitingParticipants(): Promise<{ participants: any[] }> {
        if (!this.roomId) {
            throw new Error('Not connected to a room');
        }

        const response = await fetch(`${this.baseUrl}/rooms/${this.roomId}/waiting`, {
            headers: {
                ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get waiting participants: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Leave the room
     */
    public async leave(): Promise<GenericResponse> {
        if (!this.roomId || !this.participantId) {
            return { success: true };
        }

        this.stopPolling();
        console.log('[SFUClient] Leaving room:', this.roomId, 'participant:', this.participantId);

        try {
            const response = await fetch(`${this.baseUrl}/rooms/${this.roomId}/leave`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
                },
                body: JSON.stringify({
                    participant_id: this.participantId  // snake_case for Rust backend
                })
            });

            console.log('[SFUClient] Leave response:', response.status);
            return response.json();
        } finally {
            this.roomId = null;
            this.participantId = null;
            this.listeners.clear();
        }
    }

    /**
     * Admit a participant from the waiting room
     */
    public async admitParticipant(targetParticipantId: string): Promise<GenericResponse> {
        if (!this.roomId) {
            throw new Error('Not connected to a room');
        }

        console.log('[SFUClient] Admitting participant:', targetParticipantId, 'from room:', this.roomId);

        const response = await fetch(`${this.baseUrl}/rooms/${this.roomId}/admit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
            },
            body: JSON.stringify({
                participant_id: targetParticipantId  // snake_case for Rust backend
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[SFUClient] Admit failed:', error);
            throw new Error(error.error || `Failed to admit participant: ${response.status}`);
        }

        console.log('[SFUClient] Admit successful');
        return response.json();
    }

    /**
     * Start polling for participant updates (since we're using REST)
     */
    public startPolling(intervalMs: number = 3000) {
        if (this.pollInterval) return;

        this.pollInterval = window.setInterval(async () => {
            try {
                const result: any = await this.getParticipants();
                console.log('[SFUClient] getParticipants raw result:', JSON.stringify(result));

                // Unwrap if backend returns { participant: {...}, tracks: [...] }
                const participants = Array.isArray(result.participants)
                    ? result.participants.map((p: any) => p.participant || p)
                    : [];

                console.log('[SFUClient] Emitting unwrapped participants:', participants);
                this.emit('participantsUpdate', participants);

                // Poll waiting room
                if (this.roomId) {
                    try {
                        const waitingResult: any = await this.getWaitingParticipants();
                        console.log('[SFUClient] getWaitingParticipants raw result:', JSON.stringify(waitingResult));

                        const waitingParticipants = Array.isArray(waitingResult.participants)
                            ? waitingResult.participants.map((p: any) => p.participant || p)
                            : [];

                        this.emit('waitingRoomUpdate', waitingParticipants);
                    } catch (e) {
                        // console.warn('[SFUClient] Waiting room poll failed:', e);
                    }
                }
            } catch (e) {
                console.warn('[SFUClient] Polling failed:', e);
            }
        }, intervalMs);
    }

    /**
     * Stop polling
     */
    public stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Set auth token
     */
    public setToken(token: string) {
        this.token = token;
    }

    /**
     * Get participant ID
     */
    public getParticipantId(): string | null {
        return this.participantId;
    }

    /**
     * Get room ID
     */
    public getRoomId(): string | null {
        return this.roomId;
    }

    // Event emitter methods
    public on(event: string, handler: SFUEventHandler) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)?.add(handler);
    }

    public off(event: string, handler: SFUEventHandler) {
        this.listeners.get(event)?.delete(handler);
    }

    private emit(event: string, data: any) {
        this.listeners.get(event)?.forEach(handler => {
            try {
                handler(data);
            } catch (e) {
                console.error(`[SFUClient] Handler error for ${event}:`, e);
            }
        });
    }
}

// Singleton instance
export const sfuClient = new SFUClient();
