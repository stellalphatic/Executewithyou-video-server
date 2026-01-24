'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function JoinRoomPage() {
    const params = useParams();
    const router = useRouter();
    const { isAuthenticated, isLoading } = useAuth();
    const searchParams = useSearchParams();
    const roomId = params.roomId as string;
    
    // Get mode from query param - defaults to 'meeting' for backward compatibility
    const mode = searchParams.get('mode') || 'meeting';

    useEffect(() => {
        if (isLoading) return;

        if (isAuthenticated) {
            // Build new query params without 'mode' (it's in the path now)
            const newParams = new URLSearchParams(searchParams.toString());
            newParams.delete('mode');
            // Add role=guest for studio joins (guests joining host's studio)
            if (mode === 'studio') {
                newParams.set('role', 'guest');
            }
            const queryString = newParams.toString();
            
            // Route to the appropriate mode
            const basePath = mode === 'studio' ? '/studio' : '/meeting';
            const url = `${basePath}/${roomId}${queryString ? `?${queryString}` : ''}`;
            router.push(url);
        } else {
            // Store the intended room and mode in session storage and redirect to login
            if (typeof window !== 'undefined') {
                sessionStorage.setItem('pendingJoinRoom', roomId);
                sessionStorage.setItem('pendingJoinMode', mode);
            }
            router.push('/login');
        }
    }, [isAuthenticated, isLoading, roomId, router, mode, searchParams]);

    return (
        <div className="flex h-screen w-full items-center justify-center bg-app-bg">
            <div className="text-center animate-fade-in">
                <div className="w-16 h-16 border-4 border-app-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-content-medium">
                    {mode === 'studio' ? 'Joining studio...' : 'Joining meeting...'}
                </p>
            </div>
        </div>
    );
}
