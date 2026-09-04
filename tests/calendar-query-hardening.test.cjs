// Phase 3 — Query Architecture Hardening.
// ───────────────────────────────────────────────────────────
// Verifies: owned/assigned/invited visibility correctness, realtime
// subscription parity, deterministic deduplication by Event ID,
// lifecycle filtering consistency, failure isolation WITHOUT silent
// data loss, and query error observability.
//
// Run with: node tests/calendar-query-hardening.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const CAL_LIB = path.join(__dirname, '..', 'src', 'lib', 'calendar.js');
const REALTIME = path.join(__dirname, '..', 'src', 'lib', 'calendarRealtime.js');
const OCC = path.join(__dirname, '..', 'src', 'lib', 'calendarOccurrences.js');
const REPO = path.join(__dirname, '..', 'src', 'data', 'firebase', 'firebaseCalendarRepository.js');
const PAGE = path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx');
const INDEXES = path.join(__dirname, '..', 'firestore.indexes.json');

const calSrc = fs.readFileSync(CAL_LIB, 'utf8');
const rtSrc = fs.readFileSync(REALTIME, 'utf8');
const occSrc = fs.readFileSync(OCC, 'utf8');
const repoSrc = fs.readFileSync(REPO, 'utf8');
const pageSrc = fs.readFileSync(PAGE, 'utf8');
const indexes = JSON.parse(fs.readFileSync(INDEXES, 'utf8'));

