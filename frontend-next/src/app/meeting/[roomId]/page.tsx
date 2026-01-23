'use client';

import React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Meeting } from '@/components/Meeting/Meeting';
import { useAuth } from '@/contexts/AuthContext';
import { StudioConfiguration, Tier } from '@/types';

export default function MeetingPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { isAuthenticated, isLoading, tier, user, hasAnotherTab, takeAccess } = useAuth();
    const roomId = params.roomId as string;

    React.useEffect(() => {
        console.log("meeting page auth check", { isLoading, isAuthenticated, hasAnotherTab });
        if (!isLoading && !isAuthenticated) {
            router.push('/login');
        }
    }, [isAuthenticated, isLoading, router]);

    const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Guest';
    const role = searchParams.get('role') === 'guest' ? 'guest' : 'host';

    const config = React.useMemo<StudioConfiguration>(() => ({
        roomId,
        roomName: `Meeting ${roomId.slice(0, 8)}`,
        displayName,
        hostName: displayName,
        role: role as 'host' | 'guest',
        tier: tier || Tier.PRO,
        audioEnabled: true,
        videoEnabled: true,
        videoDeviceId: '',
        audioDeviceId: '',
        resolution: '720p',
        frameRate: 30,
        mode: 'meeting',
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
    }), [roomId, displayName, tier, role]);

    React.useEffect(() => {
        console.log('[MeetingPage] Config created:', { role: config.role, roomId: config.roomId });
    }, [config]);

    const handleLeave = React.useCallback(() => {
        router.push('/dashboard');
    }, [router]);

    if (hasAnotherTab) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-black text-white p-6">
                <div className="max-w-md text-center">
                    <h1 className="text-2xl font-bold mb-4">Meeting already active</h1>
                    <p className="text-gray-400 mb-6 font-sans">You already have this meeting open in another tab. Please use that tab or close it to continue here.</p>
                    <div className="flex gap-4 justify-center">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-bold transition-colors"
                        >
                            Back to Dashboard
                        </button>
                        <button
                            onClick={takeAccess}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-bold transition-colors"
                        >
                            Join anyway
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isLoading && !user) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-app-bg">
                <div className="text-content-medium">Loading...</div>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    // Diagnostic: Track re-renders of the page
    const pageRenderCount = React.useRef(0);
    pageRenderCount.current++;
    console.log(`[MeetingPage] RENDER #${pageRenderCount.current} body`, { user_id: user.id });

    return <Meeting key={`${config.roomId}-${config.role}`} config={config} onLeave={handleLeave} />;
}
