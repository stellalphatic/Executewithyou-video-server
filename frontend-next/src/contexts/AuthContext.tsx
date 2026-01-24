'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/constants';
import { User, Session } from '@supabase/supabase-js';
import { Tier } from '@/types';

// Generate a unique tab ID for this browser tab
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

interface AuthState {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    tier: Tier;
    hasAnotherTab: boolean;
    canTakeAccess: boolean; // false if this tab was kicked out
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
    const [wasKickedOut, setWasKickedOut] = useState(false); // Track if this tab was kicked
    const activeTabIdRef = useRef<string | null>(null);
    const channelRef = useRef<BroadcastChannel | null>(null);

    // Single session detection via BroadcastChannel
    useEffect(() => {
        if (!user) return;
        
        const channel = new BroadcastChannel('allstrm_auth_session');
        channelRef.current = channel;

        const handleMessage = (event: MessageEvent) => {
            if (event.data.userId !== user.id) return;

            console.log(`[Tab ${TAB_ID.slice(-6)}] Received:`, event.data.type, 'from', event.data.tabId?.slice(-6));

            if (event.data.type === 'CHECK_TABS') {
                // Another tab is checking - respond with our status
                // Only respond if WE are the active tab
                if (activeTabIdRef.current === TAB_ID) {
                    channel.postMessage({ 
                        type: 'TAB_ACTIVE', 
                        userId: user.id, 
                        tabId: TAB_ID,
                        activeTabId: activeTabIdRef.current
                    });
                }
            } else if (event.data.type === 'TAB_ACTIVE') {
                // Another tab is active - we should show takeover UI
                // But only if we're not the active tab
                if (event.data.activeTabId && event.data.activeTabId !== TAB_ID) {
                    activeTabIdRef.current = event.data.activeTabId;
                    setHasAnotherTab(true);
                }
            } else if (event.data.type === 'SESSION_CLAIMED') {
                // Another tab claimed the session
                if (event.data.tabId !== TAB_ID) {
                    activeTabIdRef.current = event.data.tabId;
                    setHasAnotherTab(true);
                    setWasKickedOut(true); // Mark this tab as kicked - can't take back
                    console.log(`[Tab ${TAB_ID.slice(-6)}] Session claimed by ${event.data.tabId?.slice(-6)}, kicked out`);
                }
            }
        };

        channel.addEventListener('message', handleMessage);
        
        // On first load, try to become the active tab by checking if others exist
        console.log(`[Tab ${TAB_ID.slice(-6)}] Checking for other tabs...`);
        
        // Wait a tiny bit for other tabs to potentially respond
        const checkTimeout = setTimeout(() => {
            if (!activeTabIdRef.current) {
                // No other tab responded, we are the active tab
                activeTabIdRef.current = TAB_ID;
                console.log(`[Tab ${TAB_ID.slice(-6)}] No other tabs, becoming active`);
                setHasAnotherTab(false);
            }
        }, 150);
        
        channel.postMessage({ type: 'CHECK_TABS', userId: user.id, tabId: TAB_ID });

        return () => {
            clearTimeout(checkTimeout);
            channel.removeEventListener('message', handleMessage);
            channel.close();
            channelRef.current = null;
        };
    }, [user?.id]);

    const takeAccess = useCallback(() => {
        if (!user) return;
        console.log(`[Tab ${TAB_ID.slice(-6)}] Taking access, claiming session`);
        
        // Update our local state first
        activeTabIdRef.current = TAB_ID;
        setHasAnotherTab(false);
        
        // Then broadcast to other tabs
        if (channelRef.current) {
            channelRef.current.postMessage({ 
                type: 'SESSION_CLAIMED', 
                userId: user.id, 
                tabId: TAB_ID 
            });
        }
    }, [user]);

    useEffect(() => {
        console.log('%c[AuthContext] Provider MOUNTED', 'color: #7700ff; font-weight: bold');
    }, []);

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
        canTakeAccess: hasAnotherTab && !wasKickedOut, // Can only take access if not kicked
        tier,
        signIn,
        signUp,
        signOut,
        setTier,
        takeAccess,
    }), [user, session, isLoading, tier, hasAnotherTab, wasKickedOut, signIn, signUp, signOut, setTier, takeAccess]);

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
