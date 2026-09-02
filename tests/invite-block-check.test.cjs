// Phase 1 (§87) — Trust restrictions on shared Event participation.
// ───────────────────────────────────────────────────────────
// saveCalendarEvent consumes the authoritative BlockRecord and excludes
// blocked identities from invitations (create + update paths).

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const CF = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEvent.ts');
const cfSrc = fs.readFileSync(CF, 'utf8');

test('calendarEvent imports isBlocked from shared', () => {
  if (!/isBlocked/.test(cfSrc)) {
    throw new Error('calendarEvent must import isBlocked');
  }
  if (!/from '\.\/shared'/.test(cfSrc)) {
    throw new Error('isBlocked must come from ./shared');
  }
});

test('filterBlockedIdentities helper is defined', () => {
  if (!/async function filterBlockedIdentities/.test(cfSrc)) {
    throw new Error('filterBlockedIdentities helper missing');
  }
  if (!/isBlocked\(callerId,\s*id\)/.test(cfSrc)) {
    throw new Error('filterBlockedIdentities must call isBlocked');
  }
});

test('create path filters blocked identities from invitations', () => {
  if (!/await filterBlockedIdentities\(callerIdentityId,\s*invitedIdentityIds\)/.test(cfSrc)) {
    throw new Error('create path must filter invitedIdentityIds through filterBlockedIdentities');
  }
});

test('update path filters blocked identities from invitations', () => {
  if (!/'invited_identity_ids' in updatePayload/.test(cfSrc)) {
    throw new Error('update path must guard invited_identity_ids presence');
  }
  if (!/await filterBlockedIdentities\(callerIdentityId,\s*updatePayload\.invited_identity_ids\)/.test(cfSrc)) {
    throw new Error('update path must filter invited_identity_ids through filterBlockedIdentities');
  }
});

test('block check is referenced as a Trust restriction (§87)', () => {
  if (!/§87/.test(cfSrc)) {
    throw new Error('calendarEvent must reference §87 trust restriction');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);