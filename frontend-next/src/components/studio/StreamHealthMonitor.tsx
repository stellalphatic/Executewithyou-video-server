'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    Activity, Wifi, WifiOff, AlertTriangle, Check, X, ArrowUpDown, Users, MessageSquare,
    RefreshCw, BarChart3, Signal, Zap, Eye, ChevronDown, ChevronRight, Play, Pause
} from 'lucide-react';
import { Destination, DestinationHealth, DestinationStatus, Tier } from '@/types';

interface PlatformChat {
    platform: string;
    messages: ChatMessage[];
    viewerCount: number;
    isConnected: boolean;
}

interface ChatMessage {
    id: string;
    platform: string;
    author: string;
    content: string;
    timestamp: number;
    isModerator?: boolean;
    isHighlighted?: boolean;
}

interface StreamHealthMonitorProps {
    destinations: Destination[];
    tier: Tier;
    onHotSwitch?: (fromId: string, toId: string) => void;
    onRetry?: (destinationId: string) => void;
    onToggle?: (destinationId: string, enabled: boolean) => void;
}

// Health status calculation
const getHealthStatus = (health?: DestinationHealth): 'excellent' | 'good' | 'fair' | 'poor' => {
    if (!health) return 'good';
    
    const { bitrate, fps, droppedFrames } = health;
    const dropRate = droppedFrames / (fps || 1);
    
    if (bitrate > 4000 && dropRate < 0.01) return 'excellent';
    if (bitrate > 2500 && dropRate < 0.05) return 'good';
    if (bitrate > 1500 && dropRate < 0.1) return 'fair';
    return 'poor';
};

const getStatusColor = (status: DestinationStatus) => {
    switch (status) {
        case 'live': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
        case 'connecting':
        case 'reconnecting': return 'text-amber-500 bg-amber-500/10 border-amber-500/30 animate-pulse';
        case 'unstable': return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
        case 'error':
        case 'offline': return 'text-red-500 bg-red-500/10 border-red-500/30';
        default: return 'text-content-low bg-app-bg border-app-border';
    }
};

const getHealthColor = (health: 'excellent' | 'good' | 'fair' | 'poor') => {
    switch (health) {
        case 'excellent': return 'text-emerald-500';
        case 'good': return 'text-blue-500';
        case 'fair': return 'text-amber-500';
        case 'poor': return 'text-red-500';
    }
};

