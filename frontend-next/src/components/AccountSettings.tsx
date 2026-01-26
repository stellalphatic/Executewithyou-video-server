'use client';


import React, { useState, useEffect } from 'react';
import { Edit2, Trash2, Mail, Globe, Clock, ShieldAlert, Camera, Save } from 'lucide-react';
import { Button } from './Button';
import { useAuth } from '@/contexts/AuthContext';

export const AccountSettings: React.FC = () => {
    const { user } = useAuth();

    // Profile state initialized from authenticated user
    const [profile, setProfile] = useState({
        name: '',
        email: '',
        language: 'English',
        timezone: 'UTC+0'
    });
    const [isSaving, setIsSaving] = useState(false);

    // Sync profile state with authenticated user
    useEffect(() => {
        if (user) {
            setProfile(prev => ({
                ...prev,
                name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
                email: user.email || ''
            }));
        }
    }, [user]);

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => setIsSaving(false), 1500);
    };

    return (
        <div className="flex-1 flex flex-col h-full relative animate-fade-in bg-app-bg">
             {/* Header */}
             <header className="h-20 border-b border-app-border/60 flex items-center justify-between px-10 bg-app-bg/80 backdrop-blur-xl z-10">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-content-high">Account settings</h1>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-content-medium uppercase tracking-widest mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        <span>Profile & Security</span>
                        <span className="text-content-low">|</span>
                        <span>Personal</span>
                    </div>
                </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                <div className="max-w-3xl space-y-12 animate-slide-up">
                    
                    {/* Profile Header */}
                    <div className="flex items-center gap-6">
                        <div className="relative group cursor-pointer">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-xl ring-4 ring-app-surface">
                                {profile.name.substring(0,2).toUpperCase()}
                            </div>
                            <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                                <Camera className="w-6 h-6 text-white" />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-content-high">{profile.name}</h2>
                            <p className="text-content-medium">Manage your personal details and login security.</p>
                        </div>
                    </div>

                    {/* Main Settings Group */}
                    <section className="bg-app-surface/30 border border-app-border rounded-xl overflow-hidden divide-y divide-app-border/50">
                        
                        {/* Name Row */}
                        <div className="p-6 hover:bg-app-surface/50 transition-colors group">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <h3 className="text-sm font-bold text-content-high mb-1">Full Name</h3>
                                    <div className="w-full max-w-sm">
                                        <input 
                                            type="text" 
                                            value={profile.name} 
                                            onChange={(e) => setProfile({...profile, name: e.target.value})}
                                            className="bg-transparent border-none p-0 text-sm text-content-medium focus:ring-0 focus:text-content-high w-full font-mono" 
                                        />
                                    </div>
                                </div>
                                <Edit2 className="w-4 h-4 text-content-low opacity-50" />
                            </div>
                        </div>

                        {/* Email Row */}
                        <div className="p-6 hover:bg-app-surface/50 transition-colors group">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <h3 className="text-sm font-bold text-content-high mb-1 flex items-center gap-2">
                                        Email
                                    </h3>
                                    <div className="text-sm text-content-medium font-mono">{profile.email}</div>
                                    
                                    {/* Nested Social Login */}
                                    <div className="mt-4 pt-4 border-t border-app-border/30">
                                        <div className="text-xs font-semibold text-content-medium mb-2 uppercase tracking-wide">Connected social login</div>
                                        <div className="flex items-center gap-2 text-sm text-content-high">
                                            {/* Google G Logo mockup */}
                                            <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center p-[1px]">
                                                 <svg viewBox="0 0 24 24" className="w-full h-full"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                                            </div>
                                            <span>Google</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Preferences */}
                        <div className="p-6 flex items-center justify-between hover:bg-app-surface/50 transition-colors group">
                            <div>
                                <h3 className="text-sm font-bold text-content-high mb-1">Language</h3>
                                <div className="text-sm text-content-medium">{profile.language}</div>
                            </div>
                            <Globe className="w-4 h-4 text-content-low" />
                        </div>
                    </section>

                    <div className="flex justify-end">
                        <Button onClick={handleSave} isLoading={isSaving} icon={<Save className="w-4 h-4" />}>
                            Save Changes
                        </Button>
                    </div>

                    {/* Delete Account Section */}
                    <section className="pt-8 border-t border-app-border">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div>
                                <h3 className="text-sm font-bold text-content-high mb-2">Delete account</h3>
                                <p className="text-sm text-content-medium max-w-md">
                                    Content from deleted accounts cannot be restored. This action is irreversible.
                                </p>
                            </div>
                            <Button variant="secondary" className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500 hover:text-red-500">
                                Delete
                            </Button>
                        </div>
                    </section>

                </div>
            </div>
        </div>
    );
};
