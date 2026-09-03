// Calendar Real-Time Updates tests (§99).
// ───────────────────────────────────────────────────────────
// Verifies real-time subscription infrastructure exists, uses
// Firestore onSnapshot, and does NOT replace server-side authoritative
// conflict/availability validation.
// Run with: node tests/calendar-realtime.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const RT_LIB = path.join(__dirname, '..', 'src', 'lib', 'calendarRealtime.js');
const PAGE = path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx');
const CALENDAR_LIB = path.join(__dirname, '..', 'src', 'lib', 'calendar.js');

const rtSrc = fs.readFileSync(RT_LIB, 'utf8');
const pageSrc = fs.readFileSync(PAGE, 'utf8');
const calSrc = fs.readFileSync(CALENDAR_LIB, 'utf8');

// ── Real-time subscription library ──
test('RT: calendarRealtime.js exists', () => {
  if (!fs.existsSync(RT_LIB)) throw new Error('calendarRealtime.js must exist');
});

test('RT: uses Firestore onSnapshot (§99)', () => {
  if (!/onSnapshot/.test(rtSrc)) {
    throw new Error('calendarRealtime must use Firestore onSnapshot');
  }
});

test('RT: exports subscribeToOwnerEvents', () => {
  if (!/export function subscribeToOwnerEvents/.test(rtSrc)) {
    throw new Error('subscribeToOwnerEvents must be exported');
  }
});

test('RT: exports subscribeToAssignedEvents', () => {
  if (!/export function subscribeToAssignedEvents/.test(rtSrc)) {
    throw new Error('subscribeToAssignedEvents must be exported');
  }
});

test('RT: exports subscribeToInvitedEvents', () => {
  if (!/export function subscribeToInvitedEvents/.test(rtSrc)) {
    throw new Error('subscribeToInvitedEvents must be exported');
  }
});

test('RT: exports mergeAndDedupeEvents', () => {
  if (!/export function mergeAndDedupeEvents/.test(rtSrc)) {
    throw new Error('mergeAndDedupeEvents must be exported');
  }
});

test('RT: subscriptions return unsubscribe functions', () => {
  if (!/return.*unsubscribe|return onSnapshot|return \(\) =>/.test(rtSrc)) {
    throw new Error('Subscriptions must return unsubscribe functions');
  }
});

test('RT: handles subscription errors gracefully', () => {
  if (!/onError|options\.onError|console\.error/.test(rtSrc)) {
    throw new Error('Subscriptions must handle errors gracefully');
  }
});

// ── §99 Critical: real-time does NOT replace server-side validation ──
test('RT: documents that real-time is presentation only (§99)', () => {
  if (!/does NOT replace server-side|NOT.*authoritative|PRESENTATION/.test(rtSrc)) {
    throw new Error('calendarRealtime must document that real-time does not replace server-side validation (§99)');
  }
});

test('RT: does not perform conflict detection or availability evaluation', () => {
  // Real-time lib should NOT contain conflict detection or availability logic
  if (/hasOverlapping|evaluateAvailability|conflict detection/.test(rtSrc)) {
    throw new Error('Real-time lib must not perform conflict/availability validation (§99)');
  }
});

// ── CalendarPage uses real-time subscriptions ──
test('PAGE: CalendarPage imports subscription functions', () => {
  if (!/subscribeToOwnerEvents|subscribeToAssignedEvents|subscribeToInvitedEvents/.test(pageSrc)) {
    throw new Error('CalendarPage must import subscription functions');
  }
});

test('PAGE: CalendarPage sets up subscriptions in useEffect', () => {
  if (!/useEffect.*subscribe|subscribeToOwnerEvents/.test(pageSrc)) {
    throw new Error('CalendarPage must set up subscriptions in useEffect');
  }
});

test('PAGE: CalendarPage cleans up subscriptions (unsubscribe)', () => {
  if (!/Unsub|unsubscribe|return \(\) =>/.test(pageSrc)) {
    throw new Error('CalendarPage must clean up subscriptions on unmount');
  }
});

test('PAGE: CalendarPage merges + deduplicates event streams', () => {
  if (!/mergeAndDedupeEvents/.test(pageSrc)) {
    throw new Error('CalendarPage must merge and deduplicate event streams');
  }
});

// ── calendar.js re-exports subscription API ──
test('CAL: calendar.js re-exports subscription functions', () => {
  if (!/subscribeToOwnerEvents/.test(calSrc)) {
    throw new Error('calendar.js must re-export subscription functions');
  }
});

// ── §98 overlap: propagation to authorised surfaces ──
test('RT: documents §98 propagation to authorised surfaces', () => {
  if (!/§98|authorised surfaces|propagate/.test(rtSrc)) {
    throw new Error('calendarRealtime must document §98 propagation');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);