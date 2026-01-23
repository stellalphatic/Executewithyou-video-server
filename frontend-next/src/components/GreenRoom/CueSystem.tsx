'use client';


import React from 'react';

export type CueState = 'idle' | 'ready' | 'standby' | 'live';

interface CueSystemProps {
    state: CueState;
    isReady: boolean;
    onToggleReady: () => void;
}

export const CueSystem: React.FC<CueSystemProps> = ({ state, isReady, onToggleReady }) => {
    return (
        <div className="flex items-center gap-2 w-full">
            {/* Ready Toggle */}
            <button 
                onClick={onToggleReady}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-all
                ${isReady 
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500' 
                    : 'bg-app-surface border-app-border text-content-medium hover:text-content-high'}`}
            >
                <div className={`w-2 h-2 rounded-full ${isReady ? 'bg-emerald-500' : 'bg-content-low'}`} />
                {isReady ? 'READY' : 'NOT READY'}
            </button>

            {/* Status Indicator */}
            {state !== 'idle' && (
                <div className={`px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border
                    ${state === 'live' ? 'bg-red-500/20 border-red-500/50 text-red-500 animate-pulse' : 
                      'bg-amber-500/20 border-amber-500/50 text-amber-500'}`}>
                    {state}
                </div>
            )}
        </div>
    );
};
