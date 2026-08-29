"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STRIPE_PUBLISHABLE_KEY = void 0;
exports.getStripe = getStripe;
exports.resolveFeeRule = resolveFeeRule;
exports.calculateBookingFee = calculateBookingFee;
exports.resolveConnectedAccount = resolveConnectedAccount;
exports.isPaymentReady = isPaymentReady;
exports.validatePriceMatch = validatePriceMatch;
const stripe_1 = __importDefault(require("stripe"));
const https_1 = require("firebase-functions/v2/https");
// ── Stripe client ────────────────────────────────────────────
// Lazy initialization — only created when first accessed.
// Secrets are injected via the `secrets` option on each function.
let stripeClient = null;
function getStripe() {
    if (!stripeClient) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) {
            throw new https_1.HttpsError('failed-precondition', 'STRIPE_SECRET_KEY not configured');
        }
        stripeClient = new stripe_1.default(key, {
            apiVersion: '2024-06-20',
        });
    }
    return stripeClient;
}
exports.STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';
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
async function resolveFeeRule(db, providerIdentityId, businessId) {
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
    const planData = planDoc.data();
    const planTier = planData.tier || null;
    // Fee waiver is a plan configuration field, not a hardcoded assumption.
    const hasProWaiver = planData.fee_waiver === true;
    // Fee rule is loaded from plan data — not hardcoded
    const feeRule = planData.fee_rule || null;
    // Determine configuration status
    let feeConfigStatus;
    if (hasProWaiver) {
        feeConfigStatus = 'waiver';
    }
    else if (feeRule) {
        feeConfigStatus = feeRule.type === 'none' ? 'explicit_none' : 'configured';
    }
    else {
        feeConfigStatus = 'unresolved';
    }
    return { feeRule, planTier, hasProWaiver, feeConfigStatus };
}
// Calculate the booking fee from a data-driven FeeRule.
// The feeConfigStatus distinguishes deliberate zero fees from
// missing configuration. Callers must check feeConfigStatus before
// using the result for production Stripe bookings.
function calculateBookingFee(basePricePence, feeRule, feeConfigStatus) {
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
    if (basePricePence === 0 && !feeRule.applies_to_free_events) {
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
    let bookingFeePence;
    if (feeRule.type === 'percentage') {
        bookingFeePence = Math.round(basePricePence * (feeRule.value / 100));
        if (feeRule.minimum_pence) {
            bookingFeePence = Math.max(bookingFeePence, feeRule.minimum_pence);
        }
    }
    else {
        // flat
        bookingFeePence = feeRule.value;
    }
    const totalPence = basePricePence + bookingFeePence;
    return {
        bookingFeePence,
        totalPence,
        applicationFeePence: bookingFeePence,
        providerProceedsPence: totalPence - bookingFeePence,
        feeRuleBasis: `plan_${feeRule.type}`,
        feeRuleSource: 'plan_config',
        feeConfigStatus,
    };
}
async function resolveConnectedAccount(db, providerIdentityId, businessId) {
    let query;
    if (businessId) {
        query = db.collection('stripeConnectAccounts')
            .where('business_id', '==', businessId)
            .limit(1);
    }
    else {
        query = db.collection('stripeConnectAccounts')
            .where('identity_id', '==', providerIdentityId)
            .where('business_id', '==', null)
            .limit(1);
    }
    const snap = await query.get();
    if (snap.empty)
        return null;
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
async function isPaymentReady(db, providerIdentityId, businessId) {
    const account = await resolveConnectedAccount(db, providerIdentityId, businessId);
    if (!account)
        return false;
    return account.chargesEnabled && account.detailsSubmitted;
}
// ── Price validation ─────────────────────────────────────────
// Validates that a client-supplied price matches the server-side
// source of truth. The client must never provide an authoritative
// total — this function validates any client-supplied amount
// against the stored booking snapshot.
function validatePriceMatch(serverTotalPence, clientTotalPence) {
    if (clientTotalPence === undefined)
        return true; // No client total to validate
    return serverTotalPence === clientTotalPence;
}
//# sourceMappingURL=stripe.js.map