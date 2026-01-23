'use client';

/**
 * WebRTC Manager for ALLSTRM
 * Handles peer connections, track publishing, and subscriptions
 */

import { SignalClient, ServerMessageType } from './SignalClient';

export interface IceServer {
    urls: string[];
    username?: string;
    credential?: string;
}

export interface RemoteParticipant {
    id: string;
    displayName: string;
    role: string;
    stream?: MediaStream;
}

type WebRTCEventHandler = (data: any) => void;

export class WebRTCManager {
    private signalClient: SignalClient;
    private peerConnections: Map<string, RTCPeerConnection> = new Map();
    private localStream: MediaStream | null = null;
    private screenStream: MediaStream | null = null;
    private iceServers: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302'] }];
    private participantId: string | null = null;

    // Event handlers
    private eventHandlers: Map<string, Set<WebRTCEventHandler>> = new Map();

    constructor(signalClient: SignalClient) {
        this.signalClient = signalClient;
        this.setupSignalHandlers();
    }

    private setupSignalHandlers() {
        // Handle join accepted - receive ICE servers and existing participants
        this.signalClient.on('join_accepted', (payload) => {
            console.log('[WebRTCManager] Join accepted payload:', payload);
            const pId = payload.participant_id || payload.participantId || payload.id;
            const rId = payload.room_id || payload.roomId;

            this.participantId = pId;
            if (payload.ice_servers || payload.iceServers) {
                this.iceServers = payload.ice_servers || payload.iceServers;
            }
            this.emit('joined', {
                participantId: pId,
                roomId: rId,
                participants: payload.participants
            });

            // Create peer connections for existing participants
            payload.participants?.forEach((p: any) => {
                const existingPId = p.id || p.participant_id || p.participantId;
                if (existingPId) this.createPeerConnection(existingPId);
            });
        });

        // Handle new participant joining
        this.signalClient.on('participant_joined', (payload) => {
            this.createPeerConnection(payload.participant_id);
            this.emit('participantJoined', payload);
        });

        // Handle participant leaving
        this.signalClient.on('participant_left', (payload) => {
            this.closePeerConnection(payload.participant_id);
            this.emit('participantLeft', payload);
        });

        // Handle incoming SDP offer (subscription to their stream)
        this.signalClient.on('sdp_offer', async (payload) => {
            const pc = this.peerConnections.get(payload.participant_id) || this.createPeerConnection(payload.participant_id);
            try {
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: payload.sdp }));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                this.signalClient.sendAnswer(answer.sdp!, payload.participant_id);
            } catch (e) {
                console.error('[WebRTCManager] Failed to handle offer:', e);
            }
        });

        // Handle incoming SDP answer
        this.signalClient.on('sdp_answer', async (payload) => {
            const pc = this.peerConnections.get(payload.participant_id);
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }));
                } catch (e) {
                    console.error('[WebRTCManager] Failed to set answer:', e);
                }
            }
        });

        // Handle incoming ICE candidate
        this.signalClient.on('ice_candidate', async (payload) => {
            const pc = this.peerConnections.get(payload.participant_id);
            if (pc && payload.candidate) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate({
                        candidate: payload.candidate,
                        sdpMid: payload.sdp_mid,
                        sdpMLineIndex: payload.sdp_m_line_index
                    }));
                } catch (e) {
                    console.error('[WebRTCManager] Failed to add ICE candidate:', e);
                }
            }
        });

        // Handle track updates
        this.signalClient.on('track_updated', (payload) => {
            this.emit('trackUpdated', payload);
        });

        // Handle errors
        this.signalClient.on('error', (payload) => {
            this.emit('error', payload);
        });

        // Handle room closed
        this.signalClient.on('room_closed', (payload) => {
            this.cleanup();
            this.emit('roomClosed', payload);
        });
    }

    /**
     * Set the local media stream
     */
    public setLocalStream(stream: MediaStream) {
        this.localStream = stream;

        // Add tracks to all existing peer connections
        this.peerConnections.forEach((pc, participantId) => {
            stream.getTracks().forEach(track => {
                const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
                if (sender) {
                    sender.replaceTrack(track);
                } else {
                    pc.addTrack(track, stream);
                }
            });
        });
    }

    /**
     * Set the screen share stream
     */
    public setScreenStream(stream: MediaStream | null) {
        this.screenStream = stream;
        // TODO: Handle screen share track replacement
    }

    /**
     * Create a peer connection for a participant
     */
    private createPeerConnection(participantId: string): RTCPeerConnection {
        if (this.peerConnections.has(participantId)) {
            return this.peerConnections.get(participantId)!;
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
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.signalClient.sendIceCandidate(event.candidate, participantId);
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log(`[WebRTCManager] Connection state for ${participantId}:`, pc.connectionState);
            if (pc.connectionState === 'failed') {
                this.emit('connectionFailed', { participantId });
                // Attempt to reconnect
                this.recreatePeerConnection(participantId);
            }
        };

        // Handle incoming tracks
        pc.ontrack = (event) => {
            console.log(`[WebRTCManager] Received track from ${participantId}:`, event.track.kind);
            this.emit('remoteStream', {
                participantId,
                stream: event.streams[0],
                track: event.track
            });
        };

        // Add local tracks if available
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream!);
            });
        }

        this.peerConnections.set(participantId, pc);
        return pc;
    }

    /**
     * Recreate a peer connection (for reconnection)
     */
    private async recreatePeerConnection(participantId: string) {
        this.closePeerConnection(participantId);
        const pc = this.createPeerConnection(participantId);

        // Create and send offer
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.signalClient.sendOffer(offer.sdp!, participantId);
        } catch (e) {
            console.error('[WebRTCManager] Failed to recreate connection:', e);
        }
    }

    /**
     * Close a peer connection
     */
    private closePeerConnection(participantId: string) {
        const pc = this.peerConnections.get(participantId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(participantId);
        }
    }

    /**
     * Publish local tracks to the SFU
     */
    public async publishTracks() {
        if (!this.localStream) {
            console.warn('[WebRTCManager] No local stream to publish');
            return;
        }

        // In SFU mode, we create a single "publisher" peer connection
        // The SFU will handle distribution to other participants
        const pc = this.createPeerConnection('publisher');

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.signalClient.sendOffer(offer.sdp!);
        } catch (e) {
            console.error('[WebRTCManager] Failed to publish tracks:', e);
        }
    }

    /**
     * Replace a track in all peer connections
     */
    public async replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack) {
        const promises: Promise<void>[] = [];

        this.peerConnections.forEach((pc) => {
            const sender = pc.getSenders().find(s => s.track === oldTrack);
            if (sender) {
                promises.push(sender.replaceTrack(newTrack));
            }
        });

        await Promise.all(promises);
    }

    /**
     * Get all remote streams
     */
    public getRemoteStreams(): Map<string, MediaStream> {
        const streams = new Map<string, MediaStream>();
        // Remote streams are emitted via 'remoteStream' event
        return streams;
    }

    /**
     * Clean up all connections
     */
    public cleanup() {
        this.peerConnections.forEach((pc) => pc.close());
        this.peerConnections.clear();
        this.localStream = null;
        this.screenStream = null;
    }

    // Event emitter methods
    public on(event: string, handler: WebRTCEventHandler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event)?.add(handler);
    }

    public off(event: string, handler: WebRTCEventHandler) {
        this.eventHandlers.get(event)?.delete(handler);
    }

    private emit(event: string, data: any) {
        this.eventHandlers.get(event)?.forEach(handler => {
            try {
                handler(data);
            } catch (e) {
                console.error(`[WebRTCManager] Handler error for ${event}:`, e);
            }
        });
    }
}
