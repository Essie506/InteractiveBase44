// Phase 2 (C5) — Public availability derived from Calendar (§31, §75, §76).
// ───────────────────────────────────────────────────────────
// Asserts Calendar exposes a privacy-safe derived availability status
// (Available / Next Available / None) from AvailabilityRule, for
// Profile/Directory consumption — replacing the hand-entered source of truth.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const AV = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarAvailability.ts');
const avSrc = fs.readFileSync(AV, 'utf8');

test('calendarAvailability exposes getPublicAvailabilityStatus', () => {
  if (!/export async function getPublicAvailabilityStatus/.test(avSrc)) throw new Error('getPublicAvailabilityStatus missing');
});

test('public availability derives from AvailabilityRule (not hand-entered hours)', () => {
  if (!/availabilityRules/.test(avSrc)) throw new Error('must read availabilityRules');
  if (!/working_hours/.test(avSrc)) throw new Error('must derive from working_hours');
});

test('public availability returns a state (available/next_available/none)', () => {
  if (!/state:/.test(avSrc)) throw new Error('must return a state');
  if (!/next_available/.test(avSrc)) throw new Error('must support next_available state');
  if (!/'none'/.test(avSrc)) throw new Error('must support none state');
});

test('public availability is privacy-safe (no private event detail exposed)', () => {
  // meeting_url must not appear as a projected/returned field (comment mentions are fine).
  if (/meeting_url:/.test(avSrc)) throw new Error('must not expose meeting_url as a field');
  if (/invited_identity_ids:/.test(avSrc)) throw new Error('must not expose invited identities as a field');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);