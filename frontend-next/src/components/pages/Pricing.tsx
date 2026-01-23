'use client';


import React, { useState } from 'react';
import { Check, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/Button';

interface PricingProps {
    onBack: () => void;
    onGetStarted: () => void;
}

export const Pricing: React.FC<PricingProps> = ({ onBack, onGetStarted }) => {
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

    const tiers = [
        {
            name: "Free",
            price: "0",
            desc: "For hobbyists starting out.",
            features: ["720p Rendering", "1 hour upload / month", "Watermarked clips", "1 User Seat"],
            action: "Current Plan",
            highlight: false,
            disabled: true
        },
        {
            name: "Creator",
            price: billingCycle === 'monthly' ? "19" : "15",
            desc: "For serious content creators.",
            features: ["1080p Rendering", "5 hours upload / month", "No Watermark", "3 Destinations", "1 User Seat"],
            action: "Upgrade",
            highlight: false
        },
        {
            name: "Pro",
            price: billingCycle === 'monthly' ? "49" : "39",
            desc: "For professionals and brands.",
            features: ["4K Rendering", "20 hours upload / month", "Custom Branding", "Unlimited Destinations", "3 User Seats"],
            action: "Upgrade",
            highlight: true
        },
        {
            name: "Enterprise",
            price: "Custom",
            desc: "For large teams and agencies.",
            features: ["Unlimited Rendering", "Unlimited Storage", "SSO & Advanced Security", "Dedicated Success Manager", "20+ User Seats"],
            action: "Contact Sales",
            highlight: false
        }
    ];

    return (
        <div className="min-h-screen bg-app-bg text-content-high font-sans animate-fade-in overflow-y-auto">
            {/* Header */}
            <div className="py-20 px-6 text-center relative">
                <button 
                    onClick={onBack} 
                    className="absolute top-8 left-8 flex items-center gap-2 text-sm text-content-medium hover:text-content-high transition-colors bg-app-surface border border-app-border px-4 py-2 rounded-lg"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                </button>
                
                <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">Upgrade your studio</h1>
                <p className="text-xl text-content-medium max-w-2xl mx-auto mb-10">
                    Unlock professional features, higher quality, and remove limits.
                </p>

                {/* Toggle */}
                <div className="inline-flex bg-app-surface p-1 rounded-full border border-app-border mb-8 shadow-sm">
                    <button 
                        onClick={() => setBillingCycle('monthly')}
                        className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${billingCycle === 'monthly' ? 'bg-app-bg shadow-sm text-content-high text-indigo-500' : 'text-content-medium hover:text-content-high'}`}
                    >
                        Monthly
                    </button>
                    <button 
                        onClick={() => setBillingCycle('yearly')}
                        className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${billingCycle === 'yearly' ? 'bg-app-bg shadow-sm text-content-high text-indigo-500' : 'text-content-medium hover:text-content-high'}`}
                    >
                        Yearly <span className="ml-1 text-[10px] text-emerald-500 font-bold uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded">Save 20%</span>
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="max-w-7xl mx-auto px-6 pb-24">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {tiers.map((tier) => (
                        <div 
                            key={tier.name}
                            className={`
                                relative p-6 rounded-2xl border transition-all duration-300 flex flex-col
                                ${tier.highlight 
                                    ? 'bg-app-surface border-indigo-500 shadow-2xl shadow-indigo-500/10 scale-105 z-10' 
                                    : 'bg-app-surface/50 border-app-border hover:border-app-border/80'
                                }
                            `}
                        >
                            {tier.highlight && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-lg">
                                    Recommended
                                </div>
                            )}

                            <div className="mb-6">
                                <h3 className="text-lg font-bold mb-2 text-content-high">{tier.name}</h3>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-3xl font-bold tracking-tight">{tier.price === 'Custom' ? '' : '$'}{tier.price}</span>
                                    {tier.price !== 'Custom' && <span className="text-content-medium text-sm">/mo</span>}
                                </div>
                                <p className="text-xs text-content-medium mt-3 leading-relaxed">{tier.desc}</p>
                            </div>

                            <div className="flex-1 space-y-3 mb-8">
                                {tier.features.map(feat => (
                                    <div key={feat} className="flex items-start gap-3 text-xs text-content-high">
                                        <div className={`p-0.5 rounded-full ${tier.highlight ? 'bg-indigo-500/20 text-indigo-500' : 'bg-content-low/20 text-content-medium'}`}>
                                            <Check className="w-3 h-3" />
                                        </div>
                                        <span className="mt-0.5">{feat}</span>
                                    </div>
                                ))}
                            </div>

                            <Button 
                                onClick={onGetStarted} 
                                variant={tier.highlight ? 'primary' : 'secondary'}
                                className={`w-full ${tier.highlight ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : ''}`}
                                disabled={tier.disabled}
                            >
                                {tier.action}
                            </Button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
