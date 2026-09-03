// Calendar Performance tests (§113).
// ───────────────────────────────────────────────────────────
// Verifies range-based loading, pagination, indexed queries, efficient
// recurrence, cached presentation, and that critical writes prioritise
// correctness over cached convenience.
// Run with: node tests/calendar-performance.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const REPO = path.join(__dirname, '..', 'src', 'data', 'firebase', 'firebaseCalendarRepository.js');
const AGENDA = path.join(__dirname, '..', 'src', 'components', 'calendar', 'AgendaView.jsx');
const OCC = path.join(__dirname, '..', 'src', 'lib', 'calendarOccurrences.js');
const INDEXES = path.join(__dirname, '..', 'firestore.indexes.json');
const CAL_LIB = path.join(__dirname, '..', 'src', 'lib', 'calendar.js');

const repoSrc = fs.readFileSync(REPO, 'utf8');
const agendaSrc = fs.readFileSync(AGENDA, 'utf8');
const occSrc = fs.readFileSync(OCC, 'utf8');
const indexesJson = JSON.parse(fs.readFileSync(INDEXES, 'utf8'));
const calSrc = fs.readFileSync(CAL_LIB, 'utf8');

// ── §113: Range-based loading ──
test('REPO: listEventsForOwner supports date range filtering (§113)', () => {
  if (!/startDate.*endDate|start_time.*>=.*start|start_time.*<=.*end/.test(repoSrc)) {
    throw new Error('listEventsForOwner must support server-side date range filtering');
  }
});

test('REPO: range query uses start_time >= and <= (server-side filter)', () => {
  if (!/start_time.*'>=|where\('start_time'.*>=/.test(repoSrc)) {
    throw new Error('Range query must filter start_time server-side');
  }
});

test('CAL: getEvents passes date range to repository', () => {
  if (!/listEventsForOwner\(ownerId, ownerType, startDate, endDate\)/.test(calSrc)) {
    throw new Error('getEvents must pass date range to repository');
  }
});

// ── §113: Indexed date/time queries ──
test('INDEXES: composite index for owner_id + owner_type + start_time exists', () => {
  const has = indexesJson.indexes.some(idx =>
    idx.collectionGroup === 'calendarEvents' &&
    idx.fields.some(f => f.fieldPath === 'owner_id') &&
    idx.fields.some(f => f.fieldPath === 'owner_type') &&
    idx.fields.some(f => f.fieldPath === 'start_time')
  );
  if (!has) throw new Error('Composite index (owner_id, owner_type, start_time) must exist');
});

test('INDEXES: index for assigned_identity_ids + start_time exists', () => {
  const has = indexesJson.indexes.some(idx =>
    idx.collectionGroup === 'calendarEvents' &&
    idx.fields.some(f => f.fieldPath === 'assigned_identity_ids') &&
    idx.fields.some(f => f.fieldPath === 'start_time')
  );
  if (!has) throw new Error('Index for assigned_identity_ids + start_time must exist');
});

test('INDEXES: index for invited_identity_ids + start_time exists', () => {
  const has = indexesJson.indexes.some(idx =>
    idx.collectionGroup === 'calendarEvents' &&
    idx.fields.some(f => f.fieldPath === 'invited_identity_ids') &&
    idx.fields.some(f => f.fieldPath === 'start_time')
  );
  if (!has) throw new Error('Index for invited_identity_ids + start_time must exist');
});

// ── §113: Pagination for large Agenda history ──
test('AGENDA: implements pagination (§113)', () => {
  if (!/PAGE_SIZE|visibleCount|slice\(0,/.test(agendaSrc)) {
    throw new Error('AgendaView must implement pagination');
  }
});

test('AGENDA: uses IntersectionObserver for infinite scroll', () => {
  if (!/IntersectionObserver/.test(agendaSrc)) {
    throw new Error('AgendaView must use IntersectionObserver for lazy loading');
  }
});

test('AGENDA: has load-more sentinel', () => {
  if (!/sentinelRef|sentinel/.test(agendaSrc)) {
    throw new Error('AgendaView must have a load-more sentinel element');
  }
});

// ── §113: Efficient recurrence evaluation ──
test('OCC: recurrence expansion is range-bounded (effective_until)', () => {
  if (!/effective_until|effectiveUntil/.test(occSrc)) {
    throw new Error('Occurrence model must respect effective_until for range-bounded expansion');
  }
});

test('OCC: occurrences are filtered by range (not loading all)', () => {
  if (!/rangeStartMs|rangeEndMs|>= rangeStartMs|<= rangeEndMs/.test(occSrc)) {
    throw new Error('Occurrences must be filtered by visible range');
  }
});

// ── §113: Cached non-critical presentation ──
test('OCC: occurrence model is computed once (useMemo in CalendarPage)', () => {
  const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx'), 'utf8');
  // useMemo + normalizeToOccurrences may span multiple lines
  if (!/useMemo[\s\S]*normalizeToOccurrences/.test(pageSrc)) {
    throw new Error('Occurrences must be memoized (cached non-critical presentation)');
  }
});

// ── §113: Minimal duplicate source reads ──
test('OCC: deduplicates events by ID before expansion', () => {
  if (!/dedupeEventsById|dedupe/.test(calSrc)) {
    throw new Error('Events must be deduplicated by ID before processing (minimal duplicate reads)');
  }
});

// ── §113: Critical writes prioritise correctness ──
test('CAL: critical writes go through Cloud Functions (not client-side)', () => {
  // saveCalendarEvent is the sole authoritative writer
  if (!/callSaveCalendarEvent|saveCalendarEvent/.test(calSrc)) {
    throw new Error('Critical writes must go through Cloud Functions');
  }
});

test('CAL: cancelEvent routes through Cloud Function', () => {
  if (!/callSaveCalendarEvent.*id.*cancelled/.test(calSrc)) {
    throw new Error('cancelEvent must route through Cloud Function (correctness over cache)');
  }
});

// ── §113: Efficient availability queries ──
test('CAL: availability queries use indexed owner_id field', () => {
  if (!/listAvailabilityForOwner|owner_id.*owner_type.*lifecycle_state/.test(calSrc)) {
    throw new Error('Availability queries must use indexed fields');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);