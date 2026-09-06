// Subscription management — trusted Firebase Cloud Functions for
// Plans & Monetisation (Spec 17): recurring subscriptions via Stripe.
// ───────────────────────────────────────────────────────────
// 1. createSubscriptionCheckout — creates a Stripe Checkout session
//    for a plan's recurring subscription. Returns a redirect URL.
// 2. getMySubscription — returns the caller's current subscription
//    (professional or business) from Firestore.
// 3. createCustomerPortal — creates a Stripe Customer Portal session
//    for billing management (payment method, invoices, cancellation).
//
// Subscriptions live in Firestore:
//   professionalSubscriptions — identity-owned (professional context)
//   businessSubscriptions     — business-owned
//
// The Stripe webhook (verified signature) is the source of truth for
// subscription activation/cancellation. These functions create the
// checkout/portal sessions; the webhook updates subscription state.
//
// Tier 1 (essential) is the permanent free plan — no subscription
// record is needed. A missing subscription record = Tier 1 free.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, hasBusinessRole } from './shared';
import { getStripe } from './stripe';

// ── createSubscriptionCheckout ────────────────────────────────
// Request: { plan_id: string, business_id?: string, origin?: string }
// Returns: { url: string }
export const createSubscriptionCheckout = onCall(
  { region: 'europe-west2', cors: allowedOrigins, secrets: ['STRIPE_SECRET_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const identityId = await getIdentityId(request.auth.uid);
    const { plan_id, business_id, origin } = request.data || {};

    if (!plan_id) {
      throw new HttpsError('invalid-argument', 'plan_id is required');
    }

    // Authorization: business admin for business subscriptions, else professional
    if (business_id) {
      const isAdmin = await hasBusinessRole(business_id, identityId, ['owner', 'admin']);
      if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Business admin required');
      }
    }

    // Load the plan
    const planDoc = await db.collection('subscriptionPlans').doc(plan_id).get();
    let planData: any = null;
    if (planDoc.exists) {
      planData = planDoc.data();
    } else {
      // Fall back to Base44-stored plan (display data) — but the Stripe
      // price_id must be in Firestore for checkout. If the plan is only
      // in Base44, we cannot create a Stripe subscription.
      throw new HttpsError('not-found', 'Plan not found in subscription configuration');
    }

    // Free tier — no checkout needed
    if (!planData.price_pence || planData.price_pence === 0) {
      throw new HttpsError('failed-precondition', 'Free plan does not require a subscription');
    }

    const stripePriceId = planData.stripe_price_id;
    if (!stripePriceId) {
      throw new HttpsError(
        'failed-precondition',
        'Plan is not configured for live billing (missing Stripe Price). Contact support.',
      );
    }

    const stripe = getStripe();
    const now = new Date().toISOString();
    const returnUrl = origin || 'https://app.interactive.app';

    // Resolve or create a Stripe Customer for the subscriber
    const collection = business_id ? 'businessSubscriptions' : 'professionalSubscriptions';
    const ownerField = business_id ? 'business_id' : 'identity_id';
    const ownerId = business_id || identityId;

    let existingSnap = await db.collection(collection)
      .where(ownerField, '==', ownerId)
      .where('status', 'in', ['selected', 'active', 'past_due'])
      .limit(1)
      .get();

    let customerId: string | null = null;
    let subscriptionRef: FirebaseFirestore.DocumentReference | null = null;

    if (!existingSnap.empty) {
      const existingData = existingSnap.docs[0].data();
      customerId = existingData.stripe_customer_id || null;
      subscriptionRef = existingSnap.docs[0].ref;
    }

    if (!customerId) {
      // Create a Stripe Customer
      const customer = await stripe.customers.create({
        metadata: {
          identity_id: identityId,
          business_id: business_id || '',
          plan_id,
        },
      });
      customerId = customer.id;
    }

    // Create a Checkout session for the subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${returnUrl}/plans?checkout=success`,
      cancel_url: `${returnUrl}/plans?checkout=cancelled`,
      metadata: {
        identity_id: identityId,
        business_id: business_id || '',
        plan_id,
      },
      subscription_data: {
        metadata: {
          identity_id: identityId,
          business_id: business_id || '',
          plan_id,
        },
      },
    });

    // Record a 'selected' subscription record (activated by webhook)
    if (!subscriptionRef) {
      subscriptionRef = db.collection(collection).doc();
      await subscriptionRef.set({
        [ownerField]: ownerId,
        plan_id,
        plan_name: planData.name || null,
        plan_tier: planData.tier || null,
        status: 'selected',
        selected_at: now,
        activated_at: null,
        cancelled_at: null,
        stripe_subscription_id: null,
        stripe_customer_id: customerId,
        current_period_end: null,
        _created_date: now,
        _updated_date: now,
      });
    } else {
      await subscriptionRef.update({
        plan_id,
        plan_name: planData.name || null,
        plan_tier: planData.tier || null,
        status: 'selected',
        selected_at: now,
        stripe_customer_id: customerId,
        _updated_date: now,
      });
    }

    return { url: session.url };
  },
);

