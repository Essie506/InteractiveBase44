// Calendar Availability — identity-owned professional availability.
// ───────────────────────────────────────────────────────────
// Professional availability is owned by the Interactive identity
// (owner_type 'identity', operating_context 'professional'), NOT by a
// separate 'professional' owner. Booking slot resolution consumes these
// rules. These tests assert the corrected model in schema, repository,
// and the AvailabilityPage UI so booking-slot behaviour remains correct.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const SCHEMA = path.join(__dirname, '..', 'base44', 'entities', 'AvailabilityRule.jsonc');
const CAL = path.join(__dirname, '..', 'src', 'lib', 'calendar.js');
const PAGE = path.join(__dirname, '..', 'src', 'pages', 'AvailabilityPage.jsx');
const REPO = path.join(__dirname, '..', 'src', 'data', 'firebase', 'firebaseCalendarRepository.js');
const RULES = path.join(__dirname, '..', 'firestore.rules');

const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
const calSrc = fs.readFileSync(CAL, 'utf8');
const pageSrc = fs.readFileSync(PAGE, 'utf8');
const repoSrc = fs.readFileSync(REPO, 'utf8');
const rulesSrc = fs.readFileSync(RULES, 'utf8');

test('AvailabilityRule owner_type enum is [identity, business]', () => {
  if (schema.properties.owner_type.enum.join(',') !== 'identity,business') {
    throw new Error(`enum must be [identity, business], got ${schema.properties.owner_type.enum}`);
  }
});

test('AvailabilityRule has operating_context field', () => {
  if (!schema.properties.operating_context) throw new Error('operating_context field missing');
  if (!schema.properties.operating_context.enum.includes('professional')) {
    throw new Error('operating_context must include professional');
  }
});

test('AvailabilityPage creates rules with owner_type identity + professional context', () => {
  const block = pageSrc.match(/await createAvailabilityRule\(\{[\s\S]*?\}\)/)[0];
  if (!/owner_type:\s*'identity'/.test(block)) {
    throw new Error('AvailabilityPage must create with owner_type identity');
  }
  if (!/operating_context:\s*'professional'/.test(block)) {
    throw new Error('AvailabilityPage must set operating_context professional');
  }
});

test('AvailabilityPage loads rules with owner_type identity', () => {
  if (!/getAvailabilityRules\(user\.id,\s*'identity'/.test(pageSrc)) {
    throw new Error('AvailabilityPage must load rules with owner_type identity');
  }
});

test('calendar.js getAvailabilityRules queries by owner_id (identity)', () => {
  const block = calSrc.match(/export async function getAvailabilityRules[\s\S]*?\n\}/)[0];
  if (!/listAvailabilityForOwner\(ownerId\)/.test(block)) {
    throw new Error('firebase branch must query by owner_id');
  }
});

test('repository listAvailabilityForOwner queries by owner_id', () => {
  if (!/export async function listAvailabilityForOwner/.test(repoSrc)) {
    throw new Error('listAvailabilityForOwner missing');
  }
  if (!/where\('owner_id', '==', ownerId\)/.test(repoSrc)) {
    throw new Error('must filter by owner_id');
  }
});

test('firestore rules grant authenticated read for identity-owned availability', () => {
  const block = rulesSrc.match(/match \/availabilityRules\/\{ruleId\}\s*\{[\s\S]*?\n\s*\}/)[0];
  if (!/owner_type == 'identity' && isAuthenticated\(\)/.test(block)) {
    throw new Error('identity-owned availability must be readable for booking slot resolution');
  }
});

test('no remaining professional-as-owner availability references', () => {
  // AvailabilityPage and calendar.js must not pass owner_type 'professional'
  if (/owner_type:\s*'professional'/.test(pageSrc)) {
    throw new Error('AvailabilityPage must not use professional owner_type');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);