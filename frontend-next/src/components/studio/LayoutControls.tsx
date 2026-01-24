'use client';

/**
 * LayoutControls Component - Layout presets and lock toggle with tier enforcement
 */

import React from 'react';
import { Square, Grid, MonitorUp, PanelLeftDashed, LayoutPanelTop, UserSquare, Lock, Unlock, Crown } from 'lucide-react';
import { useStudioStore } from '@/stores/studioStore';
import { Tier } from '@/types';
import { getTierLimits, TIER_DISPLAY } from '@/lib/tierConfig';

// Layout configuration with tier requirements
const LAYOUT_CONFIG = {
  single: { icon: Square, label: 'Single', minTier: Tier.FREE },
  grid: { icon: Grid, label: 'Grid', minTier: Tier.FREE },
  pip: { icon: MonitorUp, label: 'PiP', minTier: Tier.CREATOR },
  sidebar: { icon: PanelLeftDashed, label: 'Sidebar', minTier: Tier.PRO },
  news: { icon: LayoutPanelTop, label: 'News', minTier: Tier.PRO },
  speaker: { icon: UserSquare, label: 'Speaker', minTier: Tier.BROADCAST },
} as const;

type LayoutPreset = keyof typeof LAYOUT_CONFIG;

interface LayoutButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  lockedMessage?: string;
  tierLocked?: boolean;
  requiredTierName?: string;
}

function LayoutButton({
  icon,
  label,
  active,
  onClick,
  disabled,
  lockedMessage,
  tierLocked,
  requiredTierName,
}: LayoutButtonProps) {
  const tooltipMessage = tierLocked 
    ? `Upgrade to ${requiredTierName} for ${label} layout` 
    : lockedMessage || label;
    
  return (
    <button
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      title={tooltipMessage}
      className={`p-2 rounded transition-colors relative group
        ${active ? 'bg-indigo-500/10 text-indigo-500' : ''}
        ${
          disabled
            ? 'opacity-50 cursor-not-allowed text-content-low'
            : 'text-content-medium hover:bg-app-surface hover:text-content-high'
        }
      `}
    >
      {icon}
      {tierLocked && (
        <Crown className="w-3 h-3 absolute -top-1 -right-1 text-amber-500 bg-app-bg rounded-full p-0.5" />
      )}
      {!tierLocked && disabled && (
        <Lock className="w-3 h-3 absolute -top-1 -right-1 text-amber-500 bg-app-bg rounded-full p-0.5" />
      )}
    </button>
  );
}

export function LayoutControls() {
  const layoutState = useStudioStore((s) => s.layoutState);
  const layoutLocked = useStudioStore((s) => s.layoutLocked);
  const tier = useStudioStore((s) => s.tier);
  const setPresetLayout = useStudioStore((s) => s.setPresetLayout);
  const toggleLayoutLock = useStudioStore((s) => s.toggleLayoutLock);

  const currentPreset = layoutState?.preset_name || 'grid';
  const lockedMessage = layoutLocked ? 'Layout Locked' : undefined;

  // Check if a layout is available for the current tier
  const isLayoutAvailable = (preset: LayoutPreset): boolean => {
    return tier >= LAYOUT_CONFIG[preset].minTier;
  };

  // Get tier display name for a layout
  const getRequiredTierName = (preset: LayoutPreset): string => {
    return TIER_DISPLAY[LAYOUT_CONFIG[preset].minTier].name;
  };

  return (
    <div className="mt-4 flex flex-col gap-2">
      {/* Basic layouts row */}
      <div className="flex items-center gap-2">
        {(Object.keys(LAYOUT_CONFIG) as LayoutPreset[]).slice(0, 3).map((preset) => {
          const config = LAYOUT_CONFIG[preset];
          const IconComponent = config.icon;
          const available = isLayoutAvailable(preset);
          
          return (
            <LayoutButton
              key={preset}
              icon={<IconComponent className="w-4 h-4" />}
              label={config.label}
              active={currentPreset === preset}
              onClick={() => setPresetLayout(preset)}
              disabled={layoutLocked || !available}
              lockedMessage={lockedMessage}
              tierLocked={!available}
              requiredTierName={getRequiredTierName(preset)}
            />
          );
        })}

        <div className="h-4 w-px bg-app-border mx-1" />

        {/* Advanced layouts */}
        {(Object.keys(LAYOUT_CONFIG) as LayoutPreset[]).slice(3).map((preset) => {
          const config = LAYOUT_CONFIG[preset];
          const IconComponent = config.icon;
          const available = isLayoutAvailable(preset);
          
          return (
            <LayoutButton
              key={preset}
              icon={<IconComponent className="w-4 h-4" />}
              label={config.label}
              active={currentPreset === preset}
              onClick={() => setPresetLayout(preset)}
              disabled={layoutLocked || !available}
              lockedMessage={lockedMessage}
              tierLocked={!available}
              requiredTierName={getRequiredTierName(preset)}
            />
          );
        })}

        <div className="h-4 w-px bg-app-border mx-1" />

        <button
          onClick={toggleLayoutLock}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
            layoutLocked
              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/50'
              : 'bg-app-bg border border-app-border text-content-medium hover:text-content-high'
          }`}
        >
          {layoutLocked ? (
            <Lock className="w-3 h-3" />
          ) : (
            <Unlock className="w-3 h-3" />
          )}
          {layoutLocked ? 'Locked' : 'Lock'}
        </button>
      </div>
      
      {/* Tier upgrade hint */}
      {tier < Tier.BROADCAST && (
        <div className="text-[9px] text-content-low flex items-center gap-1">
          <Crown className="w-3 h-3 text-amber-500/70" />
          <span>Upgrade for more layouts</span>
        </div>
      )}
    </div>
  );
}
