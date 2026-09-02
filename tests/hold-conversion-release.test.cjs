// Phase 1 (C6) — Converted holds do not remain as duplicate blocked periods (§35).
// ───────────────────────────────────────────────────────────
// When a booking converts a hold into a committed Calendar event (or
// attaches to event-booking capacity), the hold is released, not left in
// a 'confirmed' blocking state.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const BP = path.join(__dirname, '..', 'cloud-functions', 'src', 'bookingPayment.ts');
const SW = path.join(__dirname, '..', 'cloud-functions', 'src', 'stripeWebhook.ts');
const bpSrc = fs.readFileSync(BP, 'utf8');
const swSrc = fs.readFileSync(SW, 'utf8');

test('confirmFreeBooking releases the hold on conversion', () => {
  if (!/slotHolds'\)\.doc\(booking\.hold_id\)\.update\(\{\s*status: 'released'/.test(bpSrc)) {
    throw new Error('confirmFreeBooking must release (not confirm) the hold');
  }
});
test('confirmFreeBooking no longer leaves the hold in confirmed state', () => {
  if (/slotHolds'\)\.doc\(booking\.hold_id\)\.update\(\{\s*status: 'confirmed'/.test(bpSrc)) {
    throw new Error('confirmFreeBooking must not leave hold as confirmed');
  }
});
test('handlePaymentSuccess releases the hold on conversion', () => {
  if (!/slotHolds'\)\.doc\(booking\.hold_id\)\.update\(\{\s*status: 'released'/.test(swSrc)) {
    throw new Error('handlePaymentSuccess must release (not confirm) the hold');
  }
});
test('handlePaymentSuccess no longer leaves the hold in confirmed state', () => {
  if (/slotHolds'\)\.doc\(booking\.hold_id\)\.update\(\{\s*status: 'confirmed'/.test(swSrc)) {
    throw new Error('handlePaymentSuccess must not leave hold as confirmed');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);