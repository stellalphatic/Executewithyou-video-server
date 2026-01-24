'use client';

/**
 * Tier Configuration & Limits
 * 
 * Defines the feature limits for each pricing tier.
 * All limits are enforced both client-side and server-side.
 */

import { Tier } from '@/types';

export interface TierLimits {
  // Participant limits
  maxStageParticipants: number;
  maxTotalParticipants: number;
  maxBackstageParticipants: number;
  
  // Destination limits
  maxDestinations: number;
  customRtmpAllowed: boolean;
  
  // Recording limits
  recordingEnabled: boolean;
  isoRecordingEnabled: boolean;
  maxRecordingDurationMinutes: number;
  cloudStorageGb: number;
  
  // Stream quality
  maxResolution: '720p' | '1080p' | '4k';
  maxBitrateMbps: number;
  maxFps: number;
  
  // Features
  brandingEnabled: boolean;
  customBrandingEnabled: boolean;
  watermarkRemoval: boolean;
  scenesEnabled: boolean;
  maxScenes: number;
  animatedTransitions: boolean;
  greenScreenEnabled: boolean;
  noiseSuppressionEnabled: boolean;
  privateChatEnabled: boolean;
  waitingRoomEnabled: boolean;
  analyticsEnabled: boolean;
  apiAccessEnabled: boolean;
  prioritySupport: boolean;
  slaGuarantee: boolean;
  
  // Session limits
  maxConcurrentStreams: number;
  maxStreamDurationMinutes: number;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  [Tier.FREE]: {
    maxStageParticipants: 2,
    maxTotalParticipants: 4,
    maxBackstageParticipants: 2,
    maxDestinations: 1,
    customRtmpAllowed: false,
    recordingEnabled: false,
    isoRecordingEnabled: false,
    maxRecordingDurationMinutes: 0,
    cloudStorageGb: 0,
    maxResolution: '720p',
    maxBitrateMbps: 4,
    maxFps: 30,
    brandingEnabled: true,
    customBrandingEnabled: false,
    watermarkRemoval: false,
    scenesEnabled: false,
    maxScenes: 1,
    animatedTransitions: false,
    greenScreenEnabled: false,
    noiseSuppressionEnabled: false,
    privateChatEnabled: false,
    waitingRoomEnabled: false,
    analyticsEnabled: false,
    apiAccessEnabled: false,
    prioritySupport: false,
    slaGuarantee: false,
    maxConcurrentStreams: 1,
    maxStreamDurationMinutes: 60,
  },
  
  [Tier.CREATOR]: {
    maxStageParticipants: 4,
    maxTotalParticipants: 10,
    maxBackstageParticipants: 5,
    maxDestinations: 3,
    customRtmpAllowed: true,
    recordingEnabled: true,
    isoRecordingEnabled: false,
    maxRecordingDurationMinutes: 120,
    cloudStorageGb: 10,
    maxResolution: '1080p',
    maxBitrateMbps: 6,
    maxFps: 30,
    brandingEnabled: true,
    customBrandingEnabled: true,
    watermarkRemoval: true,
    scenesEnabled: true,
    maxScenes: 5,
    animatedTransitions: false,
    greenScreenEnabled: true,
    noiseSuppressionEnabled: true,
    privateChatEnabled: true,
    waitingRoomEnabled: true,
    analyticsEnabled: false,
    apiAccessEnabled: false,
    prioritySupport: false,
    slaGuarantee: false,
    maxConcurrentStreams: 1,
    maxStreamDurationMinutes: 240,
  },
  
  [Tier.PRO]: {
    maxStageParticipants: 6,
    maxTotalParticipants: 25,
    maxBackstageParticipants: 10,
    maxDestinations: 5,
    customRtmpAllowed: true,
    recordingEnabled: true,
    isoRecordingEnabled: true,
    maxRecordingDurationMinutes: 480,
    cloudStorageGb: 50,
    maxResolution: '1080p',
    maxBitrateMbps: 10,
    maxFps: 60,
    brandingEnabled: true,
    customBrandingEnabled: true,
    watermarkRemoval: true,
    scenesEnabled: true,
    maxScenes: 20,
    animatedTransitions: true,
    greenScreenEnabled: true,
    noiseSuppressionEnabled: true,
    privateChatEnabled: true,
    waitingRoomEnabled: true,
    analyticsEnabled: true,
    apiAccessEnabled: true,
    prioritySupport: true,
    slaGuarantee: false,
    maxConcurrentStreams: 2,
    maxStreamDurationMinutes: 720,
  },
  
