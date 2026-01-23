'use client';


import React, { useState, useMemo, useEffect } from 'react';
import { 
    Search, LayoutGrid, List, Filter, ArrowUpDown, 
    MoreHorizontal, Clock, Play, Download, Sparkles, 
    FileVideo, Music, Image as ImageIcon, Trash2, Edit3,
    Calendar, HardDrive, Share2, Copy, Archive, FileText,
    AlertTriangle, X, Check, Eye, MoreVertical, Layers, Lock,
    Video, Mic, Upload, Monitor, Radio, Users
} from 'lucide-react';
import { MediaAsset } from '@/types';
import { Button } from './Button';

// Extended Type for UI Logic
interface ExtendedAsset extends MediaAsset {
    origin: 'meeting' | 'studio' | 'upload';
    format?: 'mixed' | 'iso';
    resolution?: '1080p' | '4K' | '720p';
}

// Enhanced Mock Data
const INITIAL_ASSETS: ExtendedAsset[] = [
    { id: 'c1', title: 'Executive Keynote: Q4 Strategy', thumbnail: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80', duration: '45:20', date: '2024-10-24', size: '1.2 GB', type: 'video', status: 'ready', origin: 'studio', format: 'mixed', resolution: '4K' },
    { id: 'c2', title: 'Product Launch: Horizon v2', thumbnail: 'https://images.unsplash.com/photo-1505373877741-e174b4cc1035?w=800&q=80', duration: '12:15', date: '2024-10-22', size: '450 MB', type: 'video', status: 'ready', origin: 'studio', format: 'iso', resolution: '1080p' },
    { id: 'c3', title: 'Customer Success Story: Acme Corp', thumbnail: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=800&q=80', duration: '03:45', date: '2024-10-20', size: '125 MB', type: 'video', status: 'ready', origin: 'upload', resolution: '1080p' },
    { id: 'c4', title: 'Weekly Team Sync - October', thumbnail: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=800&q=80', duration: '58:00', date: '2024-10-18', size: '890 MB', type: 'video', status: 'processing', origin: 'meeting', format: 'mixed', resolution: '720p' },
    { id: 'c5', title: 'Social Media Teaser (Vertical)', thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&q=80', duration: '00:58', date: '2024-10-15', size: '45 MB', type: 'video', status: 'ready', origin: 'studio', format: 'mixed', resolution: '1080p' },
    { id: 'c6', title: 'Podcast Episode 42: The AI Shift', thumbnail: 'https://images.unsplash.com/photo-1478737270239-2f02b77ac6d5?w=800&q=80', duration: '32:10', date: '2024-10-10', size: '320 MB', type: 'audio', status: 'ready', origin: 'upload' },
];

interface LibraryProps {
    onEditAsset: (asset: MediaAsset) => void;
}

type ViewMode = 'grid' | 'list';
type SortOption = 'date' | 'name' | 'size';
type FilterType = 'all' | 'video' | 'audio' | 'image' | 'archived';

export const Library: React.FC<LibraryProps> = ({ onEditAsset }) => {
    const [assets, setAssets] = useState<ExtendedAsset[]>(INITIAL_ASSETS);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [sortBy, setSortBy] = useState<SortOption>('date');
    const [sortDesc, setSortDesc] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    
    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, assetId: string } | null>(null);
    
    // Modal States
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [shareAsset, setShareAsset] = useState<ExtendedAsset | null>(null);
    const [metadataAsset, setMetadataAsset] = useState<ExtendedAsset | null>(null);
    const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

    // Derived State
    const filteredAssets = useMemo(() => {
        return assets.filter(asset => {
            const isArchived = archivedIds.has(asset.id);
            if (activeFilter === 'archived') return isArchived;
            if (isArchived) return false; // Hide archived in normal views

            const matchesSearch = asset.title.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesType = activeFilter === 'all' || asset.type === activeFilter;
            return matchesSearch && matchesType;
        }).sort((a, b) => {
            let res = 0;
            if (sortBy === 'date') res = new Date(b.date).getTime() - new Date(a.date).getTime();
            if (sortBy === 'name') res = a.title.localeCompare(b.title);
            if (sortBy === 'size') res = parseFloat(a.size) - parseFloat(b.size);
            return sortDesc ? res : -res;
        });
    }, [assets, searchQuery, activeFilter, sortBy, sortDesc, archivedIds]);

    // Handlers
    const handleContextMenu = (e: React.MouseEvent, assetId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, assetId });
    };

    const closeContextMenu = () => setContextMenu(null);

    useEffect(() => {
        window.addEventListener('click', closeContextMenu);
        return () => window.removeEventListener('click', closeContextMenu);
    }, []);

    const handleDelete = () => {
        if (deleteId) {
            setAssets(prev => prev.filter(a => a.id !== deleteId));
            setDeleteId(null);
        }
    };

    const handleDuplicate = (assetId: string) => {
        const asset = assets.find(a => a.id === assetId);
        if (asset) {
            const newAsset = { 
                ...asset, 
                id: `copy-${Date.now()}`, 
                title: `${asset.title} (Copy)`,
                date: new Date().toLocaleDateString() 
            };
            setAssets([newAsset, ...assets]);
        }
        closeContextMenu();
    };

    const handleArchive = (assetId: string) => {
        setArchivedIds(prev => {
            const next = new Set(prev);
            if (next.has(assetId)) next.delete(assetId);
            else next.add(assetId);
            return next;
        });
        closeContextMenu();
    };

    // Helper for Badges
    const getOriginBadge = (origin: string) => {
        switch(origin) {
            case 'meeting': return { icon: <Users className="w-3 h-3" />, label: 'Meeting', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' };
            case 'studio': return { icon: <Radio className="w-3 h-3" />, label: 'Studio', color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' };
            case 'upload': return { icon: <Upload className="w-3 h-3" />, label: 'Upload', color: 'text-gray-400 bg-gray-400/10 border-gray-400/20' };
            default: return { icon: <FileVideo className="w-3 h-3" />, label: 'Unknown', color: 'text-gray-400' };
        }
    };

    const getFormatBadge = (format?: string) => {
        if (!format) return null;
        switch(format) {
            case 'mixed': return { label: 'PGM', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' };
            case 'iso': return { label: 'ISO', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' };
            default: return null;
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-app-bg text-content-high font-sans">
             {/* Header Toolbar */}
             <header className="h-20 border-b border-app-border flex items-center justify-between px-8 bg-app-bg/80 backdrop-blur-xl sticky top-0 z-20 shrink-0">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-content-high">Asset Library</h1>
                    <p className="text-xs text-content-medium mt-0.5">Manage and organize your media content</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Search */}
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-medium group-focus-within:text-indigo-500 transition-colors" />
                        <input 
                            type="text" 
                            placeholder="Search assets..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-app-surface border border-app-border rounded-lg pl-10 pr-4 py-2 text-sm text-content-high placeholder-content-low focus:outline-none focus:border-indigo-500 w-64 transition-all shadow-sm"
                        />
                    </div>

                    {/* View Options Container */}
                    <div className="flex items-center bg-app-surface border border-app-border rounded-lg p-1 shadow-sm">
                        <button 
                            onClick={() => setShowFilters(!showFilters)}
                            className={`p-1.5 rounded-md transition-colors ${showFilters ? 'bg-indigo-500/10 text-indigo-500' : 'text-content-medium hover:text-content-high hover:bg-app-bg'}`}
                            title="Filter & Sort"
                        >
                            <Filter className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-app-border mx-1" />
                        <button 
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-app-bg text-content-high shadow-sm' : 'text-content-medium hover:text-content-high'}`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-app-bg text-content-high shadow-sm' : 'text-content-medium hover:text-content-high'}`}
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Extended Filters Bar */}
            {showFilters && (
                <div className="px-8 py-3 border-b border-app-border bg-app-surface/30 flex items-center justify-between animate-slide-up">
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-semibold text-content-medium uppercase tracking-wider">Type</span>
                        <div className="flex gap-2">
                            {['all', 'video', 'audio', 'image', 'archived'].map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setActiveFilter(type as FilterType)}
                                    className={`px-3 py-1 text-xs rounded-full border transition-all capitalize ${activeFilter === type ? 'bg-indigo-500 text-white border-indigo-600' : 'bg-app-bg border-app-border text-content-medium hover:border-content-medium'}`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-xs font-semibold text-content-medium uppercase tracking-wider">Sort By</span>
                        <div className="flex items-center gap-2">
                            <select 
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as SortOption)}
                                className="bg-app-bg border border-app-border rounded-md px-2 py-1 text-xs text-content-high focus:outline-none focus:border-indigo-500 cursor-pointer"
                            >
                                <option value="date">Date Created</option>
                                <option value="name">Name</option>
                                <option value="size">File Size</option>
                            </select>
                            <button 
                                onClick={() => setSortDesc(!sortDesc)}
                                className="p-1 hover:bg-app-surface rounded text-content-medium hover:text-content-high"
                            >
                                <ArrowUpDown className={`w-3.5 h-3.5 transition-transform ${sortDesc ? 'rotate-0' : 'rotate-180'}`} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                
                {filteredAssets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-content-medium opacity-60">
                        <div className="w-16 h-16 bg-app-surface border border-app-border rounded-full flex items-center justify-center mb-4">
                            {activeFilter === 'archived' ? <Archive className="w-6 h-6"/> : <Search className="w-6 h-6" />}
                        </div>
                        <p>{activeFilter === 'archived' ? 'No archived assets.' : 'No assets found matching your criteria.'}</p>
                        {activeFilter !== 'archived' && (
                            <button onClick={() => { setSearchQuery(''); setActiveFilter('all'); }} className="text-indigo-500 text-sm mt-2 hover:underline">Clear filters</button>
                        )}
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8">
                        {filteredAssets.map((asset) => {
                            const originBadge = getOriginBadge(asset.origin);
                            const formatBadge = getFormatBadge(asset.format);
                            
                            return (
                                <div 
                                    key={asset.id} 
                                    className="group bg-app-surface border border-app-border rounded-xl overflow-hidden hover:border-indigo-500/30 transition-all hover:shadow-lg cursor-pointer flex flex-col relative h-[280px]"
                                    onContextMenu={(e) => handleContextMenu(e, asset.id)}
                                >
                                    {/* Thumb */}
                                    <div className="h-40 bg-black overflow-hidden relative shrink-0">
                                        <img src={asset.thumbnail} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" alt="" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                                        
                                        {/* Origin Badge - Top Left */}
                                        <div className={`absolute top-2 left-2 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider border flex items-center gap-1.5 shadow-sm backdrop-blur-md ${originBadge.color}`}>
                                            {originBadge.icon}
                                            {originBadge.label}
                                        </div>

                                        {/* Duration - Bottom Right */}
                                        <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-medium text-white border border-white/10 flex items-center gap-1 font-mono">
                                            <Clock className="w-3 h-3" />
                                            {asset.duration}
                                        </div>

                                        {/* Hover Actions */}
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-3 bg-black/20 backdrop-blur-[1px]">
                                            <button onClick={() => onEditAsset(asset)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-black shadow-xl hover:scale-110 transition-transform" title="Open Editor">
                                                <Play className="w-4 h-4 ml-0.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Meta */}
                                    <div className="p-4 flex-1 flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start mb-1.5">
                                                <h3 className="font-semibold text-sm text-content-high line-clamp-2 leading-tight group-hover:text-indigo-500 transition-colors" title={asset.title}>{asset.title}</h3>
                                                <button 
                                                    className="text-content-medium hover:text-content-high p-1 -mr-2 -mt-1 rounded hover:bg-app-bg shrink-0"
                                                    onClick={(e) => handleContextMenu(e, asset.id)}
                                                >
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-content-medium">
                                                {formatBadge && (
                                                    <span className={`px-1.5 py-0.5 rounded border font-bold uppercase ${formatBadge.color}`}>
                                                        {formatBadge.label}
                                                    </span>
                                                )}
                                                {asset.resolution && (
                                                    <span className="px-1.5 py-0.5 rounded border border-app-border bg-app-bg font-mono">
                                                        {asset.resolution}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="pt-3 border-t border-app-border/50 flex items-center justify-between text-[10px] text-content-medium mt-auto">
                                            <span className="flex items-center gap-1.5">
                                                <Calendar className="w-3 h-3" />
                                                {asset.date}
                                            </span>
                                            <span className="font-mono opacity-80">{asset.size}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    // List View
                    <div className="bg-app-surface/30 border border-app-border rounded-xl overflow-hidden">
                        <div className="grid grid-cols-12 px-6 py-3 border-b border-app-border bg-app-surface/50 text-xs font-semibold text-content-medium uppercase tracking-wider">
                            <div className="col-span-4">Name</div>
                            <div className="col-span-2">Origin</div>
                            <div className="col-span-2">Format</div>
                            <div className="col-span-2">Date</div>
                            <div className="col-span-1">Duration</div>
                            <div className="col-span-1 text-right">Actions</div>
                        </div>
                        <div className="divide-y divide-app-border">
                            {filteredAssets.map((asset) => {
                                const originBadge = getOriginBadge(asset.origin);
                                const formatBadge = getFormatBadge(asset.format);

                                return (
                                    <div 
                                        key={asset.id} 
                                        className="grid grid-cols-12 px-6 py-4 items-center hover:bg-app-surface transition-colors group cursor-default"
                                        onContextMenu={(e) => handleContextMenu(e, asset.id)}
                                    >
                                        <div className="col-span-4 flex items-center gap-4 min-w-0">
                                            <div className="w-12 h-8 bg-gray-800 rounded overflow-hidden relative shrink-0">
                                                <img src={asset.thumbnail} className="w-full h-full object-cover" alt="" />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-medium text-content-high truncate" title={asset.title}>{asset.title}</span>
                                                <span className="text-[10px] text-content-medium">{asset.size} • {asset.resolution}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="col-span-2">
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${originBadge.color}`}>
                                                {originBadge.icon}
                                                {originBadge.label}
                                            </span>
                                        </div>

                                        <div className="col-span-2">
                                            {formatBadge ? (
                                                <span className={`inline-flex px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${formatBadge.color}`}>
                                                    {formatBadge.label}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-content-low italic">N/A</span>
                                            )}
                                        </div>

                                        <div className="col-span-2 text-sm text-content-medium flex items-center gap-2">
                                            {asset.date}
                                        </div>
                                        <div className="col-span-1 text-sm text-content-medium font-mono">{asset.duration}</div>
                                        
                                        <div className="col-span-1 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => onEditAsset(asset)} className="p-1.5 hover:bg-indigo-500/10 text-content-medium hover:text-indigo-500 rounded" title="Edit">
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleContextMenu({clientX: 0, clientY: 0} as any, asset.id)} className="p-1.5 hover:bg-app-surface-2 text-content-medium hover:text-content-high rounded">
                                                <MoreVertical className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div 
                    className="fixed z-50 bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-2xl py-1 w-56 animate-scale-in origin-top-left overflow-hidden" 
                    style={{ left: Math.min(contextMenu.x, window.innerWidth - 240), top: Math.min(contextMenu.y, window.innerHeight - 300) }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-800/50 flex justify-between items-center">
                        <span>Asset Actions</span>
                        <span className="text-gray-600 font-mono">ID: {contextMenu.assetId.slice(0,4)}</span>
                    </div>
                    
                    <button onClick={() => { onEditAsset(assets.find(a => a.id === contextMenu.assetId)!); closeContextMenu(); }} className="w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-600 hover:text-white text-gray-200 flex items-center gap-3 transition-colors">
                        <Edit3 className="w-3.5 h-3.5" /> Open in Editor
                    </button>
                    <button onClick={() => { onEditAsset(assets.find(a => a.id === contextMenu.assetId)!); closeContextMenu(); }} className="w-full text-left px-4 py-2.5 text-xs hover:bg-purple-600 hover:text-white text-gray-200 flex items-center gap-3 transition-colors">
                        <Sparkles className="w-3.5 h-3.5" /> Generate Viral Clips
                    </button>
                    
                    <div className="h-px bg-gray-700/50 my-1" />
                    
                    <button onClick={() => { setShareAsset(assets.find(a => a.id === contextMenu.assetId)!); closeContextMenu(); }} className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-700 text-gray-300 flex items-center gap-3 transition-colors">
                        <Share2 className="w-3.5 h-3.5" /> Share
                    </button>
                    <button onClick={() => { handleDuplicate(contextMenu.assetId); }} className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-700 text-gray-300 flex items-center gap-3 transition-colors">
                        <Copy className="w-3.5 h-3.5" /> Duplicate
                    </button>
                    <button onClick={() => { setMetadataAsset(assets.find(a => a.id === contextMenu.assetId)!); closeContextMenu(); }} className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-700 text-gray-300 flex items-center gap-3 transition-colors">
                        <FileText className="w-3.5 h-3.5" /> View Metadata
                    </button>
                    <button className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-700 text-gray-300 flex items-center gap-3 transition-colors">
                        <Download className="w-3.5 h-3.5" /> Download Source
                    </button>

                    <div className="h-px bg-gray-700/50 my-1" />

                    <button onClick={() => handleArchive(contextMenu.assetId)} className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-700 text-gray-300 flex items-center gap-3 transition-colors">
                        <Archive className="w-3.5 h-3.5" /> {archivedIds.has(contextMenu.assetId) ? 'Unarchive' : 'Archive'}
                    </button>
                    <button onClick={() => { setDeleteId(contextMenu.assetId); closeContextMenu(); }} className="w-full text-left px-4 py-2.5 text-xs hover:bg-red-900/30 text-red-400 flex items-center gap-3 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> Delete Permanently
                    </button>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
                    <div className="bg-[#1a1a1a] border border-gray-700 rounded-xl p-6 max-w-sm w-full shadow-2xl relative z-10 animate-scale-in">
                        <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">Delete Asset?</h3>
                        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                            Are you sure you want to delete <span className="text-white font-semibold">"{assets.find(a => a.id === deleteId)?.title}"</span>? This action cannot be undone and will remove it from all projects.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium text-sm transition-colors border border-gray-700">Cancel</button>
                            <button onClick={handleDelete} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm transition-colors shadow-lg shadow-red-900/20">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Share Modal */}
            {shareAsset && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShareAsset(null)} />
                    <div className="bg-[#1a1a1a] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl relative z-10 animate-scale-in overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#202020]">
                            <h3 className="text-sm font-bold text-white">Share "{shareAsset.title}"</h3>
                            <button onClick={() => setShareAsset(null)} className="text-gray-400 hover:text-white"><X className="w-4 h-4"/></button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Invite People</label>
                                <div className="flex gap-2">
                                    <input type="text" placeholder="colleague@example.com" className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                                    <select className="bg-black border border-gray-700 rounded-lg px-2 text-xs text-gray-300 focus:outline-none">
                                        <option>Can View</option>
                                        <option>Can Edit</option>
                                    </select>
                                    <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 rounded-lg text-xs font-bold">Invite</button>
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Public Link</label>
                                <div className="flex items-center gap-2 bg-black border border-gray-700 rounded-lg p-1 pl-3">
                                    <Lock className="w-3 h-3 text-emerald-500" />
                                    <span className="text-xs text-gray-400 truncate flex-1">https://app.allstrm.com/assets/{shareAsset.id}/view</span>
                                    <button className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs font-medium text-white transition-colors" onClick={() => alert('Link copied!')}>Copy</button>
                                </div>
                            </div>

                            <div className="pt-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">Access Control</label>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold text-white">JD</div>
                                            <div>
                                                <div className="text-sm font-medium text-white">John Doe (You)</div>
                                                <div className="text-[10px] text-gray-500">Owner</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between opacity-50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300">TM</div>
                                            <div>
                                                <div className="text-sm font-medium text-white">Team Members</div>
                                                <div className="text-[10px] text-gray-500">Can View</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Metadata Modal */}
            {metadataAsset && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMetadataAsset(null)} />
                    <div className="bg-[#1a1a1a] border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl relative z-10 animate-scale-in">
                        <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center bg-[#202020] rounded-t-xl">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500"/> Technical Metadata</h3>
                            <button onClick={() => setMetadataAsset(null)} className="text-gray-400 hover:text-white"><X className="w-4 h-4"/></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1"><div className="text-[10px] uppercase text-gray-500 font-bold">File Name</div><div className="text-xs text-white truncate" title={metadataAsset.title}>{metadataAsset.title}</div></div>
                                <div className="space-y-1"><div className="text-[10px] uppercase text-gray-500 font-bold">ID</div><div className="text-xs font-mono text-gray-400">{metadataAsset.id}</div></div>
                                <div className="space-y-1"><div className="text-[10px] uppercase text-gray-500 font-bold">Resolution</div><div className="text-xs text-white">{metadataAsset.resolution || '1920 x 1080'}</div></div>
                                <div className="space-y-1"><div className="text-[10px] uppercase text-gray-500 font-bold">Frame Rate</div><div className="text-xs text-white">60 fps</div></div>
                                <div className="space-y-1"><div className="text-[10px] uppercase text-gray-500 font-bold">Codec</div><div className="text-xs text-white">H.264 (High)</div></div>
                                <div className="space-y-1"><div className="text-[10px] uppercase text-gray-500 font-bold">Bitrate</div><div className="text-xs text-white">12.5 Mbps</div></div>
                                <div className="space-y-1"><div className="text-[10px] uppercase text-gray-500 font-bold">Audio</div><div className="text-xs text-white">AAC 48kHz Stereo</div></div>
                                <div className="space-y-1"><div className="text-[10px] uppercase text-gray-500 font-bold">Size</div><div className="text-xs text-white">{metadataAsset.size}</div></div>
                                <div className="space-y-1"><div className="text-[10px] uppercase text-gray-500 font-bold">Origin</div><div className="text-xs text-white capitalize">{metadataAsset.origin}</div></div>
                                <div className="space-y-1"><div className="text-[10px] uppercase text-gray-500 font-bold">Format</div><div className="text-xs text-white capitalize">{metadataAsset.format || 'Standard'}</div></div>
                            </div>
                            <div className="pt-4 border-t border-gray-800">
                                <div className="text-[10px] uppercase text-gray-500 font-bold mb-2">MD5 Checksum</div>
                                <div className="text-[9px] font-mono text-gray-600 bg-black p-2 rounded border border-gray-800 break-all">f4a3c2d1e5b6a7890123456789abcdef</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
