'use client';

import React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Meeting } from '@/components/Meeting/Meeting';
import { useAuth } from '@/contexts/AuthContext';
import { StudioConfiguration, Tier } from '@/types';

/**
 * Meeting page that supports BOTH:
 * 1. Token-based access (EWY users) — via ?token= query param
 * 2. Supabase auth access (native allstrm users)
 */
export default function MeetingPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { isAuthenticated, isLoading, tier, user, hasAnotherTab, canTakeAccess, takeAccess } = useAuth();
    const roomId = params.roomId as string;

    // Check for token-based access (EWY integration)
    const tokenParam = searchParams.get('token');
    const isTokenBased = !!tokenParam;

    // Diagnostic: Track re-renders of the page - MUST be before any early returns
    const pageRenderCount = React.useRef(0);
    pageRenderCount.current++;

    // For token-based access, extract name from token metadata or use search params
    const nameFromParam = searchParams.get('name');
    const displayName = isTokenBased
        ? (nameFromParam || 'Participant')
        : (user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Guest');
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
        },
        // Pass the pre-generated token so useAllstrm uses it directly
        ...(isTokenBased && tokenParam ? { preGeneratedToken: tokenParam } : {}),
    }), [roomId, displayName, tier, role, isTokenBased, tokenParam]);

    const handleLeave = React.useCallback(() => {
        if (isTokenBased) {
            // For EWY users, close the tab or show a "meeting ended" screen
            window.close();
            // If window.close() doesn't work (popup blocker), show ended state
        } else {
            router.push('/dashboard');
        }
    }, [router, isTokenBased]);

    // Only enforce auth for non-token-based access
    React.useEffect(() => {
        if (isTokenBased) return; // Skip auth check for token-based access
        console.log("meeting page auth check", { isLoading, isAuthenticated, hasAnotherTab });
        if (!isLoading && !isAuthenticated) {
            router.push('/login');
        }
    }, [isAuthenticated, isLoading, router, hasAnotherTab, isTokenBased]);

    React.useEffect(() => {
        console.log('[MeetingPage] Config created:', { role: config.role, roomId: config.roomId, isTokenBased });
    }, [config, isTokenBased]);

    console.log(`[MeetingPage] RENDER #${pageRenderCount.current}`, { user_id: user?.id, hasAnotherTab, isTokenBased });

    if (hasAnotherTab && !isTokenBased) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-black text-white p-6">
                <div className="max-w-md text-center">
                    <h1 className="text-2xl font-bold mb-4">
                        {canTakeAccess ? 'Meeting already active' : 'Session Moved'}
                    </h1>
                    <p className="text-gray-400 mb-6 font-sans">
                        {canTakeAccess 
                            ? 'You already have this meeting open in another tab. Please use that tab or close it to continue here.'
                            : 'This session is now active in another tab. Please use that tab or close this one.'}
                    </p>
                    <div className="flex gap-4 justify-center">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-bold transition-colors"
                        >
                            Back to Dashboard
                        </button>
                        {canTakeAccess && (
                            <button
                                onClick={takeAccess}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-bold transition-colors"
                            >
                                Join anyway
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // For token-based access, skip auth loading gates
    if (isTokenBased) {
        return <Meeting key={`${config.roomId}-${config.role}`} config={config} onLeave={handleLeave} />;
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

    return <Meeting key={`${config.roomId}-${config.role}`} config={config} onLeave={handleLeave} />;
}
