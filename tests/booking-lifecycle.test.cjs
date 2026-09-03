/**
 * Booking Lifecycle + Fee Safety Tests — Phase 5
 * ───────────────────────────────────────────────────────────
 * Pure unit tests for:
 *   - Fee calculation logic (all FeeConfigStatus values)
 *   - Fee configuration safety (unresolved config rejection)
 *   - Booking V2 state machine transition validation
 *   - Payment route classification
 *   - Duplicate PaymentIntent/refund prevention logic
 *   - Cancellation actor identification
 *   - No-show actor identification
 *   - Same-price reschedule validation
 *
 * These tests run with Node.js directly — no Firebase emulator
 * required. They replicate the Cloud Function logic to verify
 * correctness of the state machine and fee rules.
 *
 * Usage:
 *   node tests/booking-lifecycle.test.cjs
 */

const assert = require('assert');

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    results.push({ name, passed: false, error: err.message });
    console.log(`[FAIL] ${name} — ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════
// FEE CALCULATION LOGIC (replicated from stripe.ts)
// ═══════════════════════════════════════════════════════════

function calculateBookingFee(basePricePence, feeRule, feeConfigStatus) {
  if (feeConfigStatus === 'waiver' || feeConfigStatus === 'explicit_none') {
    return {
      bookingFeePence: 0,
      totalPence: basePricePence,
      applicationFeePence: 0,
      providerProceedsPence: basePricePence,
      feeRuleBasis: feeConfigStatus === 'waiver' ? 'fee_waiver' : 'explicit_none',
      feeRuleSource: 'plan_config',
      feeConfigStatus,
    };
  }

  if (feeConfigStatus === 'unresolved') {
    return {
      bookingFeePence: 0,
      totalPence: basePricePence,
      applicationFeePence: 0,
      providerProceedsPence: basePricePence,
      feeRuleBasis: 'unresolved',
      feeRuleSource: 'default_none',
      feeConfigStatus,
    };
  }

  // Configured
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
  } else {
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

// ═══════════════════════════════════════════════════════════
// FEE CONFIGURATION STATUS TESTS
// ═══════════════════════════════════════════════════════════

test('FEE: waiver → 0 fee for paid booking', () => {
  const result = calculateBookingFee(5000, null, 'waiver');
  assert.strictEqual(result.bookingFeePence, 0);
  assert.strictEqual(result.totalPence, 5000);
  assert.strictEqual(result.feeRuleBasis, 'fee_waiver');
  assert.strictEqual(result.feeConfigStatus, 'waiver');
});

test('FEE: explicit_none → 0 fee for paid booking', () => {
  const result = calculateBookingFee(5000, { type: 'none', value: 0, applies_to_free_events: false }, 'explicit_none');
  assert.strictEqual(result.bookingFeePence, 0);
  assert.strictEqual(result.totalPence, 5000);
  assert.strictEqual(result.feeRuleBasis, 'explicit_none');
  assert.strictEqual(result.feeConfigStatus, 'explicit_none');
});

test('FEE: configured percentage → correct fee', () => {
  const feeRule = { type: 'percentage', value: 5, applies_to_free_events: false };
  const result = calculateBookingFee(5000, feeRule, 'configured');
  assert.strictEqual(result.bookingFeePence, 250); // 5% of 5000
  assert.strictEqual(result.totalPence, 5250);
  assert.strictEqual(result.applicationFeePence, 250);
  assert.strictEqual(result.providerProceedsPence, 5000);
  assert.strictEqual(result.feeRuleBasis, 'plan_percentage');
});

test('FEE: configured percentage with minimum', () => {
  const feeRule = { type: 'percentage', value: 5, minimum_pence: 100, applies_to_free_events: false };
  const result = calculateBookingFee(1000, feeRule, 'configured');
  assert.strictEqual(result.bookingFeePence, 100); // 5% of 1000 = 50, but min is 100
  assert.strictEqual(result.totalPence, 1100);
});

test('FEE: configured flat fee', () => {
  const feeRule = { type: 'flat', value: 200, applies_to_free_events: false };
  const result = calculateBookingFee(5000, feeRule, 'configured');
  assert.strictEqual(result.bookingFeePence, 200);
  assert.strictEqual(result.totalPence, 5200);
});

test('FEE: free event with no free-event fee → 0 fee', () => {
  const feeRule = { type: 'percentage', value: 5, applies_to_free_events: false };
  const result = calculateBookingFee(0, feeRule, 'configured');
  assert.strictEqual(result.bookingFeePence, 0);
  assert.strictEqual(result.totalPence, 0);
  assert.strictEqual(result.feeRuleBasis, 'free_event_no_fee');
});

test('FEE: free event with free-event fee → fee applies', () => {
  const feeRule = { type: 'flat', value: 100, applies_to_free_events: true };
  const result = calculateBookingFee(0, feeRule, 'configured');
  assert.strictEqual(result.bookingFeePence, 100);
  assert.strictEqual(result.totalPence, 100);
});

test('FEE: unresolved → 0 fee but marked unresolved', () => {
  const result = calculateBookingFee(5000, null, 'unresolved');
  assert.strictEqual(result.bookingFeePence, 0);
  assert.strictEqual(result.totalPence, 5000);
  assert.strictEqual(result.feeRuleBasis, 'unresolved');
  assert.strictEqual(result.feeConfigStatus, 'unresolved');
});

// ═══════════════════════════════════════════════════════════
// FEE SAFETY — unresolved config must not silently charge 0
// ═══════════════════════════════════════════════════════════

// Simulates the createBookingDraft fee safety check
function checkFeeSafety(needsStripe, basePricePence, feeConfigStatus) {
  if (needsStripe && basePricePence > 0 && feeConfigStatus === 'unresolved') {
    throw new Error('Provider plan fee configuration is unresolved');
  }
}

test('FEE SAFETY: unresolved + paid Stripe → rejected', () => {
  assert.throws(
    () => checkFeeSafety(true, 5000, 'unresolved'),
    /unresolved/
  );
});

test('FEE SAFETY: unresolved + free event → allowed', () => {
  assert.doesNotThrow(() => checkFeeSafety(true, 0, 'unresolved'));
});

test('FEE SAFETY: unresolved + non-Stripe route → allowed', () => {
  assert.doesNotThrow(() => checkFeeSafety(false, 5000, 'unresolved'));
});

test('FEE SAFETY: waiver + paid Stripe → allowed', () => {
  assert.doesNotThrow(() => checkFeeSafety(true, 5000, 'waiver'));
});

test('FEE SAFETY: explicit_none + paid Stripe → allowed', () => {
  assert.doesNotThrow(() => checkFeeSafety(true, 5000, 'explicit_none'));
});

test('FEE SAFETY: configured + paid Stripe → allowed', () => {
  assert.doesNotThrow(() => checkFeeSafety(true, 5000, 'configured'));
});

// ═══════════════════════════════════════════════════════════
// BOOKING V2 STATE MACHINE — valid transitions
// ═══════════════════════════════════════════════════════════

const BOOKING_V2_STATES = [
  'draft', 'requested', 'pending_provider_response', 'accepted',
  'awaiting_customer_confirmation', 'awaiting_payment', 'payment_pending',
  'confirmed', 'scheduled', 'in_progress', 'completed',
  'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_platform',
  'declined', 'expired', 'reschedule_requested', 'rescheduled',
  'no_show_customer', 'no_show_provider', 'disputed', 'archived',
];

const VALID_TRANSITIONS = {
  draft: ['requested', 'awaiting_payment', 'expired', 'cancelled_by_customer'],
  requested: ['accepted', 'declined', 'expired', 'cancelled_by_customer', 'cancelled_by_provider'],
  pending_provider_response: ['accepted', 'declined', 'expired', 'cancelled_by_customer'],
  accepted: ['awaiting_customer_confirmation', 'awaiting_payment', 'confirmed', 'cancelled_by_customer', 'cancelled_by_provider'],
  awaiting_customer_confirmation: ['accepted', 'awaiting_payment', 'cancelled_by_customer', 'cancelled_by_provider'],
  awaiting_payment: ['payment_pending', 'cancelled_by_customer', 'expired'],
  payment_pending: ['confirmed', 'awaiting_payment', 'cancelled_by_customer', 'cancelled_by_provider'],
  confirmed: ['scheduled', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_platform', 'reschedule_requested'],
  scheduled: ['in_progress', 'completed', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_platform', 'reschedule_requested', 'no_show_customer', 'no_show_provider', 'disputed'],
  in_progress: ['completed', 'disputed'],
  completed: ['archived', 'disputed'],
  reschedule_requested: ['rescheduled', 'scheduled', 'cancelled_by_customer', 'cancelled_by_provider'],
  rescheduled: ['scheduled'],
  disputed: ['archived', 'cancelled_by_platform'],
};

function isValidTransition(from, to) {
  if (!BOOKING_V2_STATES.includes(from)) return false;
  if (!BOOKING_V2_STATES.includes(to)) return false;
  const allowed = VALID_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

test('LIFECYCLE: all 22 Booking V2 states defined', () => {
  assert.strictEqual(BOOKING_V2_STATES.length, 22);
});

test('LIFECYCLE: draft → awaiting_payment (direct pay)', () => {
  assert.strictEqual(isValidTransition('draft', 'awaiting_payment'), true);
});

test('LIFECYCLE: draft → requested (provider acceptance)', () => {
  assert.strictEqual(isValidTransition('draft', 'requested'), true);
});

test('LIFECYCLE: awaiting_payment → payment_pending (Stripe processing)', () => {
  assert.strictEqual(isValidTransition('awaiting_payment', 'payment_pending'), true);
});

test('LIFECYCLE: payment_pending → confirmed (webhook success)', () => {
  assert.strictEqual(isValidTransition('payment_pending', 'confirmed'), true);
});

test('LIFECYCLE: payment_pending → awaiting_payment (webhook failure, retry)', () => {
  assert.strictEqual(isValidTransition('payment_pending', 'awaiting_payment'), true);
});

test('LIFECYCLE: confirmed → scheduled (calendar event created)', () => {
  assert.strictEqual(isValidTransition('confirmed', 'scheduled'), true);
});

test('LIFECYCLE: scheduled → in_progress (service starts)', () => {
  assert.strictEqual(isValidTransition('scheduled', 'in_progress'), true);
});

test('LIFECYCLE: scheduled → completed (service ends)', () => {
  assert.strictEqual(isValidTransition('scheduled', 'completed'), true);
});

test('LIFECYCLE: scheduled → cancelled_by_customer', () => {
  assert.strictEqual(isValidTransition('scheduled', 'cancelled_by_customer'), true);
});

test('LIFECYCLE: scheduled → cancelled_by_provider', () => {
  assert.strictEqual(isValidTransition('scheduled', 'cancelled_by_provider'), true);
});

test('LIFECYCLE: scheduled → cancelled_by_platform', () => {
  assert.strictEqual(isValidTransition('scheduled', 'cancelled_by_platform'), true);
});

test('LIFECYCLE: scheduled → no_show_customer', () => {
  assert.strictEqual(isValidTransition('scheduled', 'no_show_customer'), true);
});

test('LIFECYCLE: scheduled → no_show_provider', () => {
  assert.strictEqual(isValidTransition('scheduled', 'no_show_provider'), true);
});

test('LIFECYCLE: scheduled → disputed (webhook dispute)', () => {
  assert.strictEqual(isValidTransition('scheduled', 'disputed'), true);
});

test('LIFECYCLE: scheduled → reschedule_requested', () => {
  assert.strictEqual(isValidTransition('scheduled', 'reschedule_requested'), true);
});

test('LIFECYCLE: reschedule_requested → rescheduled', () => {
  assert.strictEqual(isValidTransition('reschedule_requested', 'rescheduled'), true);
});

test('LIFECYCLE: rescheduled → scheduled', () => {
  assert.strictEqual(isValidTransition('rescheduled', 'scheduled'), true);
});

test('LIFECYCLE: completed → archived', () => {
  assert.strictEqual(isValidTransition('completed', 'archived'), true);
});

test('LIFECYCLE: disputed → archived', () => {
  assert.strictEqual(isValidTransition('disputed', 'archived'), true);
});

test('LIFECYCLE: INVALID — completed → scheduled (cannot revive)', () => {
  assert.strictEqual(isValidTransition('completed', 'scheduled'), false);
});

test('LIFECYCLE: INVALID — cancelled → confirmed (cannot revive)', () => {
  assert.strictEqual(isValidTransition('cancelled_by_customer', 'confirmed'), false);
});

test('LIFECYCLE: INVALID — no_show → scheduled (cannot revive)', () => {
  assert.strictEqual(isValidTransition('no_show_customer', 'scheduled'), false);
});

// ═══════════════════════════════════════════════════════════
// PAYMENT ROUTES — all 7 supported
// ═══════════════════════════════════════════════════════════

const PAYMENT_ROUTES_REQUIRING_STRIPE = ['pay_through_interactive', 'full_payment', 'deposit'];
const PAYMENT_ROUTES_NO_STRIPE = ['pay_later', 'arrange_directly', 'free', 'external_payment'];
const ALL_ROUTES = [...PAYMENT_ROUTES_REQUIRING_STRIPE, ...PAYMENT_ROUTES_NO_STRIPE];

function requiresStripePayment(route) {
  return PAYMENT_ROUTES_REQUIRING_STRIPE.includes(route);
}

test('ROUTES: all 7 payment routes defined', () => {
  assert.strictEqual(ALL_ROUTES.length, 7);
});

test('ROUTES: pay_through_interactive requires Stripe', () => {
  assert.strictEqual(requiresStripePayment('pay_through_interactive'), true);
});

test('ROUTES: full_payment requires Stripe', () => {
  assert.strictEqual(requiresStripePayment('full_payment'), true);
});

test('ROUTES: deposit requires Stripe', () => {
  assert.strictEqual(requiresStripePayment('deposit'), true);
});

test('ROUTES: pay_later does NOT require Stripe', () => {
  assert.strictEqual(requiresStripePayment('pay_later'), false);
});

test('ROUTES: arrange_directly does NOT require Stripe', () => {
  assert.strictEqual(requiresStripePayment('arrange_directly'), false);
});

test('ROUTES: free does NOT require Stripe', () => {
  assert.strictEqual(requiresStripePayment('free'), false);
});

test('ROUTES: external_payment does NOT require Stripe', () => {
  assert.strictEqual(requiresStripePayment('external_payment'), false);
});

// ═══════════════════════════════════════════════════════════
// CANCELLATION ACTOR IDENTIFICATION
// ═══════════════════════════════════════════════════════════

function determineCancelActor(isCustomer, isProvider, isBizAdmin, isPlatformAdmin) {
  if (isCustomer) return 'cancelled_by_customer';
  if (isPlatformAdmin && !isProvider && !isBizAdmin) return 'cancelled_by_platform';
  return 'cancelled_by_provider';
}

test('CANCEL: customer cancels → cancelled_by_customer', () => {
  assert.strictEqual(determineCancelActor(true, false, false, false), 'cancelled_by_customer');
});

test('CANCEL: provider cancels → cancelled_by_provider', () => {
  assert.strictEqual(determineCancelActor(false, true, false, false), 'cancelled_by_provider');
});

test('CANCEL: business admin cancels → cancelled_by_provider', () => {
  assert.strictEqual(determineCancelActor(false, false, true, false), 'cancelled_by_provider');
});

test('CANCEL: platform admin cancels → cancelled_by_platform', () => {
  assert.strictEqual(determineCancelActor(false, false, false, true), 'cancelled_by_platform');
});

test('CANCEL: customer who is also provider → cancelled_by_customer', () => {
  assert.strictEqual(determineCancelActor(true, true, false, false), 'cancelled_by_customer');
});

// ═══════════════════════════════════════════════════════════
// NO-SHOW ACTOR IDENTIFICATION
// ═══════════════════════════════════════════════════════════

function determineNoShowActor(isProvider, isBizAdmin, isCustomer) {
  if (isProvider || isBizAdmin) return 'no_show_customer';
  if (isCustomer) return 'no_show_provider';
  return null;
}

test('NOSHOW: provider reports → no_show_customer', () => {
  assert.strictEqual(determineNoShowActor(true, false, false), 'no_show_customer');
});

test('NOSHOW: business admin reports → no_show_customer', () => {
  assert.strictEqual(determineNoShowActor(false, true, false), 'no_show_customer');
});

test('NOSHOW: customer reports → no_show_provider', () => {
  assert.strictEqual(determineNoShowActor(false, false, true), 'no_show_provider');
});

test('NOSHOW: unrelated user cannot report', () => {
  assert.strictEqual(determineNoShowActor(false, false, false), null);
});

// ═══════════════════════════════════════════════════════════
// SAME-PRICE RESCHEDULE VALIDATION
// ═══════════════════════════════════════════════════════════

function canReschedule(fromStatus, oldPrice, newPrice) {
  if (fromStatus !== 'scheduled' && fromStatus !== 'confirmed') return false;
  if (oldPrice !== newPrice) return false; // same-price only
  return true;
}

test('RESCHEDULE: scheduled booking same price → allowed', () => {
  assert.strictEqual(canReschedule('scheduled', 5000, 5000), true);
});

test('RESCHEDULE: confirmed booking same price → allowed', () => {
  assert.strictEqual(canReschedule('confirmed', 5000, 5000), true);
});

test('RESCHEDULE: different price → rejected', () => {
  assert.strictEqual(canReschedule('scheduled', 5000, 6000), false);
});

test('RESCHEDULE: draft booking → rejected', () => {
  assert.strictEqual(canReschedule('draft', 5000, 5000), false);
});

test('RESCHEDULE: completed booking → rejected', () => {
  assert.strictEqual(canReschedule('completed', 5000, 5000), false);
});

// ═══════════════════════════════════════════════════════════
// DUPLICATE PAYMENTINTENT / REFUND PREVENTION
// ═══════════════════════════════════════════════════════════

function shouldCreatePaymentIntent(booking) {
  if (booking.booking_status !== 'draft' &&
      booking.booking_status !== 'awaiting_payment' &&
      booking.booking_status !== 'payment_pending') {
    return false;
  }
  if (booking.payment_requirement !== 'required') return false;
  if (booking.payment_record_id) return false; // already has a payment record
  return true;
}

test('DEDUP: draft booking → can create PaymentIntent', () => {
  assert.strictEqual(shouldCreatePaymentIntent({
    booking_status: 'draft', payment_requirement: 'required', payment_record_id: null,
  }), true);
});

test('DEDUP: booking with existing payment_record_id → cannot create', () => {
  assert.strictEqual(shouldCreatePaymentIntent({
    booking_status: 'draft', payment_requirement: 'required', payment_record_id: 'pay-1',
  }), false);
});

test('DEDUP: confirmed booking → cannot create PaymentIntent', () => {
  assert.strictEqual(shouldCreatePaymentIntent({
    booking_status: 'confirmed', payment_requirement: 'required', payment_record_id: null,
  }), false);
});

test('DEDUP: not_required booking → cannot create PaymentIntent', () => {
  assert.strictEqual(shouldCreatePaymentIntent({
    booking_status: 'draft', payment_requirement: 'not_required', payment_record_id: null,
  }), false);
});

// ── Webhook idempotency ──
function shouldProcessWebhookEvent(existingEvent, paymentStatus) {
  if (existingEvent) return false; // already processed
  if (paymentStatus === 'succeeded') return false; // already succeeded
  return true;
}

test('DEDUP: new event + pending payment → process', () => {
  assert.strictEqual(shouldProcessWebhookEvent(false, 'pending'), true);
});

test('DEDUP: duplicate event → skip', () => {
  assert.strictEqual(shouldProcessWebhookEvent(true, 'pending'), false);
});

test('DEDUP: already succeeded payment → skip', () => {
  assert.strictEqual(shouldProcessWebhookEvent(false, 'succeeded'), false);
});

// ═══════════════════════════════════════════════════════════
// SLOT-HOLD / CALENDAR COLLISION DETECTION
// ═══════════════════════════════════════════════════════════

const ACTIVE_BOOKING_STATES = [
  'requested', 'accepted', 'awaiting_customer_confirmation',
  'awaiting_payment', 'payment_pending', 'confirmed', 'scheduled',
];

function hasSlotConflict(existingBookings, existingHolds, calendarEvents, startTime) {
  const hasBooking = existingBookings.some(b =>
    b.start_time === startTime && ACTIVE_BOOKING_STATES.includes(b.booking_status)
  );
  const hasHold = existingHolds.some(h =>
    h.start_time === startTime && h.status === 'active'
  );
  const hasCalendar = calendarEvents.some(e =>
    e.start_time === startTime && ['held', 'scheduled', 'upcoming', 'in_progress'].includes(e.lifecycle_state)
  );
  return hasBooking || hasHold || hasCalendar;
}

test('COLLISION: no conflicts → no collision', () => {
  assert.strictEqual(hasSlotConflict([], [], [], '2026-09-01T10:00:00Z'), false);
});

test('COLLISION: existing active hold → collision', () => {
  assert.strictEqual(hasSlotConflict(
    [],
    [{ start_time: '2026-09-01T10:00:00Z', status: 'active' }],
    [],
    '2026-09-01T10:00:00Z'
  ), true);
});

test('COLLISION: existing scheduled booking → collision', () => {
  assert.strictEqual(hasSlotConflict(
    [{ start_time: '2026-09-01T10:00:00Z', booking_status: 'scheduled' }],
    [],
    [],
    '2026-09-01T10:00:00Z'
  ), true);
});

test('COLLISION: existing calendar event → collision', () => {
  assert.strictEqual(hasSlotConflict(
    [],
    [],
    [{ start_time: '2026-09-01T10:00:00Z', lifecycle_state: 'scheduled' }],
    '2026-09-01T10:00:00Z'
  ), true);
});

test('COLLISION: cancelled booking → no collision', () => {
  assert.strictEqual(hasSlotConflict(
    [{ start_time: '2026-09-01T10:00:00Z', booking_status: 'cancelled_by_customer' }],
    [],
    [],
    '2026-09-01T10:00:00Z'
  ), false);
});

test('COLLISION: released hold → no collision', () => {
  assert.strictEqual(hasSlotConflict(
    [],
    [{ start_time: '2026-09-01T10:00:00Z', status: 'released' }],
    [],
    '2026-09-01T10:00:00Z'
  ), false);
});

test('COLLISION: cancelled calendar event → no collision', () => {
  assert.strictEqual(hasSlotConflict(
    [],
    [],
    [{ start_time: '2026-09-01T10:00:00Z', lifecycle_state: 'cancelled' }],
    '2026-09-01T10:00:00Z'
  ), false);
});

test('COLLISION: different time → no collision', () => {
  assert.strictEqual(hasSlotConflict(
    [{ start_time: '2026-09-01T10:00:00Z', booking_status: 'scheduled' }],
    [{ start_time: '2026-09-01T10:00:00Z', status: 'active' }],
    [{ start_time: '2026-09-01T10:00:00Z', lifecycle_state: 'scheduled' }],
    '2026-09-01T11:00:00Z'
  ), false);
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
console.log('\n═══════════════════════════════════════');
console.log(`Phase 5 Lifecycle + Fee Tests: ${passed} passed, ${failed} failed (${results.length} total)`);
console.log('═══════════════════════════════════════');

if (failed > 0) {
  console.log('\nFAILURES:');
  results.filter(r => !r.passed).forEach(r => {
    console.log(`  ✗ ${r.name}: ${r.error}`);
  });
  process.exit(1);
}