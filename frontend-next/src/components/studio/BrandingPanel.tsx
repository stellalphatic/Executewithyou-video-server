'use client';

/**
 * BrandingPanel - Enterprise-grade branding controls with tier-based restrictions
 * 
 * Features:
 * - Logo upload with position/size controls
 * - Logo background color option
 * - Brand color theming
 * - ALLSTRM watermark enforcement for FREE tier
 * - Display name toggle
 */

import React, { useRef, useCallback, useState } from 'react';
import {
  Upload,
  Trash2,
  Lock,
  Unlock,
  Image,
  Move,
  AlertCircle,
  ChevronDown,
  Eye,
  EyeOff,
  Crown,
} from 'lucide-react';
import { 
  Tier, 
  BrandConfig, 
  LogoPosition, 
  LogoSize,
  BRANDING_TIER_REQUIREMENTS 
} from '@/types';

interface BrandingPanelProps {
  tier: Tier;
  brandConfig: BrandConfig;
  onUpdate: (config: Partial<BrandConfig>) => void;
}

// Helper to check tier access
function canAccess(currentTier: Tier, requiredTier: Tier): boolean {
  return currentTier >= requiredTier;
}

// Tier badge component
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

// Position selector component
function PositionSelector({ 
  value, 
  onChange, 
  disabled 
}: { 
  value: LogoPosition; 
  onChange: (pos: LogoPosition) => void;
  disabled?: boolean;
}) {
  const positions: { id: LogoPosition; label: string }[] = [
    { id: 'top-left', label: 'TL' },
    { id: 'top-right', label: 'TR' },
    { id: 'bottom-left', label: 'BL' },
    { id: 'bottom-right', label: 'BR' },
  ];

  return (
    <div className="grid grid-cols-2 gap-1 w-20">
      {positions.map((pos) => (
        <button
          key={pos.id}
          onClick={() => !disabled && onChange(pos.id)}
          disabled={disabled}
          className={`px-2 py-1 text-xs font-medium rounded transition-all ${
            value === pos.id
              ? 'bg-indigo-500 text-white'
              : disabled
              ? 'bg-app-bg text-content-low cursor-not-allowed'
              : 'bg-app-bg text-content-medium hover:bg-app-surface-dark'
          }`}
        >
          {pos.label}
        </button>
      ))}
    </div>
  );
}

// Size selector
function SizeSelector({ 
  value, 
  onChange, 
  disabled 
}: { 
  value: LogoSize; 
  onChange: (size: LogoSize) => void;
  disabled?: boolean;
}) {
  const sizes: LogoSize[] = ['small', 'medium', 'large'];

  return (
    <div className="flex gap-1">
      {sizes.map((size) => (
        <button
          key={size}
          onClick={() => !disabled && onChange(size)}
          disabled={disabled}
          className={`px-3 py-1 text-xs font-medium rounded transition-all capitalize ${
            value === size
              ? 'bg-indigo-500 text-white'
              : disabled
              ? 'bg-app-bg text-content-low cursor-not-allowed'
              : 'bg-app-bg text-content-medium hover:bg-app-surface-dark'
          }`}
        >
          {size}
        </button>
      ))}
    </div>
  );
}

