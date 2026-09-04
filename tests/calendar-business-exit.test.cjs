// Phase 3 — Business Relationship Exit (§109).
// ───────────────────────────────────────────────────────────
// Verifies: Calendar consumes authoritative Business relationship state.
// When a Business membership ends, Calendar removes the identity from
// assigned/invited lists on all affected Business events. Events are NOT
// deleted or cancelled. History is preserved. Calendar does NOT infer
// Business membership or own Business relationship state.
//
// Run with: node tests/calendar-business-exit.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const CF = path.join(__dirname, '..', 'cloud-functions', 'src', 'handleBusinessRelationshipExit.ts');
const INDEX = path.join(__dirname, '..', 'cloud-functions', 'src', 'index.ts');
const FNS = path.join(__dirname, '..', 'src', 'services', 'firebaseFunctions.js');

const cfSrc = fs.readFileSync(CF, 'utf8');
const indexSrc = fs.readFileSync(INDEX, 'utf8');
const fnsSrc = fs.readFileSync(FNS, 'utf8');

// ── Cloud function exists ────────────────────────────────────
test('CF: handleBusinessRelationshipExit exists as onCall', () => {
  if (!/export const handleBusinessRelationshipExit\s*=\s*onCall/.test(cfSrc)) {
    throw new Error('handleBusinessRelationshipExit must be an onCall export');
  }
});

test('CF: exported from index.ts', () => {
  if (!/handleBusinessRelationshipExit/.test(indexSrc)) {
    throw new Error('handleBusinessRelationshipExit must be exported from index.ts');
  }
});

test('CF: client-side callable wrapper exists', () => {
  if (!/callHandleBusinessRelationshipExit/.test(fnsSrc)) {
    throw new Error('callHandleBusinessRelationshipExit must exist in firebaseFunctions.js');
  }
});

// ── Validates input ──────────────────────────────────────────
test('CF: validates business_id + identity_id required', () => {
  if (!/business_id.*identity_id.*required|invalid-argument.*business_id/.test(cfSrc)) {
    throw new Error('Must validate business_id and identity_id');
  }
});

test('CF: validates reason (membership_removed/role_changed/business_deactivated)', () => {
  if (!/VALID_REASONS/.test(cfSrc)) {
    throw new Error('Must define VALID_REASONS');
  }
  for (const r of ['membership_removed', 'role_changed', 'business_deactivated']) {
    if (!new RegExp(`'${r}'`).test(cfSrc)) {
      throw new Error(`Must accept reason '${r}'`);
    }
  }
});

// ── Removes identity from event arrays ──────────────────────
test('CF: removes identity from assigned_identity_ids', () => {
  if (!/assigned_identity_ids.*filter/.test(cfSrc)) {
    throw new Error('Must filter identity from assigned_identity_ids');
  }
  if (!/removed_from_assigned/.test(cfSrc)) {
    throw new Error('Must track removed_from_assigned change');
  }
});

test('CF: removes identity from invited_identity_ids', () => {
  if (!/invited_identity_ids.*filter/.test(cfSrc)) {
    throw new Error('Must filter identity from invited_identity_ids');
  }
  if (!/removed_from_invited/.test(cfSrc)) {
    throw new Error('Must track removed_from_invited change');
  }
});

// ── Preserves events and history ─────────────────────────────
test('CF: does NOT delete or cancel events', () => {
  if (/\.delete\(\)/.test(cfSrc) && !/catch\(\(\)/.test(cfSrc)) {
    // refreshEventProjection uses .delete().catch() — that's OK (projection, not event)
    const eventDeleteMatch = /calendarEvents.*\.delete\(\)/.test(cfSrc);
    if (eventDeleteMatch) {
      throw new Error('Must NOT delete calendarEvents');
    }
  }
  if (/lifecycle_state.*cancelled/.test(cfSrc)) {
    throw new Error('Must NOT cancel events (lifecycle_state unchanged)');
  }
});

test('CF: appends schedule history (preserved)', () => {
  if (!/appendScheduleHistory/.test(cfSrc)) {
    throw new Error('Must append schedule history');
  }
  if (!/participant_removed/.test(cfSrc)) {
    throw new Error('Must record participant_removed in history');
  }
});

test('CF: refreshes public projection after changes', () => {
  if (!/refreshEventProjection/.test(cfSrc)) {
    throw new Error('Must refresh public projection');
  }
});

// ── Revokes participation records ───────────────────────────
test('CF: revokes participation records for invited events', () => {
  if (!/revokeParticipationRecords/.test(cfSrc)) {
    throw new Error('Must revoke participation records for removed invitees');
  }
});

// ── Does NOT infer Business membership ──────────────────────
test('CF: does NOT query businessMemberships (Calendar does not infer membership)', () => {
  if (/businessMemberships/.test(cfSrc)) {
    throw new Error('Must NOT query businessMemberships — Calendar does not infer Business membership');
  }
});

test('CF: queries calendarEvents by business_id + array-contains (not by membership)', () => {
  if (!/business_id.*==/.test(cfSrc)) {
    throw new Error('Must query by business_id');
  }
  if (!/assigned_identity_ids.*array-contains/.test(cfSrc) && !/invited_identity_ids.*array-contains/.test(cfSrc)) {
    throw new Error('Must query by array-contains on assigned/invited');
  }
});

// ── Failure isolation ───────────────────────────────────────
test('CF: assigned and invited queries are isolated (one failure does not block the other)', () => {
  if (!/try\s*\{[\s\S]*?assigned_identity_ids[\s\S]*?\}\s*catch/.test(cfSrc)) {
    throw new Error('Assigned query must be try/catch wrapped');
  }
  if (!/try\s*\{[\s\S]*?invited_identity_ids[\s\S]*?\}\s*catch/.test(cfSrc)) {
    throw new Error('Invited query must be try/catch wrapped');
  }
});

// ── Deduplication ────────────────────────────────────────────
test('CF: deduplicates affected events by Event ID (event may be in both assigned + invited)', () => {
  if (!/affectedEvents\.find\(\(e\)\s*=>\s*e\.id\s*===\s*doc\.id\)/.test(cfSrc)) {
    throw new Error('Must deduplicate affected events by Event ID');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);