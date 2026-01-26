import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Lazy initialization to avoid build-time errors
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
    if (!_stripe) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
        _stripe = new Stripe(key, { apiVersion: '2025-12-15.clover' });
    }
    return _stripe;
}

const serviceRoleClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { db: { schema: 'core' } }
);

// GET /api/stripe/subscription?user_id=xxx - Get current subscription
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
        return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    try {
        // Get user's organization
        const { data: memberships } = await serviceRoleClient
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', userId)
            .order('role', { ascending: true });

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ error: 'User has no organization' }, { status: 404 });
        }

        const orgId = memberships[0].organization_id;

        // Get organization with subscription
        const { data: org } = await serviceRoleClient
            .from('organizations')
            .select('stripe_subscription_id, stripe_customer_id, billing_tier')
            .eq('id', orgId)
            .single();

        if (!org?.stripe_subscription_id) {
            return NextResponse.json({
                subscription: null,
                billing_tier: org?.billing_tier || 'free'
            });
        }

        // Get subscription from our DB
        const { data: sub } = await serviceRoleClient
            .from('subscriptions')
            .select('*')
            .eq('stripe_subscription_id', org.stripe_subscription_id)
            .single();

        // Get subscription details from Stripe for up-to-date info
        let stripeSubscription: Stripe.Subscription | null = null;
        try {
            stripeSubscription = await getStripe().subscriptions.retrieve(org.stripe_subscription_id);
        } catch (e) {
            console.error('Could not retrieve Stripe subscription:', e);
        }

        // Access subscription properties (using type assertion for API compatibility)
        const subAny = stripeSubscription as any;
        return NextResponse.json({
            subscription: sub,
            stripe_subscription: stripeSubscription ? {
                id: stripeSubscription.id,
                status: stripeSubscription.status,
                current_period_end: subAny.current_period_end ? new Date(subAny.current_period_end * 1000).toISOString() : null,
                cancel_at_period_end: stripeSubscription.cancel_at_period_end,
                trial_end: subAny.trial_end ? new Date(subAny.trial_end * 1000).toISOString() : null,
            } : null,
            billing_tier: org.billing_tier
        });

    } catch (error: any) {
        console.error('Get subscription error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/stripe/subscription - Change subscription (upgrade/downgrade)
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { user_id, new_price_id } = body;

        if (!user_id || !new_price_id) {
            return NextResponse.json({ error: 'Missing user_id or new_price_id' }, { status: 400 });
        }

        // Get user's organization
        const { data: memberships } = await serviceRoleClient
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', user_id)
            .order('role', { ascending: true });

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ error: 'User has no organization' }, { status: 404 });
        }

        if (memberships[0].role !== 'owner') {
            return NextResponse.json({ error: 'Only organization owners can manage billing' }, { status: 403 });
        }

        const orgId = memberships[0].organization_id;

        // Get organization's subscription
        const { data: org } = await serviceRoleClient
            .from('organizations')
            .select('stripe_subscription_id, stripe_customer_id')
            .eq('id', orgId)
            .single();

        if (!org?.stripe_subscription_id) {
            return NextResponse.json({
                error: 'No active subscription. Use checkout to create one.',
                redirect: 'checkout'
            }, { status: 400 });
        }

        // Get current subscription from Stripe
        const subscription = await getStripe().subscriptions.retrieve(org.stripe_subscription_id);

        // Update the subscription with the new price (proration by default)
        const updatedSubscription = await getStripe().subscriptions.update(org.stripe_subscription_id, {
            items: [
                {
                    id: subscription.items.data[0].id,
                    price: new_price_id,
                },
            ],
            proration_behavior: 'create_prorations',
            metadata: {
                organization_id: orgId,
                user_id: user_id
            }
        });

        const updatedSubAny = updatedSubscription as any;
        return NextResponse.json({
            success: true,
            subscription: {
                id: updatedSubscription.id,
                status: updatedSubscription.status,
                current_period_end: updatedSubAny.current_period_end ? new Date(updatedSubAny.current_period_end * 1000).toISOString() : null,
            }
        });

    } catch (error: any) {
        console.error('Update subscription error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/stripe/subscription?user_id=xxx - Cancel subscription
export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');
    const cancelImmediately = searchParams.get('immediately') === 'true';

    if (!userId) {
        return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    try {
        // Get user's organization
        const { data: memberships } = await serviceRoleClient
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', userId)
            .order('role', { ascending: true });

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ error: 'User has no organization' }, { status: 404 });
        }

        if (memberships[0].role !== 'owner') {
            return NextResponse.json({ error: 'Only organization owners can manage billing' }, { status: 403 });
        }

        const orgId = memberships[0].organization_id;

        // Get organization's subscription
        const { data: org } = await serviceRoleClient
            .from('organizations')
            .select('stripe_subscription_id')
            .eq('id', orgId)
            .single();

        if (!org?.stripe_subscription_id) {
            return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
        }

        let canceledSubscription: Stripe.Subscription;

        if (cancelImmediately) {
            // Cancel immediately
            canceledSubscription = await getStripe().subscriptions.cancel(org.stripe_subscription_id);
        } else {
            // Cancel at end of billing period
            canceledSubscription = await getStripe().subscriptions.update(org.stripe_subscription_id, {
                cancel_at_period_end: true
            });
        }

        // Update our subscription record
        await serviceRoleClient
            .from('subscriptions')
            .update({
                cancel_at_period_end: canceledSubscription.cancel_at_period_end,
                canceled_at: cancelImmediately ? new Date().toISOString() : null,
                status: canceledSubscription.status
            })
            .eq('stripe_subscription_id', org.stripe_subscription_id);

        const canceledSubAny = canceledSubscription as any;
        return NextResponse.json({
            success: true,
            canceled_at_period_end: canceledSubscription.cancel_at_period_end,
            current_period_end: canceledSubAny.current_period_end ? new Date(canceledSubAny.current_period_end * 1000).toISOString() : null,
            status: canceledSubscription.status
        });

    } catch (error: any) {
        console.error('Cancel subscription error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/stripe/subscription - Reactivate canceled subscription
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { user_id } = body;

        if (!user_id) {
            return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
        }

        // Get user's organization
        const { data: memberships } = await serviceRoleClient
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', user_id)
            .order('role', { ascending: true });

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ error: 'User has no organization' }, { status: 404 });
        }

        if (memberships[0].role !== 'owner') {
            return NextResponse.json({ error: 'Only organization owners can manage billing' }, { status: 403 });
        }

        const orgId = memberships[0].organization_id;

        // Get organization's subscription
        const { data: org } = await serviceRoleClient
            .from('organizations')
            .select('stripe_subscription_id')
            .eq('id', orgId)
            .single();

        if (!org?.stripe_subscription_id) {
            return NextResponse.json({ error: 'No subscription to reactivate' }, { status: 400 });
        }

        // Reactivate by removing cancel_at_period_end
        const subscription = await getStripe().subscriptions.update(org.stripe_subscription_id, {
            cancel_at_period_end: false
        });

        // Update our subscription record
        await serviceRoleClient
            .from('subscriptions')
            .update({
                cancel_at_period_end: false,
                canceled_at: null,
                status: subscription.status
            })
            .eq('stripe_subscription_id', org.stripe_subscription_id);

        const subAny = subscription as any;
        return NextResponse.json({
            success: true,
            subscription: {
                id: subscription.id,
                status: subscription.status,
                current_period_end: subAny.current_period_end ? new Date(subAny.current_period_end * 1000).toISOString() : null,
            }
        });

    } catch (error: any) {
        console.error('Reactivate subscription error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
