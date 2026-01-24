'use client';

/**
 * OverlayPanel - Enterprise-grade overlay/ticker management
 * 
 * Features:
 * - Standard banners
 * - Full-width tickers (vertical drag only)
 * - Customizable background (transparent/solid)
 * - Text color customization
 * - Lower thirds
 */

import React, { useState, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  GripVertical,
  Type,
  Palette,
  Settings2,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Maximize2,
  AlignHorizontalJustifyCenter,
  Crown,
} from 'lucide-react';
import { 
  Tier, 
  Banner, 
  OverlayType, 
  OverlayScope,
  TickerSpeed,
  BRANDING_TIER_REQUIREMENTS 
} from '@/types';

interface OverlayPanelProps {
  tier: Tier;
  banners: Banner[];
  onAdd: (banner: Omit<Banner, 'id'>) => void;
  onUpdate: (id: string, updates: Partial<Banner>) => void;
  onRemove: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}

// Helper to check tier access
function canAccess(currentTier: Tier, requiredTier: Tier): boolean {
  return currentTier >= requiredTier;
}

// Tier badge
function TierBadge({ required }: { required: Tier }) {
  const tierNames: Record<Tier, string> = {
    [Tier.FREE]: 'Free',
    [Tier.CREATOR]: 'Creator',
    [Tier.PRO]: 'Pro',
    [Tier.BROADCAST]: 'Broadcast',
    [Tier.ENTERPRISE]: 'Enterprise',
  };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full">
      <Crown size={10} />
      {tierNames[required]}+
    </span>
  );
}

// Toggle Switch component
function Toggle({ 
  enabled, 
  onChange, 
  disabled 
}: { 
  enabled: boolean; 
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`w-9 h-5 rounded-full transition-all relative ${
        enabled ? 'bg-indigo-500' : 'bg-gray-600'
      } disabled:opacity-50`}
    >
      <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${
        enabled ? 'right-1' : 'left-1'
      }`} />
    </button>
  );
}

// Overlay type selector
function OverlayTypeSelector({ 
  value, 
  onChange,
  canUseTicker
}: { 
  value: OverlayType; 
  onChange: (type: OverlayType) => void;
  canUseTicker: boolean;
}) {
  const types: { id: OverlayType; label: string; pro?: boolean }[] = [
    { id: 'banner', label: 'Banner' },
    { id: 'ticker', label: 'Ticker', pro: true },
    { id: 'lower_third', label: 'Lower Third', pro: true },
  ];

  return (
    <div className="flex gap-1">
      {types.map((type) => {
        const isLocked = type.pro && !canUseTicker;
        return (
          <button
            key={type.id}
            onClick={() => !isLocked && onChange(type.id)}
            disabled={isLocked}
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-all flex items-center justify-center gap-1 ${
              value === type.id
                ? 'bg-indigo-500 text-white'
                : isLocked
                ? 'bg-app-bg text-content-low cursor-not-allowed'
                : 'bg-app-bg text-content-medium hover:bg-app-surface-dark'
            }`}
          >
            {type.label}
            {isLocked && <Lock size={10} />}
          </button>
        );
      })}
    </div>
  );
}

