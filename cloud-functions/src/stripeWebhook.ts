// Stripe webhook handler — trusted Firebase HTTP function
// ───────────────────────────────────────────────────────────
// Receives raw Stripe webhook events, verifies the signature,
// deduplicates via processed event IDs, and routes events to
// trusted domain handlers.
//
// The browser is NEVER authoritative for payment success.
// Only this webhook handler (with verified Stripe signature)
// can transition a paid Booking to confirmed.
//
// Idempotency: processed event IDs are stored in the
// `processedStripeEvents` collection. Repeated deliveries
// are detected and skipped — no duplicate side effects.
//
// Setup: configure the webhook endpoint URL in the Stripe
// Dashboard (or via Stripe CLI for local testing) and set
// the STRIPE_WEBHOOK_SECRET Firebase secret.
//
// ── Bootstrap state ──────────────────────────────────────────
// STRIPE_WEBHOOK_SECRET is intentionally NOT declared in the
// function's `secrets` array yet. Firebase cannot deploy the
// function if a declared secret does not exist in Secret Manager,
// and Stripe cannot generate the real whsec_... signing secret
// until the deployed endpoint URL exists.
//
// This bootstrap version deploys with only STRIPE_SECRET_KEY bound.
// While STRIPE_WEBHOOK_SECRET is absent, the function returns 503
// and processes NO Stripe events — verification is never bypassed
// and no unsigned event is accepted.
//
// After Stripe registers the endpoint and provides the real whsec_...:
//   1. Set STRIPE_WEBHOOK_SECRET in Firebase Secret Manager
//   2. Restore 'STRIPE_WEBHOOK_SECRET' to the secrets array below
//   3. Redeploy stripeWebhook
//   4. Verify signed Stripe sandbox events

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStripe } from './stripe';

const db = getFirestore();

// ── Webhook handler ─────────────────────────────────────────
export const stripeWebhook = onRequest(
  {
    region: 'europe-west2',
    // Bootstrap: STRIPE_WEBHOOK_SECRET intentionally omitted — see above.
    // Restore to: secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']
    secrets: ['STRIPE_SECRET_KEY'],
    timeoutSeconds: 60,
  },
  async (req, res) => {
    // ── Bootstrap gate ──
    // If the webhook secret is not yet configured, return a controlled
    // 503 and process no events. This allows Firebase to deploy the
    // endpoint so Stripe can register it and generate the signing secret.
    // Verification is never weakened — no event is processed without a
    // valid secret and signature.
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('STRIPE_WEBHOOK_SECRET not configured — webhook endpoint in bootstrap state');
      res.status(503).send('Webhook not configured');
      return;
    }

    // ── Signature verification ──
    // Stripe sends the signature in the `stripe-signature` header.
    // The raw body is required for verification — Firebase Functions
    // v2 onRequest provides req.rawBody.
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      res.status(400).send('Missing signature');
      return;
    }

    const stripe = getStripe();
    let event: any;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        webhookSecret,
      );
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      res.status(400).send(`Signature verification failed: ${err.message}`);
      return;
    }

    // ── Idempotency check ──
    // Check if this event has already been processed
    const eventRef = db.collection('processedStripeEvents').doc(event.id);
    const existingEvent = await eventRef.get();
    if (existingEvent.exists) {
      console.log(`Duplicate webhook event: ${event.id} — skipping`);
      res.status(200).send({ received: true, duplicate: true });
      return;
    }

    // Mark as processed (with processing status)
    const now = new Date().toISOString();
    await eventRef.set({
      event_id: event.id,
      event_type: event.type,
      created: event.created,
      processing_status: 'processing',
      _created_date: now,
    });

    try {
      // ── Route event to handler ──
      switch (event.type) {
        case 'payment_intent.succeeded':
          await handlePaymentSuccess(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await handlePaymentFailure(event.data.object);
          break;
        case 'charge.refunded':
          await handleRefund(event.data.object);
          break;
        case 'charge.dispute.created':
        case 'charge.dispute.closed':
          await handleDispute(event);
          break;
        case 'account.updated':
          await handleAccountUpdated(event.data.object);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      // Mark as completed
      await eventRef.update({ processing_status: 'completed', _updated_date: now });
      res.status(200).send({ received: true, type: event.type });
    } catch (err: any) {
      console.error(`Error processing webhook ${event.id}:`, err);
      await eventRef.update({ processing_status: 'failed', error: err.message, _updated_date: now });
      res.status(500).send('Webhook processing error');
    }
  },
);

