'use client';

/**
 * AllstrmWatermark - ALLSTRM branding watermark component
 * 
 * Features:
 * - Enforced for FREE tier (cannot be removed)
 * - Optional for CREATOR+ tiers
 * - Configurable position and opacity
 * - Animated subtle pulse effect
 */

import React from 'react';
import { Tier, LogoPosition, BRANDING_TIER_REQUIREMENTS } from '@/types';

interface AllstrmWatermarkProps {
  tier: Tier;
  showWatermark: boolean;
  position?: LogoPosition;
  opacity?: number;
  className?: string;
}

// Position to CSS classes mapping
const positionClasses: Record<LogoPosition, string> = {
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
};

export function AllstrmWatermark({ 
  tier, 
  showWatermark, 
  position = 'bottom-right',
  opacity = 50,
  className = ''
}: AllstrmWatermarkProps) {
  // FREE tier always shows watermark, regardless of showWatermark setting
  const isFreeTier = tier < BRANDING_TIER_REQUIREMENTS.removeWatermark;
  const shouldShow = isFreeTier || showWatermark;

  if (!shouldShow) return null;

  return (
    <div 
      className={`absolute z-30 pointer-events-none select-none ${positionClasses[position]} ${className}`}
      style={{ opacity: opacity / 100 }}
    >
      <div className="flex items-center gap-2 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-lg">
        {/* ALLSTRM Logo/Icon */}
        <svg 
          width="20" 
          height="20" 
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="text-white"
        >
          <path 
            d="M12 2L2 7L12 12L22 7L12 2Z" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
          <path 
            d="M2 17L12 22L22 17" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
          <path 
            d="M2 12L12 17L22 12" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
        
        {/* Brand text */}
        <span className="text-white text-sm font-semibold tracking-wide">
          ALLSTRM
        </span>

        {/* Free tier badge */}
        {isFreeTier && (
          <span className="text-xs text-white/60 font-medium">
            Free
          </span>
        )}
      </div>
    </div>
  );
}

// Minimal watermark version for canvas/recording
export function AllstrmWatermarkCanvas({ 
  tier, 
  showWatermark, 
  position = 'bottom-right',
  opacity = 50,
}: AllstrmWatermarkProps) {
  const isFreeTier = tier < BRANDING_TIER_REQUIREMENTS.removeWatermark;
  const shouldShow = isFreeTier || showWatermark;

  if (!shouldShow) return null;

  const positionStyles: Record<LogoPosition, React.CSSProperties> = {
    'top-left': { top: 16, left: 16 },
    'top-right': { top: 16, right: 16 },
    'bottom-left': { bottom: 16, left: 16 },
    'bottom-right': { bottom: 16, right: 16 },
  };

  return (
    <div 
      className="absolute z-30 pointer-events-none select-none"
      style={{ 
        ...positionStyles[position],
        opacity: opacity / 100 
      }}
    >
      <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-md">
        <svg 
          width="14" 
          height="14" 
          viewBox="0 0 24 24" 
          fill="none"
          className="text-white"
        >
          <path 
            d="M12 2L2 7L12 12L22 7L12 2Z" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
          <path 
            d="M2 17L12 22L22 17" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
          <path 
            d="M2 12L12 17L22 12" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-white text-xs font-semibold">
          ALLSTRM
        </span>
      </div>
    </div>
  );
}

export default AllstrmWatermark;