// Opacity slider
function OpacitySlider({ 
  value, 
  onChange,
  label
}: { 
  value: number; 
  onChange: (val: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-content-medium w-12">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-2 bg-app-bg rounded-lg appearance-none cursor-pointer accent-indigo-500"
      />
      <span className="text-xs text-content-low w-8">{value}%</span>
    </div>
  );
}

// Speed selector for ticker
function TickerSpeedSelector({ 
  value, 
  onChange 
}: { 
  value: TickerSpeed; 
  onChange: (speed: TickerSpeed) => void;
}) {
  const speeds: TickerSpeed[] = ['slow', 'medium', 'fast'];

  return (
    <div className="flex gap-1">
      {speeds.map((speed) => (
        <button
          key={speed}
          onClick={() => onChange(speed)}
          className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-all capitalize ${
            value === speed
              ? 'bg-indigo-500 text-white'
              : 'bg-app-bg text-content-medium hover:bg-app-surface-dark'
          }`}
        >
          {speed}
        </button>
      ))}
    </div>
  );
}

// Individual overlay card
function OverlayCard({
  banner,
  onUpdate,
  onRemove,
  onToggleVisibility,
  canUseTicker,
}: {
  banner: Banner;
  onUpdate: (updates: Partial<Banner>) => void;
  onRemove: () => void;
  onToggleVisibility: () => void;
  canUseTicker: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isTicker = banner.type === 'ticker' || banner.isTicker;

  return (
    <div className={`bg-app-bg rounded-xl border transition-all ${
      banner.isVisible ? 'border-indigo-500/50' : 'border-app-border'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={onToggleVisibility}
          className={`p-1.5 rounded-lg transition-colors ${
            banner.isVisible 
              ? 'bg-indigo-500/20 text-indigo-400' 
              : 'text-content-low hover:text-content-medium'
          }`}
        >
          {banner.isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>

        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={banner.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            className="w-full bg-transparent text-sm text-content-high focus:outline-none truncate"
            placeholder="Enter text..."
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            isTicker 
              ? 'bg-purple-500/20 text-purple-400'
              : banner.type === 'lower_third'
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-indigo-500/20 text-indigo-400'
          }`}>
            {isTicker ? 'Ticker' : banner.type === 'lower_third' ? 'L3' : 'Banner'}
          </span>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-content-low hover:text-content-medium transition-colors"
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <button
            onClick={onRemove}
            className="p-1 text-content-low hover:text-red-400 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Expanded Options */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-app-border pt-3">
          {/* Type selector */}
          <div className="space-y-1">
            <span className="text-xs text-content-medium">Type</span>
            <OverlayTypeSelector
              value={banner.type}
              onChange={(type) => onUpdate({ 
                type, 
                isTicker: type === 'ticker',
                fullWidth: type === 'ticker' ? true : banner.fullWidth,
                verticalOnly: type === 'ticker' ? true : banner.verticalOnly,
              })}
              canUseTicker={canUseTicker}
            />
          </div>

          {/* Ticker-specific options */}
          {isTicker && (
            <>
              <div className="space-y-1">
                <span className="text-xs text-content-medium">Scroll Speed</span>
                <TickerSpeedSelector
                  value={banner.tickerSpeed || 'medium'}
                  onChange={(speed) => onUpdate({ tickerSpeed: speed })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Maximize2 size={12} className="text-content-medium" />
                  <span className="text-xs text-content-medium">Full Width</span>
                </div>
                <Toggle
                  enabled={banner.fullWidth}
                  onChange={() => onUpdate({ fullWidth: !banner.fullWidth })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpDown size={12} className="text-content-medium" />
                  <span className="text-xs text-content-medium">Vertical Drag Only</span>
                </div>
                <Toggle
                  enabled={banner.verticalOnly}
                  onChange={() => onUpdate({ verticalOnly: !banner.verticalOnly })}
                />
              </div>
            </>
          )}

          {/* Colors */}
          <div className="space-y-2">
            <span className="text-xs text-content-medium font-medium">Colors</span>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="color"
                  value={banner.backgroundColor}
                  onChange={(e) => onUpdate({ backgroundColor: e.target.value, customColor: e.target.value })}
                  className="w-8 h-8 rounded-lg border border-app-border cursor-pointer"
                />
                <span className="text-xs text-content-low">Background</span>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="color"
                  value={banner.textColor}
                  onChange={(e) => onUpdate({ textColor: e.target.value, customTextColor: e.target.value })}
                  className="w-8 h-8 rounded-lg border border-app-border cursor-pointer"
                />
                <span className="text-xs text-content-low">Text</span>
              </div>
            </div>

            <OpacitySlider
              label="BG"
              value={banner.backgroundOpacity}
              onChange={(val) => onUpdate({ backgroundOpacity: val })}
            />
          </div>

          {/* Position constraint preview */}
          {isTicker && banner.verticalOnly && (
            <div className="bg-app-surface-dark rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs text-content-medium mb-2">
                <ArrowUpDown size={12} />
                <span>Vertical Position Range</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-content-low">Min Y</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={banner.minY || 0}
                  onChange={(e) => onUpdate({ minY: Number(e.target.value) })}
                  className="flex-1 h-2 bg-app-bg rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <span className="text-xs text-content-low w-8">{banner.minY || 0}%</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-content-low">Max Y</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={banner.maxY || 100}
                  onChange={(e) => onUpdate({ maxY: Number(e.target.value) })}
                  className="flex-1 h-2 bg-app-bg rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <span className="text-xs text-content-low w-8">{banner.maxY || 100}%</span>
              </div>
            </div>
          )}

          {/* Lock toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {banner.locked ? <Lock size={12} /> : <Unlock size={12} />}
              <span className="text-xs text-content-medium">Lock Position</span>
            </div>
            <Toggle
              enabled={banner.locked || false}
              onChange={() => onUpdate({ locked: !banner.locked })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Create overlay form
function CreateOverlayForm({ 
  onAdd, 
  canUseTicker 
}: { 
  onAdd: (banner: Omit<Banner, 'id'>) => void;
  canUseTicker: boolean;
}) {
  const [text, setText] = useState('');
  const [type, setType] = useState<OverlayType>('banner');
  const [isExpanded, setIsExpanded] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#0a4cc7');
  const [textColor, setTextColor] = useState('#ffffff');
  const [backgroundOpacity, setBackgroundOpacity] = useState(100);
  const [fullWidth, setFullWidth] = useState(true);
  const [tickerSpeed, setTickerSpeed] = useState<TickerSpeed>('medium');

  const handleAdd = useCallback(() => {
    if (!text.trim()) return;

    const isTicker = type === 'ticker';

    onAdd({
      text: text.trim(),
      type,
      isTicker,
      isVisible: false,
      backgroundColor,
      backgroundOpacity,
      textColor,
      customColor: backgroundColor,
      customTextColor: textColor,
      fullWidth: isTicker ? fullWidth : false,
      verticalOnly: isTicker,
      minY: isTicker ? 50 : undefined,
      maxY: isTicker ? 100 : undefined,
      scope: 'global',
      locked: false,
      tickerSpeed: isTicker ? tickerSpeed : undefined,
    });

    // Reset form
    setText('');
    setIsExpanded(false);
  }, [text, type, backgroundColor, textColor, backgroundOpacity, fullWidth, tickerSpeed, onAdd]);

  return (
    <div className="bg-app-bg rounded-xl border border-app-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter overlay text..."
          className="flex-1 bg-transparent text-sm text-content-high placeholder:text-content-low focus:outline-none"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 text-content-low hover:text-content-medium transition-colors"
        >
          <Settings2 size={14} />
        </button>
        <button
          onClick={handleAdd}
          disabled={!text.trim()}
          className="px-3 py-1.5 bg-indigo-500 text-white text-xs font-medium rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={14} />
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-3 pt-2 border-t border-app-border">
          <div className="space-y-1">
            <span className="text-xs text-content-medium">Type</span>
            <OverlayTypeSelector
              value={type}
              onChange={setType}
              canUseTicker={canUseTicker}
            />
          </div>

          {type === 'ticker' && (
            <>
              <div className="space-y-1">
                <span className="text-xs text-content-medium">Speed</span>
                <TickerSpeedSelector value={tickerSpeed} onChange={setTickerSpeed} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-content-medium">Full Width</span>
                <Toggle enabled={fullWidth} onChange={() => setFullWidth(!fullWidth)} />
              </div>
            </>
          )}

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-8 h-8 rounded-lg border border-app-border cursor-pointer"
              />
              <span className="text-xs text-content-low">BG</span>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="w-8 h-8 rounded-lg border border-app-border cursor-pointer"
              />
              <span className="text-xs text-content-low">Text</span>
            </div>
          </div>

          <OpacitySlider
            label="BG"
            value={backgroundOpacity}
            onChange={setBackgroundOpacity}
          />
        </div>
      )}
    </div>
  );
}

export function OverlayPanel({ 
  tier, 
  banners, 
  onAdd, 
  onUpdate, 
  onRemove,
  onToggleVisibility 
}: OverlayPanelProps) {
  const canUseTicker = canAccess(tier, BRANDING_TIER_REQUIREMENTS.advancedOverlays);

  const visibleCount = banners.filter(b => b.isVisible).length;
  const tickerCount = banners.filter(b => b.type === 'ticker' || b.isTicker).length;
  const bannerCount = banners.filter(b => !b.isTicker && b.type !== 'ticker').length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-app-border shrink-0">
        <h3 className="text-lg font-semibold text-content-high">Overlays</h3>
        <p className="text-xs text-content-medium mt-1">
          Banners, tickers, and lower thirds
        </p>
        <div className="flex items-center gap-3 mt-2 text-xs text-content-low">
          <span>{visibleCount} active</span>
          <span className="w-1 h-1 rounded-full bg-content-low" />
          <span>{bannerCount} banners</span>
          <span className="w-1 h-1 rounded-full bg-content-low" />
          <span>{tickerCount} tickers</span>
        </div>
      </div>

      {/* Tier warning for tickers */}
      {!canUseTicker && (
        <div className="p-4 bg-amber-500/10 border-b border-amber-500/30">
          <div className="flex items-start gap-2">
            <Crown className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-amber-400 font-medium">Pro Feature</p>
              <p className="text-xs text-content-medium mt-0.5">
                Tickers and lower thirds require Pro tier or higher.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Create Form */}
        <CreateOverlayForm onAdd={onAdd} canUseTicker={canUseTicker} />

        {/* Overlay List */}
        {banners.length === 0 ? (
          <div className="text-center py-8 text-content-low text-sm">
            No overlays yet. Add one above.
          </div>
        ) : (
          <div className="space-y-2">
            {banners.map((banner) => (
              <OverlayCard
                key={banner.id}
                banner={banner}
                onUpdate={(updates) => onUpdate(banner.id, updates)}
                onRemove={() => onRemove(banner.id)}
                onToggleVisibility={() => onToggleVisibility(banner.id)}
                canUseTicker={canUseTicker}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Tips */}
      <div className="p-4 border-t border-app-border bg-app-surface-dark/50 shrink-0">
        <div className="text-xs text-content-low space-y-1">
          <p><strong className="text-content-medium">Tip:</strong> Tickers scroll horizontally and can only be moved up/down.</p>
          <p>Use 0% background opacity for transparent overlays.</p>
        </div>
      </div>
    </div>
  );
}

export default OverlayPanel;
