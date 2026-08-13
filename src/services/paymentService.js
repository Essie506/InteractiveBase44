/**
 * Payment Service — Phase 5
 * ───────────────────────────────────────────────────────────
 * Payment Service → Payment Provider Adapter → Firebase trusted backend → Stripe
 *
 * This is the client-side payment orchestration layer. It:
 *   1. Calls the trusted Cloud Function to create a PaymentIntent
 *   2. Loads Stripe.js with the publishable key
 *   3. Confirms the payment via Stripe.js
 *   4. Returns the result — but the client result is NOT authoritative
 *   5. The Stripe webhook (verified signature) is the source of truth
 *
 * The browser must NEVER be authoritative for payment success.
 * A booking is confirmed only when the webhook handler processes
 * the payment_intent.succeeded event.
 *
 * Stripe secrets never reach the client. Only the publishable key
 * is used (fetched via getStripeConfig Cloud Function).
 */

import { loadStripe } from '@stripe/stripe-js';
import {
  callCreatePaymentIntent,
  callGetStripeConfig,
  callGetConnectAccountStatus,
  callCreateConnectAccount,
} from '@/services/firebaseFunctions';

// ── Stripe.js instance (lazy-loaded) ─────────────────────────
let stripePromise = null;

async function getStripeInstance() {
  if (!stripePromise) {
    const config = await callGetStripeConfig({});
    stripePromise = loadStripe(config.publishable_key);
  }
  return stripePromise;
}

// ── Payment Provider Adapter ─────────────────────────────────
// Abstracts the Stripe-specific payment confirmation logic.
// If a different provider is added in the future, only this
// adapter needs to change — the booking service stays the same.

const stripePaymentAdapter = {
  /**
   * Confirms a card payment via Stripe.js.
   * Returns the Stripe.js result — NOT authoritative for booking confirmation.
   * The webhook is the source of truth.
   *
   * @param {string} clientSecret - PaymentIntent client secret
   * @param {object} paymentMethod - { card: element, billing_details? }
   * @returns {Promise<object>} Stripe.js confirmation result
   */
  async confirmCardPayment(clientSecret, paymentMethod) {
    const stripe = await getStripeInstance();
    return stripe.confirmCardPayment(clientSecret, paymentMethod);
  },

  /**
   * Confirms a payment using the Payment Element (Stripe.js v2).
   */
  async confirmPayment(clientSecret, options) {
    const stripe = await getStripeInstance();
    return stripe.confirmPayment({
      clientSecret,
      ...options,
    });
  },
};

// ── Payment Service ──────────────────────────────────────────
// Orchestrates the payment flow:
//   1. Create PaymentIntent (trusted Cloud Function)
//   2. Confirm payment (Stripe.js via adapter)
//   3. Return result (client-side — NOT authoritative)
//
// The booking is NOT confirmed here. It is confirmed by the webhook.

export async function processBookingPayment(bookingId, paymentMethodData) {
  // Step 1: Create PaymentIntent via trusted Cloud Function
  // The server validates the booking, calculates the fee, and creates
  // the PaymentIntent on the provider's connected account.
  const { client_secret, payment_intent_id } = await callCreatePaymentIntent({
    booking_id: bookingId,
  });

  // Step 2: Confirm payment via Stripe.js
  // This collects card data and submits to Stripe.
  // The result is NOT authoritative — the webhook confirms the booking.
  const result = await stripePaymentAdapter.confirmCardPayment(
    client_secret,
    paymentMethodData,
  );

  // Step 3: Return the result
  // If paymentRequiresAction, the UI should handle 3D Secure.
  // If succeeded, the webhook will confirm the booking shortly.
  // If error, the booking remains unconfirmed.
  return {
    payment_intent_id,
    status: result.error ? 'failed' : (result.paymentIntent?.status || 'processing'),
    error: result.error?.message || null,
    requires_action: result.paymentIntent?.status === 'requires_action',
    client_secret,
  };
}

// ── Stripe Connect Onboarding ────────────────────────────────

export async function startConnectOnboarding(businessId, origin) {
  return callCreateConnectAccount({ business_id: businessId, origin });
}

export async function getConnectStatus(businessId) {
  return callGetConnectAccountStatus({ business_id: businessId });
}

export async function getProviderConnectStatus() {
  return callGetConnectAccountStatus({});
}