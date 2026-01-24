'use client';

/**
 * StudioControls Component - Bottom control bar with media controls
 */

import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Settings,
  LogOut,
  X,
  Monitor,
  FileText,
} from 'lucide-react';

interface ControlBtnProps {
  icon: React.ReactNode;
  label: string;
  isActiveState?: boolean;
  danger?: boolean;
  hotkey?: string;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function ControlBtn({
  icon,
  label,
  isActiveState,
  danger,
  hotkey,
  className = '',
  ...props
}: ControlBtnProps) {
  return (
    <div className="relative group">
      <button
        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 
        ${
          danger
            ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20'
            : isActiveState === false
            ? 'bg-red-500 text-white hover:bg-red-600 border border-transparent shadow-lg shadow-red-500/20'
            : 'bg-app-surface text-content-high hover:bg-indigo-500 hover:text-white border border-app-border hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20'
        } ${className}`}
        {...props}
      >
        {React.isValidElement(icon)
          ? React.cloneElement(icon as React.ReactElement<any>, { size: 20 })
          : icon}
      </button>
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
        {label}
        {hotkey && (
          <span className="ml-2 text-gray-400 text-[10px] uppercase">
            {hotkey}
          </span>
        )}
      </div>
    </div>
  );
}

interface StudioControlsProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenStream: MediaStream | null;
  shareMenuOpen: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleShareMenu: () => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onPresentFile: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
}

export function StudioControls({
  audioEnabled,
  videoEnabled,
  screenStream,
  shareMenuOpen,
  onToggleAudio,
  onToggleVideo,
  onToggleShareMenu,
  onStartScreenShare,
  onStopScreenShare,
  onPresentFile,
  onOpenSettings,
  onLeave,
}: StudioControlsProps) {
  return (
    <div className="h-16 bg-app-surface border-t border-app-border flex items-center px-6 justify-between shrink-0 z-30">
      <div className="w-40" />

      <div className="flex items-center gap-3">
        <ControlBtn
          icon={audioEnabled ? <Mic /> : <MicOff />}
          label={audioEnabled ? 'Mute' : 'Unmute'}
          isActiveState={audioEnabled}
          onClick={onToggleAudio}
          hotkey="Ctrl+D"
        />

        <ControlBtn
          icon={videoEnabled ? <Video /> : <VideoOff />}
          label={videoEnabled ? 'Stop Cam' : 'Start Cam'}
          isActiveState={videoEnabled}
          onClick={onToggleVideo}
          hotkey="Ctrl+E"
        />

        <div className="relative group">
          <ControlBtn
            icon={
              screenStream ? <X className="text-red-500" /> : <MonitorUp />
            }
            label={screenStream ? 'Stop Share' : 'Share'}
            isActiveState={true}
            onClick={() => {
              if (screenStream) {
                onStopScreenShare();
              } else {
                onToggleShareMenu();
              }
            }}
          />

          {shareMenuOpen && !screenStream && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-app-surface border border-app-border rounded-lg shadow-xl p-1 z-50 animate-scale-in w-40">
              <button
                onClick={() => {
                  onStartScreenShare();
                  onToggleShareMenu();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-app-bg rounded text-left whitespace-nowrap"
              >
                <Monitor className="w-4 h-4 text-indigo-500" /> Share Screen
              </button>
              <button
                onClick={onPresentFile}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-app-bg rounded text-left whitespace-nowrap"
              >
                <FileText className="w-4 h-4 text-emerald-500" /> Present File
              </button>
            </div>
          )}
        </div>

        <ControlBtn
          icon={<Settings />}
          label="Settings"
          onClick={onOpenSettings}
          hotkey="Ctrl+,"
        />

        <ControlBtn
          icon={<LogOut />}
          label="Leave"
          danger
          onClick={onLeave}
        />
      </div>

      <div className="w-40" />
    </div>
  );
}
