'use client';


import { useState, useCallback, useEffect } from 'react';
import { SignalClient } from '@/lib/engines/SignalClient';
import { WEBSOCKET_URL } from '@/lib/constants';
import { CueState } from '../components/GreenRoom/CueSystem';

export interface BackstageState {
    isConnected: boolean;
    isReady: boolean;
    cueState: CueState;
    latency: number;
}

export function useBackstage(participantId: string, token: string) {
    const [client] = useState(() => new SignalClient(WEBSOCKET_URL));
    const [state, setState] = useState<BackstageState>({
        isConnected: false,
        isReady: false,
        cueState: 'idle',
        latency: 0
    });

    useEffect(() => {
        // Initialize S1 Connection
        client.connect(token).then(() => {
            setState(s => ({ ...s, isConnected: true }));
        }).catch(err => {
            console.error("[Backstage] Connection failed", err);
        });

        // Listen for Cues
        client.on('MEDIA_STATE_UPDATE', (payload: any) => {
            if (payload.cue) {
                setState(s => ({ ...s, cueState: payload.cue }));
            }
        });

        return () => client.disconnect();
    }, [client, token]);

    const toggleReady = useCallback(() => {
        const newReadyState = !state.isReady;
        setState(s => ({ ...s, isReady: newReadyState }));
        client.send('PARTICIPANT_UPDATE', { 
            id: participantId, 
            ready: newReadyState 
        });
    }, [client, state.isReady, participantId]);

    const sendReaction = useCallback((emoji: string) => {
        client.send('PARTICIPANT_UPDATE', { reaction: emoji });
    }, [client]);

    return {
        ...state,
        toggleReady,
        sendReaction
    };
}
