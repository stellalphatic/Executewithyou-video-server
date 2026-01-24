'use client';

import { Tier } from '@/types';
import { TIER_LIMITS } from '@/lib/tierConfig';

export interface ResolutionProfile {
    label: string;
    width: number;
    height: number;
    bitrateMbps: number;
    fps: number;
}

// Resolution profiles with corresponding bitrates
export const RESOLUTION_PROFILES: Record<string, ResolutionProfile> = {
    '360p': { label: '360p', width: 640, height: 360, bitrateMbps: 1, fps: 30 },
    '480p': { label: '480p', width: 854, height: 480, bitrateMbps: 1.5, fps: 30 },
    '720p': { label: '720p HD', width: 1280, height: 720, bitrateMbps: 3, fps: 30 },
    '720p60': { label: '720p 60fps', width: 1280, height: 720, bitrateMbps: 4.5, fps: 60 },
    '1080p': { label: '1080p Full HD', width: 1920, height: 1080, bitrateMbps: 6, fps: 30 },
    '1080p60': { label: '1080p 60fps', width: 1920, height: 1080, bitrateMbps: 9, fps: 60 },
    '1440p': { label: '1440p 2K', width: 2560, height: 1440, bitrateMbps: 12, fps: 30 },
    '4k': { label: '4K Ultra HD', width: 3840, height: 2160, bitrateMbps: 20, fps: 30 },
    '4k60': { label: '4K 60fps', width: 3840, height: 2160, bitrateMbps: 30, fps: 60 },
};

// Get maximum allowed resolution for a tier
export function getMaxResolutionForTier(tier: Tier): ResolutionProfile {
    const limits = TIER_LIMITS[tier];
    const maxRes = limits.maxResolution;
    const maxFps = limits.maxFps;
    
    if (maxRes === '4k') {
        return maxFps >= 60 ? RESOLUTION_PROFILES['4k60'] : RESOLUTION_PROFILES['4k'];
    }
    if (maxRes === '1080p') {
        return maxFps >= 60 ? RESOLUTION_PROFILES['1080p60'] : RESOLUTION_PROFILES['1080p'];
    }
    return maxFps >= 60 ? RESOLUTION_PROFILES['720p60'] : RESOLUTION_PROFILES['720p'];
}

// Get available resolutions for a tier
export function getAvailableResolutions(tier: Tier): ResolutionProfile[] {
    const maxProfile = getMaxResolutionForTier(tier);
    const limits = TIER_LIMITS[tier];
    
    return Object.values(RESOLUTION_PROFILES).filter(profile => {
        // Must be within max resolution
        if (profile.height > maxProfile.height) return false;
        // Must be within max FPS
        if (profile.fps > limits.maxFps) return false;
        // Must be within max bitrate
        if (profile.bitrateMbps > limits.maxBitrateMbps) return false;
        return true;
    });
}

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor';

// Adaptive resolution controller
export class AdaptiveResolutionController {
    private currentProfile: ResolutionProfile;
    private targetProfile: ResolutionProfile;
    private tier: Tier;
    private isAdaptiveEnabled: boolean = true;
    
    // Network metrics for adaptive decisions
    private bitrateHistory: number[] = [];
    private packetLossHistory: number[] = [];
    private latencyHistory: number[] = [];
    
    private readonly historySize = 10;
    private readonly downgradeThresholdBitrate = 0.7; // 70% of target bitrate
    private readonly upgradeThresholdBitrate = 0.9; // 90% of target bitrate  
    private readonly downgradeThresholdLoss = 0.05; // 5% packet loss
    private readonly upgradeThresholdLoss = 0.01; // 1% packet loss
    
    private onResolutionChange?: (profile: ResolutionProfile) => void;

    constructor(tier: Tier, initialResolution?: string) {
        this.tier = tier;
        const maxProfile = getMaxResolutionForTier(tier);
        this.currentProfile = initialResolution 
            ? RESOLUTION_PROFILES[initialResolution] || maxProfile
            : maxProfile;
        this.targetProfile = this.currentProfile;
    }

    setTier(tier: Tier) {
        this.tier = tier;
        const maxProfile = getMaxResolutionForTier(tier);
        
        // If current resolution exceeds new tier limit, downgrade
        if (this.currentProfile.height > maxProfile.height || 
            this.currentProfile.fps > maxProfile.fps) {
            this.setResolution(maxProfile);
        }
    }

    setAdaptiveEnabled(enabled: boolean) {
        this.isAdaptiveEnabled = enabled;
    }

    setResolution(profile: ResolutionProfile) {
        const maxProfile = getMaxResolutionForTier(this.tier);
        
        // Enforce tier limits
        if (profile.height > maxProfile.height) {
            console.warn(`[AdaptiveRes] Resolution ${profile.label} exceeds tier limit, using ${maxProfile.label}`);
            profile = maxProfile;
        }
        
        this.targetProfile = profile;
        this.currentProfile = profile;
        this.onResolutionChange?.(profile);
    }

