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

    useEffect(() => {
        if (isLoading) return;

        if (isAuthenticated) {
            // Default to meeting mode for join links, preserving query params
            const queryString = searchParams.toString();
            const url = `/meeting/${roomId}${queryString ? `?${queryString}` : ''}`;
            router.push(url);
        } else {
            // Store the intended room in session storage and redirect to login
            if (typeof window !== 'undefined') {
                sessionStorage.setItem('pendingJoinRoom', roomId);
            }
            router.push('/login');
        }
    }, [isAuthenticated, isLoading, roomId, router]);

    return (
        <div className="flex h-screen w-full items-center justify-center bg-app-bg">
            <div className="text-center animate-fade-in">
                <div className="w-16 h-16 border-4 border-app-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-content-medium">Joining room...</p>
            </div>
        </div>
    );
}
