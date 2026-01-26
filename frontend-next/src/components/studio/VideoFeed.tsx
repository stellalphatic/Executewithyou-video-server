'use client';

/**
 * VideoFeed Component - Renders a participant's video with proper styling
 */

import React, { useEffect, useRef } from 'react';
import { Participant } from '@/types';

interface VideoFeedProps {
  participant: Participant;
  stream: MediaStream | null;
  isLocal: boolean;
  minimal?: boolean;
  objectFit?: 'contain' | 'cover';
  objectPosition?: string;
  zoom?: number;
  className?: string;
}

export function VideoFeed({
  participant,
  stream,
  isLocal,
  minimal = false,
  objectFit = 'cover',
  objectPosition = 'center',
  zoom = 1,
  className = '',
}: VideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
    } else if (videoRef.current && !stream) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  const initials = participant.display_name
    ? participant.display_name.substring(0, 2).toUpperCase()
    : '??';

  const isScreen = participant.id === 'screen';
  const isVideoVisible =
    (participant.media_state.video_enabled || isScreen) &&
    (stream || (!isLocal && !isScreen));

  return (
    <div
      className={`w-full h-full bg-gray-900 relative flex items-center justify-center overflow-hidden ${className}`}
    >
      {isVideoVisible && stream ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full"
          style={{
            objectFit,
            objectPosition,
            transform: isLocal && !isScreen ? `scale(${zoom}) scaleX(-1)` : `scale(${zoom})`,
            transition: 'transform 0.1s ease-out',
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg ${
              minimal ? 'w-8 h-8 text-xs' : 'w-20 h-20 text-2xl'
            }`}
          >
            {initials}
          </div>
        </div>
      )}
    </div>
  );
}
