'use client';

/**
 * StudioHeader Component - Top bar with recording status, destinations, and broadcast controls
 */

import React from 'react';
import { ChevronDown, CircleDot } from 'lucide-react';
import { Button } from '@/components/Button';
import { useStudioStore, selectIsRecording, selectActiveScene } from '@/stores/studioStore';
import { BroadcastStatus } from '@/types';

interface StudioHeaderProps {
  broadcastStatus: BroadcastStatus;
  onOpenDestinations: () => void;
  onToggleBroadcast: () => void;
}

export function StudioHeader({
  broadcastStatus,
  onOpenDestinations,
  onToggleBroadcast,
}: StudioHeaderProps) {
  const activeScene = useStudioStore(selectActiveScene);
  const recording = useStudioStore((s) => s.recording);
  const isRecording = useStudioStore(selectIsRecording);
  const isRecordingMenuOpen = useStudioStore((s) => s.isRecordingMenuOpen);
  const setRecordingMenuOpen = useStudioStore((s) => s.setRecordingMenuOpen);
  const startRecording = useStudioStore((s) => s.startRecording);
  const stopRecording = useStudioStore((s) => s.stopRecording);
  const pauseRecording = useStudioStore((s) => s.pauseRecording);
  const resumeRecording = useStudioStore((s) => s.resumeRecording);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const recColor = recording.activeTypes.includes('mixed')
    ? 'border-red-500 text-red-500 bg-red-500/10'
    : recording.activeTypes.length > 0
    ? 'border-amber-500 text-amber-500 bg-amber-500/10'
    : 'border-app-border text-content-medium bg-app-bg';

  const recLabel =
    recording.activeTypes.length === 2
      ? 'REC ALL'
      : recording.activeTypes.includes('mixed')
      ? 'REC PGM'
      : recording.activeTypes.includes('iso')
      ? 'REC ISO'
      : 'REC';

  const handleStartProgram = () => {
    const result = startRecording('mixed');
    if (!result.success && result.error) {
      alert(result.error);
    }
  };

  const handleStopProgram = () => stopRecording('mixed');
  const handlePauseProgram = () => pauseRecording('mixed');
  const handleResumeProgram = () => resumeRecording('mixed');

  return (
    <header className="h-14 px-6 bg-app-surface border-b border-app-border flex items-center justify-between shrink-0 relative z-50">
      {/* Scene indicator */}
      <div className="flex items-center gap-2 text-sm font-medium text-content-medium">
        <ChevronDown className="w-4 h-4" />
        <span className="text-content-high font-semibold">
          {activeScene?.name || 'Current Scene'}
        </span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Recording dropdown */}
        <div className="relative">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg cursor-pointer transition-all ${recColor} hover:border-content-low`}
            onClick={(e) => {
              e.stopPropagation();
              setRecordingMenuOpen(!isRecordingMenuOpen);
            }}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isRecording ? 'bg-current animate-pulse' : 'bg-content-low'
              }`}
            />
            <span className="text-[9px] font-bold uppercase w-14 text-center">
              {isRecording ? formatTime(recording.duration) : recLabel}
            </span>
            <ChevronDown className="w-3 h-3" />
          </div>

          {isRecordingMenuOpen && (
            <div
              className="absolute top-full mt-2 right-0 w-64 bg-app-surface border border-app-border rounded-xl shadow-2xl overflow-hidden z-50 animate-scale-in origin-top-right"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-3 border-b border-app-border/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CircleDot className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-content-high">
                      PROGRAM
                    </span>
                  </div>
                  {recording.program === 'recording' && (
                    <span className="text-[10px] font-mono text-red-500 animate-pulse">
                      LIVE
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {recording.program === 'idle' ? (
                    <Button
                      size="sm"
                      className="w-full h-8 text-[10px]"
                      onClick={handleStartProgram}
                    >
                      START RECORDING
                    </Button>
                  ) : (
                    <>
                      <button
                        className="flex-1 bg-app-bg border border-app-border rounded hover:bg-app-surface text-[10px] font-bold py-2"
                        onClick={
                          recording.program === 'recording'
                            ? handlePauseProgram
                            : handleResumeProgram
                        }
                      >
                        {recording.program === 'paused' ? 'RESUME' : 'PAUSE'}
                      </button>
                      <button
                        className="flex-1 bg-red-500 text-white rounded hover:bg-red-600 text-[10px] font-bold py-2"
                        onClick={handleStopProgram}
                      >
                        STOP
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-app-border mx-2" />

        <Button variant="secondary" size="sm" onClick={onOpenDestinations}>
          Destinations
        </Button>

        <Button
          variant={broadcastStatus === 'live' ? 'danger' : 'primary'}
          size="sm"
          onClick={onToggleBroadcast}
          className={broadcastStatus === 'live' ? 'bg-red-600' : 'bg-indigo-600'}
        >
          {broadcastStatus === 'live' ? 'End Broadcast' : 'Go Live'}
        </Button>
      </div>
    </header>
  );
}
