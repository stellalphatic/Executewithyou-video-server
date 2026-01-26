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

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

// POST /api/stripe/webhook - Handle Stripe webhook events
export async function POST(req: NextRequest) {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log('[Stripe Webhook] Event received:', event.type);

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutCompleted(session);
                break;
            }

            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionUpdate(subscription);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionDeleted(subscription);
                break;
            }

            case 'invoice.paid': {
                const invoice = event.data.object as Stripe.Invoice;
                await handleInvoicePaid(invoice);
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                await handleInvoicePaymentFailed(invoice);
                break;
            }

            case 'customer.subscription.trial_will_end': {
                const subscription = event.data.object as Stripe.Subscription;
                // Could send notification email here
                console.log('[Stripe] Trial ending soon for subscription:', subscription.id);
                break;
            }

            default:
                console.log('[Stripe] Unhandled event type:', event.type);
        }

        return NextResponse.json({ received: true });

    } catch (error: any) {
        console.error('[Stripe Webhook] Error processing event:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const orgId = session.metadata?.organization_id;
    const subscriptionId = session.subscription as string;

    if (!orgId || !subscriptionId) {
        console.error('[Stripe] Missing org_id or subscription_id in checkout session');
        return;
    }

    // Update organization with subscription ID
    await serviceRoleClient
        .from('organizations')
        .update({
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: session.customer as string
        })
        .eq('id', orgId);

    console.log('[Stripe] Checkout completed for org:', orgId);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
    const orgId = subscription.metadata?.organization_id;

    if (!orgId) {
        // Try to find org by customer ID
        const customerId = subscription.customer as string;
        const { data: org } = await serviceRoleClient
            .from('organizations')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single();

        if (!org) {
            console.error('[Stripe] Could not find organization for subscription:', subscription.id);
            return;
        }
    }

    const targetOrgId = orgId || (await getOrgIdByCustomer(subscription.customer as string));
    if (!targetOrgId) return;

    const priceId = subscription.items.data[0]?.price?.id;
    const billingInterval = subscription.items.data[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';

    // Get tier info from our pricing table
    const { data: tierInfo } = await serviceRoleClient
        .from('tier_pricing')
        .select('*')
        .eq('stripe_price_id', priceId)
        .single();

    // Upsert subscription record (using type assertion for API compatibility)
    const subAny = subscription as any;
    const { error: subError } = await serviceRoleClient
        .from('subscriptions')
        .upsert({
            organization_id: targetOrgId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: subscription.customer as string,
            stripe_price_id: priceId,
            status: subscription.status,
            billing_interval: billingInterval,
            current_period_start: subAny.current_period_start ? new Date(subAny.current_period_start * 1000).toISOString() : new Date().toISOString(),
            current_period_end: subAny.current_period_end ? new Date(subAny.current_period_end * 1000).toISOString() : new Date().toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            canceled_at: subAny.canceled_at ? new Date(subAny.canceled_at * 1000).toISOString() : null,
            trial_start: subAny.trial_start ? new Date(subAny.trial_start * 1000).toISOString() : null,
            trial_end: subAny.trial_end ? new Date(subAny.trial_end * 1000).toISOString() : null,
        }, {
            onConflict: 'stripe_subscription_id'
        });

    if (subError) {
        console.error('[Stripe] Error upserting subscription:', subError);
    }

    // If subscription is active/trialing and we have tier info, update org limits
    // (This is also handled by the DB trigger, but we do it here for immediate effect)
    if ((subscription.status === 'active' || subscription.status === 'trialing') && tierInfo) {
        await serviceRoleClient
            .from('organizations')
            .update({
                billing_tier: tierInfo.tier,
                max_rooms: tierInfo.max_rooms,
                max_participants_per_room: tierInfo.max_participants_per_room,
                max_stream_hours_monthly: tierInfo.max_stream_hours_monthly,
                max_recording_hours: tierInfo.max_recording_hours,
                max_destinations: tierInfo.max_destinations,
                features: tierInfo.features,
                stripe_subscription_id: subscription.id
            })
            .eq('id', targetOrgId);

        // Also update the user's plan in core.users
        const { data: members } = await serviceRoleClient
            .from('organization_members')
            .select('user_id')
            .eq('organization_id', targetOrgId)
            .eq('role', 'owner');

        if (members && members.length > 0) {
            await serviceRoleClient
                .from('users')
                .update({ plan: tierInfo.tier })
                .eq('id', members[0].user_id);
        }
    }

    console.log('[Stripe] Subscription updated:', subscription.id, 'Status:', subscription.status);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const targetOrgId = subscription.metadata?.organization_id || await getOrgIdByCustomer(subscription.customer as string);
    if (!targetOrgId) return;

    // Update subscription status
    await serviceRoleClient
        .from('subscriptions')
        .update({
            status: 'canceled',
            canceled_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', subscription.id);

    // Downgrade organization to free tier
    await serviceRoleClient
        .from('organizations')
        .update({
            billing_tier: 'free',
            max_rooms: 1,
            max_participants_per_room: 5,
            max_stream_hours_monthly: 10,
            max_recording_hours: 0,
            max_destinations: 1,
            features: { custom_branding: false, iso_recording: false, api_access: false },
            stripe_subscription_id: null
        })
        .eq('id', targetOrgId);

    // Update user plan
    const { data: members } = await serviceRoleClient
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', targetOrgId)
        .eq('role', 'owner');

    if (members && members.length > 0) {
        await serviceRoleClient
            .from('users')
            .update({ plan: 'free' })
            .eq('id', members[0].user_id);
    }

    console.log('[Stripe] Subscription deleted, org downgraded to free:', targetOrgId);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const targetOrgId = await getOrgIdByCustomer(customerId);
    if (!targetOrgId) return;

    // Record invoice in our database
    await serviceRoleClient
        .from('invoices')
        .upsert({
            organization_id: targetOrgId,
            stripe_invoice_id: invoice.id,
            stripe_customer_id: customerId,
            amount_paid: invoice.amount_paid,
            amount_due: invoice.amount_due,
            currency: invoice.currency,
            status: 'paid',
            invoice_url: invoice.hosted_invoice_url,
            invoice_pdf: invoice.invoice_pdf,
            hosted_invoice_url: invoice.hosted_invoice_url,
            period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
            period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
            paid_at: new Date().toISOString()
        }, {
            onConflict: 'stripe_invoice_id'
        });

    console.log('[Stripe] Invoice paid:', invoice.id);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const targetOrgId = await getOrgIdByCustomer(customerId);
    if (!targetOrgId) return;

    // Record failed invoice
    await serviceRoleClient
        .from('invoices')
        .upsert({
            organization_id: targetOrgId,
            stripe_invoice_id: invoice.id,
            stripe_customer_id: customerId,
            amount_paid: invoice.amount_paid,
            amount_due: invoice.amount_due,
            currency: invoice.currency,
            status: 'open', // Still open, payment failed
            invoice_url: invoice.hosted_invoice_url,
            invoice_pdf: invoice.invoice_pdf,
            hosted_invoice_url: invoice.hosted_invoice_url,
            period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
            period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
        }, {
            onConflict: 'stripe_invoice_id'
        });

    // Could send notification email here
    console.log('[Stripe] Invoice payment failed:', invoice.id);
}

async function getOrgIdByCustomer(customerId: string): Promise<string | null> {
    const { data: org } = await serviceRoleClient
        .from('organizations')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

    return org?.id || null;
}
