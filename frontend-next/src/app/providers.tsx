'use client';

import React, { useState, useEffect } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { Moon, Sun } from 'lucide-react';

export function Providers({ children }: { children: React.ReactNode }) {
    const [isDark, setIsDark] = useState(true);

    useEffect(() => {
        // Initialize dark mode
        document.documentElement.classList.add('dark');
    }, []);

    const toggleTheme = () => {
        const newMode = !isDark;
        setIsDark(newMode);
        if (newMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    return (
        <AuthProvider>
            <div className="font-sans text-content-high bg-app-bg transition-colors duration-300 min-h-screen">
                {children}

                {/* Global Theme Toggle */}
                <div className="fixed bottom-6 right-6 z-[100] animate-slide-up" style={{ animationDelay: '0.5s' }}>
                    <button
                        onClick={toggleTheme}
                        className="w-10 h-10 rounded-full bg-app-surface border border-app-border shadow-lg flex items-center justify-center text-content-high hover:scale-110 transition-transform active:scale-95"
                        title="Toggle Theme"
                    >
                        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </AuthProvider>
    );
}
