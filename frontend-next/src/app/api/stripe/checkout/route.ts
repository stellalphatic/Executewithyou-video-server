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

// POST /api/stripe/checkout - Create a checkout session
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { user_id, price_id, success_url, cancel_url } = body;

        if (!user_id || !price_id) {
            return NextResponse.json({ error: 'Missing user_id or price_id' }, { status: 400 });
        }

        // 1. Get user's organization
        const { data: memberships, error: memError } = await serviceRoleClient
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', user_id)
            .order('role', { ascending: true });

        if (memError) throw memError;

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ error: 'User has no organization' }, { status: 404 });
        }

        const membership = memberships[0];

        // Only owners can manage billing
        if (membership.role !== 'owner') {
            return NextResponse.json({ error: 'Only organization owners can manage billing' }, { status: 403 });
        }

        const orgId = membership.organization_id;

        // 2. Get organization and check for existing Stripe customer
        const { data: org, error: orgError } = await serviceRoleClient
            .from('organizations')
            .select('id, name, slug, stripe_customer_id, stripe_subscription_id')
            .eq('id', orgId)
            .single();

        if (orgError) throw orgError;

        // 3. Get user email for customer creation
        const { data: userData, error: userError } = await serviceRoleClient
            .from('users')
            .select('email, display_name')
            .eq('id', user_id)
            .single();

        if (userError) throw userError;

        let customerId = org.stripe_customer_id;

        // 4. Create Stripe customer if doesn't exist
        if (!customerId) {
            const customer = await getStripe().customers.create({
                email: userData.email,
                name: userData.display_name || org.name,
                metadata: {
                    organization_id: orgId,
                    user_id: user_id
                }
            });
            customerId = customer.id;

            // Update org with customer ID
            await serviceRoleClient
                .from('organizations')
                .update({ stripe_customer_id: customerId })
                .eq('id', orgId);
        }

        // 5. Check if there's an existing active subscription
        if (org.stripe_subscription_id) {
            // User is upgrading/downgrading - use subscription update flow instead
            // For now, we'll cancel and create new (or you could use proration)
            try {
                const existingSub = await getStripe().subscriptions.retrieve(org.stripe_subscription_id);
                if (existingSub.status === 'active' || existingSub.status === 'trialing') {
                    // Return error - they should use the subscription management endpoint
                    return NextResponse.json({
                        error: 'Active subscription exists. Use /api/stripe/subscription to modify.',
                        subscription_id: org.stripe_subscription_id
                    }, { status: 400 });
                }
            } catch (e) {
                // Subscription doesn't exist in Stripe anymore, continue
            }
        }

        // 6. Create checkout session
        const session = await getStripe().checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [
                {
                    price: price_id,
                    quantity: 1,
                },
            ],
            success_url: success_url || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
            cancel_url: cancel_url || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=canceled`,
            subscription_data: {
                metadata: {
                    organization_id: orgId,
                    user_id: user_id
                }
            },
            metadata: {
                organization_id: orgId,
                user_id: user_id
            },
            allow_promotion_codes: true,
            billing_address_collection: 'auto',
        });

        return NextResponse.json({
            checkout_url: session.url,
            session_id: session.id
        });

    } catch (error: any) {
        console.error('Stripe Checkout Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
