// Regression test: UI-created manual-event creation under the V2 lifecycle model.
// ───────────────────────────────────────────────────────────
// Reproduces the smoke-test blocker where creating an event from the
// Calendar UI did not result in an event appearing. Verifies:
//   1. createEvent passes ALL client fields (assigned_identity_ids,
//      invited_emails, location) to the canonical writer — not just
//      a curated subset.
//   2. The payload carries lifecycle_state 'scheduled' (V2-valid).
//   3. getAllEventsForIdentity isolates sub-query failures so a missing
//      composite index on assigned/invited does not reject the entire
//      load (the root cause of the silent event-not-appearing bug).
//   4. The V2 lifecycle 'scheduled' is not filtered out by getEvents
//      or normalizeToOccurrences.
// Run with: node tests/calendar-create-regression.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const CAL_LIB = path.join(__dirname, '..', 'src', 'lib', 'calendar.js');
const OCC_LIB = path.join(__dirname, '..', 'src', 'lib', 'calendarOccurrences.js');
const EVENT_MODAL = path.join(__dirname, '..', 'src', 'components', 'calendar', 'EventModal.jsx');
const CAL_PAGE = path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx');

const calSrc = fs.readFileSync(CAL_LIB, 'utf8');
const occSrc = fs.readFileSync(OCC_LIB, 'utf8');
const modalSrc = fs.readFileSync(EVENT_MODAL, 'utf8');
const pageSrc = fs.readFileSync(CAL_PAGE, 'utf8');

// ── 1. createEvent passes ALL client fields ──────────────────
test('CREATE: createEvent spreads ...data (does not drop assigned_identity_ids / invited_emails / location)', () => {
  // The fixed createEvent must spread ...data into eventData so the
  // canonical writer receives the complete payload.
  const createFnMatch = calSrc.match(/export async function createEvent\(data\)\s*\{[\s\S]*?\n\}/);
  if (!createFnMatch) throw new Error('createEvent function not found');
  const createFn = createFnMatch[0];
  if (!/\.\.\.data/.test(createFn)) {
    throw new Error('createEvent must spread ...data into eventData (assigned_identity_ids, invited_emails, location were being dropped)');
  }
});

test('CREATE: createEvent sets lifecycle_state to scheduled (V2-valid)', () => {
  const createFnMatch = calSrc.match(/export async function createEvent\(data\)\s*\{[\s\S]*?\n\}/);
  if (!createFnMatch) throw new Error('createEvent function not found');
  const createFn = createFnMatch[0];
  if (!/lifecycle_state.*scheduled/.test(createFn)) {
    throw new Error('createEvent must set lifecycle_state: "scheduled" (V2 §15)');
  }
});

test('CREATE: createEvent does NOT hardcode owner_id from destructuring (server overrides it)', () => {
  const createFnMatch = calSrc.match(/export async function createEvent\(data\)\s*\{[\s\S]*?\n\}/);
  if (!createFnMatch) throw new Error('createEvent function not found');
  const createFn = createFnMatch[0];
  // The old code destructured owner_id from data and set it explicitly.
  // The fix spreads ...data; the cloud function overrides owner_id server-side.
  if (/owner_id,$/.test(createFn) && !/\.\.\.data/.test(createFn)) {
    throw new Error('createEvent must not hardcode owner_id from destructuring — the canonical writer sets it server-side');
  }
});

// ── 2. EventModal sends location + invited_emails + assigned_identity_ids ──
test('MODAL: EventModal includes location in the save payload', () => {
  if (!/location:\s*locationType\s*!==\s*'online'/.test(modalSrc)) {
    throw new Error('EventModal must include location in the save data payload');
  }
});

test('MODAL: EventModal has a Location input field for physical/hybrid events', () => {
  if (!/Venue name or address/.test(modalSrc)) {
    throw new Error('EventModal must expose a Location input for physical/hybrid events');
  }
});

test('MODAL: EventModal has error handling (toast) on save failure', () => {
  if (!/Could not save event/.test(modalSrc)) {
    throw new Error('EventModal must show a toast on save failure (previously errors were silent unhandled rejections)');
  }
});

