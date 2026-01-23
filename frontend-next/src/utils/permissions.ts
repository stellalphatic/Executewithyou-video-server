'use client';


import { Tier, ParticipantRole } from '@/types';

// Feature Flag Definitions
export const FEATURES = {
    // --- Category 1: Core Streaming & Layout ---
    LAYOUT_AUTO_GRID: { tier: Tier.CREATOR, label: 'Auto Grid Layout' },
    LAYOUT_PIP: { tier: Tier.CREATOR, label: 'Picture-in-Picture' },
    LAYOUT_PRESETS: { tier: Tier.CREATOR, label: 'Layout Presets' },
    SCENE_MULTI: { tier: Tier.PRO, label: 'Multi-scene Pipelines' },
    TRANSITIONS: { tier: Tier.PRO, label: 'Animated Transitions' },
    
    // --- Category 2: Audio & Video ---
    NOISE_SUPPRESSION: { tier: Tier.CREATOR, label: 'Noise Suppression' },
    ECHO_CANCELLATION: { tier: Tier.CREATOR, label: 'Advanced Echo Cancellation' },
    RECORDING_ISO: { tier: Tier.PRO, label: 'ISO Recording (Multitrack)' },
    AUDIO_COMPRESSION: { tier: Tier.PRO, label: 'Audio Compression & EQ' },
    AI_NOISE_CLEANUP: { tier: Tier.ENTERPRISE, label: 'AI Noise Cleanup' },
    
    // --- Category 3: Visual & Interactive ---
    OVERLAY_ANIMATED: { tier: Tier.CREATOR, label: 'Animated Graphics' },
    LOWER_THIRDS_AUTO: { tier: Tier.PRO, label: 'Automated Lower Thirds' },
    
    // --- Category 4: Production ---
    CO_HOSTS: { tier: Tier.CREATOR, label: 'Co-Host Roles' },
    PRIVATE_CHAT: { tier: Tier.CREATOR, label: 'Private Chat' },
    
    // --- Category 5: Distribution ---
    MULTI_DESTINATION: { tier: Tier.CREATOR, label: 'Multi-streaming' },
    CUSTOM_RTMP: { tier: Tier.CREATOR, label: 'Custom RTMP' },
    DVR: { tier: Tier.PRO, label: 'DVR & Replay' }
};

export type FeatureId = keyof typeof FEATURES;

/**
 * Checks if a specific feature is enabled for the current subscription tier.
 */
export function isFeatureEnabled(tier: Tier, feature: FeatureId): boolean {
    return tier >= FEATURES[feature].tier;
}

/**
 * Checks if the user has permission to perform host actions.
 * Guests have restricted access (read-only views mostly).
 */
export function hasHostPermissions(role: ParticipantRole): boolean {
    return role === 'owner' || role === 'host' || role === 'co_host';
}

/**
 * Get the minimum tier required for a feature (for UI tooltips).
 */
export function getRequiredTier(feature: FeatureId): Tier {
    return FEATURES[feature].tier;
}

/**
 * Returns a human-readable upgrade message.
 */
export function getUpgradeMessage(feature: FeatureId): string {
    const tier = FEATURES[feature].tier;
    const tierName = 
        tier === Tier.CREATOR ? "Creator" :
        tier === Tier.PRO ? "Studio Pro" :
        tier === Tier.BROADCAST ? "Broadcast" : "Enterprise";
    
    return `Upgrade to ${tierName} plan to unlock ${FEATURES[feature].label}.`;
}