    onResolutionChanged(callback: (profile: ResolutionProfile) => void) {
        this.onResolutionChange = callback;
    }

    // Update with network metrics
    updateMetrics(metrics: {
        bitrate?: number; // Current measured bitrate in Mbps
        packetLoss?: number; // Packet loss ratio (0-1)
        latency?: number; // RTT in ms
    }) {
        if (metrics.bitrate !== undefined) {
            this.bitrateHistory.push(metrics.bitrate);
            if (this.bitrateHistory.length > this.historySize) {
                this.bitrateHistory.shift();
            }
        }
        
        if (metrics.packetLoss !== undefined) {
            this.packetLossHistory.push(metrics.packetLoss);
            if (this.packetLossHistory.length > this.historySize) {
                this.packetLossHistory.shift();
            }
        }
        
        if (metrics.latency !== undefined) {
            this.latencyHistory.push(metrics.latency);
            if (this.latencyHistory.length > this.historySize) {
                this.latencyHistory.shift();
            }
        }
        
        if (this.isAdaptiveEnabled) {
            this.evaluateAndAdjust();
        }
    }

    private getAverageBitrate(): number {
        if (this.bitrateHistory.length === 0) return this.currentProfile.bitrateMbps;
        return this.bitrateHistory.reduce((a, b) => a + b, 0) / this.bitrateHistory.length;
    }

    private getAveragePacketLoss(): number {
        if (this.packetLossHistory.length === 0) return 0;
        return this.packetLossHistory.reduce((a, b) => a + b, 0) / this.packetLossHistory.length;
    }

    private getAverageLatency(): number {
        if (this.latencyHistory.length === 0) return 0;
        return this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    }

    getConnectionQuality(): ConnectionQuality {
        const avgLoss = this.getAveragePacketLoss();
        const avgLatency = this.getAverageLatency();
        const bitrateRatio = this.getAverageBitrate() / this.targetProfile.bitrateMbps;
        
        if (avgLoss < 0.01 && avgLatency < 100 && bitrateRatio > 0.95) return 'excellent';
        if (avgLoss < 0.03 && avgLatency < 200 && bitrateRatio > 0.8) return 'good';
        if (avgLoss < 0.1 && avgLatency < 500 && bitrateRatio > 0.6) return 'fair';
        return 'poor';
    }

    private evaluateAndAdjust() {
        const avgBitrate = this.getAverageBitrate();
        const avgLoss = this.getAveragePacketLoss();
        const targetBitrate = this.targetProfile.bitrateMbps;
        
        const availableResolutions = getAvailableResolutions(this.tier);
        const currentIndex = availableResolutions.findIndex(
            p => p.label === this.currentProfile.label
        );
        
        // Check if we need to downgrade
        if (avgBitrate < targetBitrate * this.downgradeThresholdBitrate || 
            avgLoss > this.downgradeThresholdLoss) {
            
            // Find a lower resolution
            if (currentIndex > 0) {
                const newProfile = availableResolutions[currentIndex - 1];
                console.log(`[AdaptiveRes] Downgrading: ${this.currentProfile.label} -> ${newProfile.label}`);
                this.currentProfile = newProfile;
                this.onResolutionChange?.(newProfile);
            }
            return;
        }
        
        // Check if we can upgrade (only if at target resolution or below and network is good)
        if (avgBitrate >= targetBitrate * this.upgradeThresholdBitrate && 
            avgLoss <= this.upgradeThresholdLoss &&
            this.currentProfile.height < this.targetProfile.height) {
            
            // Find a higher resolution that doesn't exceed target
            const nextIndex = currentIndex + 1;
            if (nextIndex < availableResolutions.length) {
                const newProfile = availableResolutions[nextIndex];
                if (newProfile.height <= this.targetProfile.height) {
                    console.log(`[AdaptiveRes] Upgrading: ${this.currentProfile.label} -> ${newProfile.label}`);
                    this.currentProfile = newProfile;
                    this.onResolutionChange?.(newProfile);
                }
            }
        }
    }

    getCurrentProfile(): ResolutionProfile {
        return this.currentProfile;
    }

    getTargetProfile(): ResolutionProfile {
        return this.targetProfile;
    }

    // Get MediaTrackConstraints for getUserMedia
    getMediaConstraints(): MediaTrackConstraints {
        return {
            width: { ideal: this.currentProfile.width, max: this.currentProfile.width },
            height: { ideal: this.currentProfile.height, max: this.currentProfile.height },
            frameRate: { ideal: this.currentProfile.fps, max: this.currentProfile.fps }
        };
    }

    // Get encoder parameters for WebRTC
    getEncoderParameters(): RTCRtpEncodingParameters {
        return {
            maxBitrate: this.currentProfile.bitrateMbps * 1_000_000, // Convert to bps
            maxFramerate: this.currentProfile.fps,
            scaleResolutionDownBy: 1.0,
        };
    }
}

// Hook-friendly factory
export function createAdaptiveController(tier: Tier): AdaptiveResolutionController {
    return new AdaptiveResolutionController(tier);
}