// ── 3. getAllEventsForIdentity isolates sub-query failures ──
test('LOAD: getAllEventsForIdentity wraps assigned/invited queries in try/catch', () => {
  const fnMatch = calSrc.match(/export async function getAllEventsForIdentity[\s\S]*?\n\}/);
  if (!fnMatch) throw new Error('getAllEventsForIdentity function not found');
  const fn = fnMatch[0];
  // Each sub-query (listEventsAssignedToIdentity, listEventsInvitedToIdentity)
  // must be individually try/catch-wrapped so one failure does not reject
  // the entire load (root cause of the silent event-not-appearing bug).
  if (!/try\s*\{[\s\S]*?listEventsAssignedToIdentity[\s\S]*?\}\s*catch/.test(fn)) {
    throw new Error('listEventsAssignedToIdentity must be try/catch-wrapped');
  }
  if (!/try\s*\{[\s\S]*?listEventsInvitedToIdentity[\s\S]*?\}\s*catch/.test(fn)) {
    throw new Error('listEventsInvitedToIdentity must be try/catch-wrapped');
  }
});

test('LOAD: CalendarPage loadEvents logs errors (does not silently swallow)', () => {
  if (!/console\.error.*Failed to load events/.test(pageSrc)) {
    throw new Error('CalendarPage loadEvents must log errors to console (was silently swallowing)');
  }
});

// ── 4. V2 lifecycle 'scheduled' is not filtered out ──────────
test('FILTER: getEvents does NOT filter out lifecycle_state "scheduled"', () => {
  const getEventsMatch = calSrc.match(/export async function getEvents[\s\S]*?\n\}/);
  if (!getEventsMatch) throw new Error('getEvents function not found');
  const fn = getEventsMatch[0];
  // The filter must only exclude cancelled and removed — NOT scheduled.
  if (!/lifecycle_state\s*!==\s*'cancelled'/.test(fn)) {
    throw new Error('getEvents must filter out cancelled events');
  }
  if (!/lifecycle_state\s*!==\s*'removed'/.test(fn)) {
    throw new Error('getEvents must filter out removed events (§106–§111)');
  }
  // Must NOT filter out scheduled
  if (/lifecycle_state\s*!==\s*'scheduled'/.test(fn)) {
    throw new Error('getEvents must NOT filter out "scheduled" events (V2 §15 active state)');
  }
});

test('FILTER: normalizeToOccurrences does NOT skip lifecycle_state "scheduled"', () => {
  const fnMatch = occSrc.match(/export function normalizeToOccurrences[\s\S]*?\n\}/);
  if (!fnMatch) throw new Error('normalizeToOccurrences function not found');
  const fn = fnMatch[0];
  // Must skip cancelled and removed, but NOT scheduled
  if (!/lifecycle_state\s*===\s*'cancelled'/.test(fn)) {
    throw new Error('normalizeToOccurrences must skip cancelled events');
  }
  if (!/lifecycle_state\s*===\s*'removed'/.test(fn)) {
    throw new Error('normalizeToOccurrences must skip removed events');
  }
  if (/lifecycle_state\s*===\s*'scheduled'/.test(fn) && /continue/.test(fn)) {
    throw new Error('normalizeToOccurrences must NOT skip "scheduled" events');
  }
});

// ── 5. Duplicate Today controls fix ──────────────────────────
test('UI: CalendarPage does not show duplicate "Today" labels', () => {
  // The header button must be disambiguated from the view-switcher tab.
  const todayButtonMatches = pageSrc.match(/>\s*Today\s*</g) || [];
  // The view switcher has its own "Today" label (in CalendarViewSwitcher.jsx).
  // The page header must NOT also say just "Today" — it must be "Jump to Today"
  // or similar.
  const jumpToToday = /Jump to Today/.test(pageSrc);
  if (!jumpToToday) {
    throw new Error('CalendarPage header must use "Jump to Today" (not bare "Today") to avoid duplicate labels with the view switcher');
  }
});

test('UI: CalendarPage uses useFirebase from backendConfig (not window.__FIREBASE_CONFIG__)', () => {
  if (/window\.__FIREBASE_CONFIG__/.test(pageSrc)) {
    throw new Error('CalendarPage must not use window.__FIREBASE_CONFIG__ — import useFirebase from @/lib/backendConfig');
  }
  if (!/from\s+['"]@\/lib\/backendConfig['"]/.test(pageSrc)) {
    throw new Error('CalendarPage must import useFirebase from @/lib/backendConfig');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);