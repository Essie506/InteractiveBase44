// Phase 2 (C2) — Overlap-range conflict detection (§29, §37, §39).
// ───────────────────────────────────────────────────────────
// Asserts conflict detection uses range overlap (not exact start_time
// equality) so partially overlapping commitments are detected, and that
// checks run inside the transaction for concurrency safety.

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
const AV = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarAvailability.ts');
const bpSrc = fs.readFileSync(BP, 'utf8');
const blSrc = fs.readFileSync(BL, 'utf8');
const avSrc = fs.readFileSync(AV, 'utf8');

test('calendarAvailability module defines overlap helpers', () => {
  for (const fn of ['hasOverlappingEvent', 'hasOverlappingHold', 'hasOverlappingBooking']) {
    if (!new RegExp(`export async function ${fn}`).test(avSrc)) throw new Error(`${fn} must be exported`);
  }
});

test('overlap helpers use range query (start_time < end) not exact equality', () => {
  if (!/where\('start_time', '<', endIso\)/.test(avSrc)) throw new Error('must query start_time < endIso');
  if (/where\('start_time', '==',/.test(avSrc)) throw new Error('must not use exact start_time equality');
});

test('overlap helpers filter end_time > start in memory', () => {
  if (!/end_time.*\)\.getTime\(\) > startMs/.test(avSrc)) throw new Error('must filter end_time > start in memory');
});

test('createBookingDraft uses overlap helpers (not exact-time)', () => {
  if (!/hasOverlappingHold\(tx, provider_identity_id/.test(bpSrc)) throw new Error('must use hasOverlappingHold');
  if (!/hasOverlappingBooking\(tx, provider_identity_id/.test(bpSrc)) throw new Error('must use hasOverlappingBooking');
  if (!/hasOverlappingEvent\(tx, calendarOwner/.test(bpSrc)) throw new Error('must use hasOverlappingEvent');
  if (/where\('start_time', '==', start_time\)/.test(bpSrc)) throw new Error('exact-time conflict check must be removed');
});

test('rescheduleBooking uses overlap helpers with self-exclusion', () => {
  if (!/hasOverlappingHold\(tx, booking\.provider_identity_id, new_start_time, new_end_time, booking\.hold_id\)/.test(blSrc)) throw new Error('must exclude own hold');
  if (!/hasOverlappingBooking\(tx, booking\.provider_identity_id, new_start_time, new_end_time, booking_id\)/.test(blSrc)) throw new Error('must exclude own booking');
  if (!/hasOverlappingEvent\(tx, calendarOwner, new_start_time, new_end_time, booking\.calendar_event_id\)/.test(blSrc)) throw new Error('must exclude own event');
  if (/where\('start_time', '==', new_start_time\)/.test(blSrc)) throw new Error('exact-time conflict check must be removed');
});

test('conflict checks run inside the transaction (concurrency safety)', () => {
  if (!/hasOverlappingHold\(tx,/.test(bpSrc)) throw new Error('overlap check must use tx');
  if (!/hasOverlappingHold\(tx,/.test(blSrc)) throw new Error('overlap check must use tx');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);