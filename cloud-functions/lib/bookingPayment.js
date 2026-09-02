"use strict";
// Booking payment orchestration — trusted Firebase Cloud Functions
// ───────────────────────────────────────────────────────────
// 1. createBookingDraft — validates availability, creates slot
//    hold, snapshots price/policy, creates booking in draft state.
// 2. createPaymentIntent — validates booking, calculates fee
//    server-side, creates Stripe PaymentIntent on connected account.
// 3. confirmFreeBooking — confirms £0 total bookings without payment.
//
// The browser is NEVER authoritative for payment success.
// Authoritative confirmation comes from the Stripe webhook handler.
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmFreeBooking = exports.createPaymentIntent = exports.createBookingDraft = void 0;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const stripe_1 = require("./stripe");
const eventCapacity_1 = require("./eventCapacity");
const calendarEvent_1 = require("./calendarEvent");
// ── Slot hold duration ───────────────────────────────────────
const HOLD_DURATION_MINUTES = 15;
// ── Payment routes ───────────────────────────────────────────
// Preserves all provider payment routes from the Booking V2 spec:
//   pay_through_interactive — Stripe processes full payment
//   full_payment             — Stripe processes full payment
//   deposit                  — Stripe processes partial (deposit) payment
//   pay_later                — No Stripe payment; customer pays provider directly
//   arrange_directly         — No payment; customer contacts provider to arrange
//   free                     — No payment; £0 total
//   external_payment         — Provider uses external payment system
const PAYMENT_ROUTES_REQUIRING_STRIPE = ['pay_through_interactive', 'full_payment', 'deposit'];
const PAYMENT_ROUTES_NO_STRIPE = ['pay_later', 'arrange_directly', 'free', 'external_payment'];
function requiresStripePayment(route) {
    return PAYMENT_ROUTES_REQUIRING_STRIPE.includes(route);
}
// ── createBookingDraft ───────────────────────────────────────
// Creates a booking draft with price/policy snapshots and a
// slot hold to prevent double-booking during payment.
//
// Request: {
//   provider_identity_id, business_id?, service_id, booking_type,
//   start_time, end_time, timezone, location_context?, meeting_url?,
//   base_price_pence, currency,
//   payment_route, deposit_amount_pence?,
//   cancellation_policy: { deadline_hours, refund_percentage },
//   guest?: { email, phone?, display_name? }  // for guest checkout
// }
// Returns: { booking_id, hold_id, total_pence, booking_fee_pence, payment_requirement }
exports.createBookingDraft = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins, secrets: ['STRIPE_SECRET_KEY'] }, async (request) => {
    // Authenticate — signed-in users provide auth; guests use a
    // separate guest-specific flow (guestEmailVerified via custom token)
    let callerIdentityId = null;
    if (request.auth) {
        try {
            callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
        }
        catch {
            // No identity mapping — treat as guest if guest fields provided
        }
    }
    const data = request.data || {};
    const { provider_identity_id, business_id, service_id, booking_type, start_time, end_time, timezone, location_context, meeting_url, base_price_pence, currency, payment_route, deposit_amount_pence, cancellation_policy, guest, event_id, // NEW — links booking to a public Calendar Event
    attendee_quantity, // NEW — group attendance (default 1 for one-to-one)
     } = data;
    // ── Validate required fields ──
    if (!provider_identity_id || !service_id || !start_time || !end_time) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required booking fields');
    }
    // ── Event booking vs one-to-one ──
    // Event-specific logic activates ONLY when event_id is present.
    // Non-event bookings keep their existing behaviour unchanged.
    const qty = (0, eventCapacity_1.normaliseAttendeeQuantity)(attendee_quantity);
    const isEventBooking = !!event_id;
    // Resolved price/currency/isFree. For events the authoritative event
    // price is used (never null→free; unknown pricing is rejected). For
    // one-to-one bookings the client-supplied base price is used.
    let resolvedBasePrice = base_price_pence || 0;
    let eventCurrency = currency || 'GBP';
    let eventIsFree = false;
    let eventCapacity = null;
    if (isEventBooking) {
        const eventDoc = await shared_1.db.collection('calendarEvents').doc(event_id).get();
        if (!eventDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Event not found');
        }
        const eventData = eventDoc.data();
        if (eventData.visibility !== 'public') {
            throw new https_1.HttpsError('failed-precondition', 'Event is not publicly bookable');
        }
        if (eventData.lifecycle_state === 'cancelled' || eventData.lifecycle_state === 'completed') {
            throw new https_1.HttpsError('failed-precondition', 'Event is cancelled or completed');
        }
        // Authoritative event price — never treat null/missing as free.
        let eventPrice;
        try {
            eventPrice = (0, eventCapacity_1.resolveEventPrice)(eventData);
        }
        catch (e) {
            throw new https_1.HttpsError('failed-precondition', e.message);
        }
        resolvedBasePrice = eventPrice.price_pence;
        eventCurrency = eventPrice.currency;
        eventIsFree = eventPrice.is_free;
        eventCapacity = (typeof eventData.capacity === 'number' && eventData.capacity >= 1)
            ? eventData.capacity : null;
        if (eventCapacity == null) {
            throw new https_1.HttpsError('failed-precondition', 'Event has no capacity');
        }
    }
    if (!payment_route) {
        throw new https_1.HttpsError('invalid-argument', 'payment_route is required');
    }
    // ── Guest validation ──
    // Guests must provide email. No Interactive Identity is created.
    if (!callerIdentityId && (!guest || !guest.email)) {
        throw new https_1.HttpsError('invalid-argument', 'Guest email required for guest checkout');
    }
    // ── Payment route validation ──
    const allRoutes = [...PAYMENT_ROUTES_REQUIRING_STRIPE, ...PAYMENT_ROUTES_NO_STRIPE];
    if (!allRoutes.includes(payment_route)) {
        throw new https_1.HttpsError('invalid-argument', `Invalid payment_route: ${payment_route}`);
    }
    // ── Stripe payment readiness check ──
    // Paid bookings require a payment-ready Stripe Connect account
    const needsStripe = requiresStripePayment(payment_route);
    if (needsStripe) {
        const ready = await (0, stripe_1.isPaymentReady)(shared_1.db, provider_identity_id, business_id || null);
        if (!ready) {
            throw new https_1.HttpsError('failed-precondition', 'Provider is not payment-ready. Complete Stripe Connect onboarding first.');
        }
    }
    // ── Fee rule resolution (data-driven, not hardcoded) ──
    // Fee rules are loaded from the provider's subscription plan configuration.
    // Numerical fee values are NOT hardcoded — they come from plan data.
    const { feeRule, planTier, hasProWaiver, feeConfigStatus } = await (0, stripe_1.resolveFeeRule)(shared_1.db, provider_identity_id, business_id || null);
    // ── Price snapshot + fee calculation (server-side) ──
    // For event bookings, the event's advertised price is authoritative
    // when the client does not provide one. This snapshots the event price
    // using the existing Booking price-snapshot architecture.
    const basePrice = resolvedBasePrice;
    // ── Fee configuration safety ──
    // Do not allow a missing fee configuration to silently become an
    // unintended zero-fee production Stripe booking.
    //   'waiver' / 'explicit_none' → deliberate zero fee, OK
    //   'configured'               → authoritative fee rule, OK
    //   'unresolved'               → no authoritative configuration
    // Free/no-fee routes (base_price = 0, or non-Stripe routes) can
    // still operate without Stripe fee calculation.
    if (needsStripe && basePrice > 0 && feeConfigStatus === 'unresolved') {
        throw new https_1.HttpsError('failed-precondition', 'Provider plan fee configuration is unresolved. ' +
            'Cannot create a paid Stripe booking without authoritative fee rules. ' +
            'Configure subscriptionPlans.fee_rule or set fee_waiver before accepting paid bookings.');
    }
    const feeCalc = (0, stripe_1.calculateBookingFee)(basePrice, feeRule, feeConfigStatus);
    // Free events: no fee regardless of route
    if (event_id && eventIsFree) {
        feeCalc.totalPence = 0;
        feeCalc.bookingFeePence = 0;
    }
    // For deposit route, the Stripe charge is the deposit amount
    // The total is still base + fee, but only deposit is charged now
    const stripeChargeAmount = payment_route === 'deposit'
        ? (deposit_amount_pence || 0)
        : feeCalc.totalPence;
    // ── Payment requirement ──
    let payment_requirement;
    if (!needsStripe || feeCalc.totalPence === 0) {
        payment_requirement = 'not_required';
    }
    else if (payment_route === 'deposit') {
        payment_requirement = 'required'; // deposit payment
    }
    else {
        payment_requirement = 'required';
    }
    // Free booking: £0 base + £0 fee = no payment
    if (payment_route === 'free' && feeCalc.totalPence > 0) {
        // Free event with booking fee — still needs Stripe payment for the fee
        payment_requirement = 'required';
    }
    // ── Slot hold + booking creation ──
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_DURATION_MINUTES * 60 * 1000);
    // ── Event booking: atomic capacity reservation ──
    // The capacity check + booking creation run in ONE transaction, with
    // the event doc as the contention point (capacity_revision bump).
    // Firestore's optimistic-retry transactions serialise concurrent
    // bookings on the event doc, so two simultaneous bookings cannot
    // both take the last place. The booking is created in 'requested'
    // (capacity-consuming) so the place is held immediately.
    if (isEventBooking) {
        const eventRef = shared_1.db.collection('calendarEvents').doc(event_id);
        const txResult = await shared_1.db.runTransaction(async (tx) => {
            const ev = await tx.get(eventRef);
            if (!ev.exists) {
                throw new https_1.HttpsError('not-found', 'Event not found');
            }
            const evData = ev.data();
            if (evData.lifecycle_state === 'cancelled' || evData.lifecycle_state === 'completed') {
                throw new https_1.HttpsError('failed-precondition', 'Event is cancelled or completed');
            }
            const cap = (typeof evData.capacity === 'number' && evData.capacity >= 1) ? evData.capacity : null;
            if (cap == null) {
                throw new https_1.HttpsError('failed-precondition', 'Event has no capacity');
            }
            const reservedSnap = await tx.get(shared_1.db.collection('bookings')
                .where('event_id', '==', event_id)
                .where('booking_status', 'in', eventCapacity_1.CAPACITY_CONSUMING_STATES));
            const reserved = (0, eventCapacity_1.sumAttendeeQuantity)(reservedSnap.docs);
            if (reserved + qty > cap) {
                throw new https_1.HttpsError('failed-precondition', 'Event is full or has insufficient spaces');
            }
            // Contention bump — serialises concurrent transactions on this doc.
            tx.update(eventRef, {
                capacity_revision: (evData.capacity_revision || 0) + 1,
                _updated_date: now.toISOString(),
            });
            // Slot hold (kept for compatibility with the hold-based lifecycle).
            const holdRef = shared_1.db.collection('slotHolds').doc();
            tx.set(holdRef, {
                provider_identity_id,
                business_id: business_id || null,
                service_id,
                start_time,
                end_time,
                status: 'active',
                expires_at: expiresAt.toISOString(),
                created_by_identity_id: callerIdentityId,
                _created_date: now.toISOString(),
            });
            // Booking — 'requested' holds the place immediately (capacity-consuming).
            const bookingRef = shared_1.db.collection('bookings').doc();
            tx.set(bookingRef, {
                customer_identity_id: callerIdentityId,
                guest_email: guest?.email || null,
                guest_phone: guest?.phone || null,
                guest_display_name: guest?.display_name || null,
                provider_identity_id,
                business_id: business_id || null,
                service_id,
                booking_type: booking_type || 'service',
                start_time,
                end_time,
                timezone: timezone || 'UTC',
                location_context: location_context || 'physical',
                meeting_url: meeting_url || null,
                event_id,
                attendee_quantity: qty,
                price_snapshot: {
                    base_price_pence: basePrice,
                    currency: eventCurrency,
                },
                booking_fee_snapshot: {
                    amount_pence: feeCalc.bookingFeePence,
                    currency: eventCurrency,
                    fee_rule_basis: feeCalc.feeRuleBasis,
                },
                total_snapshot: {
                    amount_pence: feeCalc.totalPence,
                    currency: eventCurrency,
                },
                deposit_amount_pence: payment_route === 'deposit' ? (deposit_amount_pence || 0) : null,
                stripe_charge_amount_pence: stripeChargeAmount,
                cancellation_policy_snapshot: cancellation_policy || { deadline_hours: 24, refund_percentage: 100 },
                refund_policy_snapshot: cancellation_policy || { deadline_hours: 24, refund_percentage: 100 },
                booking_status: 'requested',
                payment_route,
                payment_requirement,
                payment_status_mirror: 'none',
                payment_record_id: null,
                stripe_payment_intent_id: null,
                stripe_connected_account_id: null,
                calendar_event_id: null,
                reschedule_history: [],
                no_show_state: { reported: false, reported_by: null, reported_at: null, reason: null, no_show_type: null },
                hold_id: holdRef.id,
                _created_date: now.toISOString(),
                _updated_date: now.toISOString(),
                confirmed_at: null,
                cancelled_at: null,
                completed_at: null,
            });
            return { bookingId: bookingRef.id, holdId: holdRef.id };
        });
        // Refresh the public projection so spaces_remaining reflects the new booking.
        await (0, calendarEvent_1.refreshEventProjection)(event_id);
        return {
            booking_id: txResult.bookingId,
            hold_id: txResult.holdId,
            total_pence: feeCalc.totalPence,
            booking_fee_pence: feeCalc.bookingFeePence,
            stripe_charge_amount_pence: stripeChargeAmount,
            payment_requirement,
            currency: eventCurrency,
        };
    }
    // ── One-to-one booking: existing flow (unchanged) ──
    const holdResult = await shared_1.db.runTransaction(async (tx) => {
        // Check for conflicting active holds
        const conflictingSnap = await tx.get(shared_1.db.collection('slotHolds')
            .where('provider_identity_id', '==', provider_identity_id)
            .where('start_time', '==', start_time)
            .where('status', '==', 'active')
            .limit(1));
        if (!conflictingSnap.empty) {
            throw new https_1.HttpsError('failed-precondition', 'This slot is already being booked');
        }
        // Also check for existing bookings in active states (Booking V2 lifecycle)
        const confirmedSnap = await tx.get(shared_1.db.collection('bookings')
            .where('provider_identity_id', '==', provider_identity_id)
            .where('start_time', '==', start_time)
            .where('booking_status', 'in', [
            'requested', 'accepted', 'awaiting_customer_confirmation',
            'awaiting_payment', 'payment_pending', 'confirmed', 'scheduled',
        ])
            .limit(1));
        if (!confirmedSnap.empty) {
            throw new https_1.HttpsError('failed-precondition', 'This slot is already booked');
        }
        // Check Calendar for existing events (Calendar is authoritative for availability)
        const calendarOwner = business_id || provider_identity_id;
        const calendarSnap = await tx.get(shared_1.db.collection('calendarEvents')
            .where('owner_id', '==', calendarOwner)
            .where('start_time', '==', start_time)
            .where('lifecycle_state', 'in', ['scheduled', 'confirmed', 'tentative'])
            .limit(1));
        if (!calendarSnap.empty) {
            throw new https_1.HttpsError('failed-precondition', 'This slot conflicts with an existing calendar event');
        }
        // Create the hold
        const holdRef = shared_1.db.collection('slotHolds').doc();
        tx.set(holdRef, {
            provider_identity_id,
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
    // ── Create booking draft ──
    const bookingRef = shared_1.db.collection('bookings').doc();
    const bookingData = {
        customer_identity_id: callerIdentityId,
        guest_email: guest?.email || null,
        guest_phone: guest?.phone || null,
        guest_display_name: guest?.display_name || null,
        provider_identity_id,
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
        // Price snapshots (immutable after creation)
        price_snapshot: {
            base_price_pence: basePrice,
            currency: eventCurrency,
        },
        booking_fee_snapshot: {
            amount_pence: feeCalc.bookingFeePence,
            currency: eventCurrency,
            fee_rule_basis: feeCalc.feeRuleBasis,
        },
        total_snapshot: {
            amount_pence: feeCalc.totalPence,
            currency: eventCurrency,
        },
        deposit_amount_pence: payment_route === 'deposit' ? (deposit_amount_pence || 0) : null,
        stripe_charge_amount_pence: stripeChargeAmount,
        cancellation_policy_snapshot: cancellation_policy || { deadline_hours: 24, refund_percentage: 100 },
        refund_policy_snapshot: cancellation_policy || { deadline_hours: 24, refund_percentage: 100 },
        // State
        booking_status: 'draft',
        payment_route,
        payment_requirement,
        payment_status_mirror: 'none',
        payment_record_id: null,
        stripe_payment_intent_id: null,
        stripe_connected_account_id: null,
        calendar_event_id: null,
        // Audit
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
    return {
        booking_id: bookingRef.id,
        hold_id: holdResult,
        total_pence: feeCalc.totalPence,
        booking_fee_pence: feeCalc.bookingFeePence,
        stripe_charge_amount_pence: stripeChargeAmount,
        payment_requirement,
        currency: eventCurrency,
    };
});
// ── createPaymentIntent ──────────────────────────────────────
// Creates a Stripe PaymentIntent for a booking that requires payment.
// The client must NOT provide an authoritative total — the function
// calculates everything server-side from the booking snapshot.
//
// Request: { booking_id: string }
// Returns: { client_secret: string, payment_intent_id: string }
exports.createPaymentIntent = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins, secrets: ['STRIPE_SECRET_KEY'] }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    // Resolve caller identity (signed-in) — guests use a separate path
    let callerIdentityId = null;
    try {
        callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    }
    catch {
        // Guest — will be validated against booking guest_email
    }
    const { booking_id } = request.data || {};
    if (!booking_id) {
        throw new https_1.HttpsError('invalid-argument', 'booking_id is required');
    }
    // Load booking
    const bookingDoc = await shared_1.db.collection('bookings').doc(booking_id).get();
    if (!bookingDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Booking not found');
    }
    const booking = bookingDoc.data();
    // Authorization: customer or guest must match
    if (callerIdentityId) {
        if (booking.customer_identity_id !== callerIdentityId) {
            throw new https_1.HttpsError('permission-denied', 'Not your booking');
        }
    }
    else {
        // Guest — verify via auth token email matching booking guest_email
        const authEmail = request.auth.token?.email;
        if (!authEmail || !booking.guest_email || authEmail.toLowerCase() !== booking.guest_email.toLowerCase()) {
            throw new https_1.HttpsError('permission-denied', 'Guest email does not match booking');
        }
    }
    // Validate booking state — must be in draft, awaiting_payment, or payment_pending (Booking V2)
    // Event bookings are created in 'requested' (capacity-consuming); allow
    // it here so event bookings can proceed to payment. One-to-one bookings
    // remain in 'draft'/'awaiting_payment'/'payment_pending'.
    if (booking.booking_status !== 'draft' && booking.booking_status !== 'awaiting_payment' && booking.booking_status !== 'payment_pending' && booking.booking_status !== 'requested') {
        throw new https_1.HttpsError('failed-precondition', `Booking is ${booking.booking_status}, cannot create payment`);
    }
    if (booking.payment_requirement !== 'required') {
        throw new https_1.HttpsError('failed-precondition', 'This booking does not require payment');
    }
    // Validate slot hold is still active
    const holdDoc = await shared_1.db.collection('slotHolds').doc(booking.hold_id).get();
    if (!holdDoc.exists || holdDoc.data().status !== 'active') {
        throw new https_1.HttpsError('failed-precondition', 'Slot hold expired. Please restart booking.');
    }
    const holdExpiry = new Date(holdDoc.data().expires_at);
    if (holdExpiry < new Date()) {
        throw new https_1.HttpsError('failed-precondition', 'Slot hold expired. Please restart booking.');
    }
    // Resolve provider's Stripe connected account
    const connectedAccount = await (0, stripe_1.resolveConnectedAccount)(shared_1.db, booking.provider_identity_id, booking.business_id);
    if (!connectedAccount || !connectedAccount.chargesEnabled) {
        throw new https_1.HttpsError('failed-precondition', 'Provider is not payment-ready');
    }
    // Server-side price validation — never trust client
    const chargeAmount = booking.stripe_charge_amount_pence || booking.total_snapshot.amount_pence;
    const applicationFee = booking.booking_fee_snapshot.amount_pence;
    const currency = booking.total_snapshot.currency.toLowerCase();
    // Create or retrieve PaymentRecord
    let paymentRecordId = booking.payment_record_id;
    const now = new Date().toISOString();
    if (!paymentRecordId) {
        const payRef = shared_1.db.collection('paymentRecords').doc();
        paymentRecordId = payRef.id;
        await payRef.set({
            booking_id,
            payer_identity_id: callerIdentityId,
            guest_email: booking.guest_email,
            provider_identity_id: booking.provider_identity_id,
            business_id: booking.business_id,
            stripe_payment_intent_id: null,
            stripe_connected_account_id: connectedAccount.accountId,
            stripe_customer_id: null,
            amount_snapshot: chargeAmount,
            currency: booking.total_snapshot.currency,
            application_fee_snapshot: applicationFee,
            provider_proceeds_snapshot: chargeAmount - applicationFee,
            payment_status: 'pending',
            refund_state: 'none',
            stripe_event_references: [],
            _created_date: now,
            _updated_date: now,
        });
        await bookingDoc.ref.update({
            payment_record_id: paymentRecordId,
            stripe_connected_account_id: connectedAccount.accountId,
        });
    }
    // Create Stripe PaymentIntent on the connected account
    const stripe = (0, stripe_1.getStripe)();
    const paymentIntent = await stripe.paymentIntents.create({
        amount: chargeAmount,
        currency,
        application_fee_amount: applicationFee,
        transfer_data: {
            destination: connectedAccount.accountId,
        },
        metadata: {
            booking_id,
            payment_record_id: paymentRecordId,
            provider_identity_id: booking.provider_identity_id,
        },
        automatic_payment_methods: { enabled: true },
    }, {
        stripeAccount: connectedAccount.accountId,
        idempotencyKey: `booking_${booking_id}_paymentintent`,
    });
    // Update PaymentRecord with PaymentIntent ID
    await shared_1.db.collection('paymentRecords').doc(paymentRecordId).update({
        stripe_payment_intent_id: paymentIntent.id,
        _updated_date: now,
    });
    // Transition booking to payment_pending
    await bookingDoc.ref.update({
        booking_status: 'payment_pending',
        stripe_payment_intent_id: paymentIntent.id,
        _updated_date: now,
    });
    return {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
    };
});
// ── confirmFreeBooking ───────────────────────────────────────
// Confirms a booking with no payment requirement (free, pay_later,
// arrange_directly, external_payment). No Stripe payment is needed.
//
// Request: { booking_id: string }
// Returns: { booking_id, status: 'confirmed' }
exports.confirmFreeBooking = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    let callerIdentityId = null;
    try {
        callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    }
    catch {
        // Guest
    }
    const { booking_id } = request.data || {};
    if (!booking_id) {
        throw new https_1.HttpsError('invalid-argument', 'booking_id is required');
    }
    const bookingDoc = await shared_1.db.collection('bookings').doc(booking_id).get();
    if (!bookingDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Booking not found');
    }
    const booking = bookingDoc.data();
    // Authorization
    if (callerIdentityId) {
        if (booking.customer_identity_id !== callerIdentityId) {
            throw new https_1.HttpsError('permission-denied', 'Not your booking');
        }
    }
    else {
        const authEmail = request.auth.token?.email;
        if (!authEmail || !booking.guest_email || authEmail.toLowerCase() !== booking.guest_email.toLowerCase()) {
            throw new https_1.HttpsError('permission-denied', 'Guest email does not match booking');
        }
    }
    // Validate booking state — must be in draft, accepted, or awaiting_customer_confirmation (Booking V2)
    // Event bookings are created in 'requested' (capacity-consuming); allow
    // it here so free event bookings can confirm. One-to-one bookings remain
    // in 'draft'/'accepted'/'awaiting_customer_confirmation'.
    if (booking.booking_status !== 'draft' && booking.booking_status !== 'accepted' && booking.booking_status !== 'awaiting_customer_confirmation' && booking.booking_status !== 'requested') {
        throw new https_1.HttpsError('failed-precondition', `Booking is ${booking.booking_status}`);
    }
    if (booking.payment_requirement === 'required') {
        throw new https_1.HttpsError('failed-precondition', 'This booking requires payment — use createPaymentIntent');
    }
    // Transition to confirmed (all agreement steps complete — Booking V2)
    const now = new Date().toISOString();
    await bookingDoc.ref.update({
        booking_status: 'confirmed',
        payment_status_mirror: 'not_required',
        confirmed_at: now,
        _updated_date: now,
    });
    // Confirm slot hold
    if (booking.hold_id) {
        await shared_1.db.collection('slotHolds').doc(booking.hold_id).update({
            status: 'confirmed',
            _updated_date: now,
        });
    }
    // ── Event booking: no private calendar event is created ──
    // The booking attaches to the public CalendarEvent via event_id; the
    // customer is an attendee. Stay in 'confirmed' (attending the event)
    // and refresh the public projection so spaces_remaining is correct.
    if (booking.event_id) {
        await (0, calendarEvent_1.refreshEventProjection)(booking.event_id);
        return { booking_id, status: 'confirmed' };
    }
    // Create calendar event — corrected ownership model.
    // Professional provider (no business): identity-owned, professional
    //   operating context. owner_id = provider identity.
    // Business booking: business-owned. owner_id = businessId. The
    //   provider identity is preserved as created_by_id AND assigned so
    //   the event appears on the provider's Calendar (view only — they
    //   cannot cancel it here; Booking owns the lifecycle).
    const isBusinessBooking = !!booking.business_id;
    const calendarRef = shared_1.db.collection('calendarEvents').doc();
    await calendarRef.set({
        owner_id: isBusinessBooking ? booking.business_id : booking.provider_identity_id,
        owner_type: isBusinessBooking ? 'business' : 'identity',
        operating_context: isBusinessBooking ? 'business' : 'professional',
        title: `Booking: ${booking.booking_type}`,
        description: `Booking ${booking_id}`,
        start_time: booking.start_time,
        end_time: booking.end_time,
        timezone: booking.timezone,
        all_day: false,
        location_type: booking.location_context,
        meeting_url: booking.meeting_url,
        visibility: 'private',
        lifecycle_state: 'confirmed',
        source_system: 'booking',
        source_id: booking_id,
        business_id: booking.business_id || null,
        created_by_id: booking.provider_identity_id,
        assigned_identity_ids: isBusinessBooking ? [booking.provider_identity_id] : [],
        invited_identity_ids: [],
        invited_guest_emails: [],
        _created_date: now,
        _updated_date: now,
    });
    // Transition to scheduled (Calendar has an active event — Booking V2)
    await bookingDoc.ref.update({
        calendar_event_id: calendarRef.id,
        booking_status: 'scheduled',
        _updated_date: now,
    });
    // Create receipt
    const receiptRef = shared_1.db.collection('receipts').doc();
    await receiptRef.set({
        booking_id,
        customer_snapshot: {
            identity_id: booking.customer_identity_id,
            display_name: booking.guest_display_name,
            email: booking.guest_email,
            phone: booking.guest_phone,
        },
        provider_snapshot: {
            identity_id: booking.provider_identity_id,
            business_id: booking.business_id,
        },
        service_snapshot: {
            id: booking.service_id,
            type: booking.booking_type,
        },
        subtotal_pence: booking.price_snapshot.base_price_pence,
        booking_fee_pence: booking.booking_fee_snapshot.amount_pence,
        total_pence: booking.total_snapshot.amount_pence,
        currency: booking.total_snapshot.currency,
        stripe_transaction_reference: null,
        payment_timestamp: now,
        refund_adjustments: [],
        _created_date: now,
    });
    // Create notification for provider
    const notifRef = shared_1.db.collection('notificationRecords').doc();
    await notifRef.set({
        recipient_id: booking.provider_identity_id,
        source_system: 'messaging',
        event_type: 'booking_confirmed',
        title: 'New Booking',
        body: `New booking confirmed for ${new Date(booking.start_time).toLocaleString()}`,
        category: 'calendar',
        priority: 'normal',
        delivery_channels: ['in_app'],
        is_read: false,
        action_url: `/bookings/${booking_id}`,
        action_label: 'View Booking',
        source_id: booking_id,
        _created_date: now,
        _updated_date: now,
    });
    return { booking_id, status: 'confirmed' };
});
//# sourceMappingURL=bookingPayment.js.map