  [Tier.BROADCAST]: {
    maxStageParticipants: 10,
    maxTotalParticipants: 50,
    maxBackstageParticipants: 25,
    maxDestinations: 10,
    customRtmpAllowed: true,
    recordingEnabled: true,
    isoRecordingEnabled: true,
    maxRecordingDurationMinutes: 1440,
    cloudStorageGb: 200,
    maxResolution: '4k',
    maxBitrateMbps: 25,
    maxFps: 60,
    brandingEnabled: true,
    customBrandingEnabled: true,
    watermarkRemoval: true,
    scenesEnabled: true,
    maxScenes: 50,
    animatedTransitions: true,
    greenScreenEnabled: true,
    noiseSuppressionEnabled: true,
    privateChatEnabled: true,
    waitingRoomEnabled: true,
    analyticsEnabled: true,
    apiAccessEnabled: true,
    prioritySupport: true,
    slaGuarantee: true,
    maxConcurrentStreams: 5,
    maxStreamDurationMinutes: -1, // Unlimited
  },
  
  [Tier.ENTERPRISE]: {
    maxStageParticipants: 25,
    maxTotalParticipants: 100,
    maxBackstageParticipants: 50,
    maxDestinations: -1, // Unlimited
    customRtmpAllowed: true,
    recordingEnabled: true,
    isoRecordingEnabled: true,
    maxRecordingDurationMinutes: -1, // Unlimited
    cloudStorageGb: -1, // Unlimited
    maxResolution: '4k',
    maxBitrateMbps: 50,
    maxFps: 60,
    brandingEnabled: true,
    customBrandingEnabled: true,
    watermarkRemoval: true,
    scenesEnabled: true,
    maxScenes: -1, // Unlimited
    animatedTransitions: true,
    greenScreenEnabled: true,
    noiseSuppressionEnabled: true,
    privateChatEnabled: true,
    waitingRoomEnabled: true,
    analyticsEnabled: true,
    apiAccessEnabled: true,
    prioritySupport: true,
    slaGuarantee: true,
    maxConcurrentStreams: -1, // Unlimited
    maxStreamDurationMinutes: -1, // Unlimited
  },
};

/**
 * Get tier limits for a specific tier
 */
export function getTierLimits(tier: Tier): TierLimits {
  return TIER_LIMITS[tier];
}

/**
 * Check if a specific limit is reached
 */
export function isLimitReached(
  tier: Tier,
  limitKey: keyof TierLimits,
  currentValue: number
): boolean {
  const limit = TIER_LIMITS[tier][limitKey];
  if (typeof limit !== 'number') return false;
  if (limit === -1) return false; // Unlimited
  return currentValue >= limit;
}

/**
 * Get upgrade suggestion message
 */
export function getUpgradeSuggestion(
  currentTier: Tier,
  limitKey: keyof TierLimits
): { tier: Tier; message: string } | null {
  const limitLabels: Partial<Record<keyof TierLimits, string>> = {
    maxStageParticipants: 'stage participants',
    maxTotalParticipants: 'total participants',
    maxDestinations: 'streaming destinations',
    maxScenes: 'scenes',
    maxRecordingDurationMinutes: 'recording duration',
  };

  const label = limitLabels[limitKey] || limitKey;
  
  // Find next tier with higher limit
  const tiers = [Tier.FREE, Tier.CREATOR, Tier.PRO, Tier.BROADCAST, Tier.ENTERPRISE];
  const currentIndex = tiers.indexOf(currentTier);
  
  for (let i = currentIndex + 1; i < tiers.length; i++) {
    const nextTier = tiers[i];
    const currentLimit = TIER_LIMITS[currentTier][limitKey];
    const nextLimit = TIER_LIMITS[nextTier][limitKey];
    
    if (typeof currentLimit === 'number' && typeof nextLimit === 'number') {
      if (nextLimit === -1 || nextLimit > currentLimit) {
        const tierNames: Record<Tier, string> = {
          [Tier.FREE]: 'Free',
          [Tier.CREATOR]: 'Creator',
          [Tier.PRO]: 'Pro',
          [Tier.BROADCAST]: 'Broadcast',
          [Tier.ENTERPRISE]: 'Enterprise',
        };
        
        return {
          tier: nextTier,
          message: `Upgrade to ${tierNames[nextTier]} for ${nextLimit === -1 ? 'unlimited' : nextLimit} ${label}`,
        };
      }
    }
  }
  
  return null;
}

/**
 * Tier display information
 */