// ── Payment success handler ──────────────────────────────────
// On authoritative Stripe payment success:
//   1. Identify PaymentRecord by PaymentIntent ID
//   2. Verify booking relationship
//   3. Mark payment succeeded
//   4. Transition booking from payment_pending to confirmed
//   5. Confirm slot hold
//   6. Create calendar event
//   7. Generate receipt
//   8. Trigger booking confirmation notification
//   9. Preserve idempotency (no duplicates)
async function handlePaymentSuccess(paymentIntent: any) {
  const now = new Date().toISOString();
  const piId = paymentIntent.id;

  // Find PaymentRecord by PaymentIntent ID
  const paySnap = await db.collection('paymentRecords')
    .where('stripe_payment_intent_id', '==', piId)
    .limit(1)
    .get();

  if (paySnap.empty) {
    console.error(`No PaymentRecord for PaymentIntent ${piId}`);
    return;
  }

  const payDoc = paySnap.docs[0];
  const payment = payDoc.data();

  // Idempotency: skip if already succeeded
  if (payment.payment_status === 'succeeded') {
    console.log(`Payment ${piId} already succeeded — skipping`);
    return;
  }

  // Update PaymentRecord
  await payDoc.ref.update({
    payment_status: 'succeeded',
    stripe_event_references: [...(payment.stripe_event_references || []), piId],
    _updated_date: now,
  });

  // Load booking
  const bookingRef = db.collection('bookings').doc(payment.booking_id);
  const bookingDoc = await bookingRef.get();
  if (!bookingDoc.exists) {
    console.error(`Booking ${payment.booking_id} not found for payment ${piId}`);
    return;
  }
  const booking = bookingDoc.data()!;

  // Idempotency: skip if booking already confirmed
  if (booking.booking_status === 'confirmed') {
    console.log(`Booking ${payment.booking_id} already confirmed — skipping`);
    return;
  }

  // Transition booking to confirmed (all agreement steps complete — Booking V2)
  await bookingRef.update({
    booking_status: 'confirmed',
    payment_status_mirror: 'succeeded',
    confirmed_at: now,
    _updated_date: now,
  });

  // Confirm slot hold
  if (booking.hold_id) {
    await db.collection('slotHolds').doc(booking.hold_id).update({
      status: 'confirmed',
      _updated_date: now,
    });
  }

  // Create calendar event (idempotent — check if exists)
  if (!booking.calendar_event_id) {
    const calendarRef = db.collection('calendarEvents').doc();
    await calendarRef.set({
      owner_id: booking.provider_identity_id,
      owner_type: booking.business_id ? 'business' : 'professional',
      operating_context: booking.business_id ? 'business' : 'professional',
      title: `Booking: ${booking.booking_type}`,
      description: `Booking ${payment.booking_id}`,
      start_time: booking.start_time,
      end_time: booking.end_time,
      timezone: booking.timezone,
      all_day: false,
      location_type: booking.location_context,
      meeting_url: booking.meeting_url,
      visibility: 'private',
      lifecycle_state: 'confirmed',
      source_system: 'booking',
      source_id: payment.booking_id,
      business_id: booking.business_id,
      created_by_id: booking.provider_identity_id,
      _created_date: now,
      _updated_date: now,
    });
    // Transition to scheduled (Calendar has an active event — Booking V2)
    await bookingRef.update({
      calendar_event_id: calendarRef.id,
      booking_status: 'scheduled',
      _updated_date: now,
    });
  }

  // Create receipt (idempotent — check if exists)
  const receiptSnap = await db.collection('receipts')
    .where('booking_id', '==', payment.booking_id)
    .limit(1)
    .get();
  if (receiptSnap.empty) {
    const receiptRef = db.collection('receipts').doc();
    await receiptRef.set({
      booking_id: payment.booking_id,
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
      stripe_transaction_reference: piId,
      payment_timestamp: now,
      refund_adjustments: [],
      _created_date: now,
    });
  }

  // Create notification for provider (idempotent — check by source_id)
  const notifSnap = await db.collection('notificationRecords')
    .where('source_id', '==', payment.booking_id)
    .where('event_type', '==', 'booking_confirmed')
    .limit(1)
    .get();
  if (notifSnap.empty) {
    const notifRef = db.collection('notificationRecords').doc();
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
      action_url: `/bookings/${payment.booking_id}`,
      action_label: 'View Booking',
      source_id: payment.booking_id,
      _created_date: now,
      _updated_date: now,
    });
  }

  // Guest confirmation email — deferred to email delivery phase
  // (existing SendEmail integration reaches registered users only;
  // guest email requires a configured external email provider)
  if (booking.guest_email) {
    console.log(`Guest receipt email pending for booking ${payment.booking_id} — email delivery deferred`);
  }
}

