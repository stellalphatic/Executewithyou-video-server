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

// Guest Permission Actions
export type GuestAction = 
    | 'TOGGLE_OWN_AUDIO'
    | 'TOGGLE_OWN_VIDEO'
    | 'SHARE_SCREEN'
    | 'SEND_CHAT'
    | 'VIEW_PARTICIPANTS'
    | 'VIEW_CHAT'
    | 'RAISE_HAND'
    | 'CHANGE_LAYOUT'
    | 'MANAGE_DESTINATIONS'
    | 'START_RECORDING'
    | 'START_BROADCAST'
    | 'ADMIT_PARTICIPANTS'
    | 'MUTE_OTHERS'
    | 'KICK_PARTICIPANTS'
    | 'CHANGE_BRANDING'
    | 'ADD_OVERLAYS'
    | 'CONTROL_SCENES';

// Permission matrix for roles
const ROLE_PERMISSIONS: Record<ParticipantRole, GuestAction[]> = {
    owner: [
        'TOGGLE_OWN_AUDIO', 'TOGGLE_OWN_VIDEO', 'SHARE_SCREEN', 'SEND_CHAT',
        'VIEW_PARTICIPANTS', 'VIEW_CHAT', 'RAISE_HAND', 'CHANGE_LAYOUT',
        'MANAGE_DESTINATIONS', 'START_RECORDING', 'START_BROADCAST',
        'ADMIT_PARTICIPANTS', 'MUTE_OTHERS', 'KICK_PARTICIPANTS',
        'CHANGE_BRANDING', 'ADD_OVERLAYS', 'CONTROL_SCENES'
    ],
    host: [
        'TOGGLE_OWN_AUDIO', 'TOGGLE_OWN_VIDEO', 'SHARE_SCREEN', 'SEND_CHAT',
        'VIEW_PARTICIPANTS', 'VIEW_CHAT', 'RAISE_HAND', 'CHANGE_LAYOUT',
        'MANAGE_DESTINATIONS', 'START_RECORDING', 'START_BROADCAST',
        'ADMIT_PARTICIPANTS', 'MUTE_OTHERS', 'KICK_PARTICIPANTS',
        'CHANGE_BRANDING', 'ADD_OVERLAYS', 'CONTROL_SCENES'
    ],
    co_host: [
        'TOGGLE_OWN_AUDIO', 'TOGGLE_OWN_VIDEO', 'SHARE_SCREEN', 'SEND_CHAT',
        'VIEW_PARTICIPANTS', 'VIEW_CHAT', 'RAISE_HAND', 'CHANGE_LAYOUT',
        'ADMIT_PARTICIPANTS', 'MUTE_OTHERS'
    ],
    guest: [
        'TOGGLE_OWN_AUDIO', 'TOGGLE_OWN_VIDEO', 'SHARE_SCREEN', 'SEND_CHAT',
        'VIEW_PARTICIPANTS', 'VIEW_CHAT', 'RAISE_HAND'
    ]
};

// Host-configurable guest permissions
export interface GuestPermissionConfig {
    canToggleAudio: boolean;
    canToggleVideo: boolean;
    canShareScreen: boolean;
    canSendChat: boolean;
    canRaiseHand: boolean;
}

export const DEFAULT_GUEST_PERMISSIONS: GuestPermissionConfig = {
    canToggleAudio: true,
    canToggleVideo: true,
    canShareScreen: false, // Disabled by default for guests
    canSendChat: true,
    canRaiseHand: true
};

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
 * Check if a specific action is allowed for a role
 */
export function canPerformAction(role: ParticipantRole, action: GuestAction): boolean {
    return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}

/**
 * Check guest permission with host-configured overrides
 */
export function canGuestPerformAction(
    action: GuestAction, 
    guestConfig: GuestPermissionConfig = DEFAULT_GUEST_PERMISSIONS
): boolean {
    switch (action) {
        case 'TOGGLE_OWN_AUDIO': return guestConfig.canToggleAudio;
        case 'TOGGLE_OWN_VIDEO': return guestConfig.canToggleVideo;
        case 'SHARE_SCREEN': return guestConfig.canShareScreen;
        case 'SEND_CHAT': return guestConfig.canSendChat;
        case 'RAISE_HAND': return guestConfig.canRaiseHand;
        case 'VIEW_PARTICIPANTS':
        case 'VIEW_CHAT':
            return true; // Always allowed for guests
        default:
            return false; // All other actions require host+ role
    }
}

/**
 * Get all actions a role can perform
 */
export function getActionsForRole(role: ParticipantRole): GuestAction[] {
    return ROLE_PERMISSIONS[role] || [];
}

/**
 * Get human-readable role display name
 */
export function getRoleDisplayName(role: ParticipantRole): string {
    switch (role) {
        case 'owner': return 'Owner';
        case 'host': return 'Host';
        case 'co_host': return 'Co-Host';
        case 'guest': return 'Guest';
        default: return 'Unknown';
    }
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

/**
 * Get permission denied message for an action
 */
export function getPermissionDeniedMessage(action: GuestAction): string {
    const actionMessages: Partial<Record<GuestAction, string>> = {
        'SHARE_SCREEN': 'Screen sharing is not enabled for guests',
        'MANAGE_DESTINATIONS': 'Only hosts can manage streaming destinations',
        'START_RECORDING': 'Only hosts can start recording',
        'START_BROADCAST': 'Only hosts can start the broadcast',
        'ADMIT_PARTICIPANTS': 'Only hosts can admit participants',
        'MUTE_OTHERS': 'Only hosts and co-hosts can mute others',
        'KICK_PARTICIPANTS': 'Only hosts can remove participants',
        'CHANGE_BRANDING': 'Only hosts can change branding',
        'ADD_OVERLAYS': 'Only hosts can add overlays',
        'CONTROL_SCENES': 'Only hosts can control scenes',
        'CHANGE_LAYOUT': 'Only hosts and co-hosts can change layout',
    };
    return actionMessages[action] || 'You do not have permission to perform this action';
}
