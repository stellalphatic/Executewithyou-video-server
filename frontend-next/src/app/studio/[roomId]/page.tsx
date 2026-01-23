'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Studio } from '@/components/Studio';
import { useAuth } from '@/contexts/AuthContext';
import { StudioConfiguration, Tier } from '@/types';
import { Share2 } from 'lucide-react';

export default function StudioPage() {
    const params = useParams();
    const router = useRouter();
    const { isAuthenticated, isLoading, tier, user, hasAnotherTab, takeAccess } = useAuth();
    const roomId = params.roomId as string;

    React.useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push('/login');
        }
    }, [isAuthenticated, isLoading, router]);

    if (hasAnotherTab) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-[#0a0a0a] text-white p-6">
                <div className="max-w-md w-full text-center space-y-8 animate-scale-in">
                    <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto ring-1 ring-indigo-500/30">
                        <Share2 className="w-10 h-10 text-indigo-500" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2">Studio Open Elsewhere</h1>
                        <p className="text-gray-400 font-sans leading-relaxed">
                            You already have this workspace active in another tab.
                            To continue here, you'll need to claim the session.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={takeAccess}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                        >
                            Use Here
                        </button>
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all border border-white/10"
                        >
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-app-bg">
                <div className="text-content-medium">Loading...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Host';

    const config: StudioConfiguration = {
        roomId,
        roomName: `Studio ${roomId.slice(0, 8)}`,
        displayName,
        hostName: displayName,
        role: 'host',
        tier: tier || Tier.PRO,
        audioEnabled: true,
        videoEnabled: true,
        videoDeviceId: '',
        audioDeviceId: '',
        resolution: '720p',
        frameRate: 30,
        mode: 'studio',
        visualConfig: {
            skinEnhance: false,
            greenScreen: false,
            backgroundType: 'none',
            backgroundImage: '',
            blurAmount: 0,
            brightness: 0,
            contrast: 1,
            saturation: 1,
            keyThreshold: 0,
            keySmoothness: 0
        }
    };

    return <Studio config={config} onLeave={() => router.push('/dashboard')} />;
}
