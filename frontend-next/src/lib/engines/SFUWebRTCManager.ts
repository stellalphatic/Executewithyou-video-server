'use client';

/**
 * SFU WebRTC Manager for ALLSTRM
 * Handles WebRTC peer connections using REST API signaling with the SFU
 */

import { SFUClient, IceServer, TrackInfo } from './SFUClient';

export interface RemoteParticipant {
    id: string;
    displayName: string;
    role: string;
    stream?: MediaStream;
}

type WebRTCEventHandler = (data: any) => void;

export class SFUWebRTCManager {
    private sfuClient: SFUClient;
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private screenStream: MediaStream | null = null;
    private iceServers: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302'] }];
    private participantId: string | null = null;
    private roomId: string | null = null;
    private pendingIceCandidates: RTCIceCandidate[] = [];
    private isNegotiating = false;

    // Event handlers
    private eventHandlers: Map<string, Set<WebRTCEventHandler>> = new Map();

    constructor(sfuClient: SFUClient) {
        this.sfuClient = sfuClient;
        this.setupSFUHandlers();
    }

    private setupSFUHandlers() {
        // Handle join success
        this.sfuClient.on('joined', (payload) => {
            this.participantId = payload.participantId;
            this.roomId = payload.roomId;

            if (payload.iceServers?.length) {
                this.iceServers = payload.iceServers;
            }

            this.emit('joined', {
                participantId: payload.participantId,
                roomId: payload.roomId,
                participants: payload.participants,
                availableTracks: payload.availableTracks,
                isInWaitingRoom: payload.isInWaitingRoom
            });
        });

        // Handle SDP answer from SFU
        this.sfuClient.on('answer', async (payload) => {
            if (this.peerConnection && payload.sdp) {
                try {
                    await this.peerConnection.setRemoteDescription(
                        new RTCSessionDescription({ type: 'answer', sdp: payload.sdp })
                    );

                    // Add any pending ICE candidates
                    for (const candidate of this.pendingIceCandidates) {
                        await this.peerConnection.addIceCandidate(candidate);
                    }
                    this.pendingIceCandidates = [];
                } catch (e) {
                    console.error('[SFUWebRTCManager] Failed to set remote description:', e);
                    this.emit('error', { code: 'sdp_error', message: 'Failed to set remote description' });
                }
            }
        });

        // Handle participant updates from polling
        this.sfuClient.on('participantsUpdate', (participants) => {
            this.emit('participantsUpdate', participants);
        });

        this.sfuClient.on('waitingRoomUpdate', (participants) => {
            this.emit('waitingRoomUpdate', participants);
        });
    }

