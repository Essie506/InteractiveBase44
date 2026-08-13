// Stripe Connect onboarding + payment readiness
// ───────────────────────────────────────────────────────────
// Manages Express connected accounts for providers/businesses
// receiving payments. Interactive verification and Stripe Connect
// onboarding are separate concerns — onboarding does not verify
// the provider on Interactive.
//
// Flow:
//   Provider enables paid bookings
//     → Interactive checks Stripe Connect status
//     → If account missing/incomplete
//     → Trusted Firebase Function creates account + onboarding link
//     → Stripe-hosted onboarding
//     → Stripe returns account state
//     → Interactive records payment-readiness state
//
// Paid bookings are NOT accepted for providers who are not
// payment-ready (charges_enabled + details_submitted).

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, hasBusinessRole } from './shared';
import { getStripe } from './stripe';

// ── createConnectAccount ─────────────────────────────────────
// Creates a Stripe Express connected account (or returns existing)
// and generates an Account Link for Stripe-hosted onboarding.
//
// Request: { business_id?: string, origin?: string }
// Returns: { url: string, account_id: string }
export const createConnectAccount = onCall(
  { region: 'europe-west2', cors: allowedOrigins, secrets: ['STRIPE_SECRET_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const identityId = await getIdentityId(request.auth.uid);
    const { business_id, origin } = request.data || {};

    // If business_id provided, verify caller is business admin
    if (business_id) {
      const isAdmin = await hasBusinessRole(business_id, identityId, ['owner', 'admin']);
      if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Business admin required');
      }
    }

    const stripe = getStripe();
    const now = new Date().toISOString();

    // Check for existing account
    let existingQuery: FirebaseFirestore.Query;
    if (business_id) {
      existingQuery = db.collection('stripeConnectAccounts')
        .where('business_id', '==', business_id)
        .limit(1);
    } else {
      existingQuery = db.collection('stripeConnectAccounts')
        .where('identity_id', '==', identityId)
        .where('business_id', '==', null)
        .limit(1);
    }
    const existingSnap = await existingQuery.get();

    let accountId: string;
    if (!existingSnap.empty) {
      accountId = existingSnap.docs[0].data().stripe_account_id;
    } else {
      // Create new Express account
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: {
          identity_id: identityId,
          business_id: business_id || '',
        },
      });
      accountId = account.id;

      await db.collection('stripeConnectAccounts').doc(accountId).set({
        identity_id: identityId,
        business_id: business_id || null,
        stripe_account_id: accountId,
        account_status: 'pending',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        _created_date: now,
        _updated_date: now,
      });
    }

    // Create onboarding link
    const returnUrl = origin || 'https://app.base44.app';
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${returnUrl}/settings?stripe_refresh=1`,
      return_url: `${returnUrl}/settings?stripe_complete=1`,
      type: 'account_onboarding',
    });

    return { url: accountLink.url, account_id: accountId };
  },
);

// ── getConnectAccountStatus ──────────────────────────────────
// Refreshes and returns the Stripe Connect account status.
// Updates the stored record with the latest Stripe state.
//
// Request: { business_id?: string }
// Returns: { connected, payment_ready, charges_enabled, payouts_enabled, details_submitted }
export const getConnectAccountStatus = onCall(
  { region: 'europe-west2', cors: allowedOrigins, secrets: ['STRIPE_SECRET_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const identityId = await getIdentityId(request.auth.uid);
    const { business_id } = request.data || {};

    // If business_id provided, verify caller can view
    if (business_id) {
      const canView = await hasBusinessRole(business_id, identityId, ['owner', 'admin', 'staff']);
      if (!canView) {
        throw new HttpsError('permission-denied', 'Not a business member');
      }
    }

    let query: FirebaseFirestore.Query;
    if (business_id) {
      query = db.collection('stripeConnectAccounts')
        .where('business_id', '==', business_id)
        .limit(1);
    } else {
      query = db.collection('stripeConnectAccounts')
        .where('identity_id', '==', identityId)
        .where('business_id', '==', null)
        .limit(1);
    }
    const snap = await query.get();

    if (snap.empty) {
      return { connected: false, payment_ready: false };
    }

    const docRef = snap.docs[0].ref;
    const docData = snap.docs[0].data();

    // Refresh from Stripe
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(docData.stripe_account_id);
    const now = new Date().toISOString();

    const chargesEnabled = account.charges_enabled;
    const payoutsEnabled = account.payouts_enabled;
    const detailsSubmitted = account.details_submitted;

    await docRef.update({
      account_status: chargesEnabled && detailsSubmitted ? 'enabled' : 'restricted',
      charges_enabled: chargesEnabled,
      payouts_enabled: payoutsEnabled,
      details_submitted: detailsSubmitted,
      _updated_date: now,
    });

    return {
      connected: true,
      payment_ready: chargesEnabled && detailsSubmitted,
      charges_enabled: chargesEnabled,
      payouts_enabled: payoutsEnabled,
      details_submitted: detailsSubmitted,
    };
  },
);

// ── getStripeConfig ──────────────────────────────────────────
// Returns client-safe Stripe configuration for Stripe.js.
// Only the publishable key is returned — never the secret key.
//
// Request: {} (no params)
// Returns: { publishable_key: string }
export const getStripeConfig = onCall(
  { region: 'europe-west2', cors: allowedOrigins, secrets: ['STRIPE_PUBLISHABLE_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    // Verify identity exists (guests use a separate flow)
    await getIdentityId(request.auth.uid);

    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      throw new HttpsError('failed-precondition', 'STRIPE_PUBLISHABLE_KEY not configured');
    }
    return { publishable_key: publishableKey };
  },
);