// ── getMySubscription ────────────────────────────────────────
// Request: { business_id?: string }
// Returns: { plan_id, plan_name, plan_tier, status, current_period_end, stripe_customer_id } | null
export const getMySubscription = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const identityId = await getIdentityId(request.auth.uid);
    const { business_id } = request.data || {};

    let collection: string;
    let ownerField: string;
    let ownerId: string;

    if (business_id) {
      const canView = await hasBusinessRole(business_id, identityId, ['owner', 'admin', 'staff']);
      if (!canView) {
        throw new HttpsError('permission-denied', 'Not a business member');
      }
      collection = 'businessSubscriptions';
      ownerField = 'business_id';
      ownerId = business_id;
    } else {
      collection = 'professionalSubscriptions';
      ownerField = 'identity_id';
      ownerId = identityId;
    }

    const snap = await db.collection(collection)
      .where(ownerField, '==', ownerId)
      .where('status', 'in', ['selected', 'active', 'past_due'])
      .limit(1)
      .get();

    if (snap.empty) return null;
    const data = snap.docs[0].data();
    return {
      plan_id: data.plan_id,
      plan_name: data.plan_name,
      plan_tier: data.plan_tier,
      status: data.status,
      current_period_end: data.current_period_end || null,
      stripe_customer_id: data.stripe_customer_id || null,
    };
  },
);

// ── createCustomerPortal ─────────────────────────────────────
// Request: { business_id?: string, origin?: string }
// Returns: { url: string }
export const createCustomerPortal = onCall(
  { region: 'europe-west2', cors: allowedOrigins, secrets: ['STRIPE_SECRET_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const identityId = await getIdentityId(request.auth.uid);
    const { business_id, origin } = request.data || {};

    let collection: string;
    let ownerField: string;
    let ownerId: string;

    if (business_id) {
      const isAdmin = await hasBusinessRole(business_id, identityId, ['owner', 'admin']);
      if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Business admin required');
      }
      collection = 'businessSubscriptions';
      ownerField = 'business_id';
      ownerId = business_id;
    } else {
      collection = 'professionalSubscriptions';
      ownerField = 'identity_id';
      ownerId = identityId;
    }

    const snap = await db.collection(collection)
      .where(ownerField, '==', ownerId)
      .where('status', 'in', ['selected', 'active', 'past_due'])
      .limit(1)
      .get();

    if (snap.empty) {
      throw new HttpsError('not-found', 'No active subscription to manage');
    }

    const customerId = snap.docs[0].data().stripe_customer_id;
    if (!customerId) {
      throw new HttpsError('failed-precondition', 'Subscription has no Stripe customer');
    }

    const stripe = getStripe();
    const returnUrl = origin || 'https://app.interactive.app';
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${returnUrl}/plans`,
    });

    return { url: session.url };
  },
);