    /**
     * Join a room and establish WebRTC connection to SFU
     */
    public async join(
        roomId: string,
        displayName: string,
        role: string = 'guest',
        mode: string = 'meeting'
    ): Promise<void> {
        // Generate a unique participant ID only once per manager instance
        if (!this.participantId) {
            this.participantId = `participant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        }
        console.log('[SFUWebRTCManager] Using participant ID:', this.participantId);

        // Join via SFU REST API
        const response = await this.sfuClient.join(
            roomId,
            this.participantId,
            displayName,
            role,
            mode
        );

        if (!response.success) {
            console.error('[SFUWebRTCManager] Join failed:', response);
            throw new Error('Failed to join room');
        }
        console.log('[SFUWebRTCManager] Join successful:', response);

        // Store ICE servers from response
        if (response.iceServers?.length) {
            this.iceServers = response.iceServers;
        }

        // Create peer connection to SFU
        await this.createPeerConnection();

        // If we have local media, create and send offer
        if (this.localStream) {
            await this.publishTracks();
        }

        // Start polling for participant updates
        this.sfuClient.startPolling();
    }

    /**
     * Create the peer connection to SFU
     */
    private async createPeerConnection(): Promise<RTCPeerConnection> {
        if (this.peerConnection) {
            this.peerConnection.close();
        }

        const config: RTCConfiguration = {
            iceServers: this.iceServers.map(s => ({
                urls: s.urls,
                username: s.username,
                credential: s.credential
            }))
        };

        const pc = new RTCPeerConnection(config);

        // Handle ICE candidates
        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                try {
                    await this.sfuClient.sendIceCandidate(event.candidate);
                } catch (e) {
                    console.warn('[SFUWebRTCManager] Failed to send ICE candidate:', e);
                }
            }
        };

        // Handle ICE connection state
        pc.oniceconnectionstatechange = () => {
            console.log('[SFUWebRTCManager] ICE state:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'failed') {
                this.emit('connectionFailed', { reason: 'ICE connection failed' });
                // Attempt ICE restart
                this.restartIce();
            } else if (pc.iceConnectionState === 'connected') {
                this.emit('connected', {});
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log('[SFUWebRTCManager] Connection state:', pc.connectionState);
            if (pc.connectionState === 'failed') {
                this.emit('connectionFailed', { reason: 'Connection failed' });
            }
        };

        // Handle incoming tracks from SFU
        pc.ontrack = (event) => {
            console.log('[SFUWebRTCManager] Received track:', event.track.kind, 'stream:', event.streams[0]?.id);

            // Extract participant ID from stream ID (format: participantId-trackKind)
            const streamId = event.streams[0]?.id || '';
            const participantId = streamId.split('-')[0] || 'unknown';

            this.emit('remoteStream', {
                participantId,
                stream: event.streams[0],
                track: event.track
            });
        };

        // Handle negotiation needed
        pc.onnegotiationneeded = async () => {
            if (this.isNegotiating) {
                console.log('[SFUWebRTCManager] Already negotiating, skipping');
                return;
            }

            try {
                this.isNegotiating = true;
                await this.negotiate();
            } finally {
                this.isNegotiating = false;
            }
        };

        this.peerConnection = pc;
        return pc;
    }

    /**
     * Perform SDP negotiation with SFU
     */
    private async negotiate(): Promise<void> {
        if (!this.peerConnection) return;

        const pc = this.peerConnection;

        try {
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            await pc.setLocalDescription(offer);

            // Send offer to SFU and receive answer
            const trackTypes = this.localStream
                ? this.localStream.getTracks().map(t => t.kind)
                : [];

            const response = await this.sfuClient.sendOffer(offer.sdp!, trackTypes);

            if (response.success && response.sdp) {
                await pc.setRemoteDescription(
                    new RTCSessionDescription({ type: 'answer', sdp: response.sdp })
                );
            }
        } catch (e) {
            console.error('[SFUWebRTCManager] Negotiation failed:', e);
            throw e;
        }
    }

    /**
     * Set the local media stream
     */
    public setLocalStream(stream: MediaStream) {
        this.localStream = stream;

        if (this.peerConnection) {
            // Add tracks to peer connection
            stream.getTracks().forEach(track => {
                const sender = this.peerConnection!.getSenders().find(s => s.track?.kind === track.kind);
                if (sender) {
                    sender.replaceTrack(track);
                } else {
                    this.peerConnection!.addTrack(track, stream);
                }
            });
        }
    }

    /**
     * Set the screen share stream
     */
    public setScreenStream(stream: MediaStream | null) {
        const oldStream = this.screenStream;
        this.screenStream = stream;

        if (this.peerConnection) {
            if (oldStream) {
                // Remove old screen tracks
                const senders = this.peerConnection.getSenders();
                oldStream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track === track);
                    if (sender) {
                        this.peerConnection!.removeTrack(sender);
                    }
                });
            }

            if (stream) {
                // Add new screen tracks
                stream.getTracks().forEach(track => {
                    this.peerConnection!.addTrack(track, stream);
                });
            }
        }
    }

    /**
     * Publish local tracks to the SFU
     */
    public async publishTracks(): Promise<void> {
        if (!this.localStream) {
            console.warn('[SFUWebRTCManager] No local stream to publish');
            return;
        }

        if (!this.peerConnection) {
            await this.createPeerConnection();
        }

        // Add tracks if not already added
        const senders = this.peerConnection!.getSenders();
        this.localStream.getTracks().forEach(track => {
            const existingSender = senders.find(s => s.track?.kind === track.kind);
            if (!existingSender) {
                this.peerConnection!.addTrack(track, this.localStream!);
            }
        });

        // Trigger negotiation
        await this.negotiate();
    }

    /**
     * Subscribe to a participant's tracks
     */
    public async subscribeToParticipant(
        participantId: string,
        trackKind: 'audio' | 'video' | 'screen',
        trackId: string
    ): Promise<void> {
        await this.sfuClient.subscribe(participantId, trackKind, trackId);
        // The track will arrive via pc.ontrack event
    }

    /**
     * Unsubscribe from a participant's track
     */
    public async unsubscribeFromParticipant(
        participantId: string,
        trackKind: 'audio' | 'video' | 'screen',
        trackId: string
    ): Promise<void> {
        await this.sfuClient.unsubscribe(participantId, trackKind, trackId);
    }

    /**
     * Replace a track in the peer connection
     */
    public async replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack): Promise<void> {
        if (!this.peerConnection) return;

        const sender = this.peerConnection.getSenders().find(s => s.track === oldTrack);
        if (sender) {
            await sender.replaceTrack(newTrack);
        }
    }

    /**
     * Attempt ICE restart
     */
    private async restartIce(): Promise<void> {
        if (!this.peerConnection) return;

        try {
            const offer = await this.peerConnection.createOffer({ iceRestart: true });
            await this.peerConnection.setLocalDescription(offer);

            const response = await this.sfuClient.sendOffer(offer.sdp!);
            if (response.success && response.sdp) {
                await this.peerConnection.setRemoteDescription(
                    new RTCSessionDescription({ type: 'answer', sdp: response.sdp })
                );
            }
        } catch (e) {
            console.error('[SFUWebRTCManager] ICE restart failed:', e);
        }
    }

    /**
     * Leave the room and cleanup
     */
    public async leave(): Promise<void> {
        this.sfuClient.stopPolling();

        try {
            await this.sfuClient.leave();
        } catch (e) {
            console.warn('[SFUWebRTCManager] Leave failed:', e);
        }

        this.cleanup();
    }

    /**
     * Clean up all connections
     */
    public cleanup(): void {
        this.sfuClient.stopPolling();

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.localStream = null;
        this.screenStream = null;
        this.participantId = null;
        this.roomId = null;
        this.pendingIceCandidates = [];
        this.isNegotiating = false;
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
    public on(event: string, handler: WebRTCEventHandler): void {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event)?.add(handler);
    }

    public off(event: string, handler: WebRTCEventHandler): void {
        this.eventHandlers.get(event)?.delete(handler);
    }

    private emit(event: string, data: any): void {
        this.eventHandlers.get(event)?.forEach(handler => {
            try {
                handler(data);
            } catch (e) {
                console.error(`[SFUWebRTCManager] Handler error for ${event}:`, e);
            }
        });
    }
}
