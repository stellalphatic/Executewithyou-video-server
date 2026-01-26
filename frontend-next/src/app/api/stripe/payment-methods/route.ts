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

// GET /api/stripe/payment-methods?user_id=xxx - Get saved payment methods
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

        // Get organization's Stripe customer ID
        const { data: org } = await serviceRoleClient
            .from('organizations')
            .select('stripe_customer_id')
            .eq('id', orgId)
            .single();

        if (!org?.stripe_customer_id) {
            return NextResponse.json({ payment_methods: [] });
        }

        // Get payment methods from Stripe
        const paymentMethods = await getStripe().paymentMethods.list({
            customer: org.stripe_customer_id,
            type: 'card',
        });

        // Get default payment method
        const customer = await getStripe().customers.retrieve(org.stripe_customer_id);
        const defaultPaymentMethodId = (customer as Stripe.Customer).invoice_settings?.default_payment_method;

        const methods = paymentMethods.data.map(pm => ({
            id: pm.id,
            type: pm.type,
            card_brand: pm.card?.brand,
            card_last4: pm.card?.last4,
            card_exp_month: pm.card?.exp_month,
            card_exp_year: pm.card?.exp_year,
            is_default: pm.id === defaultPaymentMethodId,
            billing_name: pm.billing_details?.name,
            billing_email: pm.billing_details?.email,
        }));

        return NextResponse.json({ payment_methods: methods });

    } catch (error: any) {
        console.error('Payment methods GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/stripe/payment-methods - Add a new payment method
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { user_id, payment_method_id, set_as_default } = body;

        if (!user_id || !payment_method_id) {
            return NextResponse.json({ error: 'Missing user_id or payment_method_id' }, { status: 400 });
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
            return NextResponse.json({ error: 'Only organization owners can manage payment methods' }, { status: 403 });
        }

        const orgId = memberships[0].organization_id;

        // Get or create Stripe customer
        let { data: org } = await serviceRoleClient
            .from('organizations')
            .select('stripe_customer_id, name')
            .eq('id', orgId)
            .single();

        let customerId = org?.stripe_customer_id;

        if (!customerId) {
            // Get user email
            const { data: userData } = await serviceRoleClient
                .from('users')
                .select('email, display_name')
                .eq('id', user_id)
                .single();

            const customer = await getStripe().customers.create({
                email: userData?.email,
                name: userData?.display_name || org?.name,
                metadata: {
                    organization_id: orgId,
                    user_id: user_id
                }
            });
            customerId = customer.id;

            await serviceRoleClient
                .from('organizations')
                .update({ stripe_customer_id: customerId })
                .eq('id', orgId);
        }

        // Attach payment method to customer
        await getStripe().paymentMethods.attach(payment_method_id, {
            customer: customerId,
        });

        // Set as default if requested
        if (set_as_default) {
            await getStripe().customers.update(customerId, {
                invoice_settings: {
                    default_payment_method: payment_method_id,
                },
            });
        }

        // Get the payment method details
        const pm = await getStripe().paymentMethods.retrieve(payment_method_id);

        // Store in our database
        await serviceRoleClient
            .from('payment_methods')
            .upsert({
                organization_id: orgId,
                stripe_payment_method_id: payment_method_id,
                type: pm.type,
                card_brand: pm.card?.brand,
                card_last4: pm.card?.last4,
                card_exp_month: pm.card?.exp_month,
                card_exp_year: pm.card?.exp_year,
                is_default: set_as_default || false,
                billing_name: pm.billing_details?.name,
                billing_email: pm.billing_details?.email,
            }, {
                onConflict: 'stripe_payment_method_id'
            });

        return NextResponse.json({
            success: true,
            payment_method: {
                id: pm.id,
                card_brand: pm.card?.brand,
                card_last4: pm.card?.last4,
                is_default: set_as_default || false
            }
        });

    } catch (error: any) {
        console.error('Payment methods POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/stripe/payment-methods?user_id=xxx&payment_method_id=xxx - Remove payment method
export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');
    const paymentMethodId = searchParams.get('payment_method_id');

    if (!userId || !paymentMethodId) {
        return NextResponse.json({ error: 'Missing user_id or payment_method_id' }, { status: 400 });
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
            return NextResponse.json({ error: 'Only organization owners can manage payment methods' }, { status: 403 });
        }

        // Detach payment method from Stripe
        await getStripe().paymentMethods.detach(paymentMethodId);

        // Remove from our database
        await serviceRoleClient
            .from('payment_methods')
            .delete()
            .eq('stripe_payment_method_id', paymentMethodId);

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Payment methods DELETE error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/stripe/payment-methods - Set default payment method
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { user_id, payment_method_id } = body;

        if (!user_id || !payment_method_id) {
            return NextResponse.json({ error: 'Missing user_id or payment_method_id' }, { status: 400 });
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
            return NextResponse.json({ error: 'Only organization owners can manage payment methods' }, { status: 403 });
        }

        const orgId = memberships[0].organization_id;

        // Get Stripe customer ID
        const { data: org } = await serviceRoleClient
            .from('organizations')
            .select('stripe_customer_id')
            .eq('id', orgId)
            .single();

        if (!org?.stripe_customer_id) {
            return NextResponse.json({ error: 'No Stripe customer found' }, { status: 400 });
        }

        // Update default in Stripe
        await getStripe().customers.update(org.stripe_customer_id, {
            invoice_settings: {
                default_payment_method: payment_method_id,
            },
        });

        // Update in our database
        await serviceRoleClient
            .from('payment_methods')
            .update({ is_default: false })
            .eq('organization_id', orgId);

        await serviceRoleClient
            .from('payment_methods')
            .update({ is_default: true })
            .eq('stripe_payment_method_id', payment_method_id);

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Payment methods PATCH error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
