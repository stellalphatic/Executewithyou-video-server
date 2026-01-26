'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Studio } from '@/components/Studio';
import { useAuth } from '@/contexts/AuthContext';
import { Share2 } from 'lucide-react';

interface StoredSetupConfig {
    displayName: string;
    audioDeviceId?: string;
    videoDeviceId?: string;
    resolution?: '720p' | '1080p' | '4k';
    frameRate?: 24 | 30 | 60;
    mode?: 'studio' | 'simple';
    visualConfig?: {
        mode: string;
        // other visual config options
    };
}

export default function StudioPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { isAuthenticated, isLoading, user, hasAnotherTab, canTakeAccess, takeAccess } = useAuth();
    const roomId = params.roomId as string;
    const [setupConfig, setSetupConfig] = useState<StoredSetupConfig | null>(null);
    
    // Determine role from query param - guests join via invite link
    const role = searchParams.get('role') === 'guest' ? 'guest' : 'host';

    // Load config from sessionStorage
    useEffect(() => {
        const storedConfig = sessionStorage.getItem('studioSetupConfig');
        if (storedConfig) {
            try {
                const parsed = JSON.parse(storedConfig) as StoredSetupConfig;
                setSetupConfig(parsed);
            } catch (e) {
                console.error('Failed to parse studio setup config:', e);
            }
        }
    }, []);

    useEffect(() => {
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
                        {canTakeAccess && (
                            <button
                                onClick={takeAccess}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                            >
                                Use Here
                            </button>
                        )}
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all border border-white/10"
                        >
                            Back to Dashboard
                        </button>
                        {!canTakeAccess && (
                            <p className="text-sm text-gray-500 mt-2">Session moved to another tab. Close this tab.</p>
                        )}
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

    const displayName = setupConfig?.displayName || user?.user_metadata?.display_name || user?.email?.split('@')[0] || (role === 'guest' ? 'Guest' : 'Host');
    
    // Default visual config
    const defaultVisualConfig: import('@/types').VisualConfigType = {
        skinEnhance: false,
        greenScreen: false,
        backgroundType: 'none',
        backgroundImage: '',
        blurAmount: 10,
        brightness: 100,
        contrast: 100,
        saturation: 100,
        keyThreshold: 0.4,
        keySmoothness: 0.1,
    };
    
    // Build configuration for Studio component
    const studioConfig: import('@/types').StudioConfiguration = {
        roomId,
        roomName: `Room ${roomId}`,
        displayName,
        role: role as import('@/types').ParticipantRole,
        tier: (user?.user_metadata?.tier || 'free') as import('@/types').Tier,
        audioEnabled: true,
        videoEnabled: true,
        audioDeviceId: setupConfig?.audioDeviceId || 'default',
        videoDeviceId: setupConfig?.videoDeviceId || 'default',
        resolution: (setupConfig?.resolution || '1080p') as '720p' | '1080p' | '4k' | '360p',
        frameRate: setupConfig?.frameRate || 30,
        mode: (setupConfig?.mode || 'studio') as import('@/types').RoomMode,
        visualConfig: defaultVisualConfig,
        userId: user?.id || 'anonymous',
    };
    
    return (
        <Studio
            config={studioConfig}
            onLeave={() => router.push('/dashboard')}
        />
    );
}
