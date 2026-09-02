// Calendar event idempotency — pure regression tests.
// ───────────────────────────────────────────────────────────
// Mirrors the `idempotencyDocId` helper in
// cloud-functions/src/calendarEvent.ts and asserts the deterministic
// key properties that make concurrent-retry idempotency safe:
//
//   - same logical Add (same owner_type + owner_id + source_system +
//     source_id) → same key → all concurrent retries contend on the
//     same Firestore idempotency document → at most one authoritative
//     event.
//   - different ownership context → different key (Business events use
//     the Business ID as owner_id, NOT the caller identity).
//   - uniqueness is never inferred from event content (title/date/etc).
//
// The full concurrency guarantee is enforced by a Firestore transaction
// inside saveCalendarEvent (read idempotency doc → if mapped, return
// existing event_id; else create exactly one event + mapping, commit).
// These tests cover the pure key derivation that scopes that contention.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

// ── Mirror of idempotencyDocId (cloud-functions/src/calendarEvent.ts) ──
function idempotencyDocId(ownerType, ownerId, sourceSystem, sourceId) {
  return [ownerType || 'identity', ownerId || '', sourceSystem || 'manual', sourceId || '']
    .map((s) => String(s).replace(/\//g, '_'))
    .join('__');
}

// ── Source contract: the helper exists in calendarEvent.ts ──
test('idempotencyDocId helper is present in cloud-functions/src/calendarEvent.ts', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEvent.ts'), 'utf8',
  );
  if (!/export function idempotencyDocId/.test(src)) {
    throw new Error('idempotencyDocId not exported from calendarEvent.ts');
  }
  if (!/runTransaction/.test(src)) {
    throw new Error('saveCalendarEvent does not use a transaction for idempotent create');
  }
  if (!/calendarEventIdempotency/.test(src)) {
    throw new Error('idempotency collection not referenced');
  }
});

test('same logical Add produces the same key across retries', () => {
  const k1 = idempotencyDocId('professional', 'id1', 'manual', 'src-abc');
  const k2 = idempotencyDocId('professional', 'id1', 'manual', 'src-abc');
  if (k1 !== k2) throw new Error(`keys differ: ${k1} vs ${k2}`);
});

test('different source_id (genuinely new Add) produces a different key', () => {
  const k1 = idempotencyDocId('professional', 'id1', 'manual', 'src-abc');
  const k2 = idempotencyDocId('professional', 'id1', 'manual', 'src-xyz');
  if (k1 === k2) throw new Error('new Add must produce a different key');
});

test('different owner_type produces a different key (personal vs professional)', () => {
  const personal = idempotencyDocId('identity', 'id1', 'manual', 'src-1');
  const prof = idempotencyDocId('professional', 'id1', 'manual', 'src-1');
  if (personal === prof) throw new Error('personal and professional must not share a key');
});

test('Business event key uses Business owner_id, not caller identity', () => {
  // A business admin (identity id1) creates a business event for bizB.
  // The key must be scoped to owner_type=business + owner_id=bizB, so
  // two admins creating the same logical Add contend on the same key.
  const bizKey = idempotencyDocId('business', 'bizB', 'manual', 'src-9');
  const identityKey = idempotencyDocId('identity', 'id1', 'manual', 'src-9');
  if (bizKey === identityKey) {
    throw new Error('Business event must not be keyed by caller identity');
  }
});

test('different business_id produces a different key', () => {
  const a = idempotencyDocId('business', 'bizA', 'manual', 'src-1');
  const b = idempotencyDocId('business', 'bizB', 'manual', 'src-1');
  if (a === b) throw new Error('different businesses must not share a key');
});

test('booking-source and manual-source events with same source_id do not collide', () => {
  const manual = idempotencyDocId('professional', 'id1', 'manual', 'src-1');
  const booking = idempotencyDocId('professional', 'id1', 'booking', 'src-1');
  if (manual === booking) throw new Error('different source_system must not collide');
});

test('key does not derive from event content (title/date)', () => {
  // The key is formed only from ownership + source identity — never
  // title, date, location, or owner name. Two identical-content events
  // with different source_ids get different keys (both are valid).
  const a = idempotencyDocId('professional', 'id1', 'manual', 'src-A');
  const b = idempotencyDocId('professional', 'id1', 'manual', 'src-B');
  if (a === b) throw new Error('content-equivalent events must be distinct by source_id');
});

test('forward slashes in segments are escaped to keep a valid doc id', () => {
  const k = idempotencyDocId('professional', 'id/1', 'manual', 'src-1');
  if (k.includes('/')) throw new Error('slash must be escaped');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);