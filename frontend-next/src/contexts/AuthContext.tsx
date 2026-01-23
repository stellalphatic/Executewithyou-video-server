'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/constants';
import { User, Session } from '@supabase/supabase-js';
import { Tier } from '@/types';

interface AuthState {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    tier: Tier;
    hasAnotherTab: boolean;
}

interface AuthContextType extends AuthState {
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
    setTier: (tier: Tier) => void;
    takeAccess: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [tier, setTier] = useState<Tier>(Tier.PRO); // Default to Pro for demo

    const [hasAnotherTab, setHasAnotherTab] = useState(false);
    const renderCount = useRef(0);
    renderCount.current++;

    // Single session detection via BroadcastChannel
    useEffect(() => {
        if (!user) return;
        const channel = new BroadcastChannel('allstrm_auth_session');

        const checkOtherTabs = () => {
            channel.postMessage({ type: 'CHECK_TABS', userId: user.id });
        };

        const handleMessage = (event: MessageEvent) => {
            if (event.data.userId !== user.id) return;

            if (event.data.type === 'CHECK_TABS' && !hasAnotherTab) {
                channel.postMessage({ type: 'TAB_ACTIVE', userId: user.id });
            } else if (event.data.type === 'TAB_ACTIVE') {
                setHasAnotherTab(true);
            } else if (event.data.type === 'SESSION_CLAIMED') {
                setHasAnotherTab(true);
            }
        };

        channel.addEventListener('message', handleMessage);
        checkOtherTabs();

        return () => {
            channel.removeEventListener('message', handleMessage);
            channel.close();
        };
    }, [user?.id, hasAnotherTab]);

    const takeAccess = useCallback(() => {
        if (!user) return;
        console.log('[AuthContext] Taking access, claiming session');
        const channel = new BroadcastChannel('allstrm_auth_session');
        channel.postMessage({ type: 'SESSION_CLAIMED', userId: user.id });
        setHasAnotherTab(false);
        // We stay active, others will see SESSION_CLAIMED and set hasAnotherTab to true
        setTimeout(() => channel.close(), 100);
    }, [user?.id]);

    useEffect(() => {
        console.log('%c[AuthContext] Provider MOUNTED', 'color: #7700ff; font-weight: bold');
    }, []);
    console.log(`%c[AuthContext] Render #${renderCount.current}`, 'color: #bbbbbb');

    // Initialize auth state from Supabase
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                // Get current session
                const { data: { session: currentSession } } = await supabase.auth.getSession();

                if (currentSession) {
                    console.log('[AuthContext] Initial session found:', currentSession.user.id);
                    setSession(currentSession);
                    setUser(currentSession.user);
                } else {
                    console.log('[AuthContext] No initial session found');
                }
            } catch (error) {
                console.error('[AuthContext] Failed to initialize auth:', error);
            } finally {
                setIsLoading(false);
            }
        };

        initializeAuth();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, newSession) => {
                console.log('[AuthContext] Auth state changed:', event);

                if (newSession) {
                    console.log('[AuthContext] Setting session for user:', newSession.user.id);
                    setSession(newSession);
                    setUser(newSession.user);
                } else {
                    console.log('[AuthContext] Clearing session');
                    setSession(null);
                    setUser(null);
                }

                setIsLoading(false);
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                return { error };
            }

            if (data.session) {
                setSession(data.session);
                setUser(data.session.user);
            }

            return { error: null };
        } catch (error) {
            return { error: error as Error };
        }
    }, []);

    const signUp = useCallback(async (email: string, password: string) => {
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) {
                return { error };
            }

            if (data.session) {
                setSession(data.session);
                setUser(data.session.user);
            }

            return { error: null };
        } catch (error) {
            return { error: error as Error };
        }
    }, []);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
    }, []);

    const value = React.useMemo(() => ({
        user,
        session,
        isLoading,
        isAuthenticated: !!session && !!user,
        hasAnotherTab,
        tier,
        signIn,
        signUp,
        signOut,
        setTier,
        takeAccess,
    }), [user, session, isLoading, tier, hasAnotherTab, signIn, signUp, signOut, setTier, takeAccess]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