// Opacity slider
function OpacitySlider({ 
  value, 
  onChange, 
  disabled,
  label = 'Opacity'
}: { 
  value: number; 
  onChange: (val: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-content-medium">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-app-bg rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

// Section component
function Section({ 
  title, 
  children, 
  locked = false,
  requiredTier,
  currentTier
}: { 
  title: string; 
  children: React.ReactNode;
  locked?: boolean;
  requiredTier?: Tier;
  currentTier?: Tier;
}) {
  const isLocked = requiredTier && currentTier && !canAccess(currentTier, requiredTier);

  return (
    <div className={`space-y-3 ${isLocked ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-content-high flex items-center gap-2">
          {title}
          {isLocked && <Lock size={12} className="text-amber-400" />}
        </h4>
        {requiredTier && isLocked && <TierBadge required={requiredTier} />}
      </div>
      <div className={isLocked ? 'pointer-events-none' : ''}>
        {children}
      </div>
    </div>
  );
}

export function BrandingPanel({ tier, brandConfig, onUpdate }: BrandingPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canRemoveWatermark = canAccess(tier, BRANDING_TIER_REQUIREMENTS.removeWatermark);
  const canUploadLogo = canAccess(tier, BRANDING_TIER_REQUIREMENTS.customLogo);
  const canUseLogoBackground = canAccess(tier, BRANDING_TIER_REQUIREMENTS.logoBackground);

  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      setUploadError('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Create object URL for preview
      const logoUrl = URL.createObjectURL(file);
      onUpdate({ logoUrl, logoFile: file });
    } catch (err) {
      setUploadError('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  }, [onUpdate]);

  const handleRemoveLogo = useCallback(() => {
    if (brandConfig.logoUrl && brandConfig.logoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(brandConfig.logoUrl);
    }
    onUpdate({ logoUrl: undefined, logoFile: undefined });
  }, [brandConfig.logoUrl, onUpdate]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-app-border shrink-0">
        <h3 className="text-lg font-semibold text-content-high">Branding</h3>
        <p className="text-xs text-content-medium mt-1">
          Customize your stream's visual identity
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* ALLSTRM Watermark Section - Shows for FREE tier */}
        {!canRemoveWatermark && (
          <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-content-high">ALLSTRM Watermark</h4>
                <p className="text-xs text-content-medium mt-1">
                  Your stream includes the ALLSTRM watermark. Upgrade to Creator tier or higher to remove it.
                </p>
                <button className="mt-2 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
                  Upgrade Plan →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Watermark Control for higher tiers */}
        {canRemoveWatermark && (
          <Section title="Watermark">
            <div className="flex items-center justify-between p-3 bg-app-bg rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm text-content-medium">Show ALLSTRM watermark</span>
              </div>
              <button
                onClick={() => onUpdate({ showWatermark: !brandConfig.showWatermark })}
                className={`w-10 h-6 rounded-full transition-all relative ${
                  brandConfig.showWatermark ? 'bg-indigo-500' : 'bg-gray-600'
                }`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${
                  brandConfig.showWatermark ? 'right-1' : 'left-1'
                }`} />
              </button>
            </div>
            {brandConfig.showWatermark && (
              <div className="space-y-3 mt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-content-medium">Position</span>
                  <PositionSelector 
                    value={brandConfig.watermarkPosition} 
                    onChange={(pos) => onUpdate({ watermarkPosition: pos })}
                  />
                </div>
                <OpacitySlider
                  value={brandConfig.watermarkOpacity}
                  onChange={(val) => onUpdate({ watermarkOpacity: val })}
                />
              </div>
            )}
          </Section>
        )}

        {/* Logo Upload Section */}
        <Section 
          title="Custom Logo" 
          requiredTier={BRANDING_TIER_REQUIREMENTS.customLogo}
          currentTier={tier}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />

          {brandConfig.logoUrl ? (
            <div className="space-y-3">
              {/* Logo Preview */}
              <div className="relative bg-app-bg rounded-xl p-4 flex items-center justify-center">
                <img
                  src={brandConfig.logoUrl}
                  alt="Brand Logo"
                  className="max-h-24 max-w-full object-contain"
                  style={{ opacity: brandConfig.logoOpacity / 100 }}
                />
                <button
                  onClick={handleRemoveLogo}
                  disabled={!canUploadLogo}
                  className="absolute top-2 right-2 p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Logo Controls */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-content-medium">Position</span>
                  <PositionSelector 
                    value={brandConfig.logoPosition} 
                    onChange={(pos) => onUpdate({ logoPosition: pos })}
                    disabled={!canUploadLogo}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-content-medium">Size</span>
                  <SizeSelector 
                    value={brandConfig.logoSize} 
                    onChange={(size) => onUpdate({ logoSize: size })}
                    disabled={!canUploadLogo}
                  />
                </div>

                <OpacitySlider
                  value={brandConfig.logoOpacity}
                  onChange={(val) => onUpdate({ logoOpacity: val })}
                  disabled={!canUploadLogo}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={() => canUploadLogo && fileInputRef.current?.click()}
              disabled={!canUploadLogo || isUploading}
              className="w-full h-32 border-2 border-dashed border-app-border rounded-xl flex flex-col items-center justify-center gap-2 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent" />
              ) : (
                <>
                  <Upload className="w-6 h-6 text-content-medium" />
                  <span className="text-sm text-content-medium">Upload Logo</span>
                  <span className="text-xs text-content-low">PNG, JPG up to 5MB</span>
                </>
              )}
            </button>
          )}

          {uploadError && (
            <div className="flex items-center gap-2 text-red-400 text-xs mt-2">
              <AlertCircle size={12} />
              {uploadError}
            </div>
          )}
        </Section>

        {/* Logo Background Section */}
        <Section 
          title="Logo Background"
          requiredTier={BRANDING_TIER_REQUIREMENTS.logoBackground}
          currentTier={tier}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-app-bg rounded-lg">
              <span className="text-sm text-content-medium">Enable background</span>
              <button
                onClick={() => canUseLogoBackground && onUpdate({ logoBackgroundEnabled: !brandConfig.logoBackgroundEnabled })}
                disabled={!canUseLogoBackground}
                className={`w-10 h-6 rounded-full transition-all relative ${
                  brandConfig.logoBackgroundEnabled ? 'bg-indigo-500' : 'bg-gray-600'
                } disabled:opacity-50`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${
                  brandConfig.logoBackgroundEnabled ? 'right-1' : 'left-1'
                }`} />
              </button>
            </div>

            {brandConfig.logoBackgroundEnabled && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-content-medium">Background Color</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandConfig.logoBackground || '#000000'}
                      onChange={(e) => onUpdate({ logoBackground: e.target.value })}
                      disabled={!canUseLogoBackground}
                      className="w-8 h-8 rounded-lg border border-app-border cursor-pointer disabled:opacity-50"
                    />
                    <span className="text-xs text-content-low font-mono">
                      {brandConfig.logoBackground || '#000000'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-content-medium">Padding</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={32}
                      step={4}
                      value={brandConfig.logoPadding}
                      onChange={(e) => onUpdate({ logoPadding: Number(e.target.value) })}
                      disabled={!canUseLogoBackground}
                      className="w-24 h-2 bg-app-bg rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-50"
                    />
                    <span className="text-xs text-content-low w-8">{brandConfig.logoPadding}px</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </Section>

        {/* Brand Color */}
        <Section title="Brand Color">
          <div className="flex items-center gap-3 p-3 bg-app-bg rounded-lg">
            <input
              type="color"
              value={brandConfig.color}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="w-10 h-10 rounded-lg border border-app-border cursor-pointer"
            />
            <div className="flex-1">
              <span className="text-sm text-content-medium">Primary Color</span>
              <span className="block text-xs text-content-low font-mono mt-0.5">
                {brandConfig.color}
              </span>
            </div>
          </div>
        </Section>

        {/* Display Options */}
        <Section title="Display Options">
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-app-bg rounded-lg">
              <span className="text-sm text-content-medium">Show participant names</span>
              <button
                onClick={() => onUpdate({ showDisplayNames: !brandConfig.showDisplayNames })}
                className={`w-10 h-6 rounded-full transition-all relative ${
                  brandConfig.showDisplayNames ? 'bg-indigo-500' : 'bg-gray-600'
                }`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${
                  brandConfig.showDisplayNames ? 'right-1' : 'left-1'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-app-bg rounded-lg">
              <span className="text-sm text-content-medium">Show headlines</span>
              <button
                onClick={() => onUpdate({ showHeadlines: !brandConfig.showHeadlines })}
                className={`w-10 h-6 rounded-full transition-all relative ${
                  brandConfig.showHeadlines ? 'bg-indigo-500' : 'bg-gray-600'
                }`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${
                  brandConfig.showHeadlines ? 'right-1' : 'left-1'
                }`} />
              </button>
            </div>
          </div>
        </Section>

        {/* Theme Selection */}
        <Section title="Name Tag Style">
          <div className="grid grid-cols-2 gap-2">
            {(['bubble', 'classic', 'minimal', 'block'] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => onUpdate({ theme })}
                className={`p-3 rounded-lg border transition-all capitalize ${
                  brandConfig.theme === theme
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                    : 'border-app-border bg-app-bg text-content-medium hover:border-indigo-500/50'
                }`}
              >
                {theme}
              </button>
            ))}
          </div>
        </Section>

      </div>
    </div>
  );
}

export default BrandingPanel;
