'use client';


import React, { useState, useEffect, useCallback } from 'react';
import {
    Youtube, Facebook, Linkedin, Twitch, Instagram, Twitter,
    Plus, X, ChevronRight, CheckCircle2, Trash2, ToggleLeft, ToggleRight, Lock,
    AlertTriangle, AlertOctagon, ExternalLink, Link2, Key, Loader2
} from 'lucide-react';
import { Button } from './Button';
import { Destination, DestinationStatus } from '@/types';
import { ApiClient, OAuthProvider, OAuthConnection } from '@/lib/api';

interface DestinationsProps {
    onModalToggle?: (isOpen: boolean) => void;
    mode?: 'manage' | 'select'; // 'select' is for the creation flow
    onSkip?: () => void;
    destinations?: Destination[];
    onAddDestination?: (destination: Omit<Destination, 'id' | 'enabled' | 'status'>) => Promise<void>;
    onRemoveDestination?: (id: string) => Promise<void>;
    onToggleDestination?: (id: string, enabled: boolean) => Promise<void>;
    canAddMore?: boolean; // New Prop for Tier Enforcement
    userId?: string; // User ID for OAuth
    roomId?: string; // Room ID for creating destinations
}

const StatusBadge = ({ status, health }: { status: DestinationStatus, health?: any }) => {
    switch (status) {
        case 'live':
            return (
                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs font-bold text-emerald-500 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        LIVE
                    </div>
                    {health && (
                        <div className="flex items-center gap-2 text-[9px] font-mono text-content-medium">
                            <span>{(health.bitrate / 1000).toFixed(1)} Mbps</span>
                            <span className="text-content-low">|</span>
                            <span>{health.fps} FPS</span>
                        </div>
                    )}
                </div>
            );
        case 'connecting':
            return (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-xs font-bold text-indigo-500">
                    <div className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                    CONNECTING
                </div>
            );
        case 'reconnecting':
            return (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-xs font-bold text-amber-500">
                    <div className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                    RECONNECTING
                </div>
            );
        case 'unstable':
            return (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-xs font-bold text-amber-500">
                    <AlertTriangle className="w-3 h-3" />
                    UNSTABLE
                </div>
            );
        case 'error':
            return (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-xs font-bold text-red-500">
                    <AlertOctagon className="w-3 h-3" />
                    ERROR
                </div>
            );
        default:
            return (
                <div className="text-xs font-medium text-content-low">
                    READY
                </div>
            );
    }
};

