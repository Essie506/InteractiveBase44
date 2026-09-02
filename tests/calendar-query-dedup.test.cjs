// Calendar query de-duplication — pure regression tests.
// ───────────────────────────────────────────────────────────
// Mirrors the `dedupeEventsById` helper in src/lib/calendar.js and the
// owner_type-scoped query fix in firebaseCalendarRepository.listEventsForOwner.
//
// Root cause being guarded: getAllEventsForIdentity in Professional
// context calls getEvents(identityId,'identity') AND
// getEvents(identityId,'professional'). Before the fix both queries
// filtered only by owner_id, so a professional event (owner_id ==
// identityId, owner_type == 'professional') was returned by BOTH
// queries and merged twice. The primary fix is the owner_type filter;
// dedupeEventsById is a defensive guard that collapses any residual
// overlap by authoritative Event ID.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

// ── Mirror of dedupeEventsById (src/lib/calendar.js) ──
function dedupeEventsById(events) {
  const byId = new Map();
  for (const e of events) {
    if (!e) continue;
    const key = e.id;
    if (!byId.has(key)) byId.set(key, e);
  }
  return Array.from(byId.values());
}

// ── Source contract: the helper exists in calendar.js ──
test('dedupeEventsById helper is present in src/lib/calendar.js', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'calendar.js'), 'utf8',
  );
  if (!/export function dedupeEventsById/.test(src)) {
    throw new Error('dedupeEventsById not exported from src/lib/calendar.js');
  }
});

// ── Source contract: listEventsForOwner filters by owner_type ──
test('listEventsForOwner filters by owner_type in firebaseCalendarRepository.js', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'data', 'firebase', 'firebaseCalendarRepository.js'), 'utf8',
  );
  if (!/where\('owner_type', '==', ownerType\)/.test(src)) {
    throw new Error('listEventsForOwner does not filter by owner_type');
  }
});

test('personal event renders once', () => {
  const events = [{ id: 'a', title: 'Personal', owner_type: 'identity' }];
  const deduped = dedupeEventsById(events);
  if (deduped.length !== 1) throw new Error(`expected 1, got ${deduped.length}`);
});

test('professional event renders once when returned by both queries', () => {
  // Simulate the pre-fix overlap: the same professional event returned by
  // both the 'identity' and 'professional' queries.
  const profEvent = { id: 'p1', title: 'Prof', owner_type: 'professional', owner_id: 'id1' };
  const merged = [profEvent, profEvent];
  const deduped = dedupeEventsById(merged);
  if (deduped.length !== 1) throw new Error(`expected 1, got ${deduped.length}`);
  if (deduped[0].id !== 'p1') throw new Error('wrong event retained');
});

test('personal and professional events coexist and each render once', () => {
  const personal = { id: 'pe1', title: 'Personal', owner_type: 'identity' };
  const prof = { id: 'pf1', title: 'Prof', owner_type: 'professional' };
  const deduped = dedupeEventsById([personal, prof, prof, personal]);
  if (deduped.length !== 2) throw new Error(`expected 2, got ${deduped.length}`);
  const ids = deduped.map(e => e.id).sort();
  if (ids.join(',') !== 'pe1,pf1') throw new Error(`unexpected ids: ${ids}`);
});

test('business event renders once', () => {
  const biz = { id: 'b1', title: 'Biz', owner_type: 'business' };
  const deduped = dedupeEventsById([biz, biz, biz]);
  if (deduped.length !== 1) throw new Error(`expected 1, got ${deduped.length}`);
});

test('distinct events with same content but different ids are both kept', () => {
  const a = { id: '1', title: 'Same' };
  const b = { id: '2', title: 'Same' };
  const deduped = dedupeEventsById([a, b]);
  if (deduped.length !== 2) throw new Error('uniqueness must be by id, not content');
});

test('null entries are skipped', () => {
  const deduped = dedupeEventsById([null, { id: 'x' }, undefined, { id: 'x' }]);
  if (deduped.length !== 1) throw new Error(`expected 1, got ${deduped.length}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);