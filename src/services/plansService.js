/**
 * Plans & Monetisation Service
 * ───────────────────────────────────────────────────────────
 * Client-side plan listing + subscription management.
 *
 * Plans are read from the SubscriptionPlan entity (display data).
 * Subscriptions live in Firestore (professionalSubscriptions /
 * businessSubscriptions collections) and are managed via trusted
 * Cloud Functions (Stripe Subscriptions — recurring billing).
 *
 * Architecture:
 *   Plans page → plansService → Cloud Function (trusted) → Stripe
 *
 * The browser is never authoritative for subscription state. The
 * Stripe webhook (verified signature) is the source of truth for
 * subscription activation/cancellation.
 */

import { base44 } from '@/api/base44Client';
import {
  callCreateSubscriptionCheckout,
  callGetMySubscription,
  callCreateCustomerPortal,
} from '@/services/firebaseFunctions';

// ── Plan listing (display data) ──────────────────────────────
export async function listPlans(family = null) {
  const plans = await base44.entities.SubscriptionPlan.list('-sort_order', 50);
  const active = plans.filter(p => p.status === 'active');
  if (!family) return active;
  return active.filter(p => p.family === family);
}

// ── Current subscription ─────────────────────────────────────
// Reads the caller's active subscription from Firestore via the
// trusted getMySubscription Cloud Function. Returns null if no
// active subscription (defaults to Tier 1 free).
export async function getMySubscription(businessId = null) {
  return callGetMySubscription({ business_id: businessId || null });
}

// ── Subscribe / upgrade ──────────────────────────────────────
// Creates a Stripe Checkout session for the selected plan's
// recurring subscription. Returns a URL to redirect to.
export async function startSubscriptionCheckout(planId, businessId = null, origin = null) {
  const result = await callCreateSubscriptionCheckout({
    plan_id: planId,
    business_id: businessId || null,
    origin,
  });
  return result.url;
}

// ── Manage billing (Stripe Customer Portal) ───────────────────
// Creates a Stripe Customer Portal session for the caller to
// manage their payment method, view invoices, and cancel.
export async function openCustomerPortal(businessId = null, origin = null) {
  const result = await callCreateCustomerPortal({
    business_id: businessId || null,
    origin,
  });
  return result.url;
}

// ── Helpers ──────────────────────────────────────────────────
export function formatPlanPrice(pricePence, currency = 'GBP') {
  if (!pricePence || pricePence === 0) return 'Free';
  const symbol = currency === 'GBP' ? '£' : '';
  return `${symbol}${(pricePence / 100).toFixed(2)}`;
}

export function isFreePlan(plan) {
  return !plan?.price_pence || plan.price_pence === 0;
}

export function isHigherTier(currentTier, candidateTier) {
  const order = { basic: 1, plus: 2, pro: 3 };
  return (order[candidateTier] || 0) > (order[currentTier] || 0);
}