export const StreamHealthMonitor: React.FC<StreamHealthMonitorProps> = ({
    destinations,
    tier,
    onHotSwitch,
    onRetry,
    onToggle
}) => {
    const [expandedDestinations, setExpandedDestinations] = useState<Set<string>>(new Set());
    const [platformChats, setPlatformChats] = useState<PlatformChat[]>([]);
    const [showChatPanel, setShowChatPanel] = useState(false);
    const [activeChatPlatform, setActiveChatPlatform] = useState<string | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Simulated chat connection (would integrate with real platform APIs)
    useEffect(() => {
        const liveDestinations = destinations.filter(d => d.status === 'live');
        
        setPlatformChats(liveDestinations.map(d => ({
            platform: d.platform,
            messages: [], // Would be populated from platform API
            viewerCount: Math.floor(Math.random() * 1000), // Simulated
            isConnected: true
        })));
    }, [destinations]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [platformChats, activeChatPlatform]);

    const toggleExpanded = (id: string) => {
        setExpandedDestinations(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const liveCount = destinations.filter(d => d.status === 'live').length;
    const errorCount = destinations.filter(d => d.status === 'error' || d.status === 'offline').length;
    const totalViewers = platformChats.reduce((sum, p) => sum + p.viewerCount, 0);

    const isEnterprise = tier >= Tier.ENTERPRISE;
    const isBroadcast = tier >= Tier.BROADCAST;

    return (
        <div className="flex flex-col h-full bg-app-surface/50 border-r border-app-border">
            {/* Header with Summary */}
            <div className="p-4 border-b border-app-border bg-app-surface">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-500" />
                        <h3 className="text-xs font-bold text-content-medium uppercase tracking-wider">
                            Stream Health
                        </h3>
                    </div>
                    {isEnterprise && (
                        <button
                            onClick={() => setShowChatPanel(!showChatPanel)}
                            className={`p-1.5 rounded transition-colors ${showChatPanel ? 'bg-indigo-500/20 text-indigo-400' : 'hover:bg-app-bg text-content-medium'}`}
                            title="Platform Chat"
                        >
                            <MessageSquare className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-app-bg border border-app-border text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                            <Signal className="w-3 h-3 text-emerald-500" />
                            <span className="text-lg font-bold text-content-high">{liveCount}</span>
                        </div>
                        <span className="text-[9px] text-content-low uppercase">Live</span>
                    </div>
                    <div className="p-2 rounded-lg bg-app-bg border border-app-border text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                            <Eye className="w-3 h-3 text-indigo-500" />
                            <span className="text-lg font-bold text-content-high">{totalViewers.toLocaleString()}</span>
                        </div>
                        <span className="text-[9px] text-content-low uppercase">Viewers</span>
                    </div>
                    <div className="p-2 rounded-lg bg-app-bg border border-app-border text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                            {errorCount > 0 ? (
                                <AlertTriangle className="w-3 h-3 text-red-500" />
                            ) : (
                                <Check className="w-3 h-3 text-emerald-500" />
                            )}
                            <span className={`text-lg font-bold ${errorCount > 0 ? 'text-red-500' : 'text-content-high'}`}>
                                {errorCount}
                            </span>
                        </div>
                        <span className="text-[9px] text-content-low uppercase">Errors</span>
                    </div>
                </div>
            </div>

            {/* Destinations List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                {destinations.length === 0 ? (
                    <div className="text-center py-8">
                        <Wifi className="w-8 h-8 text-content-low mx-auto mb-2 opacity-50" />
                        <p className="text-xs text-content-low">No destinations configured</p>
                    </div>
                ) : (
                    destinations.map(dest => {
                        const healthStatus = getHealthStatus(dest.health);
                        const isExpanded = expandedDestinations.has(dest.id);
                        const platformChat = platformChats.find(p => p.platform === dest.platform);

                        return (
                            <div 
                                key={dest.id} 
                                className={`rounded-lg border overflow-hidden transition-all ${getStatusColor(dest.status)}`}
                            >
                                {/* Destination Header */}
                                <div 
                                    className="p-3 flex items-center gap-3 cursor-pointer hover:bg-white/5"
                                    onClick={() => toggleExpanded(dest.id)}
                                >
                                    <button className="text-content-medium">
                                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    </button>
                                    
                                    <div className="w-8 h-8 rounded-lg bg-app-bg/50 flex items-center justify-center text-lg">
                                        {dest.platform === 'youtube' && '📺'}
                                        {dest.platform === 'twitch' && '🎮'}
                                        {dest.platform === 'facebook' && '📘'}
                                        {dest.platform === 'linkedin' && '💼'}
                                        {dest.platform === 'x' && '𝕏'}
                                        {dest.platform === 'kick' && '🟢'}
                                        {dest.platform === 'custom_rtmp' && '📡'}
                                        {!['youtube', 'twitch', 'facebook', 'linkedin', 'x', 'kick', 'custom_rtmp'].includes(dest.platform) && '🌐'}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold truncate">{dest.name}</span>
                                            {dest.status === 'live' && (
                                                <span className="text-[8px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded animate-pulse">LIVE</span>
                                            )}
                                        </div>
                                        <span className="text-[10px] capitalize opacity-70">{dest.status}</span>
                                    </div>

                                    {/* Health Indicator */}
                                    {dest.status === 'live' && dest.health && (
                                        <div className={`flex items-center gap-1 ${getHealthColor(healthStatus)}`}>
                                            <BarChart3 className="w-3 h-3" />
                                            <span className="text-[9px] font-bold uppercase">{healthStatus}</span>
                                        </div>
                                    )}

                                    {/* Platform Viewer Count */}
                                    {platformChat && dest.status === 'live' && (
                                        <div className="flex items-center gap-1 text-content-medium">
                                            <Eye className="w-3 h-3" />
                                            <span className="text-[10px] font-mono">{platformChat.viewerCount}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="px-3 pb-3 pt-2 border-t border-white/10 space-y-3">
                                        {/* Health Metrics */}
                                        {dest.health && dest.status === 'live' && (
                                            <div className="grid grid-cols-3 gap-2 text-center">
                                                <div className="p-2 bg-app-bg/50 rounded">
                                                    <div className="text-xs font-bold text-content-high">
                                                        {dest.health.bitrate.toLocaleString()}
                                                    </div>
                                                    <div className="text-[9px] text-content-low">kbps</div>
                                                </div>
                                                <div className="p-2 bg-app-bg/50 rounded">
                                                    <div className="text-xs font-bold text-content-high">
                                                        {dest.health.fps}
                                                    </div>
                                                    <div className="text-[9px] text-content-low">FPS</div>
                                                </div>
                                                <div className="p-2 bg-app-bg/50 rounded">
                                                    <div className={`text-xs font-bold ${dest.health.droppedFrames > 10 ? 'text-amber-500' : 'text-content-high'}`}>
                                                        {dest.health.droppedFrames}
                                                    </div>
                                                    <div className="text-[9px] text-content-low">Dropped</div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Error Message */}
                                        {dest.errorMessage && (
                                            <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-[10px] text-red-400">
                                                {dest.errorMessage}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex gap-2">
                                            {(dest.status === 'error' || dest.status === 'offline') && onRetry && (
                                                <button
                                                    onClick={() => onRetry(dest.id)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-app-bg hover:bg-app-surface border border-app-border rounded text-[10px] font-bold transition-colors"
                                                >
                                                    <RefreshCw className="w-3 h-3" />
                                                    Retry
                                                </button>
                                            )}
                                            
                                            {dest.status === 'live' && onToggle && (
                                                <button
                                                    onClick={() => onToggle(dest.id, false)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded text-[10px] font-bold text-red-400 transition-colors"
                                                >
                                                    <Pause className="w-3 h-3" />
                                                    Stop
                                                </button>
                                            )}

                                            {dest.status === 'idle' && onToggle && (
                                                <button
                                                    onClick={() => onToggle(dest.id, true)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded text-[10px] font-bold text-emerald-400 transition-colors"
                                                >
                                                    <Play className="w-3 h-3" />
                                                    Start
                                                </button>
                                            )}

                                            {/* Hot Switch (Enterprise only) */}
                                            {isEnterprise && dest.status === 'error' && destinations.filter(d => d.status === 'live').length > 0 && onHotSwitch && (
                                                <button
                                                    onClick={() => {
                                                        const liveDestination = destinations.find(d => d.status === 'live');
                                                        if (liveDestination) onHotSwitch(liveDestination.id, dest.id);
                                                    }}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded text-[10px] font-bold text-indigo-400 transition-colors"
                                                >
                                                    <ArrowUpDown className="w-3 h-3" />
                                                    Hot Switch
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Platform Chat Panel (Enterprise) */}
            {isEnterprise && showChatPanel && (
                <div className="border-t border-app-border bg-app-surface">
                    <div className="p-2 border-b border-app-border/50 flex gap-1">
                        {platformChats.map(chat => (
                            <button
                                key={chat.platform}
                                onClick={() => setActiveChatPlatform(chat.platform)}
                                className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-colors ${
                                    activeChatPlatform === chat.platform 
                                        ? 'bg-indigo-500 text-white' 
                                        : 'bg-app-bg text-content-medium hover:text-content-high'
                                }`}
                            >
                                {chat.platform}
                                {chat.messages.length > 0 && (
                                    <span className="ml-1 bg-white/20 px-1 rounded">{chat.messages.length}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="h-40 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {activeChatPlatform ? (
                            platformChats.find(c => c.platform === activeChatPlatform)?.messages.length ? (
                                platformChats.find(c => c.platform === activeChatPlatform)?.messages.map(msg => (
                                    <div 
                                        key={msg.id} 
                                        className={`p-1.5 rounded text-[10px] ${msg.isHighlighted ? 'bg-indigo-500/10 border border-indigo-500/30' : ''}`}
                                    >
                                        <span className={`font-bold ${msg.isModerator ? 'text-amber-400' : 'text-indigo-400'}`}>
                                            {msg.author}:
                                        </span>
                                        <span className="text-content-medium ml-1">{msg.content}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-4 text-[10px] text-content-low">
                                    No messages yet
                                </div>
                            )
                        ) : (
                            <div className="text-center py-4 text-[10px] text-content-low">
                                Select a platform to view chat
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                </div>
            )}

            {/* Tier Upgrade Notice */}
            {!isBroadcast && (
                <div className="p-3 border-t border-app-border bg-amber-500/5">
                    <div className="flex items-center gap-2 text-[10px] text-amber-500">
                        <Zap className="w-3 h-3" />
                        <span>Upgrade to Broadcast tier for advanced health monitoring</span>
                    </div>
                </div>
            )}
        </div>
    );
};
