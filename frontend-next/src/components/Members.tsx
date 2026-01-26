'use client';


import React, { useState, useEffect } from 'react';
import { Search, ChevronDown, Shield, MoreHorizontal, UserPlus, Trash2, Mail, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from './Button';
import { useAuth } from '@/contexts/AuthContext';

interface Member {
    id: string;
    email: string;
    role: 'owner' | 'admin' | 'member';
    status: 'active' | 'pending';
    full_name?: string;
}

// Map API roles to display names
const roleDisplayNames: Record<string, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member'
};

export const Members: React.FC = () => {
    const { user } = useAuth();
    const [members, setMembers] = useState<Member[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
    const [isInviting, setIsInviting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Fetch members from API
    useEffect(() => {
        const fetchMembers = async () => {
            if (!user?.id) return;

            setIsLoading(true);
            setError(null);

            try {
                const res = await fetch(`/api/members?user_id=${user.id}`);
                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || 'Failed to fetch members');
                }

                setMembers(data.members || []);
            } catch (err: any) {
                console.error('Failed to fetch members:', err);
                setError(err.message);
                // Fallback to current user as owner if fetch fails
                setMembers([{
                    id: 'self',
                    email: user.email || 'you@example.com',
                    role: 'owner',
                    status: 'active',
                    full_name: user.user_metadata?.full_name
                }]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMembers();
    }, [user?.id, user?.email, user?.user_metadata?.full_name]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.id) return;

        setIsInviting(true);

        try {
            const res = await fetch('/api/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user.id,
                    email: inviteEmail,
                    role: inviteRole
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to invite member');
            }

            // Add new member to list if returned
            if (data.member) {
                setMembers([...members, data.member]);
            } else {
                // Optimistically add pending member
                const newMember: Member = {
                    id: `pending-${Date.now()}`,
                    email: inviteEmail,
                    role: inviteRole,
                    status: 'pending'
                };
                setMembers([...members, newMember]);
            }

            setIsInviteModalOpen(false);
            setInviteEmail('');
        } catch (err: any) {
            console.error('Failed to invite member:', err);
            setError(err.message);
        } finally {
            setIsInviting(false);
        }
    };

    const handleRemove = async (id: string) => {
        if (!user?.id) return;

        setDeletingId(id);

        try {
            const res = await fetch(`/api/members?member_id=${id}&user_id=${user.id}`, {
                method: 'DELETE'
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to remove member');
            }

            setMembers(members.filter(m => m.id !== id));
        } catch (err: any) {
            console.error('Failed to remove member:', err);
            setError(err.message);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full relative animate-fade-in bg-app-bg">
             {/* Header */}
             <header className="h-20 border-b border-app-border flex items-center justify-between px-8 bg-app-bg/80 backdrop-blur-xl z-10 shrink-0">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-content-high">Members</h1>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-content-medium uppercase tracking-widest mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>Organization Roster</span>
                        <span className="text-content-low">|</span>
                        <span>{members.length} Total</span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar flex flex-col">
                
                {/* Actions Toolbar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 animate-slide-up">
                    <div className="flex items-center gap-4 flex-1">
                        {/* Search */}
                        <div className="relative group w-full max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-medium group-focus-within:text-indigo-500 transition-colors" />
                            <input 
                                type="text" 
                                placeholder="Search by email..." 
                                className="w-full h-10 pl-10 pr-4 bg-app-surface border border-app-border rounded-lg text-sm text-content-high placeholder-content-low/50 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                            />
                        </div>

                        {/* Filter */}
                        <div className="relative">
                            <button className="h-10 px-4 bg-app-surface border border-app-border rounded-lg flex items-center gap-2 text-sm text-content-high hover:border-content-medium/50 transition-colors">
                                <span>All Roles</span>
                                <ChevronDown className="w-3.5 h-3.5 text-content-medium" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="text-right flex items-baseline gap-2">
                            <span className="text-xs text-content-medium">You have <span className="font-mono text-content-high font-bold">2</span> seats left</span>
                            <button className="text-xs font-semibold text-indigo-500 hover:text-indigo-400 transition-colors">Add more</button>
                        </div>
                        <Button 
                            className="h-10 px-6 bg-indigo-500 hover:bg-indigo-600 text-white border-none shadow-lg shadow-indigo-500/20"
                            onClick={() => setIsInviteModalOpen(true)}
                            icon={<UserPlus className="w-4 h-4" />}
                        >
                            Invite member
                        </Button>
                    </div>
                </div>

                {/* Members Table */}
                <div className="border-t border-app-border animate-slide-up" style={{ animationDelay: '0.1s' }}>
                    {/* Table Header */}
                    <div className="grid grid-cols-12 px-4 py-4 text-xs font-bold text-content-medium uppercase tracking-wider bg-app-surface/30 rounded-t-lg">
                        <div className="col-span-6">User</div>
                        <div className="col-span-3">Role</div>
                        <div className="col-span-2">Status</div>
                        <div className="col-span-1"></div>
                    </div>

                    {/* Table Body */}
                    <div className="divide-y divide-app-border/30 bg-app-surface/10 rounded-b-lg border-x border-b border-app-border/50">
                        {isLoading ? (
                            <div className="p-8 text-center">
                                <Loader2 className="w-6 h-6 animate-spin text-content-medium mx-auto" />
                                <p className="text-sm text-content-medium mt-2">Loading members...</p>
                            </div>
                        ) : error && members.length === 0 ? (
                            <div className="p-8 text-center text-red-500 text-sm">
                                {error}
                            </div>
                        ) : members.length === 0 ? (
                            <div className="p-8 text-center text-content-medium text-sm">
                                No members found. Invite someone to get started.
                            </div>
                        ) : (
                            members.map((member) => (
                                <div key={member.id} className="grid grid-cols-12 px-4 py-4 items-center hover:bg-app-surface/40 transition-colors group">
                                    <div className="col-span-6 flex items-center gap-4">
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 font-bold text-xs shadow-sm">
                                            {member.email.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-content-high">{member.full_name || member.email}</span>
                                            {member.full_name && <span className="text-[10px] text-content-low">{member.email}</span>}
                                            {member.role === 'owner' && !member.full_name && <span className="text-[10px] text-content-low">Account Owner</span>}
                                        </div>
                                    </div>
                                    <div className="col-span-3 flex items-center gap-2">
                                        <span className="text-sm text-content-medium px-2 py-1 rounded bg-app-bg border border-app-border">{roleDisplayNames[member.role] || member.role}</span>
                                        {member.role === 'owner' && (
                                            <Shield className="w-3.5 h-3.5 text-indigo-500" />
                                        )}
                                    </div>
                                    <div className="col-span-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${member.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                                            {member.status}
                                        </span>
                                    </div>

                                    <div className="col-span-1 flex justify-end">
                                        {member.role !== 'owner' && (
                                            <button
                                                onClick={() => handleRemove(member.id)}
                                                disabled={deletingId === member.id}
                                                className="p-2 rounded-lg hover:bg-red-500/10 text-content-low hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                            >
                                                {deletingId === member.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Invite Modal */}
            {isInviteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsInviteModalOpen(false)} />
                    <div className="bg-app-surface border border-app-border rounded-xl p-6 w-full max-w-md shadow-2xl relative z-10 animate-scale-in">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-content-high">Invite Member</h2>
                                <p className="text-xs text-content-medium mt-1">Send an invitation to join your workspace.</p>
                            </div>
                            <button onClick={() => setIsInviteModalOpen(false)} className="text-content-medium hover:text-content-high"><X className="w-5 h-5"/></button>
                        </div>

                        <form onSubmit={handleInvite} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-content-medium uppercase mb-1">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-medium" />
                                    <input 
                                        type="email" 
                                        required
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        className="w-full bg-app-bg border border-app-border rounded-lg pl-10 pr-3 py-2.5 text-sm text-content-high focus:border-indigo-500 focus:outline-none" 
                                        placeholder="colleague@example.com"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-content-medium uppercase mb-1">Role</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[{ value: 'admin', label: 'Admin' }, { value: 'member', label: 'Member' }].map((role) => (
                                        <button
                                            key={role.value}
                                            type="button"
                                            onClick={() => setInviteRole(role.value as 'admin' | 'member')}
                                            className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${inviteRole === role.value ? 'bg-indigo-500/10 border-indigo-500 text-indigo-500' : 'bg-app-bg border-app-border text-content-medium hover:text-content-high'}`}
                                        >
                                            {role.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-2 flex gap-3">
                                <Button type="button" variant="ghost" className="flex-1" onClick={() => setIsInviteModalOpen(false)}>Cancel</Button>
                                <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700" isLoading={isInviting}>Send Invite</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
