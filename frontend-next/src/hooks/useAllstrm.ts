import { useCallback, useEffect, useRef, useState, useMemo } from 'react';

// Polyfill for Promise.withResolvers (required for pdfjs-dist in some environments)
if (typeof Promise.withResolvers === 'undefined') {
    (Promise as any).withResolvers = function <T>() {
        let resolve!: (value: T | PromiseLike<T>) => void;
        let reject!: (reason?: any) => void;
        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
}
import {
    UseAllstrmOptions,
    UseAllstrmReturn,
    Participant,
    LayoutState,
    ChatMessage,
    Destination,
    BroadcastStatus,
    ClientMessageType
} from '@/types';
import { supabase } from '@/lib/constants';
import { BroadcastEngine } from '@/lib/engines/BroadcastEngine';
import { Scene, SceneItem } from '../types/layout';
import * as pdfjsLib from 'pdfjs-dist';
import { SignalClient } from '@/lib/engines/SignalClient';
import { WebRTCManager } from '@/lib/engines/WebRTCManager';
import { SFUClient } from '@/lib/engines/SFUClient';
import { SFUWebRTCManager } from '@/lib/engines/SFUWebRTCManager';

// Handle ESM/CJS interop for PDF.js
const pdf = (pdfjsLib as any).default || pdfjsLib;

// Configure PDF.js Worker
if (pdf.GlobalWorkerOptions) {
    pdf.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

export function useAllstrm(options: UseAllstrmOptions): UseAllstrmReturn & {
    remoteStreams: Record<string, MediaStream>,
    unmuteAllParticipants: () => void,
    muteAllParticipants: () => void,
    stopAllVideo: () => void,
    allowAllVideo: () => void,
    requestAllVideo: () => void,
    unmuteParticipant: (id: string) => void,
    startParticipantVideo: (id: string) => void,
    startFilePresentation: (file: File) => void,
    pauseRecording: (type?: 'mixed' | 'iso') => void,
    resumeRecording: (type?: 'mixed' | 'iso') => void,
    nextSlide: () => void,
    prevSlide: () => void,
    presentationState: { currentSlide: number, totalSlides: number, isPresentingFile: boolean },
    globalMuteState: boolean,
    globalVideoState: boolean,
    activeRecordings: ('mixed' | 'iso')[],
    pausedRecordings: ('mixed' | 'iso')[],
    setMixerLayout: (layout: 'grid' | 'speaker', focusId?: string) => void,
    updateRecordingScene: (scene: Scene) => void,
    isLocalInWaitingRoom: boolean
} {
    // Refs
    const wsRef = useRef<WebSocket | null>(null);
    const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const localStreamRef = useRef<MediaStream | null>(null);

    // NEW: Processed Stream Reference (Shared from UI)
    const processedStreamRef = useRef<MediaStream | null>(null);

    const screenStreamRef = useRef<MediaStream | null>(null);
    const presentationIntervalRef = useRef<number | null>(null);
    const isConnectedRef = useRef(false);
    const isConnectingRef = useRef(false);
    const initAttemptedRef = useRef(false);
    const initialConfigRef = useRef(options.initialConfig);

    // SignalClient and WebRTCManager refs for real backend connection
    const signalClientRef = useRef<SignalClient | null>(null);
    const webrtcManagerRef = useRef<WebRTCManager | null>(null);

    // SFU REST clients for SFU connection (preferred for WebRTC)
    const sfuClientRef = useRef<SFUClient | null>(null);
    const sfuWebrtcManagerRef = useRef<SFUWebRTCManager | null>(null);

    // Presentation State
    const pdfDocRef = useRef<any>(null); // PDFDocumentProxy
    const presentationRef = useRef({ currentSlide: 1, totalSlides: 1, fileName: '', isPdf: false });
    const [presentationState, setPresentationState] = useState({ currentSlide: 1, totalSlides: 1, isPresentingFile: false });
    const presentationCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Recording Refs (Map for multiple active recorders)
    const mediaRecordersRef = useRef<Map<string, MediaRecorder>>(new Map());
    const recordedChunksRef = useRef<Map<string, Blob[]>>(new Map());

    // Mixer Engine Ref (WebGL)
    const mixerEngineRef = useRef<BroadcastEngine | null>(null);
    const mixerAudioCtxRef = useRef<AudioContext | null>(null);
    const mixerAudioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

    // Mixer Layout State (Internal for Recording WYSIWYG)
    const mixerLayoutRef = useRef<{ mode: 'grid' | 'speaker', focusId?: string }>({ mode: 'grid' });

    // Authoritative Scene Ref (Provided by UI)
    const currentSceneRef = useRef<Scene | null>(null);

    // State
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [participants, _setParticipants] = useState<Participant[]>([]);
    const prevParticipantsJsonRef = useRef<string>("");
    const setParticipants = useCallback((p: Participant[] | ((prev: Participant[]) => Participant[])) => {
        if (typeof p === 'function') {
            _setParticipants(prev => {
                const next = p(prev);
                const nextJson = JSON.stringify(next);
                console.log('[useAllstrm] setParticipants (fn) - next count:', next.length);
                if (nextJson === prevParticipantsJsonRef.current) return prev;
                prevParticipantsJsonRef.current = nextJson;
                console.log(`%c[useAllstrm] participants state CHANGED (content update) - total: ${next.length}`, 'color: #00ff00; font-weight: bold');
                return next;
            });
        } else {
            const nextJson = JSON.stringify(p);
            console.log('[useAllstrm] setParticipants (val) - count:', p.length);
            if (nextJson === prevParticipantsJsonRef.current) return;
            prevParticipantsJsonRef.current = nextJson;
            console.log(`%c[useAllstrm] participants state CHANGED (content update) - total: ${p.length}`, 'color: #00ff00; font-weight: bold');
            _setParticipants(p);
        }
    }, []);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
    const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
    const [mySourceId, setMySourceId] = useState<string | null>(null);
    const [layoutState, setLayoutState] = useState<LayoutState | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [broadcastStatus, setBroadcastStatus] = useState<BroadcastStatus>('idle');
    const [destinations, setDestinations] = useState<Destination[]>([]);

    // New Recording State
    const [activeRecordings, setActiveRecordings] = useState<('mixed' | 'iso')[]>([]);
    const [pausedRecordings, setPausedRecordings] = useState<('mixed' | 'iso')[]>([]);

    const [globalMuteState, setGlobalMuteState] = useState(false);
    const [globalVideoState, setGlobalVideoState] = useState(false);
    const [isLocalInWaitingRoom, setIsLocalInWaitingRoom] = useState(
        options.initialConfig?.role === 'guest'
    );

    useEffect(() => {
        console.log('[useAllstrm] Initialized with config:', options.initialConfig);
    }, []);

    const [, setForceUpdate] = useState({});

    const currentConstraintsRef = useRef({
        videoDeviceId: undefined as string | undefined,
        audioDeviceId: undefined as string | undefined,
        width: 1280,
        height: 720,
        frameRate: 30
    });

    // Diagnostic: Track options stability
    useEffect(() => {
        const win = window as any;
        if (!win.__prevOptions) {
            win.__prevOptions = options;
            win.__useAllstrmRenderCount = 1;
            console.log('%c[useAllstrm] INITIAL RENDER', 'color: #00ccff; font-weight: bold');
            return;
        }
        win.__useAllstrmRenderCount = (win.__useAllstrmRenderCount || 0) + 1;

        const changedOptions = Object.keys(options).filter(k => (options as any)[k] !== (win.__prevOptions as any)[k]);
        if (changedOptions.length > 0) {
            console.log(`%c[useAllstrm] RENDER #${win.__useAllstrmRenderCount} - OPTIONS CHANGED:`, 'color: #ff3300; font-weight: bold', changedOptions);
            changedOptions.forEach(k => {
                console.log(`  Option "${k}" changed identity:`, (win.__prevOptions as any)[k], '=>', (options as any)[k]);
            });
        }
        win.__prevOptions = options;
        if (options.initialConfig) {
            initialConfigRef.current = options.initialConfig;
        }
    });

    // Clean up local media tracks
    const stopLocalMedia = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
    }, []);

    const getStreamWithConstraints = useCallback(async (retries = 1): Promise<MediaStream | null> => {
        const { width, height, frameRate, videoDeviceId, audioDeviceId } = currentConstraintsRef.current;
        try {
            return await navigator.mediaDevices.getUserMedia({
                video: { deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined, width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: frameRate } },
                audio: { deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
        } catch (err: any) {
            console.warn("Camera hardware locked or unavailable:", err.name);
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
                return getStreamWithConstraints(retries - 1);
            }
            return null;
        }
    }, []);

    const initLocalMedia = useCallback(async () => {
        console.log("initiating local media");
        if (localStreamRef.current?.active && localStreamRef.current.getTracks().every(t => t.readyState === 'live')) {
            setLocalStream(localStreamRef.current);
            return localStreamRef.current;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
        }
        let stream = await getStreamWithConstraints();
        if (stream) {
            localStreamRef.current = stream;
            setLocalStream(stream);
        }
        return stream;
    }, [getStreamWithConstraints]);

    // ... (Connect/Disconnect/Toggle Handlers - Unchanged)
    const disconnect = useCallback(() => {
        // Clean up SFU REST clients
        if (sfuWebrtcManagerRef.current) {
            sfuWebrtcManagerRef.current.cleanup();
            sfuWebrtcManagerRef.current = null;
        }
        if (sfuClientRef.current) {
            sfuClientRef.current.stopPolling();
            sfuClientRef.current = null;
        }

        // Clean up SignalClient and WebRTCManager (WebSocket fallback)
        if (webrtcManagerRef.current) {
            webrtcManagerRef.current.cleanup();
            webrtcManagerRef.current = null;
        }
        if (signalClientRef.current) {
            signalClientRef.current.disconnect();
            signalClientRef.current = null;
        }

        if (wsRef.current) wsRef.current.close();
        peerConnectionsRef.current.forEach((pc: RTCPeerConnection) => pc.close());
        peerConnectionsRef.current.clear();

        localStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        screenStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        if (presentationIntervalRef.current) {
            clearInterval(presentationIntervalRef.current);
            presentationIntervalRef.current = null;
        }

        mediaRecordersRef.current.forEach((rec: MediaRecorder) => { if (rec.state !== 'inactive') rec.stop(); });
        mediaRecordersRef.current.clear();

        if (mixerEngineRef.current) {
            mixerEngineRef.current.stopRendering();
            mixerEngineRef.current = null;
        }
        if (mixerAudioCtxRef.current) {
            mixerAudioCtxRef.current.close();
            mixerAudioCtxRef.current = null;
        }

        wsRef.current = null;
        localStreamRef.current = null;
        screenStreamRef.current = null;
        setIsConnected(false);
        setIsConnecting(false);
        setParticipants([]);
        setRemoteStreams({});
        setActiveRecordings([]);
        setPausedRecordings([]);
        setPresentationState({ currentSlide: 1, totalSlides: 1, isPresentingFile: false });
        pdfDocRef.current = null;
        isConnectedRef.current = false;
        initAttemptedRef.current = false;
    }, []);

    const connect = useCallback(async () => {
        console.log('[useAllstrm] connect function called', {
            roomId: options.roomId,
            isConnectedRef: isConnectedRef.current,
            isConnectingRef: isConnectingRef.current
        });

        if (isConnectedRef.current || isConnectingRef.current) {
            console.log('[useAllstrm] Already connected or connecting - NOT starting a new connection');
            return;
        }
        console.log('[useAllstrm] Starting connection... (connect called)');
        setIsConnecting(true);
        isConnectingRef.current = true;
        initAttemptedRef.current = true;
        const initialConfig = initialConfigRef.current;

        // Initialize local media first
        try {
            let stream = localStreamRef.current;
            if (!stream || !stream.active) {
                stream = await initLocalMedia();
            }
        } catch (e) {
            console.error('[useAllstrm] Failed to init local media:', e);
        }

        // Try to get auth token from Supabase
        let token = '';
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
                token = session.access_token;
            }
        } catch (e) {
            console.warn('[useAllstrm] No auth session');
        }

        const displayName = initialConfig?.displayName || 'User';
        const role = initialConfig?.role || 'guest';
        const mode = initialConfig?.mode || 'meeting';
        let usingSFU = false;

        // Try SFU REST API first (preferred for WebRTC)
        try {
            console.log('[useAllstrm] Attempting SFU REST connection...');
            const sfuClient = new SFUClient();
            sfuClient.setToken(token);
            sfuClientRef.current = sfuClient;

            const sfuWebrtcManager = new SFUWebRTCManager(sfuClient);
            sfuWebrtcManagerRef.current = sfuWebrtcManager;

            // Set up SFU WebRTC event handlers
            sfuWebrtcManager.on('joined', (data: { participantId: string; roomId: string; isInWaitingRoom: boolean; participants: any[]; availableTracks?: any[] }) => {
                console.log('[useAllstrm] SFU EVENT: joined', data);
                console.log('[useAllstrm] Setting isLocalInWaitingRoom to:', data.isInWaitingRoom);
                setMyParticipantId(data.participantId);
                setIsLocalInWaitingRoom(data.isInWaitingRoom);
                if (data.participants?.length) {
                    const existingParticipants: Participant[] = data.participants.map((p: any) => ({
                        id: p.id || p.participant_id,
                        room_id: data.roomId,
                        display_name: p.displayName || p.display_name || p.name || 'Guest',
                        role: p.role || 'guest',
                        ingest_type: 'webrtc',
                        media_state: {
                            video_enabled: p.video_enabled ?? true,
                            audio_enabled: p.audio_enabled ?? true,
                            screen_sharing: false,
                            connection_quality: 'good'
                        },
                        is_on_stage: true,
                        is_in_waiting_room: false
                    }));
                    setParticipants(existingParticipants);
                }
            });

            sfuWebrtcManager.on('participantsUpdate', (participants: any[]) => {
                const updatedParticipants: Participant[] = participants.map((p: any) => ({
                    id: p.id || p.participant_id || p.participantId,
                    room_id: options.roomId,
                    display_name: p.display_name || p.displayName || p.name || 'Guest',
                    role: p.role || 'guest',
                    ingest_type: 'webrtc',
                    media_state: {
                        video_enabled: p.video_enabled ?? p.videoEnabled ?? true,
                        audio_enabled: p.audio_enabled ?? p.audioEnabled ?? true,
                        screen_sharing: p.screen_sharing ?? p.screenSharing ?? false,
                        connection_quality: p.connection_quality || p.connectionQuality || 'good'
                    },
                    is_on_stage: p.is_on_stage ?? p.isOnStage ?? true,
                    is_in_waiting_room: p.is_in_waiting_room ?? p.isInWaitingRoom ?? false
                }));

                setParticipants(prev => {
                    // Simple deep compare to avoid re-renders if data hasn't changed
                    if (JSON.stringify(prev) === JSON.stringify(updatedParticipants)) {
                        return prev;
                    }
                    console.log('[useAllstrm] Participants updated:', updatedParticipants.map(p => ({ id: p.id, waiting: p.is_in_waiting_room })));
                    return updatedParticipants;
                });
            });

            sfuWebrtcManager.on('waitingRoomUpdate', (waitingParticipants: any[]) => {
                setParticipants(prev => {
                    // Filter out old waiting participants from prev state to avoid duplicates/stale data
                    // Then merge new waiting participants
                    const activeParticipants = prev.filter(p => !p.is_in_waiting_room);

                    const newWaitingParticipants: Participant[] = waitingParticipants.map((p: any) => ({
                        id: p.id || p.participant_id || p.participantId,
                        room_id: options.roomId,
                        display_name: p.display_name || p.displayName || p.name || 'Guest',
                        role: p.role || 'guest',
                        ingest_type: 'webrtc',
                        media_state: {
                            video_enabled: p.video_enabled ?? p.videoEnabled ?? true,
                            audio_enabled: p.audio_enabled ?? p.audioEnabled ?? true,
                            screen_sharing: p.screen_sharing ?? p.screenSharing ?? false,
                            connection_quality: p.connection_quality || p.connectionQuality || 'good'
                        },
                        is_on_stage: false,
                        is_in_waiting_room: true
                    }));

                    const allParticipants = [...activeParticipants, ...newWaitingParticipants];

                    // Simple deep compare
                    if (JSON.stringify(prev) === JSON.stringify(allParticipants)) {
                        return prev;
                    }
                    console.log('[useAllstrm] Participants updated (with waiting):', allParticipants.length);
                    return allParticipants;
                });
            });

            sfuWebrtcManager.on('remoteStream', (data: { participantId: string; stream: MediaStream }) => {
                setRemoteStreams(prev => ({
                    ...prev,
                    [data.participantId]: data.stream
                }));
            });

            sfuWebrtcManager.on('connected', () => {
                console.log('[useAllstrm] SFU WebRTC connected');
            });

            sfuWebrtcManager.on('connectionFailed', (data: { reason: string }) => {
                console.error('[useAllstrm] SFU connection failed:', data.reason);
                setError(data.reason);
            });

            sfuWebrtcManager.on('error', (data: { code: string; message: string }) => {
                console.error('[useAllstrm] SFU WebRTC Error:', data.message);
                setError(data.message);
            });

            // Set local stream before joining
            if (localStreamRef.current) {
                sfuWebrtcManager.setLocalStream(localStreamRef.current);
            }

            // Join via SFU REST API
            console.log('[useAllstrm] Joining SFU room:', { roomId: options.roomId, displayName, role, mode });
            await sfuWebrtcManager.join(options.roomId, displayName, role, mode);
            usingSFU = true;
            console.log('[useAllstrm] Successfully connected via SFU REST API');

        } catch (sfuError) {
            console.warn('[useAllstrm] SFU REST connection failed, falling back to WebSocket:', sfuError);

            // Clean up failed SFU clients
            if (sfuWebrtcManagerRef.current) {
                sfuWebrtcManagerRef.current.cleanup();
                sfuWebrtcManagerRef.current = null;
            }
            sfuClientRef.current = null;
        }

        // Fallback to WebSocket SignalClient if SFU failed
        if (!usingSFU) {
            // Create SignalClient and WebRTCManager
            const signalClient = new SignalClient();
            signalClientRef.current = signalClient;

            const webrtcManager = new WebRTCManager(signalClient);
            webrtcManagerRef.current = webrtcManager;

            // Set up WebRTCManager event handlers
            webrtcManager.on('joined', (data: { participantId: string; roomId: string; participants: any[] }) => {
                console.log('[useAllstrm] WS EVENT: joined', data);
                setMyParticipantId(data.participantId);
                if (data.participants?.length) {
                    const existingParticipants: Participant[] = data.participants.map((p: any) => ({
                        id: p.id || p.participant_id || p.participantId,
                        room_id: data.roomId,
                        display_name: p.display_name || p.displayName || p.name || 'Guest',
                        role: p.role || 'guest',
                        ingest_type: 'webrtc',
                        media_state: {
                            video_enabled: p.video_enabled ?? p.videoEnabled ?? true,
                            audio_enabled: p.audio_enabled ?? p.audioEnabled ?? true,
                            screen_sharing: p.screen_sharing ?? p.screenSharing ?? false,
                            connection_quality: p.connection_quality || p.connectionQuality || 'good'
                        },
                        is_on_stage: p.is_on_stage ?? p.isOnStage ?? true,
                        is_in_waiting_room: p.is_in_waiting_room ?? p.isInWaitingRoom ?? false
                    }));
                    setParticipants(existingParticipants);
                }
            });

            webrtcManager.on('participantJoined', (data: any) => {
                console.log('%c[useAllstrm] RAW WS EVENT: participantJoined', 'color: #10b981; font-weight: bold', data);
                const id = data.participant_id || data.participantId || data.id;
                if (!id) return;

                const newParticipant: Participant = {
                    id,
                    room_id: options.roomId,
                    display_name: data.display_name || data.displayName || data.name || data.display_name_raw || 'Guest',
                    role: (data.role || 'guest') as Participant['role'],
                    ingest_type: 'webrtc',
                    media_state: {
                        video_enabled: data.video_enabled ?? data.videoEnabled ?? true,
                        audio_enabled: data.audio_enabled ?? data.audioEnabled ?? true,
                        screen_sharing: data.screen_sharing ?? data.screenSharing ?? false,
                        connection_quality: data.connection_quality || data.connectionQuality || 'good'
                    },
                    is_on_stage: data.is_on_stage ?? data.isOnStage ?? true,
                    is_in_waiting_room: data.is_in_waiting_room ?? data.isInWaitingRoom ?? false
                };
                setParticipants(prev => {
                    if (prev.find(p => p.id === newParticipant.id)) return prev;
                    return [...prev, newParticipant];
                });
            });

            webrtcManager.on('participantLeft', (data: { participant_id?: string; participantId?: string }) => {
                const id = data.participant_id || data.participantId;
                if (!id) return;
                setParticipants(prev => prev.filter(p => p.id !== id));
                setRemoteStreams(prev => {
                    const updated = { ...prev };
                    delete updated[id];
                    return updated;
                });
            });

            webrtcManager.on('remoteStream', (data: { participantId: string; stream: MediaStream }) => {
                console.log(`%c[useAllstrm] RECEIVED REMOTE STREAM for ${data.participantId}`, 'color: #f59e0b; font-weight: bold');
                setRemoteStreams(prev => ({
                    ...prev,
                    [data.participantId]: data.stream
                }));
            });

            webrtcManager.on('error', (data: { code: string; message: string }) => {
                console.error('[useAllstrm] WebRTC Error:', data.message);
                setError(data.message);
            });

            // Handle incoming chat messages from other participants
            signalClient.on('chat', (data: { sender_id: string; sender_name: string; text: string; timestamp: number }) => {
                if (data.sender_id !== 'local-user') {
                    setChatMessages(prev => [...prev, {
                        id: `${data.timestamp}-${data.sender_id}`,
                        senderId: data.sender_id,
                        senderName: data.sender_name,
                        text: data.text,
                        timestamp: data.timestamp
                    }]);
                }
            });

            // Handle incoming reactions from other participants
            signalClient.on('reaction', (data: { sender_id: string; sender_name: string; emoji: string; type?: string }) => {
                if (data.sender_id !== 'local-user') {
                    const text = data.type === 'hand_raise' ? `${data.sender_name} raised hand ✋` : `${data.sender_name} reacted ${data.emoji}`;
                    setChatMessages(prev => [...prev, {
                        id: `${Date.now()}-${data.sender_id}-reaction`,
                        senderId: data.sender_id,
                        senderName: data.sender_name,
                        text,
                        timestamp: Date.now(),
                        isSystem: true
                    }]);
                }
            });

            // Connect to signaling server
            try {
                await signalClient.connect(token, options.roomId);

                if (localStreamRef.current) {
                    webrtcManager.setLocalStream(localStreamRef.current);
                }

                signalClient.join(options.roomId, displayName, role);

                // Participation initialization finished

            } catch (e) {
                console.error('[useAllstrm] WebSocket connection failed:', e);
                setError('Failed to connect to server');
            }
        }

        setLayoutState({ canvas: { width: 1920, height: 1080, fps: 30, background: '#000000' }, sources: {}, overlays: {}, preset_name: 'grid', version: 1 });
        setIsConnected(true);
        isConnectedRef.current = true;
        setIsConnecting(false);
        isConnectingRef.current = false;
    }, [initLocalMedia, options.roomId]);

    useEffect(() => {
        console.log('[useAllstrm] participants state updated:', participants.length);
    }, [participants]);

    useEffect(() => { return () => { disconnect(); }; }, [disconnect]);

    const toggleVideo = useCallback(() => {
        localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
        setForceUpdate({});
    }, []);

    const toggleAudio = useCallback(() => {
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
        setForceUpdate({});
    }, []);

    const startScreenShare = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            screenStreamRef.current = stream;
            setScreenStream(stream);
            setPresentationState(p => ({ ...p, isPresentingFile: false }));
            stream.getVideoTracks()[0].onended = () => { stopScreenShare(); };
        } catch (e) { console.error("Failed to share screen", e); }
    }, []);

    const stopScreenShare = useCallback(() => {
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
            setScreenStream(null);
        }
        if (presentationIntervalRef.current) {
            clearInterval(presentationIntervalRef.current);
            presentationIntervalRef.current = null;
        }
        pdfDocRef.current = null;
        presentationCanvasRef.current = null;
        setPresentationState({ currentSlide: 1, totalSlides: 1, isPresentingFile: false });
    }, []);

    // ... (PDF / PPTX Logic Unchanged)
    const renderPdfPage = async (pageNum: number) => {
        if (!pdfDocRef.current || !presentationCanvasRef.current) return;
        const doc = pdfDocRef.current;
        const canvas = presentationCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        try {
            const page = await doc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        } catch (err) { console.error("Error rendering PDF page:", err); }
    };

    const startFilePresentation = useCallback(async (file: File) => {
        stopScreenShare();
        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        presentationCanvasRef.current = canvas;

        if (isPdf) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdf.getDocument(arrayBuffer);
                const doc = await loadingTask.promise;
                pdfDocRef.current = doc;
                presentationRef.current = { currentSlide: 1, totalSlides: doc.numPages, fileName: file.name, isPdf: true };
                setPresentationState({ currentSlide: 1, totalSlides: doc.numPages, isPresentingFile: true });
                await renderPdfPage(1);
                const stream = canvas.captureStream(30);
                screenStreamRef.current = stream;
                setScreenStream(stream);
                stream.getVideoTracks()[0].onended = () => stopScreenShare();
            } catch (e) { console.error("Failed to load PDF", e); alert("Failed to load PDF file."); }
        } else {
            presentationRef.current = { currentSlide: 1, totalSlides: 12, fileName: file.name, isPdf: false };
            setPresentationState({ currentSlide: 1, totalSlides: 12, isPresentingFile: true });
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            let tick = 0;
            const draw = () => {
                tick++;
                const pageNum = presentationRef.current.currentSlide;
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(0, 0, 1920, 1080);
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(0,0,0,0.1)';
                ctx.shadowBlur = 20;
                ctx.fillRect(100, 100, 1720, 880);
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 60px Inter, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(`${file.name} - Slide ${pageNum}`, 150, 200);
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(150, 300, 800, 500);
                ctx.fillStyle = '#64748b';
                ctx.font = '30px Inter, sans-serif';
                ctx.fillText("PPTX Preview Mode (Client-Side Simulation)", 150, 850);
                ctx.fillText("For full fidelity, convert to PDF first.", 150, 900);
                const cx = 1000 + Math.sin(tick * 0.02) * 50;
                ctx.fillStyle = 'red';
                ctx.beginPath();
                ctx.arc(cx, 50, 5, 0, Math.PI * 2);
                ctx.fill();
            };
            draw();
            const intervalId = window.setInterval(draw, 33);
            presentationIntervalRef.current = intervalId;
            const stream = canvas.captureStream(30);
            screenStreamRef.current = stream;
            setScreenStream(stream);
            stream.getVideoTracks()[0].onended = () => stopScreenShare();
        }
    }, [stopScreenShare]);

    const nextSlide = useCallback(() => {
        const { currentSlide, totalSlides, isPdf } = presentationRef.current;
        if (currentSlide < totalSlides) {
            const next = currentSlide + 1;
            presentationRef.current.currentSlide = next;
            setPresentationState(prev => ({ ...prev, currentSlide: next }));
            if (isPdf) renderPdfPage(next);
        }
    }, []);

    const prevSlide = useCallback(() => {
        const { currentSlide, isPdf } = presentationRef.current;
        if (currentSlide > 1) {
            const prev = currentSlide - 1;
            presentationRef.current.currentSlide = prev;
            setPresentationState(s => ({ ...s, currentSlide: prev }));
            if (isPdf) renderPdfPage(prev);
        }
    }, []);

    // --- WEBGL MIXER LOGIC (WYSIWYG UPDATE) ---

    // Exposed method for UI to update scene
    const updateRecordingScene = useCallback((scene: Scene) => {
        currentSceneRef.current = scene;

        // Removed check for localItem.stream as it is not part of the type and the block was empty.

        if (mixerEngineRef.current) {
            mixerEngineRef.current.setScene(scene);
        }
    }, []);

    const setMixerLayout = useCallback((layout: 'grid' | 'speaker', focusId?: string) => {
        mixerLayoutRef.current = { mode: layout, focusId };
        if (activeRecordings.includes('mixed')) {
            setForceUpdate({});
        }
    }, [activeRecordings]);

    // Method to receive the processed stream from UI components (like Studio.tsx)
    const replaceVideoTrack = useCallback(async (track: MediaStreamTrack) => {
        // Store processed stream reference for recording
        const stream = new MediaStream([track]);
        if (localStreamRef.current?.getAudioTracks()[0]) {
            stream.addTrack(localStreamRef.current.getAudioTracks()[0]);
        }
        processedStreamRef.current = stream;

        // Use SFU WebRTCManager if available (preferred)
        if (sfuWebrtcManagerRef.current && localStreamRef.current) {
            const oldTrack = localStreamRef.current.getVideoTracks()[0];
            if (oldTrack) {
                await sfuWebrtcManagerRef.current.replaceTrack(oldTrack, track);
            }
        }
        // Use WebSocket WebRTCManager if available (fallback)
        else if (webrtcManagerRef.current && localStreamRef.current) {
            const oldTrack = localStreamRef.current.getVideoTracks()[0];
            if (oldTrack) {
                await webrtcManagerRef.current.replaceTrack(oldTrack, track);
            }
        } else {
            // Fallback: Update peer connections directly
            peerConnectionsRef.current.forEach((pc: RTCPeerConnection) => {
                const s = pc.getSenders().find((x: RTCRtpSender) => x.track?.kind === 'video');
                if (s) s.replaceTrack(track);
            });
        }

        // Update mixer if active
        if (activeRecordings.includes('mixed') && mixerEngineRef.current) {
            mixerEngineRef.current.addSource('local', stream);
        }
    }, [activeRecordings]);

    // Sync Streams to Mixer whenever they change
    useEffect(() => {
        if (!activeRecordings.includes('mixed')) return;
        if (!mixerEngineRef.current) {
            mixerEngineRef.current = new BroadcastEngine(1920, 1080);
            mixerEngineRef.current.startRendering();
        }
        const engine = mixerEngineRef.current;

        // 1. Add Local (Prefer Processed with Effects)
        const local = processedStreamRef.current || localStreamRef.current;
        if (local) engine.addSource('local', local);

        // 2. Add Screen
        if (screenStreamRef.current) engine.addSource('screen', screenStreamRef.current);
        else engine.removeSource('screen');

        // 3. Add Remotes
        Object.entries(remoteStreams).forEach(([id, stream]) => {
            engine.addSource(id, stream);
        });

        // 4. Update Scene Layout
        if (currentSceneRef.current) {
            engine.setScene(currentSceneRef.current);
        }

    }, [activeRecordings, localStream, screenStream, remoteStreams, participants.length]); // changed to length to check if this is causing rerender

    // ... (Recording Functions Updated)

    const startRecording = useCallback(async (type: 'mixed' | 'iso' = 'mixed') => {
        if (activeRecordings.includes(type)) return;

        let streamToRecord: MediaStream | null = null;
        recordedChunksRef.current.set(type, []);

        if (type === 'mixed') {
            if (!mixerEngineRef.current) {
                mixerEngineRef.current = new BroadcastEngine(1920, 1080);

                // FIX: Synchronously add all current streams BEFORE starting rendering/recording
                // Use Processed Stream if available
                const local = processedStreamRef.current || localStreamRef.current;
                if (local) mixerEngineRef.current.addSource('local', local);

                if (screenStreamRef.current) mixerEngineRef.current.addSource('screen', screenStreamRef.current);
                Object.entries(remoteStreams).forEach(([id, s]) => {
                    mixerEngineRef.current?.addSource(id, s);
                });

                if (currentSceneRef.current) {
                    mixerEngineRef.current.setScene(currentSceneRef.current);
                }

                // CRITICAL: Start loop & wait for readiness
                mixerEngineRef.current.startRendering();
                await mixerEngineRef.current.waitForReady();
                mixerEngineRef.current.renderFrame(); // Force paint
            } else {
                // Engine exists, but ensure it's ready and painted
                await mixerEngineRef.current.waitForReady();
                mixerEngineRef.current.renderFrame();
            }

            if (!mixerAudioCtxRef.current) {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                mixerAudioCtxRef.current = new AudioContextClass();
                mixerAudioDestRef.current = mixerAudioCtxRef.current.createMediaStreamDestination();
            }

            const ctx = mixerAudioCtxRef.current!;
            const dest = mixerAudioDestRef.current!;

            if (localStreamRef.current?.getAudioTracks().length) {
                try { ctx.createMediaStreamSource(localStreamRef.current).connect(dest); } catch (e) { }
            }
            Object.values(remoteStreams).forEach((s: MediaStream) => {
                if (s.getAudioTracks().length) {
                    try { ctx.createMediaStreamSource(s).connect(dest); } catch (e) { }
                }
            });

            const canvasStream = mixerEngineRef.current!.getStream();
            const audioTrack = dest.stream.getAudioTracks()[0];
            streamToRecord = new MediaStream([canvasStream.getVideoTracks()[0], ...(audioTrack ? [audioTrack] : [])]);

        } else {
            // For ISO, prefer raw camera stream unless user specifically requests effects (usually ISO means raw)
            // But to be consistent with "WYSIWYG", if effects are on, we might want them?
            // Standard ISO is usually raw sensor data. Let's keep it raw for now or use processed if available.
            // Let's use processed to ensure background blur is recorded if enabled.
            streamToRecord = screenStreamRef.current || processedStreamRef.current || localStreamRef.current;
        }

        if (!streamToRecord) {
            console.error(`No stream available for ${type} recording`);
            return;
        }

        const mimeType = [
            'video/webm; codecs=vp9', 'video/webm', 'video/mp4'
        ].find(t => MediaRecorder.isTypeSupported(t)) || '';

        try {
            const recorder = new MediaRecorder(streamToRecord, { mimeType, videoBitsPerSecond: 5000000 });

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    const chunks = recordedChunksRef.current.get(type) || [];
                    chunks.push(e.data);
                    recordedChunksRef.current.set(type, chunks);
                }
            };

            recorder.onstop = () => {
                const chunks = recordedChunksRef.current.get(type);
                if (chunks && chunks.length > 0) {
                    const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = `recording-${type}-${Date.now()}.webm`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                    }, 100);
                }
                recordedChunksRef.current.set(type, []);

                if (type === 'mixed') {
                    if (mixerEngineRef.current) {
                        mixerEngineRef.current.stopRendering();
                        mixerEngineRef.current = null;
                    }
                    if (mixerAudioCtxRef.current) {
                        mixerAudioCtxRef.current.close();
                        mixerAudioCtxRef.current = null;
                    }
                }
            };

            recorder.start(1000);
            mediaRecordersRef.current.set(type, recorder);
            setActiveRecordings(prev => [...prev, type]);
            setPausedRecordings(prev => prev.filter(t => t !== type)); // Ensure not paused
            console.log(`Started ${type} recording`);

        } catch (e) {
            console.error(`Failed to start ${type} recording`, e);
        }
    }, [activeRecordings, remoteStreams]);

    const stopRecording = useCallback((recordingId?: string) => {
        const type = recordingId as 'mixed' | 'iso' | undefined;
        if (type) {
            const recorder = mediaRecordersRef.current.get(type);
            if (recorder && recorder.state !== 'inactive') recorder.stop();
            mediaRecordersRef.current.delete(type);
            setActiveRecordings(prev => prev.filter(t => t !== type));
            setPausedRecordings(prev => prev.filter(t => t !== type));
        } else {
            mediaRecordersRef.current.forEach(rec => {
                if (rec.state !== 'inactive') rec.stop();
            });
            mediaRecordersRef.current.clear();
            setActiveRecordings([]);
            setPausedRecordings([]);
        }
    }, []);

    const pauseRecording = useCallback((type?: 'mixed' | 'iso') => {
        if (type) {
            const rec = mediaRecordersRef.current.get(type);
            if (rec && rec.state === 'recording') {
                rec.pause();
                setPausedRecordings(prev => [...prev, type]);
            }
        } else {
            // Fallback: Pause all active
            mediaRecordersRef.current.forEach((rec, key) => {
                if (rec.state === 'recording') {
                    rec.pause();
                    setPausedRecordings(prev => [...prev, key as 'mixed' | 'iso']);
                }
            });
        }
    }, []);

    const resumeRecording = useCallback((type?: 'mixed' | 'iso') => {
        if (type) {
            const rec = mediaRecordersRef.current.get(type);
            if (rec && rec.state === 'paused') {
                rec.resume();
                setPausedRecordings(prev => prev.filter(t => t !== type));
            }
        } else {
            // Fallback: Resume all paused
            mediaRecordersRef.current.forEach((rec, key) => {
                if (rec.state === 'paused') {
                    rec.resume();
                    setPausedRecordings(prev => prev.filter(t => t !== key));
                }
            });
        }
    }, []);

    // ... (Helpers unchanged)
    const muteParticipant = useCallback((id: string) => setParticipants(p => p.map(x => x.id === id ? { ...x, media_state: { ...x.media_state, audio_enabled: false } } : x)), []);
    const unmuteParticipant = useCallback((id: string) => setParticipants(p => p.map(x => x.id === id ? { ...x, media_state: { ...x.media_state, audio_enabled: true } } : x)), []);
    const stopParticipantVideo = useCallback((id: string) => setParticipants(p => p.map(x => x.id === id ? { ...x, media_state: { ...x.media_state, video_enabled: false } } : x)), []);
    const startParticipantVideo = useCallback((id: string) => setParticipants(p => p.map(x => x.id === id ? { ...x, media_state: { ...x.media_state, video_enabled: true } } : x)), []);
    const muteAllParticipants = useCallback(() => { setParticipants(p => p.map(x => ({ ...x, media_state: { ...x.media_state, audio_enabled: false } }))); setGlobalMuteState(true); }, []);
    const unmuteAllParticipants = useCallback(() => { setParticipants(p => p.map(x => ({ ...x, media_state: { ...x.media_state, audio_enabled: true } }))); setGlobalMuteState(false); }, []);
    const stopAllVideo = useCallback(() => { setParticipants(p => p.map(x => ({ ...x, media_state: { ...x.media_state, video_enabled: false } }))); setGlobalVideoState(true); }, []);
    const allowAllVideo = useCallback(() => { setParticipants(p => p.map(x => ({ ...x, media_state: { ...x.media_state, video_enabled: true } }))); setGlobalVideoState(false); }, []);
    const requestAllVideo = useCallback(() => { setParticipants(p => p.map(x => ({ ...x, media_state: { ...x.media_state, video_enabled: true } }))); }, []);
    const sendReaction = useCallback((e: string) => {
        setChatMessages(p => [...p, { id: Date.now().toString(), senderId: 'local', senderName: 'You', text: `Reacted ${e}`, timestamp: Date.now(), isSystem: true }]);
        // Send reaction via ParticipantUpdate message
        if (signalClientRef.current && !signalClientRef.current.isMock) {
            signalClientRef.current.send('PARTICIPANT_UPDATE', { reaction: e });
        }
    }, []);
    const toggleHandRaise = useCallback(() => {
        setChatMessages(p => [...p, { id: Date.now().toString(), senderId: 'local', senderName: 'You', text: `Raised Hand ✋`, timestamp: Date.now(), isSystem: true }]);
        // Send hand raise via ParticipantUpdate message
        if (signalClientRef.current && !signalClientRef.current.isMock) {
            signalClientRef.current.send('PARTICIPANT_UPDATE', { hand_raised: true });
        }
    }, []);
    const startBroadcast = useCallback(async () => {
        setBroadcastStatus('starting');
        try {
            // Import API dynamically to avoid circular deps
            const { ApiClient } = await import('../lib/api');
            // Create or get stream session
            try {
                await ApiClient.getStreamSession(options.roomId);
            } catch {
                await ApiClient.createStreamSession(options.roomId);
            }
            // Start the stream
            await ApiClient.startStream(options.roomId);
            setBroadcastStatus('live');
        } catch (e) {
            console.error('[useAllstrm] Failed to start broadcast:', e);
            setError('Failed to start broadcast');
            setBroadcastStatus('idle');
        }
    }, [options.roomId]);

    const stopBroadcast = useCallback(async () => {
        setBroadcastStatus('stopping');
        try {
            const { ApiClient } = await import('../lib/api');
            await ApiClient.stopStream(options.roomId);
            setBroadcastStatus('idle');
        } catch (e) {
            console.error('[useAllstrm] Failed to stop broadcast:', e);
            setError('Failed to stop broadcast');
            setBroadcastStatus('idle');
        }
    }, [options.roomId]);
    const sendChatMessage = useCallback((t: string) => {
        // Add to local chat immediately
        setChatMessages(p => [...p, { id: Date.now().toString(), senderId: 'local', senderName: 'You', text: t, timestamp: Date.now() }]);
        // Send via SignalClient if connected to real backend
        if (signalClientRef.current && !signalClientRef.current.isMock) {
            signalClientRef.current.send('CHAT_MESSAGE', { content: t });
        }
    }, []);
    const addDestination = useCallback(async (d: Omit<Destination, 'id' | 'enabled' | 'status'>) => {
        const localId = `dest-${Date.now()}`;
        // Add locally first for immediate UI feedback
        setDestinations(p => [...p, { ...d, id: localId, enabled: true, status: 'idle' }]);
        // Sync with backend if streaming
        // Backend destinations are managed through the stream session
    }, []);

    const removeDestination = useCallback(async (id: string) => {
        setDestinations(p => p.filter((d: Destination) => d.id !== id));
    }, []);

    const toggleDestination = useCallback(async (id: string, enabled: boolean) => {
        setDestinations(p => p.map((d: Destination) => d.id === id ? { ...d, enabled } : d));
        // If broadcast is live, start/stop individual destination relay
        if (broadcastStatus === 'live') {
            try {
                const { ApiClient } = await import('../lib/api');
                if (enabled) {
                    await ApiClient.startDestinationRelay(options.roomId, id);
                } else {
                    await ApiClient.stopDestinationRelay(options.roomId, id);
                }
            } catch (e) {
                console.error('[useAllstrm] Failed to toggle destination:', e);
            }
        }
    }, [broadcastStatus, options.roomId]);
    const admitParticipant = useCallback(async (id: string) => {
        if (sfuClientRef.current) {
            try {
                await sfuClientRef.current.admitParticipant(id);
                // The polling or socket update will reflect this, but we can update locally too
                setParticipants(p => p.map(x => x.id === id ? { ...x, is_in_waiting_room: false } : x));
            } catch (e) {
                console.error('[useAllstrm] Failed to admit participant:', e);
            }
        }
    }, [setParticipants]);
    const setPresetLayout = useCallback(async (n: string) => setLayoutState(s => s ? ({ ...s, preset_name: n }) : null), []);
    const updateLayout = useCallback(async () => { }, []);
    const prepareCamera = useCallback(async () => { }, []);
    const switchDevice = useCallback(async () => { }, []);
    const updateVideoConfig = useCallback(async () => { }, []);
    const toggleStageStatus = useCallback((id: string, on: boolean) => setParticipants(p => p.map(x => x.id === id ? { ...x, is_on_stage: on } : x)), []);
    const removeParticipant = useCallback((id: string) => setParticipants(p => p.filter(x => x.id !== id)), []);

    const filteredParticipants = useMemo(() =>
        participants.filter(p => p.id !== myParticipantId),
        [participants, myParticipantId]);

    return useMemo(() => ({
        isConnected, isConnecting, error, participants: filteredParticipants, myParticipantId, mySourceId, layoutState, localStream, remoteStreams, screenStream,
        connect, disconnect, toggleVideo, toggleAudio, startScreenShare, stopScreenShare, updateLayout, setPresetLayout,
        muteParticipant, muteAllParticipants, unmuteAllParticipants, unmuteParticipant,
        stopParticipantVideo, startParticipantVideo, stopAllVideo, allowAllVideo, requestAllVideo,
        startRecording, stopRecording, pauseRecording, resumeRecording,
        prepareCamera, switchDevice, updateVideoConfig, replaceVideoTrack, toggleStageStatus, removeParticipant,
        sendReaction, toggleHandRaise,
        broadcastStatus, destinations, startBroadcast, stopBroadcast, addDestination, removeDestination, toggleDestination, chatMessages, sendChatMessage,
        admitParticipant, startFilePresentation,
        nextSlide, prevSlide, presentationState,
        globalMuteState, globalVideoState,
        activeRecordings,
        pausedRecordings,
        setMixerLayout,
        updateRecordingScene,
        isLocalInWaitingRoom
    }), [
        isConnected, isConnecting, error, participants, myParticipantId, mySourceId, layoutState, localStream, remoteStreams, screenStream,
        connect, disconnect, toggleVideo, toggleAudio, startScreenShare, stopScreenShare, updateLayout, setPresetLayout,
        muteParticipant, muteAllParticipants, unmuteAllParticipants, unmuteParticipant,
        stopParticipantVideo, startParticipantVideo, stopAllVideo, allowAllVideo, requestAllVideo,
        startRecording, stopRecording, pauseRecording, resumeRecording,
        prepareCamera, switchDevice, updateVideoConfig, replaceVideoTrack, toggleStageStatus, removeParticipant,
        sendReaction, toggleHandRaise,
        broadcastStatus, destinations, startBroadcast, stopBroadcast, addDestination, removeDestination, toggleDestination, chatMessages, sendChatMessage,
        admitParticipant, startFilePresentation,
        nextSlide, prevSlide, presentationState,
        globalMuteState, globalVideoState,
        activeRecordings,
        pausedRecordings,
        setMixerLayout,
        updateRecordingScene,
        isLocalInWaitingRoom
    ]);
}
