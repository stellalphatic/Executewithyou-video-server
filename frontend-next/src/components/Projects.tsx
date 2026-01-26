'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Folder, Plus, Search, MoreHorizontal,
    Calendar, Users, Video, Edit3, Trash2,
    Archive, ExternalLink, ChevronRight
} from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from './Button';

interface ProjectsProps {
    onSelectProject?: (projectId: string) => void;
}

export const Projects: React.FC<ProjectsProps> = ({ onSelectProject }) => {
    const { user } = useAuth();
    const [projects, setProjects] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newProject, setNewProject] = useState({ name: '', description: '' });

    const loadProjects = useCallback(async () => {
        if (!user?.id) return;
        setIsLoading(true);
        try {
            const { projects: fetched } = await ApiClient.listProjects(user.id);
            setProjects(fetched);
        } catch (err) {
            console.error('Failed to load projects:', err);
        } finally {
            setIsLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.id || !newProject.name) return;

        try {
            // Find user's default organization
            const userData = await ApiClient.getUser(user.id);
            const orgs = userData?.organizations || [];

            if (!orgs.length || !orgs[0]?.id) {
                console.error('Cannot create project: User has no organization');
                alert('Unable to create project. Please contact support.');
                return;
            }

            const orgId = orgs[0].id;

            await ApiClient.createProject({
                organization_id: orgId,
                owner_id: user.id,
                name: newProject.name,
                description: newProject.description
            });
            setIsCreateModalOpen(false);
            setNewProject({ name: '', description: '' });
            loadProjects();
        } catch (err) {
            console.error('Failed to create project:', err);
        }
    };

    const handleDeleteProject = async (id: string) => {
        if (!confirm('Are you sure you want to delete this project? All associated sessions will be unlinked.')) return;
        try {
            await ApiClient.deleteProject(id);
            loadProjects();
        } catch (err) {
            console.error('Failed to delete project:', err);
        }
    };

    const filteredProjects = projects.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex-1 flex flex-col h-full bg-app-bg text-content-high">
            {/* Header */}
            <header className="h-20 border-b border-app-border flex items-center justify-between px-8 bg-app-bg/80 backdrop-blur-xl sticky top-0 z-20 shrink-0">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-content-high">Projects</h1>
                    <p className="text-xs text-content-medium mt-0.5">Organize your sessions and assets into workspaces.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-medium" />
                        <input
                            type="text"
                            placeholder="Search projects..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-app-surface border border-app-border rounded-lg pl-10 pr-4 py-2 text-sm text-content-high placeholder-content-low focus:outline-none focus:border-indigo-500 w-64 transition-all shadow-sm"
                        />
                    </div>
                    <Button onClick={() => setIsCreateModalOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Project
                    </Button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => <div key={i} className="h-48 bg-app-surface rounded-xl animate-pulse border border-app-border" />)}
                    </div>
                ) : filteredProjects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-content-medium opacity-60">
                        <div className="w-16 h-16 bg-app-surface border border-app-border rounded-full flex items-center justify-center mb-4">
                            <Folder className="w-6 h-6" />
                        </div>
                        <p>No projects found. Create one to get started.</p>
                        <button onClick={() => setIsCreateModalOpen(true)} className="text-indigo-500 text-sm mt-4 hover:underline">Create your first project</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProjects.map(project => (
                            <div
                                key={project.id}
                                className="group bg-app-surface border border-app-border rounded-xl p-6 hover:border-indigo-500/50 hover:shadow-lg transition-all cursor-pointer relative"
                                onClick={() => onSelectProject?.(project.id)}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500 border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors">
                                        <Folder className="w-6 h-6" />
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="p-1.5 hover:bg-app-bg rounded-lg text-content-medium hover:text-content-high"><Edit3 className="w-4 h-4" /></button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id); }}
                                            className="p-1.5 hover:bg-red-500/10 rounded-lg text-content-medium hover:text-red-500"
                                        ><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>

                                <h3 className="text-lg font-bold text-content-high mb-1 group-hover:text-indigo-500 transition-colors">{project.name}</h3>
                                <p className="text-sm text-content-medium line-clamp-2 mb-6 h-10 leading-relaxed italic opacity-80">{project.description || 'No description provided.'}</p>

                                <div className="pt-4 border-t border-app-border/50 flex items-center justify-between text-[11px] font-medium text-content-low uppercase tracking-wider">
                                    <span className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5" />
                                        {new Date(project.created_at).toLocaleDateString()}
                                    </span>
                                    <span className="flex items-center gap-1 font-bold text-indigo-500 group-hover:gap-2 transition-all">
                                        View Workspace <ChevronRight className="w-3 h-3" />
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsCreateModalOpen(false)} />
                    <form onSubmit={handleCreateProject} className="bg-app-surface border border-app-border rounded-xl p-8 max-w-md w-full shadow-2xl relative z-10 animate-scale-in">
                        <h2 className="text-xl font-bold text-content-high mb-2">Create New Project</h2>
                        <p className="text-sm text-content-medium mb-6">workspace to group your sessions and assets.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-content-low uppercase tracking-wider mb-1.5 block">Project Name</label>
                                <input
                                    autoFocus
                                    type="text"
                                    required
                                    placeholder="e.g., Weekly Podcast, Product Launch"
                                    value={newProject.name}
                                    onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                                    className="w-full bg-app-bg border border-app-border rounded-lg px-4 py-2.5 text-sm text-content-high focus:outline-none focus:border-indigo-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-content-low uppercase tracking-wider mb-1.5 block">Description (Optional)</label>
                                <textarea
                                    placeholder="What is this project about?"
                                    value={newProject.description}
                                    onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                                    className="w-full bg-app-bg border border-app-border rounded-lg px-4 py-2.5 text-sm text-content-high focus:outline-none focus:border-indigo-500 transition-all min-h-[100px] resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-2.5 bg-app-bg hover:bg-app-surface border border-app-border rounded-lg text-sm font-medium transition-colors">Cancel</button>
                            <Button type="submit" className="flex-1">Create Project</Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};
