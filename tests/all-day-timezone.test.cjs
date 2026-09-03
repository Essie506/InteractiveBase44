// Phase 1 (C4) — Deterministic all-day event semantics (§94–§97).
// ───────────────────────────────────────────────────────────
// All-day events are stored as UTC-midnight (TZ-invariant) and the
// calendar grid groups them by the stored UTC date so they render on
// the same calendar date in any viewer time zone.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const MODAL = path.join(__dirname, '..', 'src', 'components', 'calendar', 'EventModal.jsx');
const PAGE = path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx');
const modalSrc = fs.readFileSync(MODAL, 'utf8');
const pageSrc = fs.readFileSync(PAGE, 'utf8');

test('all-day start is stored as UTC midnight (TZ-invariant)', () => {
  if (!/allDay\s*\?\s*`\$\{date\}T00:00:00\.000Z`/.test(modalSrc)) {
    throw new Error('all-day start must be ${date}T00:00:00.000Z');
  }
});
test('all-day end is stored as UTC end-of-day (TZ-invariant)', () => {
  if (!/allDay\s*\?\s*`\$\{date\}T23:59:59\.000Z`/.test(modalSrc)) {
    throw new Error('all-day end must be ${date}T23:59:59.000Z');
  }
});
test('all-day no longer uses local-midnight toISOString construction', () => {
  if (/new Date\(`\$\{date\}T00:00`\)\.toISOString\(\)/.test(modalSrc)) {
    throw new Error('all-day must not use local-midnight toISOString (shifts across tz)');
  }
});
test('calendar grid groups all-day events by stored UTC date', () => {
  // V2 refactor: CalendarPage now uses the shared occurrence model. All-day
  // events are compared by occ.start.slice(0,10) (the stored UTC date).
  if (!/all_day\)\s*return\s*occ\.start\.slice\(0,\s*10\)/.test(pageSrc)) {
    throw new Error('eventsForDay must compare all-day events by occ.start.slice(0,10)');
  }
  if (!/isoDate/.test(pageSrc)) {
    throw new Error('eventsForDay must compute an isoDate for all-day comparison');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);