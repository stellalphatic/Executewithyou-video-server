'use client';


import React, { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';

export const Preloader: React.FC = () => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 100);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="fixed inset-0 z-[9999] bg-app-bg flex flex-col items-center justify-center overflow-hidden">
            <div className={`flex flex-col items-center transition-all duration-1000 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                {/* Minimalist Logo Construction */}
                <div className="relative mb-8">
                    <div className="w-16 h-16 bg-app-surface border border-app-border rounded-2xl flex items-center justify-center shadow-2xl relative z-10 ring-1 ring-white/5">
                        <Radio className="w-8 h-8 text-indigo-500" />
                    </div>
                    {/* Soft ambient glow */}
                    <div className="absolute inset-0 bg-indigo-500/30 blur-2xl rounded-full scale-150 animate-pulse-slow" />
                </div>

                {/* Typography & Progress */}
                <div className="flex flex-col items-center gap-4">
                    <h1 className="text-lg font-medium text-content-high tracking-tight font-sans">
                        ALLSTRM
                    </h1>
                    
                    {/* Sleek Progress Line */}
                    <div className="h-[2px] w-24 bg-app-surface rounded-full overflow-hidden relative">
                        <div className="absolute inset-0 bg-indigo-500/50 animate-[loading_1.5s_ease-in-out_infinite]" />
                    </div>
                    
                    <span className="text-[10px] text-content-medium font-mono uppercase tracking-widest opacity-60">
                        Initializing Workspace
                    </span>
                </div>
            </div>

            <style>{`
                @keyframes loading {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(0%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>
        </div>
    );
};
