'use client';

/**
 * GuestPermissionsPanel - Host-configurable guest restrictions
 * 
 * Allows hosts to control what actions guests can perform in the studio:
 * - Toggle audio/video
 * - Share screen
 * - Send chat messages
 * - Raise hand
 * 
 * Changes apply to all guests in real-time.
 */

import React from 'react';
import {
  Mic,
  Video,
  Monitor,
  MessageSquare,
  Hand,
  Shield,
  Info,
} from 'lucide-react';
import { Participant, ParticipantRole } from '@/types';
import { GuestPermissionConfig, DEFAULT_GUEST_PERMISSIONS } from '@/utils/permissions';

interface PermissionToggleProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

function PermissionToggle({
  icon,
  label,
  description,
  enabled,
  onChange,
  disabled,
}: PermissionToggleProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
      <div className="text-zinc-400 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm text-white">{label}</span>
          <button
            onClick={() => !disabled && onChange(!enabled)}
            disabled={disabled}
            className={`
              relative w-10 h-5 rounded-full transition-colors
              ${enabled ? 'bg-green-600' : 'bg-zinc-600'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <span
              className={`
                absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform
                ${enabled ? 'translate-x-5' : 'translate-x-0.5'}
              `}
            />
          </button>
        </div>
        <p className="text-xs text-zinc-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

interface GuestPermissionsPanelProps {
  isHost?: boolean;
  participants?: Participant[];
  guestPermissions?: GuestPermissionConfig;
  onUpdatePermissions?: (permissions: Partial<GuestPermissionConfig>) => void;
  onMuteAllGuests?: () => void;
  onDisableAllGuestVideo?: () => void;
}

export function GuestPermissionsPanel({
  isHost = true,
  participants = [],
  guestPermissions = DEFAULT_GUEST_PERMISSIONS,
  onUpdatePermissions,
  onMuteAllGuests,
  onDisableAllGuestVideo,
}: GuestPermissionsPanelProps) {
  const guestCount = participants.filter((p) => p.role === 'guest').length;
  
  const handlePermissionChange = (key: keyof GuestPermissionConfig, value: boolean) => {
    onUpdatePermissions?.({ [key]: value });
  };

  if (!isHost) {
    return (
      <div className="p-4 text-center text-zinc-400">
        <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Only hosts can manage guest permissions</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Guest Permissions
        </h3>
        <span className="text-xs text-zinc-500">
          {guestCount} guest{guestCount !== 1 ? 's' : ''} in studio
        </span>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-2 p-2 rounded bg-blue-500/10 border border-blue-500/20">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-300">
          These settings control what actions guests can perform. Changes apply immediately to all guests.
        </p>
      </div>

      {/* Permission Toggles */}
      <div className="space-y-2">
        <PermissionToggle
          icon={<Mic className="w-4 h-4" />}
          label="Toggle Microphone"
          description="Allow guests to mute/unmute their own microphone"
          enabled={guestPermissions.canToggleAudio}
          onChange={(enabled) => handlePermissionChange('canToggleAudio', enabled)}
        />

        <PermissionToggle
          icon={<Video className="w-4 h-4" />}
          label="Toggle Camera"
          description="Allow guests to turn their camera on/off"
          enabled={guestPermissions.canToggleVideo}
          onChange={(enabled) => handlePermissionChange('canToggleVideo', enabled)}
        />

        <PermissionToggle
          icon={<Monitor className="w-4 h-4" />}
          label="Share Screen"
          description="Allow guests to share their screen (use with caution)"
          enabled={guestPermissions.canShareScreen}
          onChange={(enabled) => handlePermissionChange('canShareScreen', enabled)}
        />

        <PermissionToggle
          icon={<MessageSquare className="w-4 h-4" />}
          label="Send Chat Messages"
          description="Allow guests to send messages in the studio chat"
          enabled={guestPermissions.canSendChat}
          onChange={(enabled) => handlePermissionChange('canSendChat', enabled)}
        />

        <PermissionToggle
          icon={<Hand className="w-4 h-4" />}
          label="Raise Hand"
          description="Allow guests to raise their hand to get attention"
          enabled={guestPermissions.canRaiseHand}
          onChange={(enabled) => handlePermissionChange('canRaiseHand', enabled)}
        />
      </div>

      {/* Quick Actions */}
      <div className="pt-2 border-t border-zinc-700 space-y-2">
        <p className="text-xs text-zinc-500 mb-2">Quick Presets</p>
        <div className="flex gap-2">
          <button
            onClick={() =>
              onUpdatePermissions?.({
                canToggleAudio: true,
                canToggleVideo: true,
                canShareScreen: true,
                canSendChat: true,
                canRaiseHand: true,
              })
            }
            className="flex-1 px-3 py-1.5 text-xs rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
          >
            Allow All
          </button>
          <button
            onClick={() =>
              onUpdatePermissions?.({
                canToggleAudio: true,
                canToggleVideo: true,
                canShareScreen: false,
                canSendChat: true,
                canRaiseHand: true,
              })
            }
            className="flex-1 px-3 py-1.5 text-xs rounded bg-zinc-600/20 text-zinc-300 hover:bg-zinc-600/30 transition-colors"
          >
            Standard
          </button>
          <button
            onClick={() =>
              onUpdatePermissions?.({
                canToggleAudio: false,
                canToggleVideo: false,
                canShareScreen: false,
                canSendChat: false,
                canRaiseHand: true,
              })
            }
            className="flex-1 px-3 py-1.5 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
          >
            Restrictive
          </button>
        </div>
      </div>

      {/* Host Actions for All Guests */}
      <div className="pt-2 border-t border-zinc-700">
        <p className="text-xs text-zinc-500 mb-2">Bulk Actions</p>
        <div className="flex gap-2">
          <button
            onClick={onMuteAllGuests}
            className="flex-1 px-3 py-1.5 text-xs rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors flex items-center justify-center gap-1"
          >
            <Mic className="w-3 h-3" />
            Mute All Guests
          </button>
          <button
            onClick={onDisableAllGuestVideo}
            className="flex-1 px-3 py-1.5 text-xs rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors flex items-center justify-center gap-1"
          >
            <Video className="w-3 h-3" />
            Disable All Video
          </button>
        </div>
      </div>
    </div>
  );
}
