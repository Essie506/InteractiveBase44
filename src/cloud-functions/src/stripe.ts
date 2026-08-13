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
// All amounts are in the smallest currency unit (pence for GBP).

// ── Fee rule configuration (data-driven, not hardcoded) ─────
// Numerical fee values (percentages, flat fees, minimums) are NOT
// hardcoded. They are loaded from the provider's subscription plan
// configuration data (subscriptionPlans.fee_rule).
//
// If no fee rule is configured for a plan, the booking fee is 0.
// If exact numerical fee values cannot be found in the authoritative
// Plans spec, they remain unresolved configuration — production/live
// payment activation must be prevented until authoritative values
// are supplied.
//
// Plans define fee entitlement. Payments applies those rules.
// Stripe executes the resulting money movement.

export interface FeeRule {
  type: 'percentage' | 'flat' | 'none';
  value: number; // percentage (e.g. 5 = 5%) or flat amount in pence
  minimum_pence?: number;
  applies_to_free_events: boolean;
}

export type FeeConfigStatus = 'waiver' | 'explicit_none' | 'configured' | 'unresolved';

export interface FeeCalculation {
  bookingFeePence: number;
  totalPence: number;
  applicationFeePence: number;
  providerProceedsPence: number;
  feeRuleBasis: string;
  feeRuleSource: string; // 'plan_config' | 'default_none'
  feeConfigStatus: FeeConfigStatus;
}

// Resolve the fee rule from the provider's subscription plan data.
// Returns the fee rule, plan tier, fee waiver flag, and configuration status.
//
// Fee configuration status distinguishes:
//   'waiver'         — plan has fee_waiver: true (deliberate zero fee)
//   'explicit_none'  — plan has fee_rule.type: 'none' (deliberate zero fee)
//   'configured'     — plan has a percentage or flat fee_rule (authoritative)
//   'unresolved'     — no fee_rule and no fee_waiver (missing configuration)
//
// 'unresolved' must NOT silently become a zero-fee production Stripe booking.
// The caller (createBookingDraft) checks feeConfigStatus and rejects
// unresolved configurations for paid Stripe routes.
export async function resolveFeeRule(
  db: FirebaseFirestore.Firestore,
  providerIdentityId: string,
  businessId: string | null,
): Promise<{ feeRule: FeeRule | null; planTier: string | null; hasProWaiver: boolean; feeConfigStatus: FeeConfigStatus }> {
  const subscriptionSnap = await db.collection('businessSubscriptions')
    .where('business_id', '==', businessId || providerIdentityId)
    .where('status', 'in', ['selected', 'active'])
    .limit(1)
    .get();

  if (subscriptionSnap.empty) {
    return { feeRule: null, planTier: null, hasProWaiver: false, feeConfigStatus: 'unresolved' };
  }

  const subData = subscriptionSnap.docs[0].data();
  const planId = subData.plan_id;
  const planDoc = await db.collection('subscriptionPlans').doc(planId).get();

  if (!planDoc.exists) {
    return { feeRule: null, planTier: null, hasProWaiver: false, feeConfigStatus: 'unresolved' };
  }

  const planData = planDoc.data()!;
  const planTier = planData.tier || null;

  // Fee waiver is a plan configuration field, not a hardcoded assumption.
  const hasProWaiver = planData.fee_waiver === true;

  // Fee rule is loaded from plan data — not hardcoded
  const feeRule: FeeRule | null = planData.fee_rule || null;

  // Determine configuration status
  let feeConfigStatus: FeeConfigStatus;
  if (hasProWaiver) {
    feeConfigStatus = 'waiver';
  } else if (feeRule) {
    feeConfigStatus = feeRule.type === 'none' ? 'explicit_none' : 'configured';
  } else {
    feeConfigStatus = 'unresolved';
  }

  return { feeRule, planTier, hasProWaiver, feeConfigStatus };
}

// Calculate the booking fee from a data-driven FeeRule.
// The feeConfigStatus distinguishes deliberate zero fees from
// missing configuration. Callers must check feeConfigStatus before
// using the result for production Stripe bookings.
export function calculateBookingFee(
  basePricePence: number,
  feeRule: FeeRule | null,
  feeConfigStatus: FeeConfigStatus,
): FeeCalculation {
  // Deliberate zero fee — waiver or explicit none
  if (feeConfigStatus === 'waiver' || feeConfigStatus === 'explicit_none') {
    const totalPence = basePricePence;
    return {
      bookingFeePence: 0,
      totalPence,
      applicationFeePence: 0,
      providerProceedsPence: totalPence,
      feeRuleBasis: feeConfigStatus === 'waiver' ? 'fee_waiver' : 'explicit_none',
      feeRuleSource: 'plan_config',
      feeConfigStatus,
    };
  }

  // Unresolved — no fee rule configured. Returns 0 fee, but the caller
  // MUST check feeConfigStatus and reject for paid Stripe bookings.
  // Free/no-fee routes can use this result safely.
  if (feeConfigStatus === 'unresolved') {
    const totalPence = basePricePence;
    return {
      bookingFeePence: 0,
      totalPence,
      applicationFeePence: 0,
      providerProceedsPence: totalPence,
      feeRuleBasis: 'unresolved',
      feeRuleSource: 'default_none',
      feeConfigStatus,
    };
  }

  // Configured — use the fee rule
  // Free event — check if fee applies to free events
  if (basePricePence === 0 && !feeRule!.applies_to_free_events) {
    return {
      bookingFeePence: 0,
      totalPence: 0,
      applicationFeePence: 0,
      providerProceedsPence: 0,
      feeRuleBasis: 'free_event_no_fee',
      feeRuleSource: 'plan_config',
      feeConfigStatus,
    };
  }

  let bookingFeePence: number;
  if (feeRule!.type === 'percentage') {
    bookingFeePence = Math.round(basePricePence * (feeRule!.value / 100));
    if (feeRule!.minimum_pence) {
      bookingFeePence = Math.max(bookingFeePence, feeRule!.minimum_pence);
    }
  } else {
    // flat
    bookingFeePence = feeRule!.value;
  }

  const totalPence = basePricePence + bookingFeePence;
  return {
    bookingFeePence,
    totalPence,
    applicationFeePence: bookingFeePence,
    providerProceedsPence: totalPence - bookingFeePence,
    feeRuleBasis: `plan_${feeRule!.type}`,
    feeRuleSource: 'plan_config',
    feeConfigStatus,
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