// ── Payment failure handler ──────────────────────────────────
async function handlePaymentFailure(paymentIntent: any) {
  const now = new Date().toISOString();
  const piId = paymentIntent.id;

  const paySnap = await db.collection('paymentRecords')
    .where('stripe_payment_intent_id', '==', piId)
    .limit(1)
    .get();

  if (paySnap.empty) return;

  const payDoc = paySnap.docs[0];
  const payment = payDoc.data();

  if (payment.payment_status === 'failed') return; // idempotent

  await payDoc.ref.update({
    payment_status: 'failed',
    stripe_event_references: [...(payment.stripe_event_references || []), piId],
    _updated_date: now,
  });

  // Update booking status
  const bookingRef = db.collection('bookings').doc(payment.booking_id);
  const bookingDoc = await bookingRef.get();
  if (!bookingDoc.exists) return;

  // Transition back to awaiting_payment (allow retry — Booking V2 lifecycle)
  // payment_status_mirror tracks the Stripe state independently
  await bookingRef.update({
    booking_status: 'awaiting_payment',
    payment_status_mirror: 'failed',
    _updated_date: now,
  });

  // Release slot hold
  if (bookingDoc.data()!.hold_id) {
    await db.collection('slotHolds').doc(bookingDoc.data()!.hold_id).update({
      status: 'released',
      _updated_date: now,
    });
  }
}

// ── Refund handler ───────────────────────────────────────────
async function handleRefund(charge: any) {
  const now = new Date().toISOString();
  const refundId = charge.refunds?.data?.[0]?.id;
  if (!refundId) return;

  // Find the refund record by Stripe refund ID
  const refundSnap = await db.collection('refundRecords')
    .where('stripe_refund_id', '==', refundId)
    .limit(1)
    .get();

  if (!refundSnap.empty) {
    const refundDoc = refundSnap.docs[0];
    const refundData = refundDoc.data();
    if (refundData.status === 'completed') return; // idempotent

    await refundDoc.ref.update({
      status: 'completed',
      refunded_amount: charge.amount_refunded,
      completed_at: now,
      _updated_date: now,
    });

    // Update PaymentRecord
    const payRef = db.collection('paymentRecords').doc(refundData.payment_record_id);
    const payDoc = await payRef.get();
    if (payDoc.exists) {
      const fullAmount = payDoc.data()!.amount_snapshot;
      const isFullRefund = charge.amount_refunded >= fullAmount;
      await payRef.update({
        refund_state: isFullRefund ? 'refunded' : 'partially_refunded',
        _updated_date: now,
      });

      // Update booking if fully refunded
      if (isFullRefund) {
        await db.collection('bookings').doc(refundData.booking_id).update({
          payment_status_mirror: 'refunded',
          _updated_date: now,
        });
      }
    }
  }
}

// ── Dispute handler ──────────────────────────────────────────
async function handleDispute(event: any) {
  const dispute = event.data.object;
  const now = new Date().toISOString();

  // Find the PaymentRecord by charge ID
  const paySnap = await db.collection('paymentRecords')
    .where('stripe_payment_intent_id', '==', dispute.payment_intent)
    .limit(1)
    .get();

  if (paySnap.empty) return;

  const payDoc = paySnap.docs[0];
  await payDoc.ref.update({
    dispute_status: dispute.status,
    stripe_event_references: [...payDoc.data()!.stripe_event_references || [], event.id],
    _updated_date: now,
  });

  // Transition booking to disputed state (Booking V2 lifecycle)
  const bookingRef = db.collection('bookings').doc(payDoc.data()!.booking_id);
  const bookingDoc = await bookingRef.get();
  if (bookingDoc.exists) {
    const bookingStatus = bookingDoc.data()!.booking_status;
    if (['scheduled', 'confirmed', 'in_progress', 'completed'].includes(bookingStatus)) {
      await bookingRef.update({
        booking_status: 'disputed',
        _updated_date: now,
      });
    }
  }
}

// ── Account updated handler (Stripe Connect) ────────────────
async function handleAccountUpdated(account: any) {
  const now = new Date().toISOString();
  const accountRef = db.collection('stripeConnectAccounts').doc(account.id);
  const doc = await accountRef.get();
  if (!doc.exists) return;

  await accountRef.update({
    account_status: account.charges_enabled && account.details_submitted ? 'enabled' : 'restricted',
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    _updated_date: now,
  });
}