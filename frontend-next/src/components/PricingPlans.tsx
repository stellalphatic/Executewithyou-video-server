'use client';

import React, { useState, useEffect } from 'react';
import { Check, Zap, Users, HardDrive, ArrowUpRight, Clock, Loader2, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { useAuth } from '@/contexts/AuthContext';
import { Tier } from '@/types';

interface TierPricing {
    id: string;
    tier: string;
    billing_interval: 'monthly' | 'yearly';
    stripe_price_id: string;
    price_cents: number;
    currency: string;
    max_rooms: number;
    max_participants_per_room: number;
    max_stream_hours_monthly: number;
    max_recording_hours: number;
    max_destinations: number;
    max_team_members: number;
    features: Record<string, boolean>;
}

interface PricingTier {
    tier: string;
    name: string;
    description: string;
    pricing: {
        monthly?: TierPricing;
        yearly?: TierPricing;
    };
}

interface PricingPlansProps {
    onClose?: () => void;
}

const tierOrder = ['free', 'creator', 'professional', 'broadcast', 'enterprise'];

const tierFeatures: Record<string, string[]> = {
    free: [
        '1 room',
        '5 participants per room',
        '10 stream hours/month',
        '1 destination',
        'Basic support'
    ],
    creator: [
        '3 rooms',
        '10 participants per room',
        '50 stream hours/month',
        '3 destinations',
        '10 hours recording storage',
        'Priority email support'
    ],
    professional: [
        '10 rooms',
        '25 participants per room',
        '200 stream hours/month',
        '10 destinations',
        '50 hours recording storage',
        'Custom branding',
        'API access',
        'Priority support'
    ],
    broadcast: [
        '25 rooms',
        '50 participants per room',
        '500 stream hours/month',
        '25 destinations',
        '200 hours recording storage',
        'Custom branding',
        'ISO recording',
        'API access',
        'Dedicated support'
    ],
    enterprise: [
        '100+ rooms',
        '100 participants per room',
        'Unlimited stream hours',
        '100+ destinations',
        '1000 hours recording storage',
        'All features included',
        'SSO/SAML',
        'Dedicated account manager',
        'SLA guarantee'
    ]
};

export const PricingPlans: React.FC<PricingPlansProps> = ({ onClose }) => {
    const { user, tier: currentTier } = useAuth();
    const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
    const [pricing, setPricing] = useState<PricingTier[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCheckingOut, setIsCheckingOut] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [currentOrgTier, setCurrentOrgTier] = useState<string>('free');

    // Fetch pricing from API
    useEffect(() => {
        const fetchPricing = async () => {
            setIsLoading(true);
            try {
                const res = await fetch('/api/stripe/pricing');
                if (res.ok) {
                    const data = await res.json();
                    setPricing(data.pricing || []);
                }
            } catch (err) {
                console.error('Failed to fetch pricing:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchPricing();
    }, []);

    // Fetch current org tier
    useEffect(() => {
        const fetchOrgTier = async () => {
            if (!user?.id) return;
            try {
                const res = await fetch(`/api/organizations/me?user_id=${user.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setCurrentOrgTier(data.billing_tier || 'free');
                }
            } catch (err) {
                console.error('Failed to fetch org tier:', err);
            }
        };
        fetchOrgTier();
    }, [user?.id]);

    const handleSelectPlan = async (tierName: string, priceId: string) => {
        if (!user?.id) return;

        setIsCheckingOut(tierName);
        setError(null);

        try {
            // If upgrading/changing plan and already has subscription
            if (currentOrgTier !== 'free' && tierName !== 'free') {
                // Change subscription
                const res = await fetch('/api/stripe/subscription', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: user.id,
                        new_price_id: priceId
                    })
                });

                const data = await res.json();

                if (!res.ok) {
                    if (data.redirect === 'checkout') {
                        // No subscription yet, go to checkout
                        await createCheckoutSession(priceId);
                        return;
                    }
                    throw new Error(data.error || 'Failed to update subscription');
                }

                // Success - reload to update UI
                window.location.reload();
                return;
            }

            // New subscription - create checkout session
            await createCheckoutSession(priceId);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsCheckingOut(null);
        }
    };

    const createCheckoutSession = async (priceId: string) => {
        const res = await fetch('/api/stripe/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: user?.id,
                price_id: priceId,
                success_url: `${window.location.origin}/dashboard?checkout=success`,
                cancel_url: `${window.location.origin}/dashboard?checkout=canceled`
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Failed to create checkout session');
        }

        // Redirect to Stripe Checkout
        if (data.checkout_url) {
            window.location.href = data.checkout_url;
        }
    };

    const handleCancelSubscription = async () => {
        if (!user?.id) return;
        if (!confirm('Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.')) {
            return;
        }

        setIsCheckingOut('cancel');
        setError(null);

        try {
            const res = await fetch(`/api/stripe/subscription?user_id=${user.id}`, {
                method: 'DELETE'
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to cancel subscription');
            }

            // Success - reload to update UI
            window.location.reload();

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsCheckingOut(null);
        }
    };

    const getCurrentTierIndex = () => tierOrder.indexOf(currentOrgTier);

    const formatPrice = (cents: number) => {
        return `$${(cents / 100).toFixed(0)}`;
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full relative animate-fade-in bg-app-bg">
            {/* Header */}
            <header className="h-20 border-b border-app-border flex items-center justify-between px-8 bg-app-bg/80 backdrop-blur-xl z-10 shrink-0">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-content-high">Choose Your Plan</h1>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-content-medium uppercase tracking-widest mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        <span>Pricing</span>
                        <span className="text-content-low">|</span>
                        <span>Current: {currentOrgTier.charAt(0).toUpperCase() + currentOrgTier.slice(1)}</span>
                    </div>
                </div>
                {onClose && (
                    <Button variant="ghost" onClick={onClose}>Close</Button>
                )}
            </header>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {/* Billing Toggle */}
                <div className="flex justify-center mb-8">
                    <div className="bg-app-surface border border-app-border rounded-lg p-1 flex gap-1">
                        <button
                            onClick={() => setBillingInterval('monthly')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                billingInterval === 'monthly'
                                    ? 'bg-indigo-500 text-white'
                                    : 'text-content-medium hover:text-content-high'
                            }`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setBillingInterval('yearly')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                                billingInterval === 'yearly'
                                    ? 'bg-indigo-500 text-white'
                                    : 'text-content-medium hover:text-content-high'
                            }`}
                        >
                            Yearly
                            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-500 text-[10px] font-bold rounded">
                                Save 20%
                            </span>
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="max-w-4xl mx-auto mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                        <p className="text-sm text-red-500">{error}</p>
                    </div>
                )}

                {/* Pricing Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-7xl mx-auto">
                    {tierOrder.map((tierKey, index) => {
                        const tierData = pricing.find(p => p.tier === tierKey);
                        const priceData = tierData?.pricing?.[billingInterval];
                        const isCurrentTier = tierKey === currentOrgTier;
                        const isUpgrade = index > getCurrentTierIndex();
                        const isDowngrade = index < getCurrentTierIndex() && tierKey !== 'free';
                        const isFree = tierKey === 'free';

                        return (
                            <div
                                key={tierKey}
                                className={`bg-app-surface/30 border rounded-xl p-6 flex flex-col ${
                                    isCurrentTier
                                        ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                                        : 'border-app-border hover:border-content-low'
                                } transition-all`}
                            >
                                {isCurrentTier && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-500 text-white text-xs font-bold rounded-full">
                                        Current Plan
                                    </div>
                                )}

                                <div className="mb-4">
                                    <h3 className="text-lg font-bold text-content-high capitalize">{tierKey}</h3>
                                    <p className="text-xs text-content-medium mt-1">
                                        {tierKey === 'free' && 'Get started for free'}
                                        {tierKey === 'creator' && 'For solo creators'}
                                        {tierKey === 'professional' && 'For growing teams'}
                                        {tierKey === 'broadcast' && 'For high-volume streaming'}
                                        {tierKey === 'enterprise' && 'For large organizations'}
                                    </p>
                                </div>

                                <div className="mb-6">
                                    {isFree ? (
                                        <div className="text-3xl font-bold text-content-high">Free</div>
                                    ) : priceData ? (
                                        <div>
                                            <span className="text-3xl font-bold text-content-high">
                                                {formatPrice(priceData.price_cents)}
                                            </span>
                                            <span className="text-content-medium text-sm">
                                                /{billingInterval === 'monthly' ? 'mo' : 'yr'}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="text-lg font-bold text-content-medium">Contact us</div>
                                    )}
                                </div>

                                <ul className="space-y-3 mb-6 flex-1">
                                    {tierFeatures[tierKey]?.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-content-medium">
                                            <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <div className="mt-auto">
                                    {isCurrentTier ? (
                                        <Button disabled className="w-full" variant="secondary">
                                            Current Plan
                                        </Button>
                                    ) : isFree ? (
                                        currentOrgTier !== 'free' ? (
                                            <Button
                                                variant="ghost"
                                                className="w-full text-red-500 hover:bg-red-500/10"
                                                onClick={handleCancelSubscription}
                                                isLoading={isCheckingOut === 'cancel'}
                                            >
                                                Downgrade to Free
                                            </Button>
                                        ) : null
                                    ) : tierKey === 'enterprise' ? (
                                        <Button variant="secondary" className="w-full">
                                            Contact Sales
                                        </Button>
                                    ) : priceData ? (
                                        <Button
                                            className={`w-full ${isUpgrade ? 'bg-indigo-500 hover:bg-indigo-600' : ''}`}
                                            variant={isDowngrade ? 'secondary' : 'primary'}
                                            onClick={() => handleSelectPlan(tierKey, priceData.stripe_price_id)}
                                            isLoading={isCheckingOut === tierKey}
                                        >
                                            {isUpgrade ? (
                                                <>
                                                    <Zap className="w-4 h-4 mr-2" />
                                                    Upgrade
                                                </>
                                            ) : (
                                                'Downgrade'
                                            )}
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Feature Comparison */}
                <div className="mt-12 max-w-4xl mx-auto">
                    <h2 className="text-lg font-bold text-content-high mb-6 text-center">Compare Plans</h2>
                    <div className="bg-app-surface/30 border border-app-border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-app-border bg-app-surface/50">
                                    <th className="px-4 py-3 text-left font-bold text-content-medium">Feature</th>
                                    <th className="px-4 py-3 text-center font-bold text-content-medium">Free</th>
                                    <th className="px-4 py-3 text-center font-bold text-content-medium">Creator</th>
                                    <th className="px-4 py-3 text-center font-bold text-content-medium">Pro</th>
                                    <th className="px-4 py-3 text-center font-bold text-content-medium">Broadcast</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border/50">
                                <tr>
                                    <td className="px-4 py-3 text-content-high flex items-center gap-2">
                                        <HardDrive className="w-4 h-4 text-content-medium" />
                                        Rooms
                                    </td>
                                    <td className="px-4 py-3 text-center text-content-medium">1</td>
                                    <td className="px-4 py-3 text-center text-content-medium">3</td>
                                    <td className="px-4 py-3 text-center text-content-medium">10</td>
                                    <td className="px-4 py-3 text-center text-content-medium">25</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 text-content-high flex items-center gap-2">
                                        <Users className="w-4 h-4 text-content-medium" />
                                        Participants/Room
                                    </td>
                                    <td className="px-4 py-3 text-center text-content-medium">5</td>
                                    <td className="px-4 py-3 text-center text-content-medium">10</td>
                                    <td className="px-4 py-3 text-center text-content-medium">25</td>
                                    <td className="px-4 py-3 text-center text-content-medium">50</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 text-content-high flex items-center gap-2">
                                        <ArrowUpRight className="w-4 h-4 text-content-medium" />
                                        Destinations
                                    </td>
                                    <td className="px-4 py-3 text-center text-content-medium">1</td>
                                    <td className="px-4 py-3 text-center text-content-medium">3</td>
                                    <td className="px-4 py-3 text-center text-content-medium">10</td>
                                    <td className="px-4 py-3 text-center text-content-medium">25</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 text-content-high flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-content-medium" />
                                        Stream Hours/Month
                                    </td>
                                    <td className="px-4 py-3 text-center text-content-medium">10</td>
                                    <td className="px-4 py-3 text-center text-content-medium">50</td>
                                    <td className="px-4 py-3 text-center text-content-medium">200</td>
                                    <td className="px-4 py-3 text-center text-content-medium">500</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 text-content-high">Custom Branding</td>
                                    <td className="px-4 py-3 text-center text-content-low">—</td>
                                    <td className="px-4 py-3 text-center text-content-low">—</td>
                                    <td className="px-4 py-3 text-center text-emerald-500"><Check className="w-4 h-4 inline" /></td>
                                    <td className="px-4 py-3 text-center text-emerald-500"><Check className="w-4 h-4 inline" /></td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 text-content-high">ISO Recording</td>
                                    <td className="px-4 py-3 text-center text-content-low">—</td>
                                    <td className="px-4 py-3 text-center text-content-low">—</td>
                                    <td className="px-4 py-3 text-center text-content-low">—</td>
                                    <td className="px-4 py-3 text-center text-emerald-500"><Check className="w-4 h-4 inline" /></td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 text-content-high">API Access</td>
                                    <td className="px-4 py-3 text-center text-content-low">—</td>
                                    <td className="px-4 py-3 text-center text-content-low">—</td>
                                    <td className="px-4 py-3 text-center text-emerald-500"><Check className="w-4 h-4 inline" /></td>
                                    <td className="px-4 py-3 text-center text-emerald-500"><Check className="w-4 h-4 inline" /></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