// ── Failure isolation + observability ───────────────────────
test('ISOLATION: getAllEventsForIdentity accepts onQueryError callback', () => {
  if (!/getAllEventsForIdentity\(.*onQueryError/.test(calSrc)) {
    throw new Error('getAllEventsForIdentity must accept onQueryError callback');
  }
});

test('ISOLATION: owner query is try/catch wrapped with onQueryError', () => {
  if (!/try\s*\{[\s\S]*?getEvents\(identityId,\s*'identity'[\s\S]*?\}\s*catch[\s\S]*?onQueryError.*owner/.test(calSrc)) {
    throw new Error('Owner query must be try/catch wrapped with onQueryError reporting');
  }
});

test('ISOLATION: assigned query is try/catch wrapped with onQueryError', () => {
  if (!/try\s*\{[\s\S]*?listEventsAssignedToIdentity[\s\S]*?\}\s*catch[\s\S]*?onQueryError.*assigned/.test(calSrc)) {
    throw new Error('Assigned query must be try/catch wrapped with onQueryError reporting');
  }
});

test('ISOLATION: invited query is try/catch wrapped with onQueryError', () => {
  if (!/try\s*\{[\s\S]*?listEventsInvitedToIdentity[\s\S]*?\}\s*catch[\s\S]*?onQueryError.*invited/.test(calSrc)) {
    throw new Error('Invited query must be try/catch wrapped with onQueryError reporting');
  }
});

test('OBSERVABILITY: CalendarPage tracks queryErrors state', () => {
  if (!/queryErrors/.test(pageSrc)) {
    throw new Error('CalendarPage must track queryErrors state');
  }
});

test('OBSERVABILITY: CalendarPage shows error banner when queryErrors exist', () => {
  if (!/queryErrors\.length.*\&\&.*!loading/.test(pageSrc)) {
    throw new Error('CalendarPage must show error banner when queryErrors exist');
  }
  if (!/role="alert"/.test(pageSrc)) {
    throw new Error('Error banner must have role="alert" for accessibility');
  }
});

test('OBSERVABILITY: failed query does NOT masquerade as empty result', () => {
  // The function must still return successfully retrieved data even if a sub-query fails.
  // The onQueryError callback is called, but events from successful queries are returned.
  if (/setEvents\(\[\]\)/.test(pageSrc) && !/catch/.test(pageSrc)) {
    throw new Error('Failed queries must not clear successfully loaded events');
  }
  // Verify the error message includes "may be incomplete"
  if (!/may be incomplete/.test(pageSrc)) {
    throw new Error('Error banner must indicate data may be incomplete');
  }
});

// ── Deduplication ────────────────────────────────────────────
test('DEDUP: dedupeEventsById deduplicates by Event ID', () => {
  if (!/byId\.has\(key\)/.test(calSrc)) {
    throw new Error('dedupeEventsById must check byId.has(key)');
  }
  if (!/e\.id/.test(calSrc)) {
    throw new Error('dedupeEventsById must use e.id as the key');
  }
});

test('DEDUP: mergeAndDedupeEvents deduplicates by Event ID', () => {
  if (!/byId\.has\(e\.id\)/.test(rtSrc)) {
    throw new Error('mergeAndDedupeEvents must check byId.has(e.id)');
  }
});

test('DEDUP: deduplication is deterministic (same input → same output)', () => {
  // The dedup uses a Map, which preserves insertion order. The first
  // occurrence wins (byId.has check). This is deterministic.
  if (!/if\s*\(!byId\.has\(key\)\)/.test(calSrc)) {
    throw new Error('dedupeEventsById must only add if not already present (first wins)');
  }
});

// ── Realtime parity ──────────────────────────────────────────
test('REALTIME: subscribeToOwnerEvents exists', () => {
  if (!/export function subscribeToOwnerEvents/.test(rtSrc)) {
    throw new Error('subscribeToOwnerEvents must exist');
  }
});

test('REALTIME: subscribeToAssignedEvents exists', () => {
  if (!/export function subscribeToAssignedEvents/.test(rtSrc)) {
    throw new Error('subscribeToAssignedEvents must exist');
  }
});

test('REALTIME: subscribeToInvitedEvents exists', () => {
  if (!/export function subscribeToInvitedEvents/.test(rtSrc)) {
    throw new Error('subscribeToInvitedEvents must exist');
  }
});

test('REALTIME: subscribeToParticipationForIdentity exists (Phase 3)', () => {
  if (!/export function subscribeToParticipationForIdentity/.test(rtSrc)) {
    throw new Error('subscribeToParticipationForIdentity must exist for Phase 3');
  }
});

test('REALTIME: realtime subscriptions use same query patterns as initial load', () => {
  // Owner subscription uses owner_id + owner_type (same as listEventsForOwner)
  if (!/where\('owner_id'/.test(rtSrc) || !/where\('owner_type'/.test(rtSrc)) {
    throw new Error('Owner subscription must filter by owner_id + owner_type');
  }
  // Assigned subscription uses array-contains (same as listEventsAssignedToIdentity)
  if (!/assigned_identity_ids.*array-contains/.test(rtSrc)) {
    throw new Error('Assigned subscription must use array-contains');
  }
  // Invited subscription uses array-contains (same as listEventsInvitedToIdentity)
  if (!/invited_identity_ids.*array-contains/.test(rtSrc)) {
    throw new Error('Invited subscription must use array-contains');
  }
});

test('REALTIME: CalendarPage merges owner + assigned + invited streams', () => {
  if (!/mergeAndDedupeEvents/.test(pageSrc)) {
    throw new Error('CalendarPage must merge and dedupe event streams');
  }
});

// ── Lifecycle filtering consistency ─────────────────────────
test('FILTER: getEvents excludes cancelled and removed', () => {
  if (!/lifecycle_state\s*!==\s*'cancelled'/.test(calSrc)) {
    throw new Error('getEvents must exclude cancelled');
  }
  if (!/lifecycle_state\s*!==\s*'removed'/.test(calSrc)) {
    throw new Error('getEvents must exclude removed');
  }
});

test('FILTER: normalizeToOccurrences skips cancelled and removed', () => {
  if (!/lifecycle_state\s*===\s*'cancelled'/.test(occSrc)) {
    throw new Error('normalizeToOccurrences must skip cancelled');
  }
  if (!/lifecycle_state\s*===\s*'removed'/.test(occSrc)) {
    throw new Error('normalizeToOccurrences must skip removed');
  }
});

test('FILTER: getEvents does NOT exclude scheduled (V2 active state)', () => {
  const getEventsMatch = calSrc.match(/export async function getEvents[\s\S]*?\n\}/);
  if (!getEventsMatch) throw new Error('getEvents not found');
  if (/lifecycle_state\s*!==\s*'scheduled'/.test(getEventsMatch[0])) {
    throw new Error('getEvents must NOT exclude scheduled');
  }
});

// ── Index completeness ───────────────────────────────────────
test('INDEX: owner_id + start_time index exists', () => {
  const has = indexes.indexes.some(i =>
    i.collectionGroup === 'calendarEvents' &&
    i.fields.length === 2 &&
    i.fields[0].fieldPath === 'owner_id' &&
    i.fields[1].fieldPath === 'start_time'
  );
  if (!has) throw new Error('Missing owner_id + start_time index');
});

test('INDEX: owner_id + owner_type + start_time index exists', () => {
  const has = indexes.indexes.some(i =>
    i.collectionGroup === 'calendarEvents' &&
    i.fields.length === 3 &&
    i.fields[0].fieldPath === 'owner_id' &&
    i.fields[1].fieldPath === 'owner_type' &&
    i.fields[2].fieldPath === 'start_time'
  );
  if (!has) throw new Error('Missing owner_id + owner_type + start_time index');
});

test('INDEX: assigned_identity_ids (array-contains) + start_time index exists', () => {
  const has = indexes.indexes.some(i =>
    i.collectionGroup === 'calendarEvents' &&
    i.fields.some(f => f.fieldPath === 'assigned_identity_ids' && f.arrayConfig === 'CONTAINS') &&
    i.fields.some(f => f.fieldPath === 'start_time')
  );
  if (!has) throw new Error('Missing assigned_identity_ids array-contains index');
});

test('INDEX: invited_identity_ids (array-contains) + start_time index exists', () => {
  const has = indexes.indexes.some(i =>
    i.collectionGroup === 'calendarEvents' &&
    i.fields.some(f => f.fieldPath === 'invited_identity_ids' && f.arrayConfig === 'CONTAINS') &&
    i.fields.some(f => f.fieldPath === 'start_time')
  );
  if (!has) throw new Error('Missing invited_identity_ids array-contains index');
});

test('INDEX: calendarParticipation identity_id + event_id index exists (Phase 3)', () => {
  const has = indexes.indexes.some(i =>
    i.collectionGroup === 'calendarParticipation' &&
    i.fields.some(f => f.fieldPath === 'identity_id') &&
    i.fields.some(f => f.fieldPath === 'event_id')
  );
  if (!has) throw new Error('Missing calendarParticipation identity_id + event_id index');
});

test('INDEX: calendarParticipation identity_id + response_state index exists (Phase 3)', () => {
  const has = indexes.indexes.some(i =>
    i.collectionGroup === 'calendarParticipation' &&
    i.fields.some(f => f.fieldPath === 'identity_id') &&
    i.fields.some(f => f.fieldPath === 'response_state')
  );
  if (!has) throw new Error('Missing calendarParticipation identity_id + response_state index');
});

test('INDEX: source_system + source_id index exists (handleSourceUnavailable query)', () => {
  const has = indexes.indexes.some(i =>
    i.collectionGroup === 'calendarEvents' &&
    i.fields.some(f => f.fieldPath === 'source_system') &&
    i.fields.some(f => f.fieldPath === 'source_id')
  );
  if (!has) throw new Error('Missing source_system + source_id index');
});

test('INDEX: business_id + assigned/invited array-contains indexes exist (§109)', () => {
  const hasAssigned = indexes.indexes.some(i =>
    i.collectionGroup === 'calendarEvents' &&
    i.fields.some(f => f.fieldPath === 'business_id') &&
    i.fields.some(f => f.fieldPath === 'assigned_identity_ids' && f.arrayConfig === 'CONTAINS')
  );
  if (!hasAssigned) throw new Error('Missing business_id + assigned_identity_ids index');
  const hasInvited = indexes.indexes.some(i =>
    i.collectionGroup === 'calendarEvents' &&
    i.fields.some(f => f.fieldPath === 'business_id') &&
    i.fields.some(f => f.fieldPath === 'invited_identity_ids' && f.arrayConfig === 'CONTAINS')
  );
  if (!hasInvited) throw new Error('Missing business_id + invited_identity_ids index');
});

// ── Bounded/scalable query behaviour ────────────────────────
test('BOUNDED: listEventsForOwner supports date range filtering (§113)', () => {
  if (!/startDate.*endDate/.test(repoSrc) || !/start_time.*>=/.test(repoSrc)) {
    throw new Error('listEventsForOwner must support server-side date range filtering');
  }
});

test('BOUNDED: listExceptionsForSeriesBatch batches in groups of 10 (Firestore in limit)', () => {
  if (!/i\s*\+=\s*10/.test(repoSrc)) {
    throw new Error('listExceptionsForSeriesBatch must batch in groups of 10');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);