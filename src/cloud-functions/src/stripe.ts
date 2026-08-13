// Stripe SDK initialization + shared payment helpers
// ───────────────────────────────────────────────────────────
// Centralises Stripe client creation, fee calculation, and
// connected-account resolution. All Cloud Functions that need
// Stripe import from here to avoid duplicate initialization.
//
// Stripe secret key is loaded from Firebase runtime secrets
// (process.env.STRIPE_SECRET_KEY). Set via:
//   firebase functions:secrets:set STRIPE_SECRET_KEY
//
// The publishable key is client-safe and returned to the
// frontend via the getStripeConfig function.

import Stripe from 'stripe';
import { HttpsError } from 'firebase-functions/v2/https';

// ── Stripe client ────────────────────────────────────────────
// Lazy initialization — only created when first accessed.
// Secrets are injected via the `secrets` option on each function.
let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new HttpsError('failed-precondition', 'STRIPE_SECRET_KEY not configured');
    }
    stripeClient = new Stripe(key, {
      apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
    });
  }
  return stripeClient;
}

export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';

// ── Fee calculation ──────────────────────────────────────────
// Interactive decides whether a booking fee applies.
// Stripe executes the resulting fee via application_fee_amount.
//
// Plan rules (from SubscriptionPlan tier):
//   professional → Pro fee waiver (booking_fee = 0)
//   growth       → standard fee
//   essential    → standard fee
//
// Free events (£0 base) can still have a booking fee per spec.
//
// All amounts are in the smallest currency unit (pence for GBP).
//
// NOTE: The exact fee percentages/waivers should be confirmed
// against the authoritative Plans spec. The values below are
// reasonable defaults — adjust when the Plans spec is available.

export interface FeeCalculation {
  bookingFeePence: number;
  totalPence: number;
  applicationFeePence: number;
  providerProceedsPence: number;
  feeRuleBasis: string;
}

export function calculateBookingFee(
  basePricePence: number,
  planTier: string | null,
  hasProWaiver: boolean,
): FeeCalculation {
  let bookingFeePence: number;
  let feeRuleBasis: string;

  if (hasProWaiver || planTier === 'professional') {
    bookingFeePence = 0;
    feeRuleBasis = 'pro_waiver';
  } else if (basePricePence === 0) {
    // Free event — flat booking fee per spec
    bookingFeePence = 100; // £1.00
    feeRuleBasis = 'free_event_flat_fee';
  } else {
    // Standard: 5% of base price, minimum 50p
    bookingFeePence = Math.max(Math.round(basePricePence * 0.05), 50);
    feeRuleBasis = planTier ? `standard_${planTier}` : 'standard';
  }

  const totalPence = basePricePence + bookingFeePence;
  // Application fee = the Interactive booking fee (collected from provider)
  const applicationFeePence = bookingFeePence;
  const providerProceedsPence = totalPence - applicationFeePence;

  return {
    bookingFeePence,
    totalPence,
    applicationFeePence,
    providerProceedsPence,
    feeRuleBasis,
  };
}

// ── Connected account resolution ─────────────────────────────
// Looks up the provider's Stripe Connect account reference.
// For business providers, looks up by business_id.
// For individual professionals, looks up by identity_id.

export interface ConnectedAccountRef {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export async function resolveConnectedAccount(
  db: FirebaseFirestore.Firestore,
  providerIdentityId: string,
  businessId: string | null,
): Promise<ConnectedAccountRef | null> {
  let query: FirebaseFirestore.Query;
  if (businessId) {
    query = db.collection('stripeConnectAccounts')
      .where('business_id', '==', businessId)
      .limit(1);
  } else {
    query = db.collection('stripeConnectAccounts')
      .where('identity_id', '==', providerIdentityId)
      .where('business_id', '==', null)
      .limit(1);
  }
  const snap = await query.get();
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return {
    accountId: data.stripe_account_id,
    chargesEnabled: data.charges_enabled === true,
    payoutsEnabled: data.payouts_enabled === true,
    detailsSubmitted: data.details_submitted === true,
  };
}

// ── Payment readiness ────────────────────────────────────────
// A provider is payment-ready when they have a connected account
// with charges_enabled and details_submitted.
export async function isPaymentReady(
  db: FirebaseFirestore.Firestore,
  providerIdentityId: string,
  businessId: string | null,
): Promise<boolean> {
  const account = await resolveConnectedAccount(db, providerIdentityId, businessId);
  if (!account) return false;
  return account.chargesEnabled && account.detailsSubmitted;
}

// ── Price validation ─────────────────────────────────────────
// Validates that a client-supplied price matches the server-side
// source of truth. The client must never provide an authoritative
// total — this function validates any client-supplied amount
// against the stored booking snapshot.
export function validatePriceMatch(
  serverTotalPence: number,
  clientTotalPence: number | undefined,
): boolean {
  if (clientTotalPence === undefined) return true; // No client total to validate
  return serverTotalPence === clientTotalPence;
}