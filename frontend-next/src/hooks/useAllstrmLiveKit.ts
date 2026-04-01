'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  Participant,
  RemoteParticipant,
  LocalParticipant,
  ConnectionState,
  TrackPublication,
  RemoteTrackPublication,
  LocalTrackPublication,
  VideoPresets,
  createLocalTracks,
  LocalVideoTrack,
  LocalAudioTrack,
} from 'livekit-client';
import type {
  UseAllstrmOptions,
  UseAllstrmReturn,
  Participant as AllstrmParticipant,
  LayoutState,
  ChatMessage,
  Destination,
  BroadcastStatus,
} from '@/types';
import { Scene } from '../types/layout';
import { parsePresentation, PresentationStream } from '@/utils/filePresentation';
import { ApiClient } from '@/lib/api';

/**
 * LiveKit-powered implementation of useAllstrm hook
 * Maintains the same interface as the original hook for backward compatibility
 */
export function useAllstrmLiveKit(options: UseAllstrmOptions): UseAllstrmReturn & {
export function useAllstrmLiveKit(options: UseAllstrmOptions): UseAllstrmReturn & {
  remoteStreams: Record<string, MediaStream>;
  remoteScreenStreams: Record<string, MediaStream>;
  unmuteAllParticipants: () => void;
  muteAllParticipants: () => void;
  stopAllVideo: () => void;
  allowAllVideo: () => void;
  requestAllVideo: () => void;
  unmuteParticipant: (id: string) => void;
  startParticipantVideo: (id: string) => void;
  startFilePresentation: (file: File) => void;
  stopFilePresentation: () => void;
  pauseRecording: (type?: 'mixed' | 'iso') => void;
  resumeRecording: (type?: 'mixed' | 'iso') => void;
  nextSlide: () => void;
  prevSlide: () => void;
  presentationState: { currentSlide: number; totalSlides: number; isPresentingFile: boolean };
  globalMuteState: boolean;
  globalVideoState: boolean;
  activeRecordings: ('mixed' | 'iso')[];
  pausedRecordings: ('mixed' | 'iso')[];
  setMixerLayout: (layout: 'grid' | 'speaker', focusId?: string) => void;
  updateRecordingScene: (scene: Scene) => void;
  isLocalInWaitingRoom: boolean;
  isRoomRecording: boolean;
  sendDataMessage: (message: Record<string, unknown>) => Promise<void>;
  receivedStageState: string[];
  stageStateVersion: number;
  receivedPermissions: {
    canToggleAudio: boolean;
    canToggleVideo: boolean;
    canShareScreen: boolean;
    canSendChat: boolean;
    canRaiseHand: boolean;
  };
} {
  // LiveKit Room reference
  const roomRef = useRef<Room | null>(null);
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null);
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null);

  // Egress IDs for broadcast cleanup
  const egressIdsRef = useRef<string[]>([]);

  // Connection state refs to prevent race conditions
  const isConnectedRef = useRef(false);
  const isConnectingRef = useRef(false);
  const connectionAttemptRef = useRef(0);

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRoomRecording, setIsRoomRecording] = useState(false);
  const [participants, setParticipants] = useState<AllstrmParticipant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Record<string, MediaStream>>({});
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
  const [layoutState, setLayoutState] = useState<LayoutState | null>(null);

  // File presentation state
  const presentationStreamRef = useRef<PresentationStream | null>(null);
  const [presentationState, setPresentationState] = useState<{
    currentSlide: number;
    totalSlides: number;
    isPresentingFile: boolean;
  }>({ currentSlide: 0, totalSlides: 0, isPresentingFile: false });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [broadcastStatus, setBroadcastStatus] = useState<BroadcastStatus>('idle');
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [activeRecordings, setActiveRecordings] = useState<('mixed' | 'iso')[]>([]);

  // Waiting room state - default to true for guests, they must be explicitly admitted
  const configRole = options.initialConfig?.role;
  const isGuest = configRole === 'guest';
  const roomId = options.roomId;
  const admissionStorageKey = `admitted_${roomId}`;
  console.log('[useAllstrmLiveKit] Hook init - role:', configRole, 'isGuest:', isGuest);

  // Initialize hasBeenAdmitted from sessionStorage to survive re-renders
  const [hasBeenAdmitted, setHasBeenAdmitted] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(admissionStorageKey) === 'true';
    }
    return false;
  });

  // Initialize waiting room state - check if already admitted
  const [isLocalInWaitingRoom, setIsLocalInWaitingRoom] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(admissionStorageKey) === 'true') {
      return false; // Already admitted, not in waiting room
    }
    return isGuest;
  });
  const [participantMetadata, setParticipantMetadata] = useState<Record<string, { inWaitingRoom?: boolean }>>(
    isGuest ? { [options.initialConfig?.userId || 'guest']: { inWaitingRoom: true } } : {}
  );
  const [admittedParticipants, setAdmittedParticipants] = useState<Set<string>>(new Set());
  // Ref to always have latest admittedParticipants (avoids stale closure in event handlers)
  const admittedParticipantsRef = useRef<Set<string>>(new Set());
  const [pausedRecordings, setPausedRecordings] = useState<('mixed' | 'iso')[]>([]);
  const [globalMuteState, setGlobalMuteState] = useState(false);
  const [globalVideoState, setGlobalVideoState] = useState(false);
  const [receivedStageState, setReceivedStageState] = useState<string[]>([]);
  // Track stage sync version to detect changes including clearing stage
  const [stageStateVersion, setStageStateVersion] = useState(0);
  // Permissions received from host for this guest
  const [receivedPermissions, setReceivedPermissions] = useState<{
    canToggleAudio: boolean;
    canToggleVideo: boolean;
    canShareScreen: boolean;
    canSendChat: boolean;
    canRaiseHand: boolean;
  }>({
    canToggleAudio: true,
    canToggleVideo: true,
    canShareScreen: false,
    canSendChat: true,
    canRaiseHand: true,
  });
  // Track if guest was kicked by host
  const [wasKicked, setWasKicked] = useState(false);
  // Track if session ended (host left)
  const [sessionEnded, setSessionEnded] = useState(false);

  // Refs for recording
  const mediaRecordersRef = useRef<Map<string, MediaRecorder>>(new Map());
  const recordedChunksRef = useRef<Map<string, Blob[]>>(new Map());
  const currentSceneRef = useRef<Scene | null>(null);

  // WYSIWYG compositing refs
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const compositeAnimationRef = useRef<number | null>(null);
  const stageElementRef = useRef<HTMLDivElement | null>(null);

  // Convert LiveKit participant to Allstrm participant format
  const convertParticipant = useCallback(
    (participant: Participant, isLocal: boolean = false): AllstrmParticipant => {
      const videoTrack = participant.getTrackPublication(Track.Source.Camera);
      const audioTrack = participant.getTrackPublication(Track.Source.Microphone);
      const screenTrack = participant.getTrackPublication(Track.Source.ScreenShare);

      let metadata: { role?: string; isHost?: boolean; inWaitingRoom?: boolean } = {};
      try {
        metadata = participant.metadata ? JSON.parse(participant.metadata) : {};
      } catch {
        metadata = {};
      }

      // Determine if participant is in waiting room
      // Check if they've been admitted (overrides metadata), or check metadata
      const participantId = isLocal ? 'local' : participant.identity;
      // For local participant: check hasBeenAdmitted state (set when guest receives admission)
      // For remote participants: check admittedParticipants Set (tracked by host)
      // Use ref to avoid stale closure in event handlers
      const isAdmitted = isLocal ? hasBeenAdmitted : admittedParticipantsRef.current.has(participantId);
      const isInWaitingRoom = !isAdmitted && metadata.inWaitingRoom === true;

      return {
        id: participantId,
        room_id: options.roomId,
        display_name: participant.name || participant.identity || 'Anonymous',
        role: (metadata.role as AllstrmParticipant['role']) || (metadata.isHost ? 'host' : 'guest'),
        ingest_type: 'webrtc',
        media_state: {
          video_enabled: videoTrack?.isEnabled ?? false,
          audio_enabled: audioTrack?.isEnabled ?? false,
          screen_sharing: screenTrack?.isEnabled ?? false,
          connection_quality: (participant.connectionQuality?.toString() || 'good') as 'good' | 'excellent' | 'fair' | 'poor',
        },
        is_on_stage: false,  // Stage status controlled by Studio's onStageParticipants state
        is_in_waiting_room: isInWaitingRoom,
      };
    },
    [options.roomId, admittedParticipants, hasBeenAdmitted]
  );

  // Handle beforeunload to notify guests when host closes tab
  useEffect(() => {
    if (isGuest) return; // Only host needs to send notifications

    const handleBeforeUnload = () => {
      // Send sessionEnded message synchronously (best effort, may not always work)
      if (roomRef.current) {
        try {
          // Use sendBeacon for more reliable delivery during unload
          const message = JSON.stringify({
            type: 'sessionEnded',
            timestamp: Date.now(),
            reason: 'host_left'
          });
          // Also try to send via data message (may not complete)
          roomRef.current.localParticipant.publishData(
            new TextEncoder().encode(message),
            { reliable: true }
          ).catch(() => { });
        } catch (err) {
          console.warn('[useAllstrmLiveKit] Could not send sessionEnded on unload:', err);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isGuest]);

  // Update participants list from room
  const updateParticipants = useCallback(() => {
    if (!roomRef.current) return;

    const room = roomRef.current;
    const allParticipants: AllstrmParticipant[] = [];

    // Add local participant
    if (room.localParticipant) {
      const localParticipant = convertParticipant(room.localParticipant, true);
      allParticipants.push(localParticipant);
      // NOTE: We do NOT update isLocalInWaitingRoom here anymore
      // That state is managed explicitly via DataReceived admission messages
    }

    // Add remote participants
    room.remoteParticipants.forEach((participant) => {
      allParticipants.push(convertParticipant(participant, false));
    });

    setParticipants(allParticipants);
  }, [convertParticipant]);

  // Update remote streams from room
  const updateRemoteStreams = useCallback(() => {
    if (!roomRef.current) return;

    const streams: Record<string, MediaStream> = {};
    const screenStreams: Record<string, MediaStream> = {};

    roomRef.current.remoteParticipants.forEach((participant) => {
      const stream = new MediaStream();
      const screenStreamObj = new MediaStream();

      participant.trackPublications.forEach((publication) => {
        if (publication.track && publication.isSubscribed) {
          if (publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio) {
            screenStreamObj.addTrack(publication.track.mediaStreamTrack);
          } else {
            stream.addTrack(publication.track.mediaStreamTrack);
          }
        }
      });

      if (stream.getTracks().length > 0) {
        streams[participant.identity] = stream;
      }
      if (screenStreamObj.getTracks().length > 0) {
        screenStreams[participant.identity] = screenStreamObj;
      }
    });

    setRemoteStreams(streams);
    setRemoteScreenStreams(screenStreams);
  }, []);

  // Fetch token from our API
  const fetchToken = useCallback(async (): Promise<{ token: string; serverUrl: string } | null> => {
    try {
      const config = options.initialConfig;
      const res = await fetch(`/api/rooms/${options.roomId}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: config?.displayName || 'Anonymous',
          role: config?.role || 'guest',
          userId: config?.userId || `user_${Date.now()}`,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to get token (${res.status})`);
      }

      const data = await res.json();
      let dynamicUrl = 'ws://localhost:7880';
      if (typeof window !== 'undefined') {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (!isLocalhost) {
          const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          dynamicUrl = `${wsProtocol}//${window.location.hostname}`;
        }
      }
      const envUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
      let finalServerUrl = data.serverUrl || ((envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) ? envUrl : dynamicUrl);
      
      // Strip :7880 in production so we route through Caddy's standard 443 TLS port
      if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        finalServerUrl = finalServerUrl.replace(':7880', '');
      }
      
      return {
        token: data.token,
        serverUrl: finalServerUrl,
      };
    } catch (err) {
      console.error('[useAllstrmLiveKit] Token fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get token');
      return null;
    }
  }, [options.roomId, options.initialConfig]);

  // Connect to LiveKit room
  const connect = useCallback(async () => {
    // Use refs to prevent race conditions from React's async state updates
    if (isConnectedRef.current || isConnectingRef.current) {
      console.log('[useAllstrmLiveKit] Already connected or connecting, skipping');
      return;
    }

    // Increment connection attempt counter
    const currentAttempt = ++connectionAttemptRef.current;

    isConnectingRef.current = true;
    setIsConnecting(true);
    setError(null);

    console.log('[useAllstrmLiveKit] Starting connection attempt', currentAttempt);

    try {
      let tokenData;
      // If we have a pre-generated token from the URL, use it directly
      if (options.initialConfig?.preGeneratedToken) {
        console.log('[useAllstrmLiveKit] Using pre-generated token for connection');
        let dynamicUrl = 'ws://localhost:7880';
        if (typeof window !== 'undefined') {
          const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          if (!isLocalhost) {
          const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            dynamicUrl = `${wsProtocol}//${window.location.hostname}`;
          }
        }
        
        const envUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
        let serverUrl = (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) ? envUrl : dynamicUrl;
        
        // Strip :7880 in production so we route through Caddy's standard 443 TLS port
        if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          serverUrl = serverUrl.replace(':7880', '');
        }
        
        tokenData = {
          token: options.initialConfig.preGeneratedToken,
          serverUrl: serverUrl,
        };
      } else {
        tokenData = await fetchToken();
      }

      // Check if this attempt is still valid (not superseded by newer attempt or disconnect)
      if (connectionAttemptRef.current !== currentAttempt) {
        console.log('[useAllstrmLiveKit] Connection attempt', currentAttempt, 'superseded');
        return;
      }

      if (!tokenData) {
        isConnectingRef.current = false;
        setIsConnecting(false);
        return;
      }

      console.log('[useAllstrmLiveKit] Got token, connecting to', tokenData.serverUrl);

      // Create room instance
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: VideoPresets.h720.resolution,
        },
      });

      roomRef.current = room;

      // Set up event handlers
      room.on(RoomEvent.Connected, () => {
        console.log('[useAllstrmLiveKit] Connected to room');
        isConnectedRef.current = true;
        isConnectingRef.current = false;
        setIsConnected(true);
        setIsConnecting(false);
        setMyParticipantId(room.localParticipant?.identity || null);

        // Check if local participant is in waiting room based on metadata
        if (room.localParticipant) {
          let metadata: { inWaitingRoom?: boolean; role?: string } = {};
          try {
            metadata = room.localParticipant.metadata ? JSON.parse(room.localParticipant.metadata) : {};
          } catch {
            metadata = {};
          }
          console.log('[useAllstrmLiveKit] Local participant metadata:', {
            identity: room.localParticipant.identity,
            metadata,
            rawMetadata: room.localParticipant.metadata,
          });

          // Set initial waiting room state based on token metadata
          // CRITICAL: Check if already admitted via sessionStorage FIRST to prevent duplicate waiting room
          const alreadyAdmitted = typeof window !== 'undefined' && sessionStorage.getItem(admissionStorageKey) === 'true';
          if (alreadyAdmitted) {
            console.log('[useAllstrmLiveKit] Already admitted via sessionStorage, keeping out of waiting room');
            setIsLocalInWaitingRoom(false);
            setHasBeenAdmitted(true);
          } else if (metadata.inWaitingRoom === true) {
            console.log('[useAllstrmLiveKit] Guest is in waiting room');
            setIsLocalInWaitingRoom(true);
          } else {
            console.log('[useAllstrmLiveKit] Participant is NOT in waiting room (host or already admitted)');
            setIsLocalInWaitingRoom(false);
          }
        }

        updateParticipants();
        updateRemoteStreams();

        // Create local stream from local tracks
        if (room.localParticipant) {
          const stream = new MediaStream();
          room.localParticipant.trackPublications.forEach((pub) => {
            if (pub.track && (pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone)) {
              stream.addTrack(pub.track.mediaStreamTrack);
            }
          });
          if (stream.getTracks().length > 0) {
            setLocalStream(stream);
          }
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        setIsConnected(false);
        setParticipants([]);
        setLocalStream(null);
        setScreenStream(null);
        setRemoteStreams({});
        setChatMessages([]);
        setActiveRecordings([]);
        setIsRoomRecording(false);
      });

      room.on(RoomEvent.RecordingStatusChanged, (isRecording: boolean) => {
        setIsRoomRecording(isRecording);
      });

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        console.log('[useAllstrmLiveKit] Participant connected:', participant.identity);
        updateParticipants();
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        console.log('[useAllstrmLiveKit] Participant disconnected:', participant.identity);

        // Check if the disconnected participant was the host
        try {
          const metadata = participant.metadata ? JSON.parse(participant.metadata) : {};
          if (metadata.isHost || metadata.role === 'host' || metadata.role === 'owner') {
            console.log('[useAllstrmLiveKit] Host disconnected - session ended');
            setSessionEnded(true);
          }
        } catch (err) {
          console.warn('[useAllstrmLiveKit] Could not parse participant metadata:', err);
        }

        updateParticipants();
        setRemoteStreams((prev) => {
          const updated = { ...prev };
          delete updated[participant.identity];
          return updated;
        });
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('[useAllstrmLiveKit] Track subscribed:', track.kind, participant.identity);
        updateRemoteStreams();
        updateParticipants();
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log('[useAllstrmLiveKit] Track unsubscribed:', track.kind, participant.identity);
        updateRemoteStreams();
        updateParticipants();
      });

      room.on(RoomEvent.TrackMuted, (publication, participant) => {
        console.log('[useAllstrmLiveKit] Track muted:', publication.kind, participant.identity);
        updateParticipants();
      });

      room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
        console.log('[useAllstrmLiveKit] Track unmuted:', publication.kind, participant.identity);
        updateParticipants();
      });

      room.on(RoomEvent.LocalTrackPublished, (publication: LocalTrackPublication) => {
        console.log('[useAllstrmLiveKit] Local track published:', publication.kind);
        // Update local stream
        if (room.localParticipant) {
          const stream = new MediaStream();
          room.localParticipant.trackPublications.forEach((pub) => {
            if (pub.track && (pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone)) {
              stream.addTrack(pub.track.mediaStreamTrack);
            }
          });
          if (stream.getTracks().length > 0) {
            setLocalStream(stream);
          }
        }
        updateParticipants();
      });

      room.on(RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
        console.log('[useAllstrmLiveKit] Local track unpublished:', publication.kind);
        // Update local stream to remove the unpublished track
        if (room.localParticipant) {
          const stream = new MediaStream();
          room.localParticipant.trackPublications.forEach((pub) => {
            if (pub.track && pub.track.mediaStreamTrack && (pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone)) {
              stream.addTrack(pub.track.mediaStreamTrack);
            }
          });
          setLocalStream(stream.getTracks().length > 0 ? stream : null);
        }
        updateParticipants();
      });

      room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
        console.log('[useAllstrmLiveKit] DataReceived event fired!', {
          from: participant?.identity,
          kind,
          topic,
          payloadLength: payload?.length,
        });

        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          console.log('[useAllstrmLiveKit] Parsed data message:', data);

          // Handle admission message
          if (data.type === 'admission') {
            console.log('[useAllstrmLiveKit] Received admission message:', data);
            if (data.admitted) {
              // We've been admitted! Update local state
              console.log('[useAllstrmLiveKit] Processing admission - setting isLocalInWaitingRoom to false');
              setAdmittedParticipants((prev) => new Set([...prev, 'local']));
              setIsLocalInWaitingRoom(false);
              setHasBeenAdmitted(true);
              // Persist to sessionStorage to survive re-renders
              if (typeof window !== 'undefined') {
                sessionStorage.setItem(admissionStorageKey, 'true');
              }
              console.log('[useAllstrmLiveKit] Admitted to room!');
            }
          }

          // Handle stage sync from host (guest receives this)
          if (data.type === 'stageSync') {
            console.log('[useAllstrmLiveKit] Received stage sync:', data.onStageIds, 'timestamp:', data.timestamp);
            // Store stage state - Studio component will use this for guests
            setReceivedStageState(data.onStageIds || []);
            // Increment version to trigger effect even for empty arrays
            setStageStateVersion(v => v + 1);
          }

          // Handle permission updates from host (guest receives this)
          if (data.type === 'permission') {
            console.log('[useAllstrmLiveKit] Received permission update:', data);
            // Check if this permission message is for us
            const localId = roomRef.current?.localParticipant?.identity;
            if (data.targetId === localId || data.targetId === 'local') {
              setReceivedPermissions(prev => ({
                ...prev,
                ...(data.permissions || {})
              }));
              console.log('[useAllstrmLiveKit] Applied permissions:', data.permissions);
            }
          }

          // Handle kick message from host
          if (data.type === 'kick') {
            console.log('[useAllstrmLiveKit] Received kick message:', data);
            const localId = roomRef.current?.localParticipant?.identity;
            if (data.targetId === localId || data.targetId === 'local') {
              setWasKicked(true);
              console.log('[useAllstrmLiveKit] You have been kicked from the room');
            }
          }

          // Handle session ended message (host left)
          if (data.type === 'sessionEnded') {
            console.log('[useAllstrmLiveKit] Received sessionEnded message - host left');
            setSessionEnded(true);
          }

          // Handle chat messages
          if (data.type === 'chat') {
            setChatMessages((prev) => [
              ...prev,
              {
                id: `${Date.now()}-${participant?.identity || 'system'}`,
                senderId: participant?.identity || 'system',
                senderName: participant?.name || 'System',
                text: data.message,
                timestamp: Date.now(),
              },
            ]);
          }
        } catch (e) {
          // Ignore non-JSON messages
          console.log('[useAllstrmLiveKit] Non-JSON data received:', e);
        }
      });

      room.on(RoomEvent.ConnectionQualityChanged, () => {
        updateParticipants();
      });

      // Get initial config
      const config = options.initialConfig;
      const enableVideo = config?.videoEnabled ?? true;
      const enableAudio = config?.audioEnabled ?? true;

      console.log('[useAllstrmLiveKit] Connecting to room with video:', enableVideo, 'audio:', enableAudio);

      // Connect to room with video/audio
      await room.connect(tokenData.serverUrl, tokenData.token);

      console.log('[useAllstrmLiveKit] Room connected, enabling tracks...');

      // Enable camera and microphone
      if (enableVideo) {
        await room.localParticipant.setCameraEnabled(true);
        console.log('[useAllstrmLiveKit] Camera enabled');
      }
      if (enableAudio) {
        await room.localParticipant.setMicrophoneEnabled(true);
        console.log('[useAllstrmLiveKit] Microphone enabled');
      }

      // Set initial layout state
      setLayoutState({
        canvas: { width: 1920, height: 1080, fps: 30, background: '#000000' },
        sources: {},
        overlays: {},
        preset_name: 'grid',
        version: 1,
      });

      console.log('[useAllstrmLiveKit] Connection setup complete');
    } catch (err) {
      console.error('[useAllstrmLiveKit] Connection error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      isConnectingRef.current = false;
      setIsConnecting(false);
    }
  }, [
    isConnected,
    isConnecting,
    fetchToken,
    options.initialConfig,
    updateParticipants,
    updateRemoteStreams,
  ]);

  // Disconnect from room
  const disconnect = useCallback(async () => {
    console.log('[useAllstrmLiveKit] Disconnecting...');

    // If host is disconnecting, notify all guests that session is ending
    if (!isGuest && roomRef.current) {
      try {
        await roomRef.current.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({
            type: 'sessionEnded',
            timestamp: Date.now(),
            reason: 'host_left'
          })),
          { reliable: true }
        );
        console.log('[useAllstrmLiveKit] Sent sessionEnded notification to guests');
      } catch (err) {
        console.error('[useAllstrmLiveKit] Failed to send sessionEnded:', err);
      }
    }

    // Clear admission state from sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(admissionStorageKey);
    }

    // Reset connection state refs
    isConnectedRef.current = false;
    isConnectingRef.current = false;
    connectionAttemptRef.current++;

    // Explicitly stop all local tracks to turn off camera light
    if (roomRef.current?.localParticipant) {
      console.log('[useAllstrmLiveKit] Stopping all local tracks...');
      roomRef.current.localParticipant.trackPublications.forEach((pub) => {
        if (pub.track?.mediaStreamTrack) {
          pub.track.mediaStreamTrack.stop();
          console.log('[useAllstrmLiveKit] Stopped track:', pub.track.kind);
        }
      });
    }

    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }

    // Stop any recordings
    mediaRecordersRef.current.forEach((rec) => {
      if (rec.state !== 'inactive') rec.stop();
    });
    mediaRecordersRef.current.clear();

    setIsConnected(false);
    setIsConnecting(false);
    setParticipants([]);
    setRemoteStreams({});
    setLocalStream(null);
    setScreenStream(null);
    setActiveRecordings([]);
    setPausedRecordings([]);
    setHasBeenAdmitted(false);
    setIsLocalInWaitingRoom(isGuest);
  }, [admissionStorageKey, isGuest]);

  // Toggle local video
  const toggleVideo = useCallback(async () => {
    if (!roomRef.current?.localParticipant) return;
    const room = roomRef.current;
    const enabled = room.localParticipant.isCameraEnabled;

    await room.localParticipant.setCameraEnabled(!enabled);

    // Update local stream after camera toggle
    // This ensures the stream includes the new video track state
    const stream = new MediaStream();
    room.localParticipant.trackPublications.forEach((pub) => {
      if (pub.track && pub.track.mediaStreamTrack && (pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone)) {
        stream.addTrack(pub.track.mediaStreamTrack);
      }
    });
    setLocalStream(stream.getTracks().length > 0 ? stream : null);

    updateParticipants();
  }, [updateParticipants]);

  // Toggle local audio
  const toggleAudio = useCallback(async () => {
    if (!roomRef.current?.localParticipant) return;
    const enabled = roomRef.current.localParticipant.isMicrophoneEnabled;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!enabled);
    updateParticipants();
  }, [updateParticipants]);

  // Start screen share
  const startScreenShare = useCallback(async () => {
    if (!roomRef.current?.localParticipant) return;

    try {
      await roomRef.current.localParticipant.setScreenShareEnabled(true);

      // Get screen share track and create stream
      const screenPub = roomRef.current.localParticipant.getTrackPublication(
        Track.Source.ScreenShare
      );
      if (screenPub?.track) {
        const stream = new MediaStream([screenPub.track.mediaStreamTrack]);
        setScreenStream(stream);
      }

      updateParticipants();
    } catch (err) {
      console.error('[useAllstrmLiveKit] Screen share error:', err);
    }
  }, [updateParticipants]);

  // Stop screen share
  const stopScreenShare = useCallback(async () => {
    if (!roomRef.current?.localParticipant) return;

    await roomRef.current.localParticipant.setScreenShareEnabled(false);
    setScreenStream(null);
    setPresentationState({ currentSlide: 1, totalSlides: 1, isPresentingFile: false });
    updateParticipants();
  }, [updateParticipants]);

  // Replace video track (for processed/effects stream)
  const replaceVideoTrack = useCallback(
    async (track: MediaStreamTrack) => {
      if (!roomRef.current?.localParticipant) return;

      const publication = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
      if (publication && publication.track) {
        // Replace the track in the publication
        await (publication.track as LocalVideoTrack).replaceTrack(track);
      }
    },
    []
  );

  // Set preset layout
  const setPresetLayout = useCallback(async (name: string) => {
    setLayoutState((prev) =>
      prev ? { ...prev, preset_name: name } : null
    );
  }, []);

  // Update recording scene
  const updateRecordingScene = useCallback((scene: Scene) => {
    currentSceneRef.current = scene;
  }, []);

  // Start recording - WYSIWYG compositing for mixed type
  const startRecording = useCallback(
    async (type: 'mixed' | 'iso' = 'mixed', stageElement?: HTMLDivElement | null) => {
      if (activeRecordings.includes(type)) return;

      let streamToRecord: MediaStream | null = null;
      recordedChunksRef.current.set(type, []);

      if (type === 'mixed' && stageElement) {
        // WYSIWYG Recording - Composite the stage element to canvas
        stageElementRef.current = stageElement;

        // Create compositing canvas at 1920x1080
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('Failed to create canvas context');
          return;
        }
        compositeCanvasRef.current = canvas;
        compositeCtxRef.current = ctx;

        // Get stage dimensions for scaling
        const stageRect = stageElement.getBoundingClientRect();
        const scaleX = canvas.width / stageRect.width;
        const scaleY = canvas.height / stageRect.height;

        // Compositing loop
        const compositeFrame = () => {
          if (!compositeCtxRef.current || !stageElementRef.current) return;
          const ctx = compositeCtxRef.current;
          const stage = stageElementRef.current;

          // Clear canvas with stage background
          const stageBg = window.getComputedStyle(stage).backgroundColor;
          ctx.fillStyle = stageBg || '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Draw all video elements from the stage
          const videos = stage.querySelectorAll('video');
          videos.forEach((video) => {
            if (video.readyState >= 2) { // HAVE_CURRENT_DATA
              const rect = video.getBoundingClientRect();
              const stageRect = stage.getBoundingClientRect();

              // Calculate position relative to stage
              const x = (rect.left - stageRect.left) * scaleX;
              const y = (rect.top - stageRect.top) * scaleY;
              const w = rect.width * scaleX;
              const h = rect.height * scaleY;

              // Get transform for mirroring
              const transform = window.getComputedStyle(video).transform;
              const isMirrored = transform.includes('-1');

              ctx.save();
              if (isMirrored) {
                ctx.translate(x + w, y);
                ctx.scale(-1, 1);
                ctx.drawImage(video, 0, 0, w, h);
              } else {
                ctx.drawImage(video, x, y, w, h);
              }
              ctx.restore();
            }
          });

          // Draw overlay elements (text, images) - simplified
          const overlays = stage.querySelectorAll('[data-overlay="true"]');
          overlays.forEach((overlay) => {
            const rect = overlay.getBoundingClientRect();
            const stageRect = stage.getBoundingClientRect();
            const x = (rect.left - stageRect.left) * scaleX;
            const y = (rect.top - stageRect.top) * scaleY;

            if (overlay.tagName === 'IMG') {
              ctx.drawImage(overlay as HTMLImageElement, x, y, rect.width * scaleX, rect.height * scaleY);
            }
          });

          // Continue loop
          compositeAnimationRef.current = requestAnimationFrame(compositeFrame);
        };

        // Start compositing
        compositeAnimationRef.current = requestAnimationFrame(compositeFrame);

        // Create stream from canvas
        const canvasStream = canvas.captureStream(30);

        // Add all audio tracks
        const audioStream = new MediaStream();
        if (localStream) {
          localStream.getAudioTracks().forEach((t) => audioStream.addTrack(t.clone()));
        }
        Object.values(remoteStreams).forEach((rs) => {
          rs.getAudioTracks().forEach((t) => audioStream.addTrack(t.clone()));
        });

        // Combine canvas video with audio
        const combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioStream.getAudioTracks(),
        ]);

        streamToRecord = combinedStream;
        console.log('[Recording] Starting WYSIWYG composited recording');
      } else if (type === 'mixed') {
        // Fallback: simple mixed recording (local video + all audio)
        const stream = new MediaStream();
        if (localStream) {
          localStream.getVideoTracks().forEach((t) => stream.addTrack(t.clone()));
          localStream.getAudioTracks().forEach((t) => stream.addTrack(t.clone()));
        }
        Object.values(remoteStreams).forEach((rs) => {
          rs.getAudioTracks().forEach((t) => stream.addTrack(t.clone()));
        });
        streamToRecord = stream;
        console.log('[Recording] Starting fallback mixed recording (no stage element)');
      } else {
        // ISO recording
        streamToRecord = screenStream || localStream;
      }

      if (!streamToRecord) {
        console.error(`No stream available for ${type} recording`);
        return;
      }

      const mimeType =
        ['video/webm; codecs=vp9', 'video/webm', 'video/mp4'].find((t) =>
          MediaRecorder.isTypeSupported(t)
        ) || '';

      try {
        const recorder = new MediaRecorder(streamToRecord, {
          mimeType,
          videoBitsPerSecond: 8000000, // Increased for WYSIWYG quality
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            const chunks = recordedChunksRef.current.get(type) || [];
            chunks.push(e.data);
            recordedChunksRef.current.set(type, chunks);
          }
        };

        recorder.onstop = () => {
          // Stop compositing animation if running
          if (compositeAnimationRef.current) {
            cancelAnimationFrame(compositeAnimationRef.current);
            compositeAnimationRef.current = null;
          }
          compositeCanvasRef.current = null;
          compositeCtxRef.current = null;
          stageElementRef.current = null;

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
              URL.revokeObjectURL(url);
              document.body.removeChild(a);
            }, 100);
          }
          recordedChunksRef.current.set(type, []);
        };

        recorder.start(1000);
        mediaRecordersRef.current.set(type, recorder);
        setActiveRecordings((prev) => [...prev, type]);
        setPausedRecordings((prev) => prev.filter((t) => t !== type));
      } catch (e) {
        console.error(`Failed to start ${type} recording`, e);
      }
    },
    [activeRecordings, localStream, remoteStreams, screenStream]
  );

  // Stop recording
  const stopRecording = useCallback((type?: string) => {
    const recType = type as 'mixed' | 'iso' | undefined;
    if (recType) {
      const recorder = mediaRecordersRef.current.get(recType);
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      mediaRecordersRef.current.delete(recType);
      setActiveRecordings((prev) => prev.filter((t) => t !== recType));
      setPausedRecordings((prev) => prev.filter((t) => t !== recType));
    } else {
      mediaRecordersRef.current.forEach((rec) => {
        if (rec.state !== 'inactive') rec.stop();
      });
      mediaRecordersRef.current.clear();
      setActiveRecordings([]);
      setPausedRecordings([]);
    }
  }, []);

  // Pause recording
  const pauseRecording = useCallback((type?: 'mixed' | 'iso') => {
    if (type) {
      const rec = mediaRecordersRef.current.get(type);
      if (rec && rec.state === 'recording') {
        rec.pause();
        setPausedRecordings((prev) => [...prev, type]);
      }
    }
  }, []);

  // Resume recording
  const resumeRecording = useCallback((type?: 'mixed' | 'iso') => {
    if (type) {
      const rec = mediaRecordersRef.current.get(type);
      if (rec && rec.state === 'paused') {
        rec.resume();
        setPausedRecordings((prev) => prev.filter((t) => t !== type));
      }
    }
  }, []);

  // Send chat message
  const sendChatMessage = useCallback(
    (text: string) => {
      if (!roomRef.current?.localParticipant) return;

      // Add to local chat
      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          senderId: 'local',
          senderName: 'You',
          text,
          timestamp: Date.now(),
        },
      ]);

      // Send via data channel
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ type: 'chat', message: text }));
      roomRef.current.localParticipant.publishData(data, { reliable: true });
    },
    []
  );

  // Stub functions for compatibility
  const muteParticipant = useCallback((id: string) => {
    setParticipants((p) =>
      p.map((x) =>
        x.id === id ? { ...x, media_state: { ...x.media_state, audio_enabled: false } } : x
      )
    );
  }, []);

  const unmuteParticipant = useCallback((id: string) => {
    setParticipants((p) =>
      p.map((x) =>
        x.id === id ? { ...x, media_state: { ...x.media_state, audio_enabled: true } } : x
      )
    );
  }, []);

  const stopParticipantVideo = useCallback((id: string) => {
    setParticipants((p) =>
      p.map((x) =>
        x.id === id ? { ...x, media_state: { ...x.media_state, video_enabled: false } } : x
      )
    );
  }, []);

  const startParticipantVideo = useCallback((id: string) => {
    setParticipants((p) =>
      p.map((x) =>
        x.id === id ? { ...x, media_state: { ...x.media_state, video_enabled: true } } : x
      )
    );
  }, []);

  const muteAllParticipants = useCallback(() => {
    setParticipants((p) =>
      p.map((x) => ({ ...x, media_state: { ...x.media_state, audio_enabled: false } }))
    );
    setGlobalMuteState(true);
  }, []);

  const unmuteAllParticipants = useCallback(() => {
    setParticipants((p) =>
      p.map((x) => ({ ...x, media_state: { ...x.media_state, audio_enabled: true } }))
    );
    setGlobalMuteState(false);
  }, []);

  const stopAllVideo = useCallback(() => {
    setParticipants((p) =>
      p.map((x) => ({ ...x, media_state: { ...x.media_state, video_enabled: false } }))
    );
    setGlobalVideoState(true);
  }, []);

  const allowAllVideo = useCallback(() => {
    setParticipants((p) =>
      p.map((x) => ({ ...x, media_state: { ...x.media_state, video_enabled: true } }))
    );
    setGlobalVideoState(false);
  }, []);

  const requestAllVideo = useCallback(() => {
    setParticipants((p) =>
      p.map((x) => ({ ...x, media_state: { ...x.media_state, video_enabled: true } }))
    );
  }, []);

  const toggleStageStatus = useCallback((id: string, on: boolean) => {
    setParticipants((p) => p.map((x) => (x.id === id ? { ...x, is_on_stage: on } : x)));
  }, []);

  const removeParticipant = useCallback((id: string) => {
    // Send kick notification to the participant before removing
    if (roomRef.current) {
      try {
        const kickMessage = {
          type: 'kick',
          targetId: id,
          timestamp: Date.now()
        };
        roomRef.current.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify(kickMessage)),
          { reliable: true }
        );
        console.log('[useAllstrmLiveKit] Kick message sent to:', id);
      } catch (err) {
        console.error('[useAllstrmLiveKit] Failed to send kick message:', err);
      }
    }
    setParticipants((p) => p.filter((x) => x.id !== id));
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    setChatMessages((p) => [
      ...p,
      {
        id: Date.now().toString(),
        senderId: 'local',
        senderName: 'You',
        text: `Reacted ${emoji}`,
        timestamp: Date.now(),
        isSystem: true,
      },
    ]);
  }, []);

  const toggleHandRaise = useCallback(() => {
    setChatMessages((p) => [
      ...p,
      {
        id: Date.now().toString(),
        senderId: 'local',
        senderName: 'You',
        text: 'Raised Hand ✋',
        timestamp: Date.now(),
        isSystem: true,
      },
    ]);
  }, []);

  // Fetch destinations from database on mount or userId change
  useEffect(() => {
    const fetchDestinations = async () => {
      const userId = options.initialConfig?.userId;
      if (!userId) return;

      try {
        const { destinations: dbDestinations } = await ApiClient.listDestinations(userId);
        setDestinations(dbDestinations);
        console.log('[useAllstrmLiveKit] Loaded destinations from DB:', dbDestinations.length);
      } catch (err) {
        console.error('[useAllstrmLiveKit] Failed to load destinations:', err);
      }
    };

    fetchDestinations();
  }, [options.initialConfig?.userId]);

  const startBroadcast = useCallback(async () => {
    if (!options.roomId) {
      console.warn('[useAllstrmLiveKit] Cannot start broadcast: no roomId');
      return;
    }

    // Use destinations from state (which are synced with DB)
    const enabledDests = destinations
      .filter((d) => d.enabled)
      .map((d) => ({
        rtmpUrl: d.url,
        streamKey: d.streamKey
      }));

    if (enabledDests.length === 0) {
      console.warn('[useAllstrmLiveKit] No enabled destinations found');
      return;
    }

    console.log('[useAllstrmLiveKit] Starting broadcast to', enabledDests.length, 'destinations');
    setBroadcastStatus('starting');

    try {
      const res = await fetch('/api/egress/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: options.roomId, destinations: enabledDests }),
      });
      const data = await res.json();

      if (data.success || data.egressIds) {
        egressIdsRef.current = data.egressIds || [];
        setBroadcastStatus('live');
        console.log('[useAllstrmLiveKit] Broadcast started, egress IDs:', egressIdsRef.current);

        // Update room status to 'live' in database
        try {
          await ApiClient.updateRoom(options.roomId, { status: 'live' });
        } catch (dbErr) {
          console.error('[useAllstrmLiveKit] Failed to update room status to live:', dbErr);
        }
      } else {
        setBroadcastStatus('error');
        console.error('[useAllstrmLiveKit] Broadcast failed:', data.error);
      }
    } catch (e) {
      console.error('[useAllstrmLiveKit] Broadcast start error:', e);
      setBroadcastStatus('error');
    }
  }, [options.roomId, destinations]);

  const stopBroadcast = useCallback(async () => {
    console.log('[useAllstrmLiveKit] Stopping broadcast, egress IDs:', egressIdsRef.current);
    setBroadcastStatus('stopping');

    for (const egressId of egressIdsRef.current) {
      try {
        await fetch('/api/egress/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ egressId }),
        });
        console.log('[useAllstrmLiveKit] Stopped egress:', egressId);
      } catch (e) {
        console.error('[useAllstrmLiveKit] Stop egress error:', e);
      }
    }

    egressIdsRef.current = [];
    setBroadcastStatus('idle');

    // Update room status to 'idle' in database
    try {
      await ApiClient.updateRoom(options.roomId, { status: 'idle' });
    } catch (dbErr) {
      console.error('[useAllstrmLiveKit] Failed to update room status to idle:', dbErr);
    }
  }, [options.roomId]);

  const addDestination = useCallback(async (d: Omit<Destination, 'id' | 'enabled' | 'status'>) => {
    const userId = options.initialConfig?.userId;
    if (!userId) {
      console.error('[useAllstrmLiveKit] Cannot add destination: no userId');
      return;
    }

    try {
      const newDest = await ApiClient.createDestination({
        ...d,
        user_id: userId,
        room_id: options.roomId,
        rtmp_url: d.url || '',
        stream_key: d.streamKey || '',
      });
      setDestinations((p) => [...p, newDest]);
    } catch (err) {
      console.error('[useAllstrmLiveKit] Failed to add destination:', err);
    }
  }, [options.initialConfig?.userId, options.roomId]);

  const removeDestination = useCallback(async (id: string) => {
    try {
      await ApiClient.deleteDestination(id);
      setDestinations((p) => p.filter((d) => d.id !== id));
    } catch (err) {
      console.error('[useAllstrmLiveKit] Failed to remove destination:', err);
    }
  }, []);

  const toggleDestination = useCallback(async (id: string, enabled?: boolean) => {
    const dest = destinations.find(d => d.id === id);
    if (!dest) return;

    const newEnabled = enabled ?? !dest.enabled;
    try {
      await ApiClient.toggleDestination(id, newEnabled);
      setDestinations((p) =>
        p.map((d) => (d.id === id ? { ...d, enabled: newEnabled } : d))
      );
    } catch (err) {
      console.error('[useAllstrmLiveKit] Failed to toggle destination:', err);
    }
  }, [destinations]);

  const admitParticipant = useCallback(async (id: string) => {
    console.log('[useAllstrmLiveKit] Admitting participant:', id);

    // Add to admitted set
    setAdmittedParticipants((prev) => new Set([...prev, id]));

    // Send admission message to the participant via LiveKit data channel
    if (roomRef.current) {
      const room = roomRef.current;

      console.log('[useAllstrmLiveKit] Room state:', {
        localIdentity: room.localParticipant?.identity,
        remoteParticipantCount: room.remoteParticipants.size,
        remoteIdentities: Array.from(room.remoteParticipants.values()).map(p => p.identity),
      });

      // Find the participant by identity (remoteParticipants is a Map keyed by SID, so we need to iterate)
      let targetParticipant: RemoteParticipant | undefined;
      room.remoteParticipants.forEach((participant) => {
        if (participant.identity === id) {
          targetParticipant = participant;
        }
      });

      if (targetParticipant) {
        const admissionMessage = {
          type: 'admission',
          admitted: true,
          admittedBy: room.localParticipant?.identity,
          timestamp: Date.now(),
        };

        console.log('[useAllstrmLiveKit] Sending admission message:', {
          message: admissionMessage,
          targetIdentity: targetParticipant.identity,
          targetSid: targetParticipant.sid,
        });

        try {
          // Send reliable data to the specific participant
          await room.localParticipant.publishData(
            new TextEncoder().encode(JSON.stringify(admissionMessage)),
            { reliable: true, destinationIdentities: [targetParticipant.identity] }
          );
          console.log('[useAllstrmLiveKit] Admission message sent to:', id);
        } catch (err) {
          console.error('[useAllstrmLiveKit] Failed to send admission message:', err);
        }
      } else {
        console.warn('[useAllstrmLiveKit] Could not find participant to admit:', id, 'Available:', Array.from(room.remoteParticipants.values()).map(p => p.identity));
      }
    } else {
      console.error('[useAllstrmLiveKit] No room reference available');
    }

    // NOTE: Don't call updateParticipants() here - the useEffect below handles it
    // after admittedParticipants state actually updates
  }, []);

  // Effect to update participants when admittedParticipants changes (fixes closure issue)
  useEffect(() => {
    // Keep ref in sync with state to avoid stale closures
    admittedParticipantsRef.current = admittedParticipants;
    if (roomRef.current) {
      updateParticipants();
    }
  }, [admittedParticipants, updateParticipants])

  // Send data message to all participants (for stage sync, chat, etc.)
  const sendDataMessage = useCallback(async (message: Record<string, unknown>) => {
    if (!roomRef.current) {
      console.warn('[useAllstrmLiveKit] Cannot send data message - no room');
      return;
    }
    try {
      await roomRef.current.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(message)),
        { reliable: true }
      );
      console.log('[useAllstrmLiveKit] Data message sent:', message.type);
    } catch (err) {
      console.error('[useAllstrmLiveKit] Failed to send data message:', err);
    }
  }, []);

  const startFilePresentation = useCallback(async (file: File) => {
    console.log('[useAllstrmLiveKit] Starting file presentation:', file.name);

    try {
      // Parse the file
      const result = await parsePresentation(file);

      if (result.error || result.slides.length === 0) {
        console.error('[useAllstrmLiveKit] Failed to parse file:', result.error);
        setError(`Failed to parse presentation: ${result.error || 'No slides found'}`);
        return;
      }

      console.log('[useAllstrmLiveKit] Parsed', result.totalSlides, 'slides');

      // Stop any existing presentation
      if (presentationStreamRef.current) {
        presentationStreamRef.current.stop();
      }

      // Create new presentation stream
      const presenter = new PresentationStream();
      await presenter.loadSlides(result.slides);
      presentationStreamRef.current = presenter;

      // Get the stream
      const stream = presenter.getStream();

      // Update state
      setPresentationState({
        currentSlide: 1,
        totalSlides: result.totalSlides,
        isPresentingFile: true,
      });

      // Publish as screen share
      if (roomRef.current) {
        const room = roomRef.current;
        const videoTrack = stream.getVideoTracks()[0];

        if (videoTrack) {
          await room.localParticipant.publishTrack(videoTrack, {
            name: 'presentation',
            source: Track.Source.ScreenShare,
          });
          setScreenStream(stream);
          console.log('[useAllstrmLiveKit] Presentation published successfully');
        }
      } else {
        // Not connected to room, just set screen stream for preview
        setScreenStream(stream);
      }

    } catch (err) {
      console.error('[useAllstrmLiveKit] File presentation error:', err);
      setError(`Presentation error: ${err}`);
    }
  }, []);

  const stopFilePresentation = useCallback(() => {
    if (presentationStreamRef.current) {
      presentationStreamRef.current.stop();
      presentationStreamRef.current = null;
    }
    setPresentationState({ currentSlide: 0, totalSlides: 0, isPresentingFile: false });
    stopScreenShare();
  }, [stopScreenShare]);

  const nextSlide = useCallback(async () => {
    if (presentationStreamRef.current) {
      const newSlide = await presentationStreamRef.current.nextSlide();
      setPresentationState((p) => ({ ...p, currentSlide: newSlide }));
    }
  }, []);

  const prevSlide = useCallback(async () => {
    if (presentationStreamRef.current) {
      const newSlide = await presentationStreamRef.current.prevSlide();
      setPresentationState((p) => ({ ...p, currentSlide: newSlide }));
    }
  }, []);

  const setMixerLayout = useCallback((layout: 'grid' | 'speaker', focusId?: string) => {
    // Layout is managed by the UI, this is just a notification
    console.log('[useAllstrmLiveKit] Mixer layout:', layout, focusId);
  }, []);

  // Stubs for unused functions
  const updateLayout = useCallback(async () => { }, []);
  const prepareCamera = useCallback(async () => { }, []);
  const switchDevice = useCallback(async () => { }, []);
  const updateVideoConfig = useCallback(async () => { }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Filter out local participant from returned list (handled separately in UI)
  const filteredParticipants = useMemo(
    () => participants.filter((p) => p.id !== 'local'),
    [participants]
  );

  return useMemo(
    () => ({
      isConnected,
      isConnecting,
      error,
      participants: filteredParticipants,
      myParticipantId,
      mySourceId: myParticipantId,
      layoutState,
      localStream,
      remoteStreams,
      screenStream,
      connect,
      disconnect,
      toggleVideo,
      toggleAudio,
      startScreenShare,
      stopScreenShare,
      updateLayout,
      setPresetLayout,
      muteParticipant,
      muteAllParticipants,
      unmuteAllParticipants,
      unmuteParticipant,
      stopParticipantVideo,
      startParticipantVideo,
      stopAllVideo,
      allowAllVideo,
      requestAllVideo,
      startRecording,
      stopRecording,
      pauseRecording,
      resumeRecording,
      prepareCamera,
      switchDevice,
      updateVideoConfig,
      replaceVideoTrack,
      toggleStageStatus,
      removeParticipant,
      sendReaction,
      toggleHandRaise,
      broadcastStatus,
      destinations,
      startBroadcast,
      stopBroadcast,
      addDestination,
      removeDestination,
      toggleDestination,
      chatMessages,
      sendChatMessage,
      admitParticipant,
      startFilePresentation,
      stopFilePresentation,
      nextSlide,
      prevSlide,
      presentationState,
      globalMuteState,
      globalVideoState,
      activeRecordings,
      pausedRecordings,
      setMixerLayout,
      updateRecordingScene,
      isLocalInWaitingRoom,
      isRoomRecording,
      sendDataMessage,
      receivedStageState,
      stageStateVersion,
      receivedPermissions,
      wasKicked,
      sessionEnded,
    }),
    [
      isConnected,
      isConnecting,
      error,
      filteredParticipants,
      myParticipantId,
      layoutState,
      localStream,
      remoteStreams,
      screenStream,
      connect,
      disconnect,
      toggleVideo,
      toggleAudio,
      startScreenShare,
      stopScreenShare,
      setPresetLayout,
      muteParticipant,
      muteAllParticipants,
      unmuteAllParticipants,
      unmuteParticipant,
      stopParticipantVideo,
      startParticipantVideo,
      stopAllVideo,
      allowAllVideo,
      requestAllVideo,
      startRecording,
      stopRecording,
      pauseRecording,
      resumeRecording,
      replaceVideoTrack,
      toggleStageStatus,
      removeParticipant,
      sendReaction,
      toggleHandRaise,
      broadcastStatus,
      destinations,
      startBroadcast,
      stopBroadcast,
      addDestination,
      removeDestination,
      toggleDestination,
      chatMessages,
      sendChatMessage,
      admitParticipant,
      startFilePresentation,
      stopFilePresentation,
      nextSlide,
      prevSlide,
      presentationState,
      globalMuteState,
      globalVideoState,
      activeRecordings,
      pausedRecordings,
      setMixerLayout,
      updateRecordingScene,
      isLocalInWaitingRoom,
      isRoomRecording,
      sendDataMessage,
      receivedStageState,
      stageStateVersion,
      receivedPermissions,
      wasKicked,
      sessionEnded,
    ]
  );
}
