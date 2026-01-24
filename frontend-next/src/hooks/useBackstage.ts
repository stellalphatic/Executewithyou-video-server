'use client';

import { useState, useCallback, useEffect } from 'react';
import { CueState } from '../components/GreenRoom/CueSystem';

export interface BackstageState {
    isConnected: boolean;
    isReady: boolean;
    cueState: CueState;
    latency: number;
}

/**
 * Backstage hook - provides green room functionality
 * Now uses local state instead of the old SignalClient
 * LiveKit handles the actual WebRTC connection
 */
export function useBackstage(participantId: string, _token?: string) {
    const [state, setState] = useState<BackstageState>({
        isConnected: true, // Always "connected" in LiveKit mode
        isReady: false,
        cueState: 'idle',
        latency: 0
    });

    // Simulate connection success immediately
    useEffect(() => {
        console.log('[Backstage] LiveKit mode - participant:', participantId);
        setState(s => ({ ...s, isConnected: true }));
    }, [participantId]);

    const toggleReady = useCallback(() => {
        setState(s => ({ ...s, isReady: !s.isReady }));
    }, []);

    const sendReaction = useCallback((emoji: string) => {
        console.log('[Backstage] Reaction:', emoji);
        // In LiveKit mode, reactions are sent via data channel in useAllstrmLiveKit
    }, []);

    const setCue = useCallback((cue: CueState) => {
        setState(s => ({ ...s, cueState: cue }));
    }, []);

    return {
        ...state,
        toggleReady,
        sendReaction,
        setCue
    };
}
