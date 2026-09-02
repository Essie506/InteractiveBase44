// Phase 2 (C3) — Booking consumes Calendar-authoritative availability (§27, §32).
// ───────────────────────────────────────────────────────────
// Asserts Booking requests availability from Calendar (evaluateAvailabilityRule)
// before holding a slot, and that Calendar evaluates AvailabilityRule
// (working_hours + unavailable/blocked + exceptions).

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

test('calendarAvailability defines evaluateAvailabilityRule', () => {
  if (!/export async function evaluateAvailabilityRule/.test(avSrc)) throw new Error('evaluateAvailabilityRule missing');
});

test('evaluateAvailabilityRule consumes AvailabilityRule working_hours + blocked', () => {
  if (!/working_hours/.test(avSrc)) throw new Error('must check working_hours');
  if (!/unavailable|blocked/.test(avSrc)) throw new Error('must check blocked rules');
  if (!/availabilityRules/.test(avSrc)) throw new Error('must read availabilityRules');
});

test('createBookingDraft requests availability from Calendar before holding', () => {
  if (!/evaluateAvailabilityRule\(calendarOwner/.test(bpSrc)) throw new Error('createBookingDraft must call evaluateAvailabilityRule');
  if (!/Slot is not available/.test(bpSrc)) throw new Error('must reject ineligible slots');
});

test('rescheduleBooking requests availability for the new slot', () => {
  if (!/evaluateAvailabilityRule\(calendarOwner/.test(blSrc)) throw new Error('rescheduleBooking must call evaluateAvailabilityRule');
  if (!/New slot is not available/.test(blSrc)) throw new Error('must reject ineligible new slots');
});

test('no working hours configured → no restriction (eligible by default)', () => {
  if (!/workingHours\.length/.test(avSrc)) throw new Error('must branch on workingHours.length');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);