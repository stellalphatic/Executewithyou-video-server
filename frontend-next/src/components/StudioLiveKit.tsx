'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  ControlBar,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
  useParticipants,
  GridLayout,
  ParticipantTile,
  LayoutContextProvider,
  RoomName,
  ConnectionState,
  useConnectionState,
  usePinnedTracks,
  FocusLayout,
  CarouselLayout,
  FocusLayoutContainer,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, ConnectionState as LKConnectionState } from 'livekit-client';

interface StudioLiveKitProps {
  roomId: string;
  displayName: string;
  role: 'host' | 'co-host' | 'guest' | 'viewer';
  userId: string;
  onConnectionChange?: (connected: boolean) => void;
}

export function StudioLiveKit({
  roomId,
  displayName,
  role,
  userId,
  onConnectionChange,
}: StudioLiveKitProps) {
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch LiveKit token
  useEffect(() => {
    let isMounted = true;

    async function fetchToken() {
      try {
        setIsLoading(true);
        setError(null);

        const res = await fetch(`/api/rooms/${roomId}/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName, role, userId }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to get token (${res.status})`);
        }

        const data = await res.json();
        
        if (!isMounted) return;

        if (!data.token) {
          throw new Error('No token received from server');
        }

        setToken(data.token);
        setServerUrl(data.serverUrl || process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880');
      } catch (err) {
        if (!isMounted) return;
        console.error('[StudioLiveKit] Token fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchToken();

    return () => {
      isMounted = false;
    };
  }, [roomId, displayName, role, userId]);

  // Handle connection state changes
  const handleConnected = useCallback(() => {
    console.log('[StudioLiveKit] Connected to room');
    onConnectionChange?.(true);
  }, [onConnectionChange]);

  const handleDisconnected = useCallback(() => {
    console.log('[StudioLiveKit] Disconnected from room');
    onConnectionChange?.(false);
  }, [onConnectionChange]);

  const handleError = useCallback((err: Error) => {
    console.error('[StudioLiveKit] Room error:', err);
    setError(err.message);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Connecting to room...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center max-w-md px-4">
          <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Connection Error</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Missing token/server
  if (!token || !serverUrl) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-gray-400">Unable to connect. Please try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect={true}
      video={role !== 'viewer'}
      audio={role !== 'viewer'}
      onConnected={handleConnected}
      onDisconnected={handleDisconnected}
      onError={handleError}
      data-lk-theme="default"
      className="h-screen"
      style={{ 
        '--lk-bg': '#111827',
        '--lk-bg2': '#1f2937',
      } as React.CSSProperties}
    >
      <StudioLayout role={role} roomId={roomId} />
    </LiveKitRoom>
  );
}

interface StudioLayoutProps {
  role: string;
  roomId: string;
}

function StudioLayout({ role, roomId }: StudioLayoutProps) {
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const [isStreaming, setIsStreaming] = useState(false);
  const [egressId, setEgressId] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  const isHost = role === 'host' || role === 'co-host';
  const isConnected = connectionState === LKConnectionState.Connected;

  // Start streaming
  const startStreaming = useCallback(async () => {
    try {
      setStreamError(null);
      const res = await fetch('/api/egress/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          destinationIds: [],
          recordingEnabled: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start streaming');
      }

      const data = await res.json();
      setEgressId(data.egressId);
      setIsStreaming(true);
    } catch (err) {
      console.error('[StudioLayout] Start streaming error:', err);
      setStreamError(err instanceof Error ? err.message : 'Failed to start streaming');
    }
  }, [roomId]);

  // Stop streaming
  const stopStreaming = useCallback(async () => {
    if (!egressId) return;

    try {
      setStreamError(null);
      const res = await fetch('/api/egress/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ egressId, roomId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to stop streaming');
      }

      setEgressId(null);
      setIsStreaming(false);
    } catch (err) {
      console.error('[StudioLayout] Stop streaming error:', err);
      setStreamError(err instanceof Error ? err.message : 'Failed to stop streaming');
    }
  }, [egressId, roomId]);

  // Show connecting state
  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">
            {connectionState === LKConnectionState.Connecting ? 'Connecting...' : 'Reconnecting...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <LayoutContextProvider>
      <div className="flex flex-col h-full bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-white">
              Studio
            </h1>
            <span className="px-2 py-1 text-xs bg-gray-700 rounded text-gray-300">
              {participants.length} participant{participants.length !== 1 ? 's' : ''}
            </span>
            <span className="px-2 py-1 text-xs bg-green-600/20 text-green-400 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              Connected
            </span>
          </div>

          {isHost && (
            <div className="flex items-center gap-3">
              {streamError && (
                <span className="text-xs text-red-400">{streamError}</span>
              )}
              {isStreaming ? (
                <button
                  onClick={stopStreaming}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  Stop Streaming
                </button>
              ) : (
                <button
                  onClick={startStreaming}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  Go Live
                </button>
              )}
            </div>
          )}
        </div>

        {/* Video Grid */}
        <div className="flex-1 p-4">
          <VideoGrid role={role} />
        </div>

        {/* Control Bar */}
        <ControlBar
          variation="minimal"
          controls={{
            camera: role !== 'viewer',
            microphone: role !== 'viewer',
            screenShare: isHost,
            leave: true,
            chat: true,
            settings: true,
          }}
        />
      </div>
    </LayoutContextProvider>
  );
}

interface VideoGridProps {
  role: string;
}

function VideoGrid({ role }: VideoGridProps) {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  const screenShareTracks = tracks.filter(
    (track) => track.source === Track.Source.ScreenShare
  );

  // If someone is screen sharing, use focus layout
  if (screenShareTracks.length > 0) {
    return (
      <FocusLayoutContainer className="h-full">
        <FocusLayout trackRef={screenShareTracks[0]} />
        <CarouselLayout
          tracks={tracks.filter((t) => t.source !== Track.Source.ScreenShare)}
        >
          <ParticipantTile />
        </CarouselLayout>
      </FocusLayoutContainer>
    );
  }

  // Otherwise use grid layout
  return (
    <GridLayout tracks={tracks} className="h-full">
      <ParticipantTile />
    </GridLayout>
  );
}

export default StudioLiveKit;
