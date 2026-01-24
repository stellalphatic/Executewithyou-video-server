'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle, Loader } from 'lucide-react';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting' | 'error';

interface ConnectionStatusIndicatorProps {
    status: ConnectionStatus;
    error?: string | null;
    onReconnect?: () => void;
    showLabel?: boolean;
    className?: string;
}

const statusConfig: Record<ConnectionStatus, { 
    icon: React.ReactNode; 
    label: string; 
    color: string; 
    bg: string;
    animate?: boolean 
}> = {
    connected: { 
        icon: <CheckCircle className="w-4 h-4" />, 
        label: 'Connected', 
        color: 'text-emerald-500', 
        bg: 'bg-emerald-500/10' 
    },
    connecting: { 
        icon: <Loader className="w-4 h-4" />, 
        label: 'Connecting', 
        color: 'text-amber-500', 
        bg: 'bg-amber-500/10',
        animate: true 
    },
    disconnected: { 
        icon: <WifiOff className="w-4 h-4" />, 
        label: 'Disconnected', 
        color: 'text-red-500', 
        bg: 'bg-red-500/10' 
    },
    reconnecting: { 
        icon: <RefreshCw className="w-4 h-4" />, 
        label: 'Reconnecting', 
        color: 'text-amber-500', 
        bg: 'bg-amber-500/10',
        animate: true 
    },
    error: { 
        icon: <AlertTriangle className="w-4 h-4" />, 
        label: 'Error', 
        color: 'text-red-500', 
        bg: 'bg-red-500/10' 
    }
};

export const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({
    status,
    error,
    onReconnect,
    showLabel = true,
    className = ''
}) => {
    const config = statusConfig[status];
    
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${config.bg}`}>
                <span className={`${config.color} ${config.animate ? 'animate-spin' : ''}`}>
                    {config.icon}
                </span>
                {showLabel && (
                    <span className={`text-xs font-medium ${config.color}`}>
                        {config.label}
                    </span>
                )}
            </div>
            
            {(status === 'disconnected' || status === 'error') && onReconnect && (
                <button
                    onClick={onReconnect}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                </button>
            )}
            
            {error && (
                <span className="text-xs text-red-400 truncate max-w-[150px]" title={error}>
                    {error}
                </span>
            )}
        </div>
    );
};

// Connection Quality Indicator
interface ConnectionQualityProps {
    quality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
    latency?: number;
    bitrate?: number;
}

const qualityConfig: Record<string, { bars: number; color: string; label: string }> = {
    excellent: { bars: 4, color: 'bg-emerald-500', label: 'Excellent' },
    good: { bars: 3, color: 'bg-blue-500', label: 'Good' },
    fair: { bars: 2, color: 'bg-amber-500', label: 'Fair' },
    poor: { bars: 1, color: 'bg-red-500', label: 'Poor' },
    unknown: { bars: 0, color: 'bg-content-low', label: 'Unknown' }
};

export const ConnectionQualityIndicator: React.FC<ConnectionQualityProps> = ({
    quality,
    latency,
    bitrate
}) => {
    const config = qualityConfig[quality];
    
    return (
        <div className="flex items-center gap-2">
            {/* Quality Bars */}
            <div className="flex items-end gap-0.5 h-4">
                {[1, 2, 3, 4].map(bar => (
                    <div
                        key={bar}
                        className={`w-1 rounded-sm transition-colors ${
                            bar <= config.bars ? config.color : 'bg-content-low/30'
                        }`}
                        style={{ height: `${bar * 25}%` }}
                    />
                ))}
            </div>
            
            {/* Metrics */}
            <div className="flex flex-col text-[9px] text-content-low">
                {latency !== undefined && <span>{latency}ms</span>}
                {bitrate !== undefined && <span>{(bitrate / 1000).toFixed(1)}Mbps</span>}
            </div>
        </div>
    );
};

// Reconnection Modal
interface ReconnectionModalProps {
    isOpen: boolean;
    status: 'reconnecting' | 'failed';
    attempt: number;
    maxAttempts: number;
    error?: string;
    onRetry: () => void;
    onCancel: () => void;
}

export const ReconnectionModal: React.FC<ReconnectionModalProps> = ({
    isOpen,
    status,
    attempt,
    maxAttempts,
    error,
    onRetry,
    onCancel
}) => {
    const [countdown, setCountdown] = useState(0);

    useEffect(() => {
        if (status === 'reconnecting') {
            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
            setCountdown(Math.ceil(delay / 1000));
            
            const interval = setInterval(() => {
                setCountdown(prev => Math.max(0, prev - 1));
            }, 1000);
            
            return () => clearInterval(interval);
        }
    }, [status, attempt]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
            
            <div className="relative w-full max-w-sm bg-app-surface border border-app-border rounded-2xl shadow-2xl p-6 text-center animate-scale-in">
                {status === 'reconnecting' ? (
                    <>
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                        </div>
                        <h3 className="text-lg font-bold text-content-high mb-2">
                            Reconnecting...
                        </h3>
                        <p className="text-sm text-content-medium mb-4">
                            Attempt {attempt} of {maxAttempts}
                        </p>
                        {countdown > 0 && (
                            <p className="text-xs text-content-low mb-4">
                                Retrying in {countdown}s...
                            </p>
                        )}
                        <button
                            onClick={onCancel}
                            className="text-xs text-content-medium hover:text-content-high underline"
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <>
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                            <WifiOff className="w-8 h-8 text-red-500" />
                        </div>
                        <h3 className="text-lg font-bold text-content-high mb-2">
                            Connection Lost
                        </h3>
                        <p className="text-sm text-content-medium mb-2">
                            Unable to reconnect after {maxAttempts} attempts.
                        </p>
                        {error && (
                            <p className="text-xs text-red-400 mb-4">
                                {error}
                            </p>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={onCancel}
                                className="flex-1 px-4 py-2 bg-app-bg border border-app-border rounded-lg text-sm font-medium text-content-medium hover:text-content-high transition-colors"
                            >
                                Leave
                            </button>
                            <button
                                onClick={onRetry}
                                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-bold text-white transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
