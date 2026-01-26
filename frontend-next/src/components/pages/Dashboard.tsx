'use client';


import React, { useState, useRef, useEffect } from 'react';
import {
    LayoutGrid, FolderOpen, Share2, Users, Settings,
    LogOut, Plus, Radio, Disc, Video as VideoIcon,
    X, Activity, ArrowUpRight, Clock, Calendar, Search, User,
    MoreHorizontal, ChevronRight
} from 'lucide-react';
import { Library } from '@/components/Library';
import { Destinations } from '@/components/Destinations';
import { Members } from '@/components/Members';
import { TeamSettings } from '@/components/TeamSettings';
import { AccountSettings } from '@/components/AccountSettings';
import { StudioSetup } from '@/components/StudioSetup';
import { VideoEditor } from '@/components/Editor/VideoEditor';
import { MediaAsset, Room, RoomMode, VisualConfigType, Tier } from '@/types';
import { Button } from '@/components/Button';
import { Pricing } from './Pricing';
import { supabase } from '@/lib/constants';
import { ApiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardProps {
    onNavigateToStudio: (roomId: string, name: string, mode: RoomMode, visualConfig?: VisualConfigType) => void;
    onLogout: () => void;
}

type DashboardView = 'overview' | 'library' | 'destinations' | 'team' | 'settings' | 'pricing' | 'profile';

interface DashboardStats {
    totalSessions: number;
    totalRecordings: number;
    activeDestinations: number;
}

interface OverviewProps {
    rooms: Room[];
    isLoading: boolean;
    onStart: () => void;
    onJoinRoom: (r: Room) => void;
    stats: DashboardStats;
}

// Overview Component
const Overview = ({ rooms, isLoading, onStart, onJoinRoom, stats }: OverviewProps) => (
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
                <StatCard label="Total Sessions" value={stats.totalSessions.toString()} icon={<Clock className="w-4 h-4" />} />
                <StatCard label="Recordings" value={stats.totalRecordings.toString()} icon={<Disc className="w-4 h-4" />} />
                <StatCard label="Destinations" value={stats.activeDestinations.toString()} icon={<Share2 className="w-4 h-4" />} />
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

                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-50">
                        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-app-surface rounded-xl animate-pulse" />)}
                    </div>
                ) : rooms.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {rooms.map(room => (
                            <SessionCard
                                key={room.id}
                                title={room.name}
                                date={new Date(room.created_at || '').toLocaleDateString()}
                                duration="Ready"
                                type={room.mode}
                                onClick={() => onJoinRoom(room)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 bg-app-surface/50 rounded-2xl border border-dashed border-app-border">
                        <div className="w-16 h-16 bg-app-bg rounded-full flex items-center justify-center mb-4 text-content-low">
                            <FolderOpen className="w-8 h-8" />
                        </div>
                        <h4 className="text-lg font-bold text-content-high mb-1">No sessions yet</h4>
                        <p className="text-sm text-content-medium mb-6">Create your first stream project to get started.</p>
                        <Button onClick={onStart}>
                            <Plus className="w-4 h-4 mr-2" />
                            Start New Project
                        </Button>
                    </div>
                )}
            </div>
        </div>
    </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ onNavigateToStudio, onLogout }) => {
    const { user, tier } = useAuth();
    const canManageTeam = tier >= Tier.CREATOR; // CREATOR and above can manage team
    const [currentView, setCurrentView] = useState<DashboardView>('overview');
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [setupMode, setSetupMode] = useState<RoomMode | null>(null);
    const [editingAsset, setEditingAsset] = useState<MediaAsset | null>(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [userId, setUserId] = useState<string | undefined>(undefined);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [isLoadingRooms, setIsLoadingRooms] = useState(false);
    const [stats, setStats] = useState<DashboardStats>({ totalSessions: 0, totalRecordings: 0, activeDestinations: 0 });
    const [setupRoomId, setSetupRoomId] = useState<string | null>(null);

    const profileMenuRef = useRef<HTMLDivElement>(null);

    // User display info derived from auth context
    const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
    const userInitials = userName.substring(0, 2).toUpperCase();
    const workspaceName = userName ? `${userName}'s Workspace` : 'My Workspace';

    // Fetch user ID, rooms, and stats
    useEffect(() => {
        const initializeDashboard = async () => {
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser?.id) {
                    setUserId(authUser.id);
                    await fetchRooms(authUser.id);
                    await fetchStats(authUser.id);
                }
            } catch (e) {
                console.warn('[Dashboard] Initialization failed:', e);
            }
        };
        initializeDashboard();
    }, []);

    const fetchStats = async (ownerId: string) => {
        try {
            // Fetch assets to count recordings
            const assetsRes = await fetch(`/api/assets?user_id=${ownerId}`);
            const assetsData = await assetsRes.json();
            const recordingsCount = (assetsData.assets || []).filter((a: any) => a.origin === 'studio').length;

            // Fetch destinations count
            const destRes = await fetch(`/api/destinations?user_id=${ownerId}`);
            const destData = await destRes.json();
            const destCount = (destData.destinations || []).length;

            setStats({
                totalSessions: rooms.length,
                totalRecordings: recordingsCount,
                activeDestinations: destCount
            });
        } catch (e) {
            console.warn('[Dashboard] Failed to fetch stats:', e);
        }
    };

    const fetchRooms = async (ownerId: string) => {
        setIsLoadingRooms(true);
        try {
            const { rooms: dbRooms } = await ApiClient.listRooms(ownerId);
            setRooms(dbRooms);
            // Update session count in stats
            setStats(prev => ({ ...prev, totalSessions: dbRooms.length }));
        } catch (e) {
            console.error('[Dashboard] Failed to fetch rooms:', e);
        } finally {
            setIsLoadingRooms(false);
        }
    };

    // Navigation Handler
    const handleNavigate = (view: DashboardView) => {
        setCurrentView(view);
        setIsProfileMenuOpen(false);
        if (view === 'overview' && userId) {
            fetchRooms(userId);
        }
    };

    // Create Room Handler
    const handleCreateRoom = async (mode: RoomMode) => {
        if (!userId) return;

        try {
            const newRoom = await ApiClient.createRoom({
                owner_id: userId,
                name: mode === 'studio' ? 'New Studio Session' : 'New Meeting',
                mode: mode,
            });

            setRooms(prev => [newRoom, ...prev]);
            setCreateModalOpen(false);
            setSetupRoomId(newRoom.id);
            setSetupMode(mode);
            return newRoom.id;
        } catch (e: any) {
            console.error('[Dashboard] Failed to create room:', e);
            const errorMessage = e.message || '';

            // Check if it's a tier limit error
            if (errorMessage.includes('limit reached') || errorMessage.includes('Room limit')) {
                setCreateModalOpen(false);
                const upgrade = confirm(
                    'You have reached the room limit for your current plan.\n\n' +
                    'Would you like to upgrade to create more rooms?'
                );
                if (upgrade) {
                    setCurrentView('pricing');
                }
            } else {
                alert('Failed to create room. Please try again.');
            }
        }
    };

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

    // Render Sub-Components
    const renderContent = () => {
        switch (currentView) {
            case 'library': return <Library onEditAsset={setEditingAsset} />;
            case 'destinations': return <Destinations userId={userId} />;
            case 'team': return <Members />;
            case 'settings': return <TeamSettings onNavigateToPricing={() => setCurrentView('pricing')} />;
            case 'profile': return <AccountSettings />;
            case 'pricing': return <Pricing onBack={() => setCurrentView('settings')} onGetStarted={() => alert('Integrated with Stripe/Payment')} />;
            default: return <Overview rooms={rooms} isLoading={isLoadingRooms} onStart={() => setCreateModalOpen(true)} onJoinRoom={(r: Room) => onNavigateToStudio(r.id, r.name, r.mode)} stats={stats} />;
        }
    };

    if (setupMode && setupRoomId) {
        return <StudioSetup
            onEnterStudio={(name, cam, mic, vConfig, resolution, frameRate, recordingConfig) => onNavigateToStudio(setupRoomId, name, setupMode, vConfig)}
            defaultName="Host"
            isMeeting={setupMode === 'meeting'}
        />;
    }

    // Full page takeover for Pricing
    if (currentView === 'pricing') {
        return <Pricing onBack={() => setCurrentView('settings')} onGetStarted={() => alert('Integrated with Stripe/Payment')} />;
    }

    return (
        <div className="flex h-screen w-full bg-app-bg text-content-high font-sans overflow-hidden">

            {/* Editor Overlay */}
            {editingAsset && <VideoEditor asset={editingAsset} onClose={() => setEditingAsset(null)} />}

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
                    <NavButton icon={<FolderOpen />} label="Library" active={currentView === 'library'} onClick={() => handleNavigate('library')} />
                    <NavButton icon={<Share2 />} label="Destinations" active={currentView === 'destinations'} onClick={() => handleNavigate('destinations')} />
                </div>

                {/* User Profile Section with Context Menu */}
                <div className="px-3 mt-auto relative" ref={profileMenuRef}>
                    {/* Context Menu Popup */}
                    {isProfileMenuOpen && (
                        <div className="absolute bottom-full left-3 right-3 mb-2 bg-app-bg border border-app-border rounded-xl shadow-2xl overflow-hidden z-50 animate-scale-in origin-bottom">
                            <div className="p-1">
                                <button
                                    onClick={() => handleNavigate('profile')}
                                    className="w-full text-left px-3 py-2 text-sm text-content-high hover:bg-app-surface rounded-lg flex items-center gap-3 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white">
                                        {userInitials}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-xs">{userName}</span>
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
                                    onClick={onLogout}
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
                            onContextMenu={(e) => { e.preventDefault(); setIsProfileMenuOpen(true); }}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all group ${isProfileMenuOpen ? 'bg-app-bg ring-1 ring-app-border shadow-sm' : 'hover:bg-app-bg'}`}
                        >
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white border border-app-border shadow-sm shrink-0">
                                {userInitials}
                            </div>
                            <div className="flex flex-col items-start flex-1 min-w-0">
                                <span className="text-sm font-bold text-content-high truncate w-full text-left">{userName}</span>
                                <span className="text-[10px] text-content-medium truncate w-full text-left">{workspaceName}</span>
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
};


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

const StatCard = ({ label, value, trend, icon }: { label: string; value: string; trend?: string; icon: React.ReactNode }) => (
    <div className="bg-app-surface border border-app-border rounded-xl p-6 hover:border-app-accent/30 transition-colors shadow-sm">
        <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold text-content-medium uppercase tracking-wider">{label}</span>
            <div className="text-content-medium">{icon}</div>
        </div>
        <div className="flex items-end gap-3">
            <span className="text-3xl font-mono font-bold text-content-high tracking-tighter">{value}</span>
            {trend && (
                <span className="text-xs font-medium text-emerald-500 flex items-center mb-1.5 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    <ArrowUpRight className="w-3 h-3 mr-0.5" /> {trend}
                </span>
            )}
        </div>
    </div>
);

const SessionCard = ({ title, date, duration, type, onClick }: any) => (
    <div
        onClick={onClick}
        className="group bg-app-surface border border-app-border rounded-xl p-5 hover:border-app-accent hover:shadow-md transition-all cursor-pointer relative overflow-hidden h-fit"
    >
        <div className="flex justify-between items-start mb-4 relative z-10">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${type === 'studio' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                {type === 'studio' ? <Radio className="w-5 h-5" /> : <Users className="w-5 h-5" />}
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
    const accentColors = {
        indigo: 'hover:border-indigo-500/50 bg-indigo-500/5',
        rose: 'hover:border-rose-500/50 bg-rose-500/5',
        emerald: 'hover:border-emerald-500/50 bg-emerald-500/5'
    };

    return (
        <button
            onClick={onClick}
            className={`text-left group relative bg-app-bg border border-app-border rounded-xl p-6 hover:scale-[1.02] transition-all duration-300 overflow-hidden ${accentColors[accent as keyof typeof accentColors]}`}
        >
            <div className="relative z-10">
                <div className="w-14 h-14 bg-app-surface border border-app-border rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                </div>
                <h3 className="text-lg font-bold text-content-high mb-2">{title}</h3>
                <p className="text-sm text-content-medium leading-relaxed">{desc}</p>
            </div>
        </button>
    );
};
