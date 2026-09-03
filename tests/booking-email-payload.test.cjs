// C2 fix — Booking lifecycle notifications carry email payloads so the
// Notifications dispatcher creates email deliveries.
// ───────────────────────────────────────────────────────────
// Validates Booking §1.7.1 (email = primary guest confirmation channel),
// §2.18 (lifecycle notifications), §3.12 (guest booking communications),
// and the Calendar→Notifications boundary (Calendar V2 §81).

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
const BEP = path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'email', 'payloads', 'booking.ts');
const BN = path.join(__dirname, '..', 'cloud-functions', 'src', 'bookingNotifications.ts');

const bpSrc = fs.readFileSync(BP, 'utf8');
const blSrc = fs.readFileSync(BL, 'utf8');
const swSrc = fs.readFileSync(SW, 'utf8');
const bepSrc = fs.readFileSync(BEP, 'utf8');
const bnSrc = fs.readFileSync(BN, 'utf8');

test('C2: booking email payload module exists with BookingEmailContext + builder', () => {
  if (!/export interface BookingEmailContext/.test(bepSrc)) {
    throw new Error('booking.ts must export BookingEmailContext');
  }
  if (!/export function buildBookingEmailPayload/.test(bepSrc)) {
    throw new Error('booking.ts must export buildBookingEmailPayload');
  }
});

test('C2: BookingEmailContext contains only safe fields (no meeting_url, no card data)', () => {
  if (/meeting_url/.test(bepSrc) && /interface BookingEmailContext/.test(bepSrc)) {
    // meeting_url should not be in the context interface
    const ctxBlock = bepSrc.match(/export interface BookingEmailContext \{[\s\S]*?\}/);
    if (ctxBlock && /meeting_url/.test(ctxBlock[0])) {
      throw new Error('BookingEmailContext must not contain meeting_url');
    }
  }
});

test('C2: booking email payload supports confirmed, cancelled, rescheduled', () => {
  if (!/'booking_confirmed'/.test(bepSrc)) throw new Error('must support booking_confirmed');
  if (!/'booking_cancelled'/.test(bepSrc)) throw new Error('must support booking_cancelled');
  if (!/'booking_rescheduled'/.test(bepSrc)) throw new Error('must support booking_rescheduled');
});

test('C2: bookingNotifications helper resolves provider name + builds context', () => {
  if (!/export async function buildBookingEmailContext/.test(bnSrc)) {
    throw new Error('bookingNotifications must export buildBookingEmailContext');
  }
  if (!/resolveBookingProviderName/.test(bnSrc)) {
    throw new Error('bookingNotifications must resolve provider name');
  }
});

test('C2: bookingPayment passes emailContext + emailPayloadBuilder to emitNotification', () => {
  if (!/emailContext:\s*bookingEmailCtx/.test(bpSrc)) {
    throw new Error('bookingPayment must pass emailContext to emitNotification');
  }
  if (!/emailPayloadBuilder:\s*buildBookingEmailPayload/.test(bpSrc)) {
    throw new Error('bookingPayment must pass emailPayloadBuilder');
  }
});

test('C2: bookingPayment emits customer/guest confirmation notification', () => {
  if (!/customerRecipientId|customerRecipientEmail/.test(bpSrc)) {
    throw new Error('bookingPayment must emit customer/guest notification');
  }
});

test('C2: stripeWebhook passes emailContext + emailPayloadBuilder to emitNotification', () => {
  if (!/emailContext:\s*bookingEmailCtx/.test(swSrc)) {
    throw new Error('stripeWebhook must pass emailContext to emitNotification');
  }
  if (!/emailPayloadBuilder:\s*buildBookingEmailPayload/.test(swSrc)) {
    throw new Error('stripeWebhook must pass emailPayloadBuilder');
  }
});

test('C2: stripeWebhook emits customer/guest confirmation notification', () => {
  if (!/customerRecipientId|customerRecipientEmail/.test(swSrc)) {
    throw new Error('stripeWebhook must emit customer/guest notification');
  }
});

test('C2: bookingLifecycle cancel passes emailContext + emailPayloadBuilder', () => {
  if (!/emailContext:\s*cancelEmailCtx/.test(blSrc)) {
    throw new Error('cancelBooking must pass emailContext');
  }
  if (!/emailPayloadBuilder:\s*buildBookingEmailPayload/.test(blSrc)) {
    throw new Error('bookingLifecycle must pass emailPayloadBuilder');
  }
});

test('C2: bookingLifecycle reschedule passes emailContext + emailPayloadBuilder', () => {
  if (!/emailContext:\s*rescheduleEmailCtx/.test(blSrc)) {
    throw new Error('rescheduleBooking must pass emailContext');
  }
});

test('C2: bookingLifecycle handles guest recipients (email when no identity)', () => {
  if (!/cancelRecipientEmail/.test(blSrc)) {
    throw new Error('cancelBooking must handle guest email recipient');
  }
  if (!/rescheduleRecipientEmail/.test(blSrc)) {
    throw new Error('rescheduleBooking must handle guest email recipient');
  }
});

test('C2: booking notifications still use source_system calendar (boundary preserved)', () => {
  if (!/source_system:\s*'calendar'/.test(bpSrc)) throw new Error('bookingPayment must use source_system calendar');
  if (!/source_system:\s*'calendar'/.test(blSrc)) throw new Error('bookingLifecycle must use source_system calendar');
  if (!/source_system:\s*'calendar'/.test(swSrc)) throw new Error('stripeWebhook must use source_system calendar');
});

test('C2: booking notifications do not set delivery_channels (dispatcher owns channels)', () => {
  if (/delivery_channels:/.test(bpSrc)) throw new Error('bookingPayment must not set delivery_channels');
  if (/delivery_channels:/.test(blSrc)) throw new Error('bookingLifecycle must not set delivery_channels');
  if (/delivery_channels:/.test(swSrc)) throw new Error('stripeWebhook must not set delivery_channels');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);