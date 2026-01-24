'use client';

/**
 * StudioContextMenu Component - Right-click context menu for participants
 */

import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  UserMinus,
  UserPlus,
  Minimize,
  Maximize,
  Trash2,
  StopCircle,
} from 'lucide-react';
import { useStudioStore } from '@/stores/studioStore';
import { Participant } from '@/types';

interface ContextMenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}

function ContextMenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
  title,
}: ContextMenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium transition-colors text-left group
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-app-bg'}
        ${danger ? 'text-red-500 hover:bg-red-500/10' : 'text-content-high'}
      `}
    >
      {React.isValidElement(icon)
        ? React.cloneElement(icon as React.ReactElement<any>, {
            className:
              'w-4 h-4 text-content-medium group-hover:text-current transition-colors',
          })
        : icon}
      <span>{label}</span>
    </button>
  );
}

interface StudioContextMenuProps {
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onStopScreenShare: () => void;
  onMuteParticipant: (id: string) => void;
  onStopParticipantVideo: (id: string) => void;
  onKickParticipant: (id: string) => void;
}

export function StudioContextMenu({
  onToggleAudio,
  onToggleVideo,
  onStopScreenShare,
  onMuteParticipant,
  onStopParticipantVideo,
  onKickParticipant,
}: StudioContextMenuProps) {
  const contextMenu = useStudioStore((s) => s.contextMenu);
  const closeContextMenu = useStudioStore((s) => s.closeContextMenu);
  const onStageParticipants = useStudioStore((s) => s.onStageParticipants);
  const participants = useStudioStore((s) => s.participants);
  const audioEnabled = useStudioStore((s) => s.audioEnabled);
  const videoEnabled = useStudioStore((s) => s.videoEnabled);
  const addToStage = useStudioStore((s) => s.addToStage);
  const removeFromStage = useStudioStore((s) => s.removeFromStage);
  const setViewPreference = useStudioStore((s) => s.setViewPreference);

  if (!contextMenu) return null;

  const { x, y, participantId } = contextMenu;
  const isLocal = participantId === 'local';
  const isScreen = participantId === 'screen';
  const isOnStage = onStageParticipants.some((p) => p.id === participantId);

  const target: Participant | undefined = isLocal
    ? (onStageParticipants.find((p) => p.id === 'local') as Participant)
    : participants.find((p) => p.id === participantId);

  const handleAction = (action: string) => {
    switch (action) {
      case 'mute':
        if (isLocal) {
          onToggleAudio();
        } else {
          onMuteParticipant(participantId);
        }
        break;
      case 'video':
        if (isLocal) {
          onToggleVideo();
        } else {
          onStopParticipantVideo(participantId);
        }
        break;
      case 'stage':
        if (isOnStage) {
          removeFromStage(participantId);
        } else {
          const result = addToStage(participantId);
          if (!result.success && result.error) {
            alert(result.error);
          }
        }
        break;
      case 'kick':
        if (!isLocal) {
          onKickParticipant(participantId);
        }
        break;
      case 'fit':
        setViewPreference(participantId, { fit: 'contain' });
        break;
      case 'fill':
        setViewPreference(participantId, { fit: 'cover' });
        break;
      case 'stop_presenting':
        onStopScreenShare();
        break;
    }
    closeContextMenu();
  };

  return (
    <div
      className="fixed z-50 bg-app-surface border border-app-border rounded-lg shadow-2xl py-1 w-48 animate-scale-in origin-top-left overflow-hidden"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isScreen ? (
        <>
          <div className="px-3 py-1.5 text-[10px] font-bold text-content-low uppercase tracking-wider border-b border-app-border/50 mb-1 bg-app-bg/50">
            Presentation Control
          </div>
          <ContextMenuItem
            icon={<StopCircle />}
            label="Stop Presenting"
            danger
            onClick={() => handleAction('stop_presenting')}
          />
          <div className="h-px bg-app-border/50 my-1" />
          <ContextMenuItem
            icon={<Minimize />}
            label="Fit to Screen"
            onClick={() => handleAction('fit')}
          />
          <ContextMenuItem
            icon={<Maximize />}
            label="Fill Frame"
            onClick={() => handleAction('fill')}
          />
        </>
      ) : (
        <>
          <div className="px-3 py-1.5 text-[10px] font-bold text-content-low uppercase tracking-wider border-b border-app-border/50 mb-1 bg-app-bg/50">
            Manage Guest
          </div>

          <ContextMenuItem
            icon={
              isLocal
                ? audioEnabled
                  ? <Mic />
                  : <MicOff />
                : target?.media_state.audio_enabled
                ? <Mic />
                : <MicOff />
            }
            label={
              isLocal
                ? audioEnabled
                  ? 'Mute'
                  : 'Unmute'
                : target?.media_state.audio_enabled
                ? 'Mute Participant'
                : 'Unmute Participant'
            }
            onClick={() => handleAction('mute')}
          />

          <ContextMenuItem
            icon={
              isLocal
                ? videoEnabled
                  ? <Video />
                  : <VideoOff />
                : target?.media_state.video_enabled
                ? <Video />
                : <VideoOff />
            }
            label={
              isLocal
                ? videoEnabled
                  ? 'Stop Cam'
                  : 'Start Cam'
                : target?.media_state.video_enabled
                ? 'Stop Video'
                : 'Start Video'
            }
            onClick={() => handleAction('video')}
          />

          <ContextMenuItem
            icon={isOnStage ? <UserMinus /> : <UserPlus />}
            label={isOnStage ? 'Remove from Stage' : 'Add to Stage'}
            onClick={() => handleAction('stage')}
          />

          <div className="px-3 py-1.5 text-[10px] font-bold text-content-low uppercase tracking-wider border-b border-app-border/50 border-t mt-1 mb-1 bg-app-bg/50">
            View Mode
          </div>

          <ContextMenuItem
            icon={<Minimize />}
            label="Fit to Screen"
            onClick={() => handleAction('fit')}
          />

          <ContextMenuItem
            icon={<Maximize />}
            label="Fill Frame"
            onClick={() => handleAction('fill')}
          />

          {!isLocal && (
            <>
              <div className="h-px bg-app-border/50 my-1" />
              <ContextMenuItem
                icon={<Trash2 />}
                label="Kick Guest"
                danger
                onClick={() => handleAction('kick')}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
