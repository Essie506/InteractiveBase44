"use strict";
// Event booking capacity + pricing contract — shared single source of truth.
// ───────────────────────────────────────────────────────────
// Imported by bookingPayment, bookingLifecycle, calendarEvent, and
// stripeWebhook so the capacity-consuming state set, attendee-quantity
// rules, and event-price resolution are defined exactly once.
//
// CAPACITY CONTRACT — the 22 Booking lifecycle states:
//
//   CONSUMING (place held → counts toward reserved capacity):
//     requested, pending_provider_response, accepted,
//     awaiting_customer_confirmation, awaiting_payment, payment_pending,
//     confirmed, scheduled, in_progress, completed,
//     reschedule_requested, rescheduled, disputed
//
//   RELEASING (place freed → does NOT count):
//     draft, cancelled_by_customer, cancelled_by_provider,
//     cancelled_by_platform, declined, expired,
//     no_show_customer, no_show_provider, archived
//
// Rationale:
//   - draft holds no event place. Event capacity is reserved atomically
//     at draft creation inside the booking transaction (the transaction
//     is the concurrency guard), but draft itself is NOT in the
//     consuming set so a cancelled/expired draft frees the place
//     immediately on release.
//   - in_progress / completed consume: the attendee took a place. Past
//     events are delisted from the Directory, so this only matters for
//     recomputation consistency (a completed booking must not re-free
//     a place it actually used).
//   - disputed consumes: the charge is contested but the place was
//     held/used; release happens only on an explicit resolution state
//     (not modelled here), so the place stays held while disputed.
//   - no_show_customer / no_show_provider release: the attendee is
//     marked absent.
//   - declined / expired release: the request was refused or timed out.
//   - cancelled_by_customer / cancelled_by_provider /
//     cancelled_by_platform release: the place is freed for others.
//   - archived release: archived bookings no longer hold live capacity.
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAPACITY_RELEASING_STATES = exports.CAPACITY_CONSUMING_STATES = void 0;
exports.isCapacityConsuming = isCapacityConsuming;
exports.normaliseAttendeeQuantity = normaliseAttendeeQuantity;
exports.sumAttendeeQuantity = sumAttendeeQuantity;
exports.resolveEventPrice = resolveEventPrice;
// Booking lifecycle states that consume event capacity.
exports.CAPACITY_CONSUMING_STATES = [
    'requested',
    'pending_provider_response',
    'accepted',
    'awaiting_customer_confirmation',
    'awaiting_payment',
    'payment_pending',
    'confirmed',
    'scheduled',
    'in_progress',
    'completed',
    'reschedule_requested',
    'rescheduled',
    'disputed',
];
// Booking lifecycle states that release event capacity (the complement,
// enumerated for explicitness and tests).
exports.CAPACITY_RELEASING_STATES = [
    'draft',
    'cancelled_by_customer',
    'cancelled_by_provider',
    'cancelled_by_platform',
    'declined',
    'expired',
    'no_show_customer',
    'no_show_provider',
    'archived',
];
/** True when a booking in this status counts toward reserved capacity. */
function isCapacityConsuming(status) {
    return !!status && exports.CAPACITY_CONSUMING_STATES.includes(status);
}
/**
 * Normalise an attendee quantity: integer >= 1. Defaults to 1 when the
 * value is absent, non-finite, or below 1. Fractions are floored.
 */
function normaliseAttendeeQuantity(qty) {
    if (typeof qty === 'number' && Number.isFinite(qty) && qty >= 1) {
        return Math.floor(qty);
    }
    return 1;
}
/**
 * Sum attendee quantities across booking docs (for capacity maths).
 * Falls back to 1 per booking when attendee_quantity is absent/invalid,
 * preserving one-to-one semantics where the field is null.
 */
function sumAttendeeQuantity(bookingDocs) {
    let total = 0;
    for (const doc of bookingDocs) {
        const qty = doc.data().attendee_quantity;
        total += (typeof qty === 'number' && qty > 0) ? Math.floor(qty) : 1;
    }
    return total;
}
/**
 * Resolve the authoritative event price. NEVER treats null/missing as
 * free. Throws when a paid event lacks valid pricing, so a paid event
 * with no price is rejected rather than guessed as free.
 *
 * Resolution order:
 *   - is_free === true            → free (price 0), regardless of price_pence
 *   - is_free === false           → paid; price_pence must be a positive
 *                                  finite number, else throw
 *   - is_free absent              → infer from price_pence:
 *       price_pence === 0         → free
 *       price_pence > 0          → paid
 *       price_pence absent/invalid → throw (unknown, never free)
 */
function resolveEventPrice(eventData) {
    const currency = eventData?.currency || 'GBP';
    const pricePence = eventData?.price_pence;
    const isFree = eventData?.is_free;
    if (isFree === true) {
        return { price_pence: 0, currency, is_free: true };
    }
    if (isFree === false) {
        if (typeof pricePence !== 'number' || !Number.isFinite(pricePence) || pricePence <= 0) {
            throw new Error('Paid event lacks valid pricing (price_pence missing or non-positive)');
        }
        return { price_pence: Math.floor(pricePence), currency, is_free: false };
    }
    // is_free unknown — infer from price_pence
    if (typeof pricePence === 'number' && Number.isFinite(pricePence)) {
        if (pricePence === 0)
            return { price_pence: 0, currency, is_free: true };
        return { price_pence: Math.floor(pricePence), currency, is_free: false };
    }
    // Both unknown — reject. Never treat missing as free.
    throw new Error('Event pricing is unknown (price_pence and is_free both absent)');
}
//# sourceMappingURL=eventCapacity.js.map