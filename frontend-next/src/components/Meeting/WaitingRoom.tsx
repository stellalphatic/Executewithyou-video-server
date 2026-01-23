'use client';


import React from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

interface WaitingRoomProps {
    meetingTitle: string;
    hostName: string;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({ meetingTitle, hostName }) => {
    return (
        <div className="flex h-screen w-full bg-[#1a1a1a] text-white items-center justify-center font-sans">
            <div className="text-center max-w-md p-8 animate-fade-in">
                
                <div className="mb-8 flex justify-center">
                    <div className="w-16 h-16 rounded-full bg-app-surface border border-gray-700 flex items-center justify-center relative">
                        <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
                        <ShieldCheck className="w-8 h-8 text-indigo-500" />
                    </div>
                </div>

                <h1 className="text-2xl font-bold mb-2">Please wait, the meeting host will let you in soon.</h1>
                
                <div className="mt-8 bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                    <h2 className="text-lg font-semibold text-white mb-1">{meetingTitle}</h2>
                    <p className="text-sm text-gray-400">Hosted by {hostName}</p>
                </div>

                <div className="mt-8 flex justify-center gap-4 text-xs text-gray-500">
                    <button className="hover:text-white transition-colors">Test Speaker and Microphone</button>
                </div>
            </div>
        </div>
    );
};
