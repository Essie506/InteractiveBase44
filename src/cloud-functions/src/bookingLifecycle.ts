// Booking lifecycle management — trusted Firebase Cloud Functions
// ───────────────────────────────────────────────────────────
// 1. cancelBooking — cancellation with policy evaluation + Stripe refund
// 2. rescheduleBooking — same-price reschedule with availability validation
// 3. reportNoShow — no-show state recording (no auto-refund)
// 4. completeBooking — mark booking as completed
//
// All financial transitions are server-only. Client code never
// calculates authoritative refund values or transitions booking state.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, hasBusinessRole, isAdmin } from './shared';
import { getStripe } from './stripe';

// ── cancelBooking ────────────────────────────────────────────
// Evaluates the cancellation policy snapshot, determines the refund
// amount, creates a Stripe refund if applicable, and transitions
// the booking to cancelled.
//
// Request: { booking_id: string, reason?: string }
// Returns: { booking_id, status, refund_amount_pence?, refund_record_id? }
export const cancelBooking = onCall(
  { region: 'europe-west2', cors: allowedOrigins, secrets: ['STRIPE_SECRET_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const { booking_id, reason } = request.data || {};

    if (!booking_id) {
      throw new HttpsError('invalid-argument', 'booking_id is required');
    }

    const bookingDoc = await db.collection('bookings').doc(booking_id).get();
    if (!bookingDoc.exists) {
      throw new HttpsError('not-found', 'Booking not found');
    }
    const booking = bookingDoc.data()!;

    // Authorization: customer, provider, or business admin
    const isCustomer = booking.customer_identity_id === callerIdentityId;
    const isProvider = booking.provider_identity_id === callerIdentityId;
    let isBizAdmin = false;
    if (booking.business_id) {
      isBizAdmin = await hasBusinessRole(booking.business_id, callerIdentityId, ['owner', 'admin']);
    }
    if (!isCustomer && !isProvider && !isBizAdmin) {
      throw new HttpsError('permission-denied', 'Not authorized to cancel this booking');
    }

    // Determine cancellation actor (Booking V2 — identify actor)
    const isPlatformAdmin = await isAdmin(callerIdentityId);
    let cancelledByState: string;
    if (isCustomer) {
      cancelledByState = 'cancelled_by_customer';
    } else if (isPlatformAdmin && !isProvider && !isBizAdmin) {
      cancelledByState = 'cancelled_by_platform';
    } else {
      cancelledByState = 'cancelled_by_provider';
    }

    // Validate booking state
    const cancelledStates = ['cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_platform'];
    if (cancelledStates.includes(booking.booking_status)) {
      throw new HttpsError('failed-precondition', 'Booking is already cancelled');
    }
    if (booking.booking_status === 'completed') {
      throw new HttpsError('failed-precondition', 'Cannot cancel a completed booking');
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // ── Policy evaluation ──
    // Use the booking's cancellation_policy_snapshot (not current provider policy)
    const policy = booking.cancellation_policy_snapshot || { deadline_hours: 24, refund_percentage: 100 };
    const startTime = new Date(booking.start_time);
    const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    let refundPercentage = 0;
    if (hoursUntilStart >= policy.deadline_hours) {
      refundPercentage = policy.refund_percentage;
    } else {
      // Past deadline — no refund (or partial per policy)
      refundPercentage = 0;
    }

    let refundRecordId: string | null = null;
    let refundAmountPence = 0;

    // ── Stripe refund if payment was made ──
    if (booking.payment_status_mirror === 'succeeded' && booking.payment_record_id) {
      const payDoc = await db.collection('paymentRecords').doc(booking.payment_record_id).get();
      if (payDoc.exists) {
        const payment = payDoc.data()!;
        const chargeAmount = booking.stripe_charge_amount_pence || booking.total_snapshot.amount_pence;
        refundAmountPence = Math.round(chargeAmount * (refundPercentage / 100));

        if (refundAmountPence > 0) {
          // Create Stripe refund
          const stripe = getStripe();
          const stripeRefund = await stripe.refunds.create({
            payment_intent: payment.stripe_payment_intent_id,
            amount: refundAmountPence,
            metadata: {
              booking_id,
              cancelled_by: callerIdentityId,
              reason: reason || 'cancellation',
            },
          }, {
            idempotencyKey: `refund_${booking_id}_${Date.now()}`,
          });

          // Create RefundRecord
          const refundRef = db.collection('refundRecords').doc();
          refundRecordId = refundRef.id;
          await refundRef.set({
            booking_id,
            payment_record_id: booking.payment_record_id,
            stripe_refund_id: stripeRefund.id,
            requested_amount: refundAmountPence,
            approved_amount: refundAmountPence,
            refunded_amount: 0, // Updated by webhook when completed
            currency: booking.total_snapshot.currency,
            reason: reason || 'cancellation',
            policy_basis: `cancellation_policy: ${refundPercentage}% refund, ${hoursUntilStart.toFixed(1)}h before start`,
            status: 'processing',
            requester_identity_id: callerIdentityId,
            stripe_event_reference: null,
            _created_date: nowIso,
            _updated_date: nowIso,
            completed_at: null,
          });
        }
      }
    }

    // ── Finalise cancellation (Booking V2 — identify actor) ──
    await bookingDoc.ref.update({
      booking_status: cancelledByState,
      cancelled_at: nowIso,
      _updated_date: nowIso,
    });

    // Release slot hold
    if (booking.hold_id) {
      await db.collection('slotHolds').doc(booking.hold_id).update({
        status: 'released',
        _updated_date: nowIso,
      });
    }

    // Cancel calendar event
    if (booking.calendar_event_id) {
      await db.collection('calendarEvents').doc(booking.calendar_event_id).update({
        lifecycle_state: 'cancelled',
        _updated_date: nowIso,
      });
    }

    // Update receipt with refund adjustment
    if (refundAmountPence > 0) {
      const receiptSnap = await db.collection('receipts')
        .where('booking_id', '==', booking_id)
        .limit(1)
        .get();
      if (!receiptSnap.empty) {
        const refundAdjustments = receiptSnap.docs[0].data().refund_adjustments || [];
        await receiptSnap.docs[0].ref.update({
          refund_adjustments: [...refundAdjustments, {
            amount_pence: refundAmountPence,
            reason: reason || 'cancellation',
            timestamp: nowIso,
          }],
          _updated_date: nowIso,
        });
      }
    }

    // Notification
    const recipientId = isCustomer ? booking.provider_identity_id : booking.customer_identity_id;
    if (recipientId) {
      const notifRef = db.collection('notificationRecords').doc();
      await notifRef.set({
        recipient_id: recipientId,
        source_system: 'messaging',
        event_type: 'booking_cancelled',
        title: 'Booking Cancelled',
        body: `Booking ${booking_id} has been cancelled${refundAmountPence > 0 ? `. Refund of ${(refundAmountPence / 100).toFixed(2)} ${booking.total_snapshot.currency} processing.` : '.'}`,
        category: 'calendar',
        priority: 'normal',
        delivery_channels: ['in_app'],
        is_read: false,
        action_url: `/bookings/${booking_id}`,
        source_id: booking_id,
        _created_date: nowIso,
        _updated_date: nowIso,
      });
    }

    return {
      booking_id,
      status: 'cancelled',
      refund_amount_pence: refundAmountPence,
      refund_record_id: refundRecordId,
    };
  },
);

// ── rescheduleBooking ────────────────────────────────────────
// Same-price reschedule: validates new slot availability, creates
// a new hold, updates the booking, updates the calendar event,
// and records the reschedule in the audit history.
//
// Price-difference rescheduling is NOT supported in this initial
// implementation — it is reported as a specification gap.
//
// Request: { booking_id, new_start_time, new_end_time, reason? }
// Returns: { booking_id, status, new_hold_id }
export const rescheduleBooking = onCall(
  { region: 'europe-west2', cors: allowedOrigins, secrets: ['STRIPE_SECRET_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const { booking_id, new_start_time, new_end_time, reason } = request.data || {};

    if (!booking_id || !new_start_time || !new_end_time) {
      throw new HttpsError('invalid-argument', 'booking_id, new_start_time, new_end_time required');
    }

    const bookingDoc = await db.collection('bookings').doc(booking_id).get();
    if (!bookingDoc.exists) {
      throw new HttpsError('not-found', 'Booking not found');
    }
    const booking = bookingDoc.data()!;

    // Authorization
    const isCustomer = booking.customer_identity_id === callerIdentityId;
    const isProvider = booking.provider_identity_id === callerIdentityId;
    let isBizAdmin = false;
    if (booking.business_id) {
      isBizAdmin = await hasBusinessRole(booking.business_id, callerIdentityId, ['owner', 'admin']);
    }
    if (!isCustomer && !isProvider && !isBizAdmin) {
      throw new HttpsError('permission-denied', 'Not authorized to reschedule this booking');
    }

    // Validate booking state — must be scheduled or confirmed (Booking V2)
    if (booking.booking_status !== 'scheduled' && booking.booking_status !== 'confirmed') {
      throw new HttpsError('failed-precondition', 'Only scheduled or confirmed bookings can be rescheduled');
    }

    // Transition to reschedule_requested (Booking V2 lifecycle)
    const now = new Date().toISOString();
    await bookingDoc.ref.update({
      booking_status: 'reschedule_requested',
      _updated_date: now,
    });

    // Validate new slot availability (transaction — prevent race conditions)
    const holdResult = await db.runTransaction(async (tx) => {
      // Check for conflicting holds/bookings at the new time
      const conflictingSnap = await tx.get(
        db.collection('slotHolds')
          .where('provider_identity_id', '==', booking.provider_identity_id)
          .where('start_time', '==', new_start_time)
          .where('status', '==', 'active')
          .limit(1),
      );
      if (!conflictingSnap.empty) {
        throw new HttpsError('failed-precondition', 'New slot is not available');
      }

      const bookedSnap = await tx.get(
        db.collection('bookings')
          .where('provider_identity_id', '==', booking.provider_identity_id)
          .where('start_time', '==', new_start_time)
          .where('booking_status', 'in', [
            'requested', 'accepted', 'awaiting_customer_confirmation',
            'awaiting_payment', 'payment_pending', 'confirmed', 'scheduled',
          ])
          .limit(1),
      );
      if (!bookedSnap.empty) {
        throw new HttpsError('failed-precondition', 'New slot is already booked');
      }

      // Check Calendar for existing events (Calendar is authoritative for availability)
      const calendarOwner = booking.business_id || booking.provider_identity_id;
      const calendarSnap = await tx.get(
        db.collection('calendarEvents')
          .where('owner_id', '==', calendarOwner)
          .where('start_time', '==', new_start_time)
          .where('lifecycle_state', 'in', ['scheduled', 'confirmed', 'tentative'])
          .limit(1),
      );
      if (!calendarSnap.empty) {
        throw new HttpsError('failed-precondition', 'New slot conflicts with an existing calendar event');
      }

      // Create new hold
      const holdRef = db.collection('slotHolds').doc();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      tx.set(holdRef, {
        provider_identity_id: booking.provider_identity_id,
        business_id: booking.business_id,
        service_id: booking.service_id,
        start_time: new_start_time,
        end_time: new_end_time,
        status: 'active',
        expires_at: expiresAt,
        created_by_identity_id: callerIdentityId,
        _created_date: now,
      });
      return holdRef.id;
    });

    // Record reschedule history
    const rescheduleEntry = {
      from_start_time: booking.start_time,
      to_start_time: new_start_time,
      from_end_time: booking.end_time,
      to_end_time: new_end_time,
      reason: reason || null,
      requested_by: callerIdentityId,
      timestamp: now,
    };

    // Update booking — transition through rescheduled (Booking V2 lifecycle)
    await bookingDoc.ref.update({
      booking_status: 'rescheduled',
      start_time: new_start_time,
      end_time: new_end_time,
      hold_id: holdResult,
      reschedule_history: [...(booking.reschedule_history || []), rescheduleEntry],
      _updated_date: now,
    });

    // Update calendar event
    if (booking.calendar_event_id) {
      await db.collection('calendarEvents').doc(booking.calendar_event_id).update({
        start_time: new_start_time,
        end_time: new_end_time,
        _updated_date: now,
      });
    }

    // Release old hold
    if (booking.hold_id) {
      await db.collection('slotHolds').doc(booking.hold_id).update({
        status: 'released',
        _updated_date: now,
      });
    }

    // Confirm new hold
    await db.collection('slotHolds').doc(holdResult).update({
      status: 'confirmed',
      _updated_date: now,
    });

    // Transition back to scheduled (Calendar has active event at new time — Booking V2)
    await bookingDoc.ref.update({
      booking_status: 'scheduled',
      _updated_date: now,
    });

    // Notification
    const recipientId = isCustomer ? booking.provider_identity_id : booking.customer_identity_id;
    if (recipientId) {
      const notifRef = db.collection('notificationRecords').doc();
      await notifRef.set({
        recipient_id: recipientId,
        source_system: 'messaging',
        event_type: 'booking_rescheduled',
        title: 'Booking Rescheduled',
        body: `Booking ${booking_id} rescheduled to ${new Date(new_start_time).toLocaleString()}`,
        category: 'calendar',
        priority: 'normal',
        delivery_channels: ['in_app'],
        is_read: false,
        action_url: `/bookings/${booking_id}`,
        source_id: booking_id,
        _created_date: now,
        _updated_date: now,
      });
    }

    return { booking_id, status: 'confirmed', new_hold_id: holdResult };
  },
);

// ── reportNoShow ─────────────────────────────────────────────
// Records a no-show state for a booking. Does NOT automatically
// refund — only approved no-show/refund policy applies.
//
// Only the provider can report no-show, and only for past bookings.
//
// Request: { booking_id, reason? }
// Returns: { booking_id, no_show: true }
export const reportNoShow = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const { booking_id, reason } = request.data || {};

    if (!booking_id) {
      throw new HttpsError('invalid-argument', 'booking_id is required');
    }

    const bookingDoc = await db.collection('bookings').doc(booking_id).get();
    if (!bookingDoc.exists) {
      throw new HttpsError('not-found', 'Booking not found');
    }
    const booking = bookingDoc.data()!;

    // Authorization: provider reports customer no-show; customer reports provider no-show
    const isProvider = booking.provider_identity_id === callerIdentityId;
    const isCustomer = booking.customer_identity_id === callerIdentityId;
    let isBizAdmin = false;
    if (booking.business_id) {
      isBizAdmin = await hasBusinessRole(booking.business_id, callerIdentityId, ['owner', 'admin']);
    }
    if (!isProvider && !isBizAdmin && !isCustomer) {
      throw new HttpsError('permission-denied', 'Not authorized to report no-show for this booking');
    }

    // Determine no-show type (Booking V2 — identify customer vs provider)
    const noShowState = (isProvider || isBizAdmin) ? 'no_show_customer' : 'no_show_provider';

    // Validate booking state — must be scheduled, confirmed, or completed and past
    if (booking.booking_status !== 'scheduled' && booking.booking_status !== 'confirmed' && booking.booking_status !== 'completed') {
      throw new HttpsError('failed-precondition', 'No-show can only be reported for scheduled/completed bookings');
    }

    const now = new Date();
    const endTime = new Date(booking.end_time);
    if (endTime > now) {
      throw new HttpsError('failed-precondition', 'No-show can only be reported after the booking end time');
    }

    // Idempotency: check if already reported
    if (booking.no_show_state?.reported) {
      throw new HttpsError('failed-precondition', 'No-show already reported');
    }

    const nowIso = now.toISOString();
    await bookingDoc.ref.update({
      booking_status: noShowState,
      no_show_state: {
        reported: true,
        reported_by: callerIdentityId,
        reported_at: nowIso,
        reason: reason || null,
        no_show_type: noShowState === 'no_show_customer' ? 'customer' : 'provider',
      },
      _updated_date: nowIso,
    });

    // Create trust signal for no-show
    const signalRef = db.collection('trustSignals').doc();
    await signalRef.set({
      source_system: 'trust_safety',
      target_type: booking.business_id ? 'business' : 'professional',
      target_id: booking.business_id || booking.provider_identity_id,
      signal_type: 'no_show',
      signal_data: JSON.stringify({ booking_id, customer_identity_id: booking.customer_identity_id }),
      signal_weight: 1,
      operation_id: booking_id,
      _created_date: nowIso,
    });

    return { booking_id, no_show: true };
  },
);

// ── completeBooking ──────────────────────────────────────────
// Marks a confirmed booking as completed. Only the provider
// or an admin can complete a booking.
//
// Request: { booking_id }
// Returns: { booking_id, status: 'completed' }
export const completeBooking = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const { booking_id } = request.data || {};

    if (!booking_id) {
      throw new HttpsError('invalid-argument', 'booking_id is required');
    }

    const bookingDoc = await db.collection('bookings').doc(booking_id).get();
    if (!bookingDoc.exists) {
      throw new HttpsError('not-found', 'Booking not found');
    }
    const booking = bookingDoc.data()!;

    // Authorization: provider or business admin
    const isProvider = booking.provider_identity_id === callerIdentityId;
    let isBizAdmin = false;
    if (booking.business_id) {
      isBizAdmin = await hasBusinessRole(booking.business_id, callerIdentityId, ['owner', 'admin']);
    }
    if (!isProvider && !isBizAdmin) {
      throw new HttpsError('permission-denied', 'Only the provider can complete this booking');
    }

    if (booking.booking_status !== 'scheduled' && booking.booking_status !== 'in_progress' && booking.booking_status !== 'confirmed') {
      throw new HttpsError('failed-precondition', 'Only scheduled, in-progress, or confirmed bookings can be completed');
    }

    const now = new Date().toISOString();
    await bookingDoc.ref.update({
      booking_status: 'completed',
      completed_at: now,
      _updated_date: now,
    });

    // Update calendar event
    if (booking.calendar_event_id) {
      await db.collection('calendarEvents').doc(booking.calendar_event_id).update({
        lifecycle_state: 'completed',
        _updated_date: now,
      });
    }

    return { booking_id, status: 'completed' };
  },
);