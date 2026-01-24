'use client';

/**
 * SessionTakeoverModal Component - Shown when another tab takes over the session
 */

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/Button';

interface SessionTakeoverModalProps {
  onReconnect: () => void;
  onLeave: () => void;
}

export function SessionTakeoverModal({
  onReconnect,
  onLeave,
}: SessionTakeoverModalProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-app-surface border border-app-border rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-scale-in">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-amber-500" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-content-high text-center mb-2">
          Session Active in Another Tab
        </h2>

        <p className="text-content-medium text-center mb-6">
          Your streaming session has been opened in another browser tab. Only
          one active session is allowed at a time to ensure stream stability.
        </p>

        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            className="w-full flex items-center justify-center gap-2"
            onClick={onReconnect}
          >
            <RefreshCw className="w-4 h-4" />
            Use This Tab Instead
          </Button>

          <Button
            variant="secondary"
            className="w-full"
            onClick={onLeave}
          >
            Leave Studio
          </Button>
        </div>

        <p className="text-xs text-content-low text-center mt-4">
          This is similar to how WhatsApp Web handles multiple tabs - only one
          can be active at a time.
        </p>
      </div>
    </div>
  );
}
