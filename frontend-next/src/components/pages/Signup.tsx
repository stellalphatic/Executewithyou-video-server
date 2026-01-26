'use client';


import React, { useState } from 'react';
import { ArrowRight, Aperture, Check } from 'lucide-react';
import { Button } from '@/components/Button';
import { useAuth } from '@/contexts/AuthContext';

interface SignupProps {
    onNavigateToLogin: () => void;
}

export const Signup: React.FC<SignupProps> = ({ onNavigateToLogin }) => {
    const { signUp } = useAuth();
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const { error: authError } = await signUp(email, password, fullName);

            if (authError) {
                throw authError;
            }

            setIsSuccess(true);
            // Auth context will handle the redirect, but show success first
            setTimeout(onNavigateToLogin, 2500);
        } catch (err: any) {
            let errorMessage = 'Registration failed. Please try again.';

            if (err) {
                errorMessage =
                    err.message ||
                    err.error_description ||
                    err.msg ||
                    err.error ||
                    (err.status ? `Error ${err.status}` : null) ||
                    (typeof err === 'string' ? err : null) ||
                    'Registration failed. Please try again.';

                if (err.name === 'TypeError' && err.message?.includes('fetch')) {
                    errorMessage = 'Cannot connect to authentication service. Please check if services are running.';
                }
            }

            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-app-bg flex items-center justify-center font-sans">
                <div className="text-center animate-fade-in">
                    <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-scale-in">
                        <Check className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-content-high mb-2">Account Created</h2>
                    <p className="text-content-medium">Redirecting to login...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-app-bg flex items-center justify-center relative overflow-hidden font-sans">
            {/* Ambient Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-app-accent/10 via-app-bg to-app-bg" />
            </div>

            <div className="w-full max-w-md bg-app-surface border border-app-border rounded-3xl p-8 md:p-10 shadow-2xl relative z-10 animate-scale-in">

                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-app-bg rounded-xl flex items-center justify-center mx-auto mb-6 border border-app-border shadow-sm">
                        <Aperture className="w-6 h-6 text-app-accent" />
                    </div>
                    <h2 className="text-2xl font-bold text-content-high mb-2">Create Account</h2>
                    <p className="text-content-medium text-sm">Join the workspace to start building.</p>
                </div>

                <form onSubmit={handleSignup} className="space-y-5">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-500 text-center">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-content-medium mb-1.5 uppercase tracking-wide">Full Name</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3 text-content-high focus:outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent transition-all placeholder-content-low"
                            placeholder="J. Doe"
                            required
                        />
                    </div>

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
                            minLength={8}
                        />
                    </div>

                    <Button type="submit" size="lg" className="w-full h-12 bg-content-high text-app-bg hover:opacity-90 font-bold border-none" isLoading={isLoading}>
                        Sign Up <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </form>

                <div className="mt-8 pt-8 border-t border-app-border text-center">
                    <button onClick={onNavigateToLogin} className="text-sm text-content-medium hover:text-content-high transition-colors">
                        Already have an account? <span className="text-app-accent font-medium">Sign In</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
