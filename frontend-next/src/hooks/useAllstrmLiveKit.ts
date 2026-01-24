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

/**
 * LiveKit-powered implementation of useAllstrm hook
 * Maintains the same interface as the original hook for backward compatibility
 */
export function useAllstrmLiveKit(options: UseAllstrmOptions): UseAllstrmReturn & {
  remoteStreams: Record<string, MediaStream>;
  unmuteAllParticipants: () => void;
  muteAllParticipants: () => void;
  stopAllVideo: () => void;
  allowAllVideo: () => void;
  requestAllVideo: () => void;
  unmuteParticipant: (id: string) => void;
  startParticipantVideo: (id: string) => void;
  startFilePresentation: (file: File) => void;
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
} {
  // LiveKit Room reference
  const roomRef = useRef<Room | null>(null);
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null);
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null);
  
  // Connection state refs to prevent race conditions
  const isConnectedRef = useRef(false);
  const isConnectingRef = useRef(false);
  const connectionAttemptRef = useRef(0);

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<AllstrmParticipant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
  const [layoutState, setLayoutState] = useState<LayoutState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [broadcastStatus, setBroadcastStatus] = useState<BroadcastStatus>('idle');
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [activeRecordings, setActiveRecordings] = useState<('mixed' | 'iso')[]>([]);
  const [pausedRecordings, setPausedRecordings] = useState<('mixed' | 'iso')[]>([]);
  const [globalMuteState, setGlobalMuteState] = useState(false);
  const [globalVideoState, setGlobalVideoState] = useState(false);
  const [isLocalInWaitingRoom, setIsLocalInWaitingRoom] = useState(false);
  const [presentationState, setPresentationState] = useState({
    currentSlide: 1,
    totalSlides: 1,
    isPresentingFile: false,
  });

  // Refs for recording
  const mediaRecordersRef = useRef<Map<string, MediaRecorder>>(new Map());
  const recordedChunksRef = useRef<Map<string, Blob[]>>(new Map());
  const currentSceneRef = useRef<Scene | null>(null);

  // Convert LiveKit participant to Allstrm participant format
  const convertParticipant = useCallback(
    (participant: Participant, isLocal: boolean = false): AllstrmParticipant => {
      const videoTrack = participant.getTrackPublication(Track.Source.Camera);
      const audioTrack = participant.getTrackPublication(Track.Source.Microphone);
      const screenTrack = participant.getTrackPublication(Track.Source.ScreenShare);

      let metadata: { role?: string; isHost?: boolean } = {};
      try {
        metadata = participant.metadata ? JSON.parse(participant.metadata) : {};
      } catch {
        metadata = {};
      }

      return {
        id: isLocal ? 'local' : participant.identity,
        room_id: options.roomId,
        display_name: participant.name || participant.identity || 'Anonymous',
        role: (metadata.role as AllstrmParticipant['role']) || (metadata.isHost ? 'host' : 'guest'),
        ingest_type: 'webrtc',
        media_state: {
          video_enabled: videoTrack?.isEnabled ?? false,
          audio_enabled: audioTrack?.isEnabled ?? false,
          screen_sharing: screenTrack?.isEnabled ?? false,
          connection_quality: participant.connectionQuality || 'good',
        },
        is_on_stage: true,
        is_in_waiting_room: false,
      };
    },
    [options.roomId]
  );

  // Update participants list from room
  const updateParticipants = useCallback(() => {
    if (!roomRef.current) return;

    const room = roomRef.current;
    const allParticipants: AllstrmParticipant[] = [];

    // Add local participant
    if (room.localParticipant) {
      allParticipants.push(convertParticipant(room.localParticipant, true));
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

    roomRef.current.remoteParticipants.forEach((participant) => {
      const stream = new MediaStream();

      participant.trackPublications.forEach((publication) => {
        if (publication.track && publication.isSubscribed) {
          stream.addTrack(publication.track.mediaStreamTrack);
        }
      });

      if (stream.getTracks().length > 0) {
        streams[participant.identity] = stream;
      }
    });

    setRemoteStreams(streams);
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
      return {
        token: data.token,
        serverUrl: data.serverUrl || process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880',
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
      // Fetch token
      const tokenData = await fetchToken();
      
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
        updateParticipants();
        updateRemoteStreams();

        // Create local stream from local tracks
        if (room.localParticipant) {
          const stream = new MediaStream();
          room.localParticipant.trackPublications.forEach((pub) => {
            if (pub.track) {
              stream.addTrack(pub.track.mediaStreamTrack);
            }
          });
          if (stream.getTracks().length > 0) {
            setLocalStream(stream);
          }
        }
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        console.log('[useAllstrmLiveKit] Disconnected from room:', reason);
        isConnectedRef.current = false;
        isConnectingRef.current = false;
        setIsConnected(false);
        setIsConnecting(false);
        setParticipants([]);
        setRemoteStreams({});
      });

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        console.log('[useAllstrmLiveKit] Participant connected:', participant.identity);
        updateParticipants();
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        console.log('[useAllstrmLiveKit] Participant disconnected:', participant.identity);
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
            if (pub.track) {
              stream.addTrack(pub.track.mediaStreamTrack);
            }
          });
          if (stream.getTracks().length > 0) {
            setLocalStream(stream);
          }
        }
        updateParticipants();
      });

      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
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
        } catch {
          // Ignore non-JSON messages
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
    
    // Reset connection state refs
    isConnectedRef.current = false;
    isConnectingRef.current = false;
    connectionAttemptRef.current++;
    
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
  }, []);

  // Toggle local video
  const toggleVideo = useCallback(async () => {
    if (!roomRef.current?.localParticipant) return;
    const enabled = roomRef.current.localParticipant.isCameraEnabled;
    await roomRef.current.localParticipant.setCameraEnabled(!enabled);
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

  // Start recording
  const startRecording = useCallback(
    async (type: 'mixed' | 'iso' = 'mixed') => {
      if (activeRecordings.includes(type)) return;

      let streamToRecord: MediaStream | null = null;
      recordedChunksRef.current.set(type, []);

      if (type === 'mixed') {
        // For mixed, we'd ideally use a server-side egress
        // For now, record the local stream + remote audio mixed
        const stream = new MediaStream();

        // Add local video
        if (localStream) {
          localStream.getVideoTracks().forEach((t) => stream.addTrack(t.clone()));
        }

        // Add all audio tracks
        if (localStream) {
          localStream.getAudioTracks().forEach((t) => stream.addTrack(t.clone()));
        }
        Object.values(remoteStreams).forEach((rs) => {
          rs.getAudioTracks().forEach((t) => stream.addTrack(t.clone()));
        });

        streamToRecord = stream;
      } else {
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
          videoBitsPerSecond: 5000000,
        });

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

  const startBroadcast = useCallback(async () => {
    setBroadcastStatus('starting');
    // TODO: Implement LiveKit egress for broadcasting
    setTimeout(() => setBroadcastStatus('live'), 1000);
  }, []);

  const stopBroadcast = useCallback(async () => {
    setBroadcastStatus('stopping');
    setTimeout(() => setBroadcastStatus('idle'), 1000);
  }, []);

  const addDestination = useCallback(async (d: Omit<Destination, 'id' | 'enabled' | 'status'>) => {
    setDestinations((p) => [...p, { ...d, id: `dest-${Date.now()}`, enabled: true, status: 'idle' }]);
  }, []);

  const removeDestination = useCallback(async (id: string) => {
    setDestinations((p) => p.filter((d) => d.id !== id));
  }, []);

  const toggleDestination = useCallback(async (id: string, enabled?: boolean) => {
    setDestinations((p) =>
      p.map((d) => (d.id === id ? { ...d, enabled: enabled ?? !d.enabled } : d))
    );
  }, []);

  const admitParticipant = useCallback(async (id: string) => {
    setParticipants((p) => p.map((x) => (x.id === id ? { ...x, is_in_waiting_room: false } : x)));
  }, []);

  const startFilePresentation = useCallback(async (file: File) => {
    console.log('[useAllstrmLiveKit] File presentation not yet implemented:', file.name);
    // TODO: Implement file presentation via canvas -> screen share
  }, []);

  const nextSlide = useCallback(() => {
    setPresentationState((p) => ({
      ...p,
      currentSlide: Math.min(p.currentSlide + 1, p.totalSlides),
    }));
  }, []);

  const prevSlide = useCallback(() => {
    setPresentationState((p) => ({
      ...p,
      currentSlide: Math.max(p.currentSlide - 1, 1),
    }));
  }, []);

  const setMixerLayout = useCallback((layout: 'grid' | 'speaker', focusId?: string) => {
    // Layout is managed by the UI, this is just a notification
    console.log('[useAllstrmLiveKit] Mixer layout:', layout, focusId);
  }, []);

  // Stubs for unused functions
  const updateLayout = useCallback(async () => {}, []);
  const prepareCamera = useCallback(async () => {}, []);
  const switchDevice = useCallback(async () => {}, []);
  const updateVideoConfig = useCallback(async () => {}, []);

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
    ]
  );
}
