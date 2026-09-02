// Calendar query de-duplication + one-identity-owned-set — regression tests.
// ───────────────────────────────────────────────────────────
// Mirrors `dedupeEventsById` in src/lib/calendar.js and asserts the
// corrected query model:
//   - ONE identity-owned event set, queried ONCE (no separate
//     'professional' query). Personal and Professional are operating
//     contexts of one identity, not separate owners.
//   - Business-owned events are a separate set (owner_type 'business').
//   - Assigned/invited events are additional sets, deduped by event ID.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

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

// ── Source contract: getAllEventsForIdentity queries identity ONCE ──
test('getAllEventsForIdentity queries identity-owned events once (no professional query)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'calendar.js'), 'utf8',
  );
  const fnBlock = src.match(/export async function getAllEventsForIdentity[\s\S]*?\n\}/)[0];
  if (/getEvents\([^,]+,\s*'professional'/.test(fnBlock)) {
    throw new Error('getAllEventsForIdentity must not query a separate professional set');
  }
  if (!/getEvents\(identityId,\s*'identity'/.test(fnBlock)) {
    throw new Error('getAllEventsForIdentity must query the identity-owned set once');
  }
});

// ── Source contract: assigned + invited queries exist ──
test('repository exposes assigned + invited identity queries', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'data', 'firebase', 'firebaseCalendarRepository.js'), 'utf8',
  );
  if (!/export async function listEventsAssignedToIdentity/.test(src)) {
    throw new Error('listEventsAssignedToIdentity missing');
  }
  if (!/export async function listEventsInvitedToIdentity/.test(src)) {
    throw new Error('listEventsInvitedToIdentity missing');
  }
  if (!/array-contains/.test(src)) {
    throw new Error('assigned/invited queries must use array-contains');
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

test('identity event renders once', () => {
  const events = [{ id: 'a', title: 'Personal', owner_type: 'identity' }];
  const deduped = dedupeEventsById(events);
  if (deduped.length !== 1) throw new Error(`expected 1, got ${deduped.length}`);
});

test('same identity event returned by identity + assigned queries renders once', () => {
  // An identity-owned event that is ALSO assigned to the identity (defensive
  // overlap) collapses to one row by event ID.
  const ev = { id: 'p1', title: 'Yoga', owner_type: 'identity', owner_id: 'id1', assigned_identity_ids: ['id1'] };
  const deduped = dedupeEventsById([ev, ev]);
  if (deduped.length !== 1) throw new Error(`expected 1, got ${deduped.length}`);
});

test('identity and business events coexist and each render once', () => {
  const identity = { id: 'pe1', title: 'Personal', owner_type: 'identity' };
  const biz = { id: 'pf1', title: 'Biz', owner_type: 'business' };
  const deduped = dedupeEventsById([identity, biz, biz, identity]);
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

test('CalendarPage uses owner_type identity for Personal and Professional', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx'), 'utf8',
  );
  if (/ownerType\s*=\s*activeContext\s*===\s*'business'\s*\?\s*'business'\s*:\s*activeContext\s*===\s*'professional'\s*\?\s*'professional'/.test(src)) {
    throw new Error('CalendarPage must not derive a professional owner_type');
  }
  if (!/activeContext === 'business' \? 'business' : 'identity'/.test(src)) {
    throw new Error('CalendarPage must use identity owner_type for Personal and Professional');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);