export interface TierDisplayInfo {
  name: string;
  price: string;
  priceNote: string;
  color: string;
  highlights: string[];
}

export const TIER_DISPLAY: Record<Tier, TierDisplayInfo> = {
  [Tier.FREE]: {
    name: 'Free',
    price: '$0',
    priceNote: 'forever',
    color: '#6b7280',
    highlights: [
      '2 on stage',
      '1 destination',
      '720p streaming',
      'ALLSTRM watermark',
    ],
  },
  [Tier.CREATOR]: {
    name: 'Creator',
    price: '$19',
    priceNote: '/month',
    color: '#3b82f6',
    highlights: [
      '4 on stage',
      '3 destinations',
      '1080p streaming',
      'Custom branding',
      'Recording (2h)',
      'Green screen',
    ],
  },
  [Tier.PRO]: {
    name: 'Pro',
    price: '$49',
    priceNote: '/month',
    color: '#8b5cf6',
    highlights: [
      '6 on stage',
      '5 destinations',
      '1080p @ 60fps',
      'ISO recording',
      'Analytics',
      'API access',
    ],
  },
  [Tier.BROADCAST]: {
    name: 'Broadcast',
    price: '$149',
    priceNote: '/month',
    color: '#f59e0b',
    highlights: [
      '10 on stage',
      '10 destinations',
      '4K streaming',
      'Priority support',
      'SLA guarantee',
      '200GB storage',
    ],
  },
  [Tier.ENTERPRISE]: {
    name: 'Enterprise',
    price: 'Contact',
    priceNote: 'sales',
    color: '#10b981',
    highlights: [
      '25+ on stage',
      'Unlimited destinations',
      'Custom integrations',
      'Dedicated support',
      'On-premise option',
      'SSO/SAML',
    ],
  },
};

/**
 * Validate if an action is allowed based on tier limits
 */
export function validateTierAction(
  tier: Tier,
  action: string,
  context: Record<string, any>
): { allowed: boolean; reason?: string; upgrade?: { tier: Tier; message: string } } {
  const limits = TIER_LIMITS[tier];
  
  switch (action) {
    case 'ADD_STAGE_PARTICIPANT':
      if (context.currentCount >= limits.maxStageParticipants) {
        const upgrade = getUpgradeSuggestion(tier, 'maxStageParticipants');
        return {
          allowed: false,
          reason: `Stage is full (${limits.maxStageParticipants} max)`,
          upgrade: upgrade || undefined,
        };
      }
      break;
      
    case 'ADD_DESTINATION':
      if (limits.maxDestinations !== -1 && context.currentCount >= limits.maxDestinations) {
        const upgrade = getUpgradeSuggestion(tier, 'maxDestinations');
        return {
          allowed: false,
          reason: `Maximum destinations reached (${limits.maxDestinations})`,
          upgrade: upgrade || undefined,
        };
      }
      break;
      
    case 'ADD_CUSTOM_RTMP':
      if (!limits.customRtmpAllowed) {
        return {
          allowed: false,
          reason: 'Custom RTMP not available on your plan',
          upgrade: { tier: Tier.CREATOR, message: 'Upgrade to Creator for custom RTMP' },
        };
      }
      break;
      
    case 'START_RECORDING':
      if (!limits.recordingEnabled) {
        return {
          allowed: false,
          reason: 'Recording not available on your plan',
          upgrade: { tier: Tier.CREATOR, message: 'Upgrade to Creator for recording' },
        };
      }
      break;
      
    case 'START_ISO_RECORDING':
      if (!limits.isoRecordingEnabled) {
        return {
          allowed: false,
          reason: 'ISO recording not available on your plan',
          upgrade: { tier: Tier.PRO, message: 'Upgrade to Pro for ISO recording' },
        };
      }
      break;
      
    case 'ADD_SCENE':
      if (limits.maxScenes !== -1 && context.currentCount >= limits.maxScenes) {
        const upgrade = getUpgradeSuggestion(tier, 'maxScenes');
        return {
          allowed: false,
          reason: `Maximum scenes reached (${limits.maxScenes})`,
          upgrade: upgrade || undefined,
        };
      }
      break;
      
    case 'USE_GREEN_SCREEN':
      if (!limits.greenScreenEnabled) {
        return {
          allowed: false,
          reason: 'Green screen not available on your plan',
          upgrade: { tier: Tier.CREATOR, message: 'Upgrade to Creator for green screen' },
        };
      }
      break;
  }
  
  return { allowed: true };
}
