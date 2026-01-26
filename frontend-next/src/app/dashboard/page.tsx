'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
    LayoutGrid, FolderOpen, Share2, Users, Settings,
    LogOut, Plus, Radio, Disc, Video as VideoIcon,
    X, Activity, ArrowUpRight, Clock, Calendar, Search,
    MoreHorizontal,
} from 'lucide-react';
import { Library } from '@/components/Library';
import { Destinations } from '@/components/Destinations';
import { Members } from '@/components/Members';
import { TeamSettings } from '@/components/TeamSettings';
import { AccountSettings } from '@/components/AccountSettings';
import { StudioSetup } from '@/components/StudioSetup';
import { Projects } from '@/components/Projects';
import { RoomMode, VisualConfigType, Tier } from '@/types';
import { Button } from '@/components/Button';
import { supabase } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ApiClient } from '@/lib/api';
import Link from 'next/link';

type DashboardView = 'overview' | 'projects' | 'library' | 'destinations' | 'team' | 'settings' | 'pricing' | 'profile';

export default function DashboardPage() {
    const router = useRouter();
    const { signOut, isAuthenticated, isLoading, hasAnotherTab, canTakeAccess, takeAccess, user, tier } = useAuth();
    const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User';
    const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2);
    const canManageTeam = tier >= Tier.CREATOR; // CREATOR and above can manage team

    const [currentView, setCurrentView] = useState<DashboardView>('overview');
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [setupMode, setSetupMode] = useState<RoomMode | null>(null);
    const [setupRoomId, setSetupRoomId] = useState<string | null>(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [userId, setUserId] = useState<string | undefined>(undefined);

    const profileMenuRef = useRef<HTMLDivElement>(null);

    // ALL HOOKS MUST BE DEFINED BEFORE ANY EARLY RETURNS

    // Redirect if not authenticated
    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.replace('/login');
        }
    }, [isAuthenticated, isLoading, router]);

    // Fetch user ID from Supabase auth
    useEffect(() => {
        if (!isAuthenticated) return;
        const fetchUser = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user?.id) {
                    setUserId(user.id);
                }
            } catch (e) {
                console.warn('[Dashboard] Failed to get user:', e);
            }
        };
        fetchUser();
    }, [isAuthenticated]);

    // Close profile menu on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Show loading state while checking auth or if not authenticated - AFTER ALL HOOKS
    if (isLoading || !isAuthenticated) {
        return (
            <div className="min-h-screen bg-app-bg flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
                    <p className="text-content-medium text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    // Navigation Handler
    const handleNavigate = (view: DashboardView) => {
        if (view === 'pricing') {
            router.push('/pricing');
            return;
        }
        setCurrentView(view);
        setIsProfileMenuOpen(false);
    };

    const handleLogout = async () => {
        await signOut();
        router.push('/login');
    };

    const handleNavigateToStudio = (roomId: string, name: string, mode: RoomMode, visualConfig?: VisualConfigType) => {
        if (mode === 'meeting') {
            router.push(`/meeting/${roomId}`);
        } else {
            router.push(`/studio/${roomId}`);
        }
    };

    const handleCreateRoom = async (mode: RoomMode) => {
        if (!userId) return;

        try {
            const newRoom = await ApiClient.createRoom({
                owner_id: userId,
                name: mode === 'studio' ? 'New Studio Session' : 'New Meeting',
                mode: mode,
            });

            setCreateModalOpen(false);
            setSetupRoomId(newRoom.id);
            setSetupMode(mode);
        } catch (e) {
            console.error('[Dashboard] Failed to create room:', e);
            alert('Failed to create room. Please try again.');
        }
    };

    // Render Sub-Components
    const renderContent = () => {
        switch (currentView) {
            case 'projects': return <Projects onSelectProject={(id) => console.log('Selected Project:', id)} />;
            case 'library': return <Library onEditAsset={() => { }} />;
            case 'destinations': return <Destinations userId={userId} />;
            case 'team': return <Members />;
            case 'settings': return <TeamSettings onNavigateToPricing={() => router.push('/pricing')} />;
            case 'profile': return <AccountSettings />;
            default: return <Overview onStart={() => setCreateModalOpen(true)} />;
        }
    };

    // EARLY RETURNS MUST COME AFTER ALL HOOKS
    if (hasAnotherTab) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-[#0a0a0a] text-white p-6">
                <div className="max-w-md w-full text-center space-y-8 animate-scale-in">
                    <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto ring-1 ring-indigo-500/30">
                        <Share2 className="w-10 h-10 text-indigo-500" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2">
                            {canTakeAccess ? 'Dashboard Open Elsewhere' : 'Session Moved'}
                        </h1>
                        <p className="text-gray-400 font-sans leading-relaxed">
                            {canTakeAccess
                                ? 'Your dashboard is active in another tab. To use it here, you\'ll need to claim the session.'
                                : 'This session is now active in another tab. Please use that tab or close this one.'}
                        </p>
                    </div>
                    <div className="flex flex-col gap-3">
                        {canTakeAccess && (
                            <button
                                onClick={takeAccess}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                            >
                                Use Here
                            </button>
                        )}
                        <p className="text-sm text-gray-500">Close this tab</p>
                    </div>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-app-bg">
                <div className="text-content-medium">Loading...</div>
            </div>
        );
    }

    if (setupMode && setupRoomId) {
        return <StudioSetup
            onEnterStudio={(name, cam, mic, vConfig, resolution, frameRate, recordingConfig) => handleNavigateToStudio(setupRoomId, name, setupMode, vConfig)}
            defaultName="Host"
            isMeeting={setupMode === 'meeting'}
        />;
    }

    return (
        <div className="flex h-screen w-full bg-app-bg text-content-high font-sans overflow-hidden">

            {/* Navigation Rail */}
            <aside className="w-64 bg-app-surface border-r border-app-border flex flex-col py-6 shrink-0 transition-all duration-300 z-20">
                <div className="px-6 mb-8 flex items-center gap-3">
                    <div className="w-8 h-8 bg-app-accent rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Radio className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold tracking-tight text-lg">ALLSTRM</span>
                </div>

                <div className="flex-1 flex flex-col gap-1 px-3">
                    <NavButton icon={<LayoutGrid />} label="Overview" active={currentView === 'overview'} onClick={() => handleNavigate('overview')} />
                    <NavButton icon={<FolderOpen />} label="Projects" active={currentView === 'projects'} onClick={() => handleNavigate('projects')} />
                    <NavButton icon={<Plus />} label="Library" active={currentView === 'library'} onClick={() => handleNavigate('library')} />
                    <NavButton icon={<Share2 />} label="Destinations" active={currentView === 'destinations'} onClick={() => handleNavigate('destinations')} />
                </div>

                {/* User Profile Section */}
                <div className="px-3 mt-auto relative" ref={profileMenuRef}>
                    {isProfileMenuOpen && (
                        <div className="absolute bottom-full left-3 right-3 mb-2 bg-app-bg border border-app-border rounded-xl shadow-2xl overflow-hidden z-50 animate-scale-in origin-bottom">
                            <div className="p-1">
                                <button
                                    onClick={() => handleNavigate('profile')}
                                    className="w-full text-left px-3 py-2 text-sm text-content-high hover:bg-app-surface rounded-lg flex items-center gap-3 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white">
                                        {initials}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-xs">{displayName}</span>
                                        <span className="text-[10px] text-content-medium">View Profile</span>
                                    </div>
                                </button>
                            </div>

                            <div className="h-px bg-app-border mx-2" />

                            <div className="p-1">
                                {canManageTeam && (
                                    <button
                                        onClick={() => handleNavigate('team')}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-content-medium hover:text-content-high hover:bg-app-surface rounded-lg transition-colors"
                                    >
                                        <Users className="w-4 h-4" />
                                        <span>Team Members</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => handleNavigate('settings')}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-content-medium hover:text-content-high hover:bg-app-surface rounded-lg transition-colors"
                                >
                                    <Settings className="w-4 h-4" />
                                    <span>{canManageTeam ? 'Team Settings' : 'Settings'}</span>
                                </button>
                            </div>

                            <div className="h-px bg-app-border mx-2" />

                            <div className="p-1">
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span>Sign Out</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Profile Trigger Button */}
                    <div className="border-t border-app-border pt-4 mt-2">
                        <button
                            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all group ${isProfileMenuOpen ? 'bg-app-bg ring-1 ring-app-border shadow-sm' : 'hover:bg-app-bg'}`}
                        >
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white border border-app-border shadow-sm shrink-0">
                                {initials}
                            </div>
                            <div className="flex flex-col items-start flex-1 min-w-0">
                                <span className="text-sm font-bold text-content-high truncate w-full text-left">{displayName}</span>
                                <span className="text-[10px] text-content-medium truncate w-full text-left">My Workspace</span>
                            </div>
                            <MoreHorizontal className="w-4 h-4 text-content-low group-hover:text-content-high" />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 bg-app-bg relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                {renderContent()}
            </main>

            {/* Create Project Modal */}
            {createModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)} />
                    <div className="bg-app-surface border border-app-border rounded-2xl p-8 max-w-4xl w-full shadow-2xl relative z-10 animate-scale-in">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight text-content-high">Start New Project</h2>
                                <p className="text-content-medium text-sm mt-1">Select a mode to begin your session.</p>
                            </div>
                            <button onClick={() => setCreateModalOpen(false)} className="p-2 hover:bg-app-bg rounded-full transition-colors text-content-medium hover:text-content-high"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <ProjectCard
                                title="Live Broadcast"
                                desc="Stream to multiple platforms simultaneously with low latency."
                                icon={<Radio className="w-8 h-8 text-indigo-500" />}
                                onClick={() => handleCreateRoom('studio')}
                                accent="indigo"
                            />
                            <ProjectCard
                                title="Local Recording"
                                desc="High-quality ISO capture for post-production workflows."
                                icon={<Disc className="w-8 h-8 text-rose-500" />}
                                onClick={() => handleCreateRoom('studio')}
                                accent="rose"
                            />
                            <ProjectCard
                                title="Video Meeting"
                                desc="Private, secure conference with low latency mesh networking."
                                icon={<VideoIcon className="w-8 h-8 text-emerald-500" />}
                                onClick={() => handleCreateRoom('meeting')}
                                accent="emerald"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Overview Component
const Overview = ({ onStart }: { onStart: () => void }) => (
    <div className="flex-1 flex flex-col h-full bg-app-bg relative animate-fade-in">
        {/* Fixed Header */}
        <header className="h-20 border-b border-app-border flex items-center justify-between px-8 bg-app-bg/80 backdrop-blur-xl sticky top-0 z-20 shrink-0">
            <div>
                <h1 className="text-xl font-bold tracking-tight text-content-high">Overview</h1>
                <p className="text-xs text-content-medium mt-0.5">Welcome back to your workspace.</p>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                    <Activity className="w-3 h-3" />
                    SYSTEM OPERATIONAL
                </div>
                <Button onClick={onStart} className="shadow-lg shadow-indigo-500/20">
                    <Plus className="w-4 h-4 mr-2" />
                    New Project
                </Button>
            </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <StatCard label="Total Streaming" value="124h 30m" trend="+12%" icon={<Clock className="w-4 h-4" />} />
                <StatCard label="Avg. Viewers" value="842" trend="+5%" icon={<Users className="w-4 h-4" />} />
                <StatCard label="Clips Generated" value="45" trend="+8" icon={<Disc className="w-4 h-4" />} />
            </div>

            {/* Recent Sessions */}
            <div className="flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-bold text-content-medium uppercase tracking-wider">Recent Sessions</h3>

                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-medium" />
                            <input type="text" placeholder="Search sessions..." className="pl-9 pr-4 py-1.5 bg-app-surface border border-app-border rounded-lg text-sm text-content-high focus:outline-none focus:border-app-accent" />
                        </div>
                        <button className="text-xs text-app-accent hover:text-app-accentHover font-medium">View All</button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <SessionCard title="Weekly Sync" date="2 hours ago" duration="45m" type="meeting" />
                    <SessionCard title="Product Demo Launch" date="Yesterday" duration="1h 20m" type="broadcast" />
                    <SessionCard title="Minecraft Speedrun" date="3 days ago" duration="2h 15m" type="broadcast" />
                    <SessionCard title="Town Hall" date="Last week" duration="55m" type="meeting" />
                </div>
            </div>
        </div>
    </div>
);

// --- Sub Components ---

const NavButton = ({ icon, label, active, onClick }: any) => (
    <button
        onClick={onClick}
        className={`
      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
      ${active
                ? 'bg-app-accent/10 text-app-accent'
                : 'text-content-medium hover:text-content-high hover:bg-app-bg'
            }
    `}
    >
        {React.cloneElement(icon, { className: "w-4 h-4" })}
        <span>{label}</span>
    </button>
);

const StatCard = ({ label, value, trend, icon }: any) => (
    <div className="bg-app-surface border border-app-border rounded-xl p-6 hover:border-app-accent/30 transition-colors shadow-sm">
        <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold text-content-medium uppercase tracking-wider">{label}</span>
            <div className="text-content-medium">{icon}</div>
        </div>
        <div className="flex items-end gap-3">
            <span className="text-3xl font-mono font-bold text-content-high tracking-tighter">{value}</span>
            <span className="text-xs font-medium text-emerald-500 flex items-center mb-1.5 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> {trend}
            </span>
        </div>
    </div>
);

const SessionCard = ({ title, date, duration, type }: any) => (
    <div className="group bg-app-surface border border-app-border rounded-xl p-5 hover:border-app-accent hover:shadow-md transition-all cursor-pointer relative overflow-hidden h-fit">
        <div className="flex justify-between items-start mb-4 relative z-10">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${type === 'broadcast' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                {type === 'broadcast' ? <Radio className="w-5 h-5" /> : <Users className="w-5 h-5" />}
            </div>
            <div className="px-2 py-1 rounded bg-app-bg text-[10px] font-mono text-content-medium border border-app-border">
                {duration}
            </div>
        </div>

        <div className="relative z-10">
            <h4 className="text-lg font-bold text-content-high mb-1 group-hover:text-app-accent transition-colors">{title}</h4>
            <div className="flex items-center gap-2 text-xs text-content-medium">
                <Calendar className="w-3 h-3" />
                {date}
            </div>
        </div>
    </div>
);

const ProjectCard = ({ title, desc, icon, onClick, accent }: any) => {
    const accentColors: Record<string, string> = {
        indigo: 'hover:border-indigo-500/50 bg-indigo-500/5',
        rose: 'hover:border-rose-500/50 bg-rose-500/5',
        emerald: 'hover:border-emerald-500/50 bg-emerald-500/5'
    };

    return (
        <button
            onClick={onClick}
            className={`text-left group relative bg-app-bg border border-app-border rounded-xl p-6 hover:scale-[1.02] transition-all duration-300 overflow-hidden ${accentColors[accent]}`}
        >
            <div className="relative z-10">
                <div className="w-14 h-14 bg-app-surface border border-app-border rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                    {icon}
                </div>
                <h3 className="text-lg font-bold text-content-high mb-2">{title}</h3>
                <p className="text-sm text-content-medium leading-relaxed">{desc}</p>
            </div>
        </button>
    );
};