export const Destinations: React.FC<DestinationsProps> = ({
    onModalToggle,
    mode = 'manage',
    onSkip,
    destinations: externalDestinations,
    onAddDestination: externalOnAdd,
    onRemoveDestination: externalOnRemove,
    onToggleDestination: externalOnToggle,
    canAddMore = true,
    userId,
    roomId
}) => {
    const [isModalOpen, setIsModalOpen] = useState(mode === 'select');

    // Internal state for destinations when no external handlers provided (manage mode)
    const [internalDestinations, setInternalDestinations] = useState<Destination[]>(() => {
        // Load from localStorage on mount
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('allstrm_destinations');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch {
                    return [];
                }
            }
        }
        return [];
    });

    // Use external destinations if provided, otherwise use internal
    const destinations = externalDestinations ?? internalDestinations;

    // Internal handlers when external not provided
    const onAddDestination = externalOnAdd ?? (async (dest: Omit<Destination, 'id' | 'enabled' | 'status'>) => {
        const newDest: Destination = {
            ...dest,
            id: `local-${Date.now()}`,
            enabled: true,
            status: 'idle'
        };
        const updated = [...internalDestinations, newDest];
        setInternalDestinations(updated);
        localStorage.setItem('allstrm_destinations', JSON.stringify(updated));
    });

    const onRemoveDestination = externalOnRemove ?? (async (id: string) => {
        const updated = internalDestinations.filter(d => d.id !== id);
        setInternalDestinations(updated);
        localStorage.setItem('allstrm_destinations', JSON.stringify(updated));
    });

    const onToggleDestination = externalOnToggle ?? (async (id: string, enabled: boolean) => {
        const updated = internalDestinations.map(d =>
            d.id === id ? { ...d, enabled } : d
        );
        setInternalDestinations(updated);
        localStorage.setItem('allstrm_destinations', JSON.stringify(updated));
    });

    // OAuth state
    const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
    const [oauthConnections, setOauthConnections] = useState<OAuthConnection[]>([]);
    const [loadingOAuth, setLoadingOAuth] = useState(false);
    const [selectedPlatform, setSelectedPlatform] = useState<typeof platforms[0] | null>(null);
    const [showConnectionPicker, setShowConnectionPicker] = useState(false);
    const [showManualForm, setShowManualForm] = useState(false);
    const [manualRtmpUrl, setManualRtmpUrl] = useState('');
    const [manualStreamKey, setManualStreamKey] = useState('');
    const [addingDestination, setAddingDestination] = useState(false);

    // Fetch OAuth providers and connections
    const fetchOAuthData = useCallback(async () => {
        if (!userId) return;
        setLoadingOAuth(true);
        try {
            const [providersRes, connectionsRes] = await Promise.all([
                ApiClient.listOAuthProviders(),
                ApiClient.listOAuthConnections(userId)
            ]);
            setOauthProviders(providersRes.providers);
            setOauthConnections(connectionsRes.connections);
        } catch (e) {
            console.error('[Destinations] Failed to fetch OAuth data:', e);
        } finally {
            setLoadingOAuth(false);
        }
    }, [userId]);

    // Check for OAuth callback on mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const success = params.get('success');
        const provider = params.get('provider');

        if (success === 'true' && provider) {
            // OAuth completed successfully, refresh connections
            console.log(`[Destinations] OAuth completed for ${provider}`);
            fetchOAuthData();
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [fetchOAuthData]);

    // Fetch OAuth data on mount
    useEffect(() => {
        fetchOAuthData();
    }, [fetchOAuthData]);

    useEffect(() => {
        if (mode === 'select') setIsModalOpen(true);
    }, [mode]);

    useEffect(() => {
        onModalToggle?.(isModalOpen);
    }, [isModalOpen, onModalToggle]);

    const handleClose = () => {
        setIsModalOpen(false);
        setSelectedPlatform(null);
        setShowConnectionPicker(false);
        setShowManualForm(false);
    };

    // Check if a provider is configured on the backend
    const isProviderConfigured = (providerId: string): boolean => {
        const provider = oauthProviders.find(p => p.name === providerId);
        return provider?.is_configured ?? false;
    };

    // Get existing OAuth connections for a provider
    const getConnectionsForProvider = (providerId: string): OAuthConnection[] => {
        return oauthConnections.filter(c => c.provider === providerId);
    };

    // Handle platform click - show options based on OAuth availability
    const handlePlatformClick = (platform: typeof platforms[0]) => {
        if (!canAddMore && destinations.length > 0) return;

        setSelectedPlatform(platform);

        // Check if platform supports OAuth and is configured
        if (platform.supportsOAuth && isProviderConfigured(platform.id)) {
            const existingConnections = getConnectionsForProvider(platform.id);
            if (existingConnections.length > 0) {
                // User has existing connections, show picker
                setShowConnectionPicker(true);
            } else {
                // No existing connections, redirect to OAuth
                handleOAuthRedirect(platform.id);
            }
        } else if (!platform.supportsOAuth) {
            // Platform doesn't support OAuth (Kick, Custom RTMP) - show manual form
            setShowManualForm(true);
        } else {
            // Platform supports OAuth but not configured on backend - show manual form as fallback
            setShowManualForm(true);
        }
    };

    // Redirect to OAuth provider
    const handleOAuthRedirect = (providerId: string) => {
        if (!userId) {
            console.error('[Destinations] No user ID for OAuth');
            return;
        }
        const redirectUri = window.location.pathname;
        const oauthUrl = ApiClient.getOAuthUrl(providerId, userId, redirectUri);
        window.location.href = oauthUrl;
    };

    // Add destination from OAuth connection
    const handleAddFromConnection = async (connection: OAuthConnection) => {
        if (!roomId || !onAddDestination) return;

        setAddingDestination(true);
        try {
            // Get stream destination info from OAuth connection
            const streamInfo = await ApiClient.getStreamDestinationFromOAuth(connection.id);

            await onAddDestination({
                platform: streamInfo.provider,
                name: connection.provider_display_name || connection.provider_username || `${selectedPlatform?.name} Stream`,
                url: streamInfo.rtmp_url,
                streamKey: streamInfo.stream_key
            });

            handleClose();
        } catch (e) {
            console.error('[Destinations] Failed to add destination from OAuth:', e);
            alert('Failed to get stream destination. Please try again or use manual RTMP.');
        } finally {
            setAddingDestination(false);
        }
    };

    // Add destination with manual RTMP
    const handleAddManual = async () => {
        if (!selectedPlatform || !onAddDestination) return;

        setAddingDestination(true);
        try {
            await onAddDestination({
                platform: selectedPlatform.id,
                name: `${selectedPlatform.name} Stream`,
                url: manualRtmpUrl,
                streamKey: manualStreamKey
            });

            setManualRtmpUrl('');
            setManualStreamKey('');
            handleClose();
        } catch (e) {
            console.error('[Destinations] Failed to add manual destination:', e);
        } finally {
            setAddingDestination(false);
        }
    };

    // Legacy handler for simple add (used when OAuth not available)
    const handleAdd = (platform: typeof platforms[0]) => {
        handlePlatformClick(platform);
    };

    // 13 Platform definitions - IDs match Rust Backend exactly
    const platforms = [
        { id: 'youtube', name: 'YouTube', icon: <Youtube className="w-8 h-8 text-[#FF0000]" />, supportsOAuth: true },
        { id: 'facebook', name: 'Facebook Live', icon: <Facebook className="w-8 h-8 text-[#1877F2]" />, supportsOAuth: true },
        { id: 'linkedin', name: 'LinkedIn Live', icon: <Linkedin className="w-8 h-8 text-[#0A66C2]" />, supportsOAuth: true },
        { id: 'x', name: 'X (Twitter)', icon: <Twitter className="w-8 h-8 text-content-high" />, supportsOAuth: true },
        { id: 'twitch', name: 'Twitch', icon: <Twitch className="w-8 h-8 text-[#9146FF]" />, supportsOAuth: true },
        { id: 'instagram', name: 'Instagram Live', icon: <Instagram className="w-8 h-8 text-[#E4405F]" />, supportsOAuth: true },
        { id: 'tiktok', name: 'TikTok Live', icon: <div className="w-8 h-8 bg-black text-white font-bold flex items-center justify-center rounded-full text-xs border border-white/20 shadow-sm" style={{textShadow: "1px 1px 0 #FF0050, -1px -1px 0 #00F2EA"}}>T</div>, supportsOAuth: true },
        { id: 'kick', name: 'Kick', icon: <div className="w-8 h-8 bg-[#53FC18] text-black font-black flex items-center justify-center rounded text-sm shadow-sm">K</div>, supportsOAuth: false },
        { id: 'vimeo', name: 'Vimeo', icon: <div className="w-8 h-8 bg-[#1AB7EA] text-white font-bold flex items-center justify-center rounded-full text-sm shadow-sm">v</div>, supportsOAuth: true },
        { id: 'amazon', name: 'Amazon Live', icon: <div className="w-8 h-8 bg-[#FF9900] text-black font-bold flex items-center justify-center rounded text-xs shadow-sm">a</div>, supportsOAuth: true },
        { id: 'brightcove', name: 'Brightcove', icon: <div className="w-8 h-8 bg-[#BC2C3D] text-white font-bold flex items-center justify-center rounded text-sm shadow-sm">B</div>, supportsOAuth: true },
        { id: 'hopin', name: 'Hopin', icon: <div className="w-8 h-8 bg-black text-white font-bold flex items-center justify-center rounded-full text-xs border border-white/20 shadow-sm">H</div>, supportsOAuth: true },
        { id: 'custom_rtmp', name: 'Custom RTMP', icon: <div className="w-8 h-8 bg-gray-600 text-white font-bold flex items-center justify-center rounded text-[10px] shadow-sm">RTMP</div>, supportsOAuth: false },
    ];

    const getPlatformInfo = (id: string) => {
        return platforms.find(p => p.id === id) || platforms.find(p => p.id === 'custom_rtmp')!;
    };

    return (
        <div className="flex-1 flex flex-col h-full relative animate-fade-in bg-app-bg">
             {/* Only show main dashboard content if NOT in select mode */}
             {mode !== 'select' && (
                <>
                    {/* Header */}
                    <header className="h-20 border-b border-app-border/60 flex items-center justify-between px-10 bg-app-bg/80 backdrop-blur-xl z-10 transition-opacity duration-300">
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-content-high">Destinations</h1>
                            <div className="flex items-center gap-2 text-[10px] font-mono text-content-medium uppercase tracking-widest mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                <span>Multi-stream Gateway</span>
                                <span className="text-content-low">|</span>
                                <span>{destinations.length} Active</span>
                            </div>
                        </div>
                    </header>

                    {/* Content */}
                    <div className="flex-1 flex flex-col p-10 overflow-hidden">
                        
                        {destinations.length === 0 ? (
                            /* Empty State Content */
                            <div className="flex-1 flex flex-col items-center justify-center">
                                <div className="max-w-xl text-center animate-slide-up flex flex-col items-center">
                                    {/* Icons Cluster */}
                                    <div className="flex justify-center -space-x-3 mb-8 animate-scale-in">
                                        <div className="w-12 h-12 rounded-full bg-[#FF0000]/10 border border-[#FF0000]/20 flex items-center justify-center z-0 relative shadow-sm transition-transform hover:scale-110"><Youtube className="w-5 h-5 text-[#FF0000]" /></div>
                                        <div className="w-12 h-12 rounded-full bg-[#1877F2]/10 border border-[#1877F2]/20 flex items-center justify-center z-10 relative shadow-sm transition-transform hover:scale-110"><Facebook className="w-5 h-5 text-[#1877F2]" /></div>
                                        <div className="w-12 h-12 rounded-full bg-[#E4405F]/10 border border-[#E4405F]/20 flex items-center justify-center z-20 relative shadow-sm transition-transform hover:scale-110"><Instagram className="w-5 h-5 text-[#E4405F]" /></div>
                                        <div className="w-12 h-12 rounded-full bg-app-surface border border-app-border flex items-center justify-center z-50 relative shadow-md transition-transform hover:scale-110">
                                            <Plus className="w-5 h-5 text-content-medium" />
                                        </div>
                                    </div>
                                    
                                    <h2 className="text-xl font-bold text-content-high mb-3">
                                        No destinations added
                                    </h2>
                                    <p className="text-content-medium text-sm leading-relaxed mb-8 max-w-md">
                                        Connect an account to stream. Once connected, you can broadcast to it as often as you like.
                                    </p>

                                    <Button onClick={() => setIsModalOpen(true)} size="lg">
                                        Add a destination
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            /* List of Destinations */
                            <div className="w-full max-w-4xl mx-auto space-y-4 animate-slide-up overflow-y-auto custom-scrollbar pr-2">
                                {destinations.map(dest => {
                                    const platform = getPlatformInfo(dest.platform);
                                    return (
                                        <div key={dest.id} className={`flex items-center justify-between p-5 rounded-xl border transition-all ${dest.enabled ? 'bg-app-surface/50 border-app-border' : 'bg-app-bg border-app-border opacity-70'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-lg bg-app-bg border border-app-border flex items-center justify-center shadow-sm relative">
                                                    {React.cloneElement(platform.icon as React.ReactElement<any>, { className: "w-5 h-5" })}
                                                    {dest.enabled && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-indigo-500 border-2 border-app-bg rounded-full" />}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm text-content-high">{dest.name}</div>
                                                    <div className="text-xs text-content-medium font-mono mt-0.5 flex items-center gap-2">
                                                        {platform.name}
                                                        {dest.errorMessage && (
                                                            <span className="text-red-500 font-bold ml-2 flex items-center gap-1">
                                                                <AlertOctagon className="w-3 h-3" />
                                                                {dest.errorMessage}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-6">
                                                <StatusBadge status={dest.status} health={dest.health} />
                                                
                                                <div className="h-6 w-px bg-app-border" />
                                                
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => onToggleDestination?.(dest.id, !dest.enabled)}
                                                        className={`transition-colors p-1 ${dest.enabled ? 'text-indigo-500' : 'text-content-medium hover:text-content-high'}`}
                                                        title={dest.enabled ? "Disable" : "Enable"}
                                                    >
                                                        {dest.enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                                                    </button>
                                                    <button 
                                                        onClick={() => onRemoveDestination?.(dest.id)}
                                                        className="p-2 text-content-medium hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="pt-4 flex justify-center">
                                    <Button onClick={() => setIsModalOpen(true)} variant="secondary" icon={<Plus className="w-4 h-4"/>}>Add another destination</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
             )}

            {/* Add Destination Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-blur-in" onClick={mode !== 'select' ? handleClose : undefined} />
                    
                    {/* Modal Content */}
                    <div className="relative w-full max-w-4xl bg-app-bg border border-app-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
                        
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-app-border bg-app-surface/30">
                            <h2 className="text-lg font-bold text-content-high">Add destination</h2>
                            <div className="flex items-center gap-4">
                                {mode === 'select' && onSkip && (
                                    <button onClick={onSkip} className="text-sm font-medium text-content-medium hover:text-indigo-500 transition-colors flex items-center gap-1">
                                        Skip destinations for now
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                )}
                                {mode === 'manage' && (
                                    <button onClick={handleClose} className="text-content-medium hover:text-content-high p-1 rounded-md hover:bg-app-border/50 transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {(!canAddMore && destinations.length > 0) ? (
                            <div className="flex flex-col items-center justify-center p-12 text-center animate-fade-in">
                                <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                                    <Lock className="w-8 h-8 text-amber-500" />
                                </div>
                                <h3 className="text-xl font-bold text-content-high mb-2">Limit Reached</h3>
                                <p className="text-content-medium mb-6 max-w-md">Your current plan is limited to 1 active destination. Upgrade your plan to stream to multiple platforms simultaneously.</p>
                                <Button className="bg-indigo-600 hover:bg-indigo-700">Upgrade Plan</Button>
                            </div>
                        ) : showConnectionPicker && selectedPlatform ? (
                            /* OAuth Connection Picker */
                            <div className="p-6 animate-fade-in">
                                <div className="flex items-center gap-4 mb-6">
                                    <button
                                        onClick={() => { setShowConnectionPicker(false); setSelectedPlatform(null); }}
                                        className="text-content-medium hover:text-content-high"
                                    >
                                        <ChevronRight className="w-5 h-5 rotate-180" />
                                    </button>
                                    <div className="flex items-center gap-3">
                                        {React.cloneElement(selectedPlatform.icon as React.ReactElement<any>, { className: "w-6 h-6" })}
                                        <h3 className="text-lg font-bold text-content-high">Connect to {selectedPlatform.name}</h3>
                                    </div>
                                </div>

                                <p className="text-content-medium text-sm mb-6">
                                    Select an existing connected account or connect a new one.
                                </p>

                                {/* Existing Connections */}
                                <div className="space-y-3 mb-6">
                                    {getConnectionsForProvider(selectedPlatform.id).map(connection => (
                                        <button
                                            key={connection.id}
                                            onClick={() => handleAddFromConnection(connection)}
                                            disabled={addingDestination}
                                            className="w-full flex items-center justify-between p-4 rounded-xl border border-app-border bg-app-surface/30 hover:bg-app-surface hover:border-indigo-500/50 transition-all group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-app-bg border border-app-border flex items-center justify-center">
                                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                                </div>
                                                <div className="text-left">
                                                    <div className="font-semibold text-content-high">
                                                        {connection.provider_display_name || connection.provider_username || 'Connected Account'}
                                                    </div>
                                                    <div className="text-xs text-content-medium">
                                                        @{connection.provider_username || connection.provider_user_id}
                                                    </div>
                                                </div>
                                            </div>
                                            {addingDestination ? (
                                                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                                            ) : (
                                                <ChevronRight className="w-5 h-5 text-content-medium group-hover:text-indigo-500 transition-colors" />
                                            )}
                                        </button>
                                    ))}
                                </div>

                                {/* Connect New Account */}
                                <div className="border-t border-app-border pt-6">
                                    <button
                                        onClick={() => handleOAuthRedirect(selectedPlatform.id)}
                                        className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-app-border hover:border-indigo-500/50 hover:bg-app-surface/30 transition-all text-content-medium hover:text-indigo-500"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        <span className="font-medium">Connect a new {selectedPlatform.name} account</span>
                                    </button>
                                </div>
                            </div>
                        ) : showManualForm && selectedPlatform ? (
                            /* Manual RTMP Form */
                            <div className="p-6 animate-fade-in">
                                <div className="flex items-center gap-4 mb-6">
                                    <button
                                        onClick={() => { setShowManualForm(false); setSelectedPlatform(null); }}
                                        className="text-content-medium hover:text-content-high"
                                    >
                                        <ChevronRight className="w-5 h-5 rotate-180" />
                                    </button>
                                    <div className="flex items-center gap-3">
                                        {React.cloneElement(selectedPlatform.icon as React.ReactElement<any>, { className: "w-6 h-6" })}
                                        <h3 className="text-lg font-bold text-content-high">Add {selectedPlatform.name} manually</h3>
                                    </div>
                                </div>

                                <p className="text-content-medium text-sm mb-6">
                                    Enter your RTMP server URL and stream key from {selectedPlatform.name}.
                                </p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-content-high mb-2">
                                            RTMP Server URL
                                        </label>
                                        <div className="relative">
                                            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-medium" />
                                            <input
                                                type="text"
                                                value={manualRtmpUrl}
                                                onChange={(e) => setManualRtmpUrl(e.target.value)}
                                                placeholder="rtmp://a.rtmp.youtube.com/live2"
                                                className="w-full pl-10 pr-4 py-3 rounded-lg border border-app-border bg-app-bg text-content-high placeholder:text-content-low focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-content-high mb-2">
                                            Stream Key
                                        </label>
                                        <div className="relative">
                                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-medium" />
                                            <input
                                                type="password"
                                                value={manualStreamKey}
                                                onChange={(e) => setManualStreamKey(e.target.value)}
                                                placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
                                                className="w-full pl-10 pr-4 py-3 rounded-lg border border-app-border bg-app-bg text-content-high placeholder:text-content-low focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-mono"
                                            />
                                        </div>
                                        <p className="mt-2 text-xs text-content-medium">
                                            Your stream key is kept secure and never shared.
                                        </p>
                                    </div>

                                    <div className="pt-4 flex gap-3">
                                        <Button
                                            variant="secondary"
                                            onClick={() => { setShowManualForm(false); setSelectedPlatform(null); }}
                                            className="flex-1"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={handleAddManual}
                                            disabled={!manualRtmpUrl || !manualStreamKey || addingDestination}
                                            className="flex-1"
                                        >
                                            {addingDestination ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                    Adding...
                                                </>
                                            ) : (
                                                'Add Destination'
                                            )}
                                        </Button>
                                    </div>
                                </div>

                            </div>
                        ) : (
                            <>
                                {/* Platform Selection Grid */}
                                <div className="flex px-6 border-b border-app-border bg-app-bg">
                                    <button className="px-4 py-4 text-sm font-bold text-indigo-500 border-b-2 border-indigo-500">Live Stream</button>
                                    <button className="px-4 py-4 text-sm font-bold text-content-medium hover:text-content-high transition-colors border-b-2 border-transparent hover:border-app-border">Repurpose</button>
                                </div>

                                <div className="p-6 overflow-y-auto custom-scrollbar">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                        {platforms.map((platform, idx) => {
                                            const hasOAuth = platform.supportsOAuth && isProviderConfigured(platform.id);
                                            const connectionCount = getConnectionsForProvider(platform.id).length;

                                            return (
                                                <button
                                                    key={platform.id}
                                                    onClick={() => handleAdd(platform)}
                                                    className="flex flex-col items-center justify-center gap-3 p-5 rounded-xl border border-app-border bg-app-surface/30 hover:bg-app-surface hover:border-indigo-500/50 hover:shadow-[0_0_15px_-5px_rgba(99,102,241,0.2)] transition-all group h-36 animate-slide-up relative"
                                                    style={{ animationDelay: `${idx * 0.05}s` }}
                                                >
                                                    {/* OAuth badge */}
                                                    {hasOAuth && (
                                                        <div className="absolute top-2 right-2">
                                                            {connectionCount > 0 ? (
                                                                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center" title={`${connectionCount} connected`}>
                                                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                                                </div>
                                                            ) : (
                                                                <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center" title="OAuth available">
                                                                    <ExternalLink className="w-3 h-3 text-indigo-500" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className="transform group-hover:scale-110 transition-transform duration-300 filter drop-shadow-sm">
                                                        {React.cloneElement(platform.icon as React.ReactElement<any>, { className: "w-8 h-8" })}
                                                    </div>
                                                    <span className="text-xs font-semibold text-content-high text-center">{platform.name}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
