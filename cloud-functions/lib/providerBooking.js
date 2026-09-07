"use strict";
// Provider-initiated Booking creation — trusted Firebase Cloud Function
// ───────────────────────────────────────────────────────────
// Allows a Professional or Business to create a Booking directly for a
// specified customer or guest, rather than only accepting customer-initiated
// bookings. Reuses the existing Booking model, price snapshot, slot hold,
// availability checking, and notification architecture.
//
// The booking is created in 'draft' state with the specified customer. The
// customer receives a booking invitation notification. The customer can:
//   - Accept (free) → confirmFreeBooking (existing function)
//   - Accept (paid) → createPaymentIntent (existing function)
//   - Decline → cancelBooking (existing function)
//
// No new booking states or parallel systems — this converges on the same
// authoritative Booking records as customer-initiated bookings.
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProviderBooking = void 0;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const stripe_1 = require("./stripe");
const calendarAvailability_1 = require("./calendarAvailability");
const bookingCalendarEvent_1 = require("./bookingCalendarEvent");
const dispatcher_1 = require("./notifications/dispatcher");
const bookingNotifications_1 = require("./bookingNotifications");
const booking_1 = require("./notifications/email/payloads/booking");
const HOLD_DURATION_MINUTES = 15;
const PAYMENT_ROUTES_REQUIRING_STRIPE = ['pay_through_interactive', 'full_payment', 'deposit'];
const PAYMENT_ROUTES_NO_STRIPE = ['pay_later', 'arrange_directly', 'free', 'external_payment'];
function requiresStripePayment(route) {
    return PAYMENT_ROUTES_REQUIRING_STRIPE.includes(route);
}
// ── createProviderBooking ────────────────────────────────────
// Provider creates a booking for a specified customer or guest.
//
// Request: {
//   customer_identity_id?: string,  // existing Interactive identity
//   guest?: { email, display_name?, phone? },  // guest checkout
//   service_id, booking_type?,
//   start_time, end_time, timezone?,
//   location_context?, meeting_url?,
//   base_price_pence, currency?,
//   payment_route, deposit_amount_pence?,
//   cancellation_policy?,
//   notes?,  // provider notes visible to customer
//   business_id?,
// }
// Returns: { booking_id, hold_id, total_pence, booking_fee_pence, payment_requirement }
exports.createProviderBooking = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins, secrets: ['STRIPE_SECRET_KEY'] }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    if (!callerIdentityId) {
        throw new https_1.HttpsError('permission-denied', 'Identity not found');
    }
    const data = request.data || {};
    const { customer_identity_id, guest, service_id, booking_type, start_time, end_time, timezone, location_context, meeting_url, base_price_pence, currency, payment_route, deposit_amount_pence, cancellation_policy, notes, business_id, } = data;
    // ── Validate required fields ──
    if (!service_id || !start_time || !end_time) {
        throw new https_1.HttpsError('invalid-argument', 'service_id, start_time, end_time are required');
    }
    if (!payment_route) {
        throw new https_1.HttpsError('invalid-argument', 'payment_route is required');
    }
    // Must specify either a customer identity or guest email
    if (!customer_identity_id && (!guest || !guest.email)) {
        throw new https_1.HttpsError('invalid-argument', 'Either customer_identity_id or guest.email is required');
    }
    // ── Authorization: caller must be the provider or a business admin ──
    const providerIdentityId = callerIdentityId;
    let isBizAdmin = false;
    if (business_id) {
        isBizAdmin = await (0, shared_1.hasBusinessRole)(business_id, callerIdentityId, ['owner', 'admin']);
        // For business bookings, the provider is the business; the caller must be an admin
        if (!isBizAdmin) {
            throw new https_1.HttpsError('permission-denied', 'Not authorized to create bookings for this business');
        }
    }
    // ── Payment route validation ──
    const allRoutes = [...PAYMENT_ROUTES_REQUIRING_STRIPE, ...PAYMENT_ROUTES_NO_STRIPE];
    if (!allRoutes.includes(payment_route)) {
        throw new https_1.HttpsError('invalid-argument', `Invalid payment_route: ${payment_route}`);
    }
    // ── Stripe payment readiness check ──
    const needsStripe = requiresStripePayment(payment_route);
    if (needsStripe) {
        const ready = await (0, stripe_1.isPaymentReady)(shared_1.db, providerIdentityId, business_id || null);
        if (!ready) {
            throw new https_1.HttpsError('failed-precondition', 'Provider is not payment-ready. Complete Stripe Connect onboarding first.');
        }
    }
    // ── Fee rule resolution ──
    const { feeRule, feeConfigStatus } = await (0, stripe_1.resolveFeeRule)(shared_1.db, providerIdentityId, business_id || null);
    const basePrice = base_price_pence || 0;
    const resolvedCurrency = currency || 'GBP';
    // ── Fee configuration safety ──
    if (needsStripe && basePrice > 0 && feeConfigStatus === 'unresolved') {
        throw new https_1.HttpsError('failed-precondition', 'Provider plan fee configuration is unresolved. ' +
            'Configure subscriptionPlans.fee_rule or set fee_waiver before accepting paid bookings.');
    }
    const feeCalc = (0, stripe_1.calculateBookingFee)(basePrice, feeRule, feeConfigStatus);
    const stripeChargeAmount = payment_route === 'deposit'
        ? (deposit_amount_pence || 0)
        : feeCalc.totalPence;
    let payment_requirement;
    if (!needsStripe || feeCalc.totalPence === 0) {
        payment_requirement = 'not_required';
    }
    else {
        payment_requirement = 'required';
    }
    // ── Availability check ──
    const calendarOwner = business_id || providerIdentityId;
    const calendarOwnerType = business_id ? 'business' : 'identity';
    const availabilityContext = business_id ? 'business' : 'professional';
    const availability = await (0, calendarAvailability_1.evaluateAvailabilityRule)(calendarOwner, calendarOwnerType, availabilityContext, start_time, end_time);
    if (!availability.eligible) {
        throw new https_1.HttpsError('failed-precondition', `Slot is not available: ${availability.reason || 'outside availability'}`);
    }
    // ── Slot hold + conflict detection ──
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_DURATION_MINUTES * 60 * 1000);
    const holdResult = await shared_1.db.runTransaction(async (tx) => {
        if (await (0, calendarAvailability_1.hasOverlappingHold)(tx, providerIdentityId, start_time, end_time)) {
            throw new https_1.HttpsError('failed-precondition', 'This slot overlaps an active hold');
        }
        if (await (0, calendarAvailability_1.hasOverlappingBooking)(tx, providerIdentityId, start_time, end_time)) {
            throw new https_1.HttpsError('failed-precondition', 'This slot overlaps an existing booking');
        }
        if (await (0, calendarAvailability_1.hasOverlappingEvent)(tx, calendarOwner, start_time, end_time)) {
            throw new https_1.HttpsError('failed-precondition', 'This slot conflicts with an existing calendar event');
        }
        const holdRef = shared_1.db.collection('slotHolds').doc();
        tx.set(holdRef, {
            provider_identity_id: providerIdentityId,
            business_id: business_id || null,
            service_id,
            start_time,
            end_time,
            status: 'active',
            expires_at: expiresAt.toISOString(),
            created_by_identity_id: callerIdentityId,
            _created_date: now.toISOString(),
        });
        return holdRef.id;
    });
    // Create hold calendar event (§118)
    await (0, bookingCalendarEvent_1.createHoldCalendarEvent)(holdResult, {
        provider_identity_id: providerIdentityId,
        business_id: business_id || null,
        start_time,
        end_time,
        timezone: timezone || 'UTC',
        created_by_identity_id: callerIdentityId,
    }, now.toISOString()).catch(() => { });
    // ── Create booking ──
    const bookingRef = shared_1.db.collection('bookings').doc();
    const bookingData = {
        customer_identity_id: customer_identity_id || null,
        guest_email: guest?.email || null,
        guest_phone: guest?.phone || null,
        guest_display_name: guest?.display_name || null,
        provider_identity_id: providerIdentityId,
        business_id: business_id || null,
        service_id,
        booking_type: booking_type || 'service',
        start_time,
        end_time,
        timezone: timezone || 'UTC',
        location_context: location_context || 'physical',
        meeting_url: meeting_url || null,
        event_id: null,
        attendee_quantity: null,
        price_snapshot: {
            base_price_pence: basePrice,
            currency: resolvedCurrency,
        },
        booking_fee_snapshot: {
            amount_pence: feeCalc.bookingFeePence,
            currency: resolvedCurrency,
            fee_rule_basis: feeCalc.feeRuleBasis,
        },
        total_snapshot: {
            amount_pence: feeCalc.totalPence,
            currency: resolvedCurrency,
        },
        deposit_amount_pence: payment_route === 'deposit' ? (deposit_amount_pence || 0) : null,
        stripe_charge_amount_pence: stripeChargeAmount,
        cancellation_policy_snapshot: cancellation_policy || { deadline_hours: 24, refund_percentage: 100 },
        refund_policy_snapshot: cancellation_policy || { deadline_hours: 24, refund_percentage: 100 },
        booking_status: 'draft',
        provider_initiated: true,
        provider_notes: notes || null,
        payment_route,
        payment_requirement,
        payment_status_mirror: 'none',
        payment_record_id: null,
        stripe_payment_intent_id: null,
        stripe_connected_account_id: null,
        calendar_event_id: null,
        reschedule_history: [],
        no_show_state: { reported: false, reported_by: null, reported_at: null, reason: null, no_show_type: null },
        hold_id: holdResult,
        _created_date: now.toISOString(),
        _updated_date: now.toISOString(),
        confirmed_at: null,
        cancelled_at: null,
        completed_at: null,
    };
    await bookingRef.set(bookingData);
    // ── Send booking invitation notification to customer ──
    const booking = { ...bookingData, id: bookingRef.id };
    const emailCtx = await (0, bookingNotifications_1.buildBookingEmailContext)(bookingRef.id, booking, 'booking_invitation');
    if (customer_identity_id) {
        // Notify the existing Interactive identity
        await (0, dispatcher_1.emitNotification)({
            source_system: 'calendar',
            event_type: 'booking_invitation',
            source_id: `booking:${bookingRef.id}`,
            version: '1',
            category: 'calendar',
            title: 'Booking Invitation',
            body: `You have been invited to a booking on ${new Date(start_time).toLocaleString()}.`,
            action_url: `/bookings/${bookingRef.id}`,
            action_label: 'View & Respond',
            priority: 'normal',
            recipient_id: customer_identity_id,
            recipient_email: null,
            emailContext: emailCtx,
            emailPayloadBuilder: booking_1.buildBookingEmailPayload,
        });
    }
    else if (guest?.email) {
        // Notify the guest via email
        await (0, dispatcher_1.emitNotification)({
            source_system: 'calendar',
            event_type: 'booking_invitation',
            source_id: `booking:${bookingRef.id}`,
            version: '1',
            category: 'calendar',
            title: 'Booking Invitation',
            body: `You have been invited to a booking on ${new Date(start_time).toLocaleString()}.`,
            action_url: `/booking/manage?email=${encodeURIComponent(guest.email)}&booking=${bookingRef.id}`,
            action_label: 'View & Respond',
            priority: 'normal',
            recipient_id: null,
            recipient_email: guest.email,
            emailContext: emailCtx,
            emailPayloadBuilder: booking_1.buildBookingEmailPayload,
        });
    }
    return {
        booking_id: bookingRef.id,
        hold_id: holdResult,
        total_pence: feeCalc.totalPence,
        booking_fee_pence: feeCalc.bookingFeePence,
        stripe_charge_amount_pence: stripeChargeAmount,
        payment_requirement,
        currency: resolvedCurrency,
    };
});
//# sourceMappingURL=providerBooking.js.map