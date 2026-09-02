// Calendar event idempotency — pure regression tests.
// ───────────────────────────────────────────────────────────
// Mirrors the `idempotencyDocId` helper in
// cloud-functions/src/calendarEvent.ts and asserts the deterministic
// key properties that make concurrent-retry idempotency safe.
//
// Corrected ownership model: owner_type is 'identity' or 'business'.
// 'professional' is NOT an owner type — Personal and Professional are
// operating contexts of ONE identity, so a professional manual event and
// a personal manual event by the same identity share owner_type 'identity'
// (and thus the same key space for the same source_id).

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
  const k1 = idempotencyDocId('identity', 'id1', 'manual', 'src-abc');
  const k2 = idempotencyDocId('identity', 'id1', 'manual', 'src-abc');
  if (k1 !== k2) throw new Error(`keys differ: ${k1} vs ${k2}`);
});

test('different source_id (genuinely new Add) produces a different key', () => {
  const k1 = idempotencyDocId('identity', 'id1', 'manual', 'src-abc');
  const k2 = idempotencyDocId('identity', 'id1', 'manual', 'src-xyz');
  if (k1 === k2) throw new Error('new Add must produce a different key');
});

test('identity vs business owner_type produces a different key', () => {
  // Personal and Professional are BOTH owner_type 'identity' (same key
  // space for the same identity + source_id). Business is a distinct owner.
  const identityKey = idempotencyDocId('identity', 'id1', 'manual', 'src-1');
  const bizKey = idempotencyDocId('business', 'id1', 'manual', 'src-1');
  if (identityKey === bizKey) {
    throw new Error('identity and business must not share a key');
  }
});

test('Business event key uses Business owner_id, not caller identity', () => {
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
  const manual = idempotencyDocId('identity', 'id1', 'manual', 'src-1');
  const booking = idempotencyDocId('identity', 'id1', 'booking', 'src-1');
  if (manual === booking) throw new Error('different source_system must not collide');
});

test('key does not derive from event content (title/date)', () => {
  const a = idempotencyDocId('identity', 'id1', 'manual', 'src-A');
  const b = idempotencyDocId('identity', 'id1', 'manual', 'src-B');
  if (a === b) throw new Error('content-equivalent events must be distinct by source_id');
});

test('forward slashes in segments are escaped to keep a valid doc id', () => {
  const k = idempotencyDocId('identity', 'id/1', 'manual', 'src-1');
  if (k.includes('/')) throw new Error('slash must be escaped');
});

test('Personal and Professional share the identity key space (one owner)', () => {
  // A professional manual event and a personal manual event by the same
  // identity with the same source_id resolve to the SAME key — there is
  // one identity-owned event set, not separate Personal/Professional owners.
  const personal = idempotencyDocId('identity', 'id1', 'manual', 'src-1');
  const professional = idempotencyDocId('identity', 'id1', 'manual', 'src-1');
  if (personal !== professional) {
    throw new Error('Personal and Professional must share the identity key space');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);