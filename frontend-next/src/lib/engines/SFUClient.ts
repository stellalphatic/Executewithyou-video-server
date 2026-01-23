'use client';

/**
 * SFU REST Client for ALLSTRM
 * Handles WebRTC signaling via REST API calls to the SFU backend
 */

const SFU_BASE = (import.meta as any).env?.VITE_SFU_URL || 'http://localhost:8080/api/v1/sfu';

export interface IceServer {
    urls: string[];
    username?: string;
    credential?: string;
}

export interface TrackInfo {
    trackId: string;
    participantId: string;
    kind: string;
    codec: string;
}

export interface ParticipantInfo {
    id: string;
    displayName: string;
    role: string;
}

export interface JoinResponse {
    success: boolean;
    participantId: string;
    isInWaitingRoom: boolean;
    iceServers: IceServer[];
    existingParticipants: ParticipantInfo[];
    availableTracks: TrackInfo[];
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
    private roomId: string | null = null;
    private participantId: string | null = null;
    private listeners: Map<string, Set<SFUEventHandler>> = new Map();
    private pollInterval: number | null = null;

    constructor(url: string = SFU_BASE) {
        this.baseUrl = url;
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
                participantId,
                displayName,
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
            participantId: data.participantId,
            roomId,
            isInWaitingRoom: data.isInWaitingRoom,
            iceServers: data.iceServers,
            participants: data.existingParticipants,
            availableTracks: data.availableTracks
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
                participantId: this.participantId,
                sdp,
                trackTypes
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
                participantId: this.participantId,
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
                participantId: this.participantId,
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: candidate.sdpMLineIndex
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
                participantId: this.participantId,
                targetParticipantId,
                trackKind,
                trackId
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
                participantId: this.participantId,
                targetParticipantId,
                trackKind,
                trackId
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
     * Leave the room
     */
    public async leave(): Promise<GenericResponse> {
        if (!this.roomId || !this.participantId) {
            return { success: true };
        }

        this.stopPolling();

        try {
            const response = await fetch(`${this.baseUrl}/rooms/${this.roomId}/leave`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
                },
                body: JSON.stringify({
                    participantId: this.participantId
                })
            });

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

        const response = await fetch(`${this.baseUrl}/rooms/${this.roomId}/admit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
            },
            body: JSON.stringify({
                participantId: targetParticipantId
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `Failed to admit participant: ${response.status}`);
        }

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
