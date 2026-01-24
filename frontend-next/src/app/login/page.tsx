'use client';

import React, { useState } from 'react';
import { ArrowRight, Scissors } from 'lucide-react';
import { Button } from '@/components/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
    const router = useRouter();
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const { error: authError } = await signIn(email, password);

            if (authError) {
                setError(authError.message);
                setIsLoading(false);
                return;
            }

            // Check if there's a pending room to join
            const pendingRoom = sessionStorage.getItem('pendingJoinRoom');
            const pendingMode = sessionStorage.getItem('pendingJoinMode') || 'meeting';
            
            if (pendingRoom) {
                // Clear the pending join data
                sessionStorage.removeItem('pendingJoinRoom');
                sessionStorage.removeItem('pendingJoinMode');
                // Redirect to the join page which will route to the correct mode
                router.push(`/join/${pendingRoom}?mode=${pendingMode}`);
            } else {
                // Redirect to dashboard on success
                router.push('/dashboard');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-app-bg flex items-center justify-center relative overflow-hidden font-sans">
            {/* Ambient Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-app-accent/10 via-app-bg to-app-bg" />
            </div>

            <div className="w-full max-w-md bg-app-surface border border-app-border rounded-3xl p-8 md:p-10 shadow-2xl relative z-10 animate-scale-in">

                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-app-bg rounded-xl flex items-center justify-center mx-auto mb-6 border border-app-border shadow-sm">
                        <Scissors className="w-6 h-6 text-app-accent" />
                    </div>
                    <h2 className="text-2xl font-bold text-content-high mb-2">Welcome back</h2>
                    <p className="text-content-medium text-sm">Enter your credentials to access the workspace.</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-content-medium mb-1.5 uppercase tracking-wide">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3 text-content-high focus:outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent transition-all placeholder-content-low"
                            placeholder="name@company.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-content-medium mb-1.5 uppercase tracking-wide">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3 text-content-high focus:outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent transition-all placeholder-content-low"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <Button type="submit" size="lg" className="w-full h-12 bg-content-high text-app-bg hover:opacity-90 font-bold border-none" isLoading={isLoading}>
                        Sign In <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </form>

                <div className="mt-8 pt-8 border-t border-app-border text-center">
                    <Link href="/signup" className="text-sm text-content-medium hover:text-content-high transition-colors">
                        Don&apos;t have an account? <span className="text-app-accent font-medium">Sign up</span>
                    </Link>
                    <div className="mt-4">
                        <Link href="/" className="text-xs text-content-low hover:text-content-medium">
                            ← Back to home
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
