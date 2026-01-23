'use client';

import React from 'react';
import { Aperture, ArrowRight } from 'lucide-react';
import { Button } from '@/components/Button';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center relative overflow-hidden font-sans">
      {/* Ambient Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-app-accent/10 via-app-bg to-app-bg" />
      </div>

      <div className="w-full max-w-md px-6 relative z-10 animate-scale-in">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-app-surface border border-app-border rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-app-accent/10">
            <Aperture className="w-8 h-8 text-app-accent" />
          </div>
          <h1 className="text-3xl font-bold text-content-high mb-3 tracking-tight">ALLSTRM Engine</h1>
          <p className="text-content-medium text-sm leading-relaxed">
            The unified infrastructure for real-time media.<br />
            Ingest, process, and broadcast at scale.
          </p>
        </div>

        <div className="bg-app-surface border border-app-border rounded-3xl p-8 shadow-2xl space-y-4">
          <Link href="/login" className="block">
            <Button
              size="lg"
              className="w-full h-12 bg-content-high text-app-bg hover:opacity-90 font-bold border-none"
            >
              Sign In <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>

          <Link href="/pricing" className="block">
            <Button
              variant="secondary"
              size="lg"
              className="w-full h-12"
            >
              View Pricing
            </Button>
          </Link>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-content-low">
            System operational v2.4 • <span className="text-emerald-500">Online</span>
          </p>
        </div>
      </div>
    </div>
  );
}
