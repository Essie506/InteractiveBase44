// Phase 1 (C1) — Booking-driven Calendar notifications use the dispatcher.
// ───────────────────────────────────────────────────────────
// Asserts bookingPayment.ts, bookingLifecycle.ts, stripeWebhook.ts route
// booking notification events through emitNotification (Notifications owns
// creation/channel/preference/delivery) and no longer write
// notificationRecords inline. §81, §124.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const BP = path.join(__dirname, '..', 'cloud-functions', 'src', 'bookingPayment.ts');
const BL = path.join(__dirname, '..', 'cloud-functions', 'src', 'bookingLifecycle.ts');
const SW = path.join(__dirname, '..', 'cloud-functions', 'src', 'stripeWebhook.ts');

const bpSrc = fs.readFileSync(BP, 'utf8');
const blSrc = fs.readFileSync(BL, 'utf8');
const swSrc = fs.readFileSync(SW, 'utf8');

test('bookingLifecycle imports emitNotification from the dispatcher', () => {
  if (!/import \{ emitNotification \} from '\.\/notifications\/dispatcher'/.test(blSrc)) {
    throw new Error('bookingLifecycle must import emitNotification');
  }
});
test('bookingPayment imports emitNotification from the dispatcher', () => {
  if (!/import \{ emitNotification \} from '\.\/notifications\/dispatcher'/.test(bpSrc)) {
    throw new Error('bookingPayment must import emitNotification');
  }
});
test('stripeWebhook imports emitNotification from the dispatcher', () => {
  if (!/import \{ emitNotification \} from '\.\/notifications\/dispatcher'/.test(swSrc)) {
    throw new Error('stripeWebhook must import emitNotification');
  }
});

test('bookingLifecycle no longer writes notificationRecords inline', () => {
  if (/db\.collection\('notificationRecords'\)/.test(blSrc)) {
    throw new Error('bookingLifecycle must not write notificationRecords directly');
  }
});
test('bookingPayment no longer writes notificationRecords inline', () => {
  if (/db\.collection\('notificationRecords'\)/.test(bpSrc)) {
    throw new Error('bookingPayment must not write notificationRecords directly');
  }
});
test('stripeWebhook no longer writes notificationRecords inline', () => {
  if (/db\.collection\('notificationRecords'\)/.test(swSrc)) {
    throw new Error('stripeWebhook must not write notificationRecords directly');
  }
});

test('booking notifications use source_system calendar (not messaging)', () => {
  if (!/source_system:\s*'calendar'/.test(blSrc)) throw new Error('bookingLifecycle must use source_system calendar');
  if (!/source_system:\s*'calendar'/.test(bpSrc)) throw new Error('bookingPayment must use source_system calendar');
  if (!/source_system:\s*'calendar'/.test(swSrc)) throw new Error('stripeWebhook must use source_system calendar');
});

test('booking notification event types are emitted via the dispatcher', () => {
  if (!/event_type:\s*'booking_cancelled'/.test(blSrc)) throw new Error('cancel must emit booking_cancelled');
  if (!/event_type:\s*'booking_rescheduled'/.test(blSrc)) throw new Error('reschedule must emit booking_rescheduled');
  if (!/event_type:\s*'booking_confirmed'/.test(bpSrc)) throw new Error('confirmFree must emit booking_confirmed');
  if (!/event_type:\s*'booking_confirmed'/.test(swSrc)) throw new Error('webhook must emit booking_confirmed');
});

test('booking notifications call emitNotification', () => {
  const blCalls = (blSrc.match(/emitNotification\(/g) || []).length;
  const bpCalls = (bpSrc.match(/emitNotification\(/g) || []).length;
  const swCalls = (swSrc.match(/emitNotification\(/g) || []).length;
  if (blCalls < 2) throw new Error(`bookingLifecycle must call emitNotification >=2 (got ${blCalls})`);
  if (bpCalls < 1) throw new Error(`bookingPayment must call emitNotification >=1 (got ${bpCalls})`);
  if (swCalls < 1) throw new Error(`stripeWebhook must call emitNotification >=1 (got ${swCalls})`);
});

test('booking notifications do not set delivery_channels inline (dispatcher owns channels)', () => {
  if (/delivery_channels:\s*\['in_app'\]/.test(blSrc)) throw new Error('bookingLifecycle must not set delivery_channels');
  if (/delivery_channels:\s*\['in_app'\]/.test(bpSrc)) throw new Error('bookingPayment must not set delivery_channels');
  if (/delivery_channels:\s*\['in_app'\]/.test(swSrc)) throw new Error('stripeWebhook must not set delivery_channels');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);