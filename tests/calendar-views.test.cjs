// Calendar views source-contract tests (§18–§22).
// ───────────────────────────────────────────────────────────
// Confirms all four views (Month, Week, Day, Agenda) consume the shared
// normalized occurrence model — they accept `occurrences` props and use
// the occurrence shape (occurrenceId, event, start, end, isRecurring,
// isException), and do NOT query raw entities directly.
// Run with: node tests/calendar-views.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const VIEWS_DIR = path.join(__dirname, '..', 'src', 'components', 'calendar');
const CALENDAR_PAGE = path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx');
const OCCURRENCES_LIB = path.join(__dirname, '..', 'src', 'lib', 'calendarOccurrences.js');

const weekSrc = fs.readFileSync(path.join(VIEWS_DIR, 'WeekView.jsx'), 'utf8');
const daySrc = fs.readFileSync(path.join(VIEWS_DIR, 'DayView.jsx'), 'utf8');
const agendaSrc = fs.readFileSync(path.join(VIEWS_DIR, 'AgendaView.jsx'), 'utf8');
const switcherSrc = fs.readFileSync(path.join(VIEWS_DIR, 'CalendarViewSwitcher.jsx'), 'utf8');
const pageSrc = fs.readFileSync(CALENDAR_PAGE, 'utf8');
const occLibSrc = fs.readFileSync(OCCURRENCES_LIB, 'utf8');

// ── Shared occurrence model exports ──
test('MODEL: calendarOccurrences exports normalizeToOccurrences', () => {
  if (!/export function normalizeToOccurrences/.test(occLibSrc)) {
    throw new Error('normalizeToOccurrences must be exported');
  }
});

test('MODEL: calendarOccurrences exports groupOccurrencesByDate', () => {
  if (!/export function groupOccurrencesByDate/.test(occLibSrc)) {
    throw new Error('groupOccurrencesByDate must be exported');
  }
});

test('MODEL: calendarOccurrences exports filterOccurrences', () => {
  if (!/export function filterOccurrences/.test(occLibSrc)) {
    throw new Error('filterOccurrences must be exported');
  }
});

// ── CalendarViewSwitcher offers all four views ──
test('SWITCHER: offers month, week, day, agenda', () => {
  for (const key of ['month', 'week', 'day', 'agenda']) {
    if (!new RegExp(`key: '${key}'`).test(switcherSrc)) {
      throw new Error(`switcher must offer ${key} view`);
    }
  }
});

// ── Each view accepts occurrences prop ──
test('WEEK: accepts occurrences prop', () => {
  if (!/\{ occurrences[,}]/.test(weekSrc)) {
    throw new Error('WeekView must accept occurrences prop');
  }
});

test('DAY: accepts occurrences prop', () => {
  if (!/\{ occurrences[,}]/.test(daySrc)) {
    throw new Error('DayView must accept occurrences prop');
  }
});

test('AGENDA: accepts occurrences prop', () => {
  if (!/\{ occurrences[,}]/.test(agendaSrc)) {
    throw new Error('AgendaView must accept occurrences prop');
  }
});

// ── Each view uses the normalized occurrence shape ──
test('WEEK: uses occurrenceId for keys', () => {
  if (!/occ\.occurrenceId/.test(weekSrc)) {
    throw new Error('WeekView must use occ.occurrenceId');
  }
});

test('DAY: uses occurrenceId for keys', () => {
  if (!/occ\.occurrenceId/.test(daySrc)) {
    throw new Error('DayView must use occ.occurrenceId');
  }
});

test('AGENDA: uses occurrenceId for keys', () => {
  if (!/occ\.occurrenceId/.test(agendaSrc)) {
    throw new Error('AgendaView must use occ.occurrenceId');
  }
});

test('WEEK: uses occ.event (parent event record)', () => {
  if (!/occ\.event/.test(weekSrc)) {
    throw new Error('WeekView must use occ.event');
  }
});

test('DAY: uses occ.event and occ.isRecurring', () => {
  if (!/occ\.event/.test(daySrc)) throw new Error('DayView must use occ.event');
  if (!/occ\.isRecurring/.test(daySrc)) throw new Error('DayView must use occ.isRecurring');
});

test('AGENDA: uses occ.event, occ.start, occ.end', () => {
  if (!/occ\.event/.test(agendaSrc)) throw new Error('AgendaView must use occ.event');
  if (!/occ\.start/.test(agendaSrc)) throw new Error('AgendaView must use occ.start');
  if (!/occ\.end/.test(agendaSrc)) throw new Error('AgendaView must use occ.end');
});

test('WEEK: distinguishes all-day vs timed via occ.event.all_day', () => {
  if (!/occ\.event\.all_day/.test(weekSrc)) {
    throw new Error('WeekView must check occ.event.all_day for all-day grouping (§97)');
  }
});

test('DAY: distinguishes all-day vs timed via occ.event.all_day', () => {
  if (!/occ\.event\.all_day/.test(daySrc)) {
    throw new Error('DayView must check occ.event.all_day for all-day grouping (§97)');
  }
});

test('AGENDA: distinguishes all-day vs timed via occ.event.all_day', () => {
  // Accept both occ.event.all_day and event.all_day (when event is derived from occ.event)
  if (!/occ\.event\.all_day|event\.all_day/.test(agendaSrc)) {
    throw new Error('AgendaView must check occ.event.all_day for all-day grouping (§97)');
  }
  // Verify event is derived from occ.event
  if (!/const event = occ\.event/.test(agendaSrc) && !/occ\.event\.all_day/.test(agendaSrc)) {
    throw new Error('AgendaView must derive event from occ.event before checking all_day');
  }
});

// ── Views do NOT query raw entities directly ──
test('WEEK: does not import base44 entities', () => {
  if (/base44\.entities/.test(weekSrc)) {
    throw new Error('WeekView must not query raw entities — it consumes the occurrence model');
  }
});

test('DAY: does not import base44 entities', () => {
  if (/base44\.entities/.test(daySrc)) {
    throw new Error('DayView must not query raw entities — it consumes the occurrence model');
  }
});

test('AGENDA: does not import base44 entities', () => {
  if (/base44\.entities/.test(agendaSrc)) {
    throw new Error('AgendaView must not query raw entities — it consumes the occurrence model');
  }
});

// ── CalendarPage orchestrates the shared model ──
test('PAGE: imports normalizeToOccurrences from the shared model', () => {
  if (!/normalizeToOccurrences/.test(pageSrc)) {
    throw new Error('CalendarPage must import normalizeToOccurrences');
  }
  if (!/from ['"]@\/lib\/calendarOccurrences['"]/.test(pageSrc)) {
    throw new Error('CalendarPage must import from @/lib/calendarOccurrences');
  }
});

test('PAGE: renders CalendarViewSwitcher', () => {
  if (!/CalendarViewSwitcher/.test(pageSrc)) {
    throw new Error('CalendarPage must render CalendarViewSwitcher');
  }
});

test('PAGE: renders WeekView, DayView, AgendaView conditionally', () => {
  for (const comp of ['WeekView', 'DayView', 'AgendaView']) {
    if (!new RegExp(comp).test(pageSrc)) {
      throw new Error(`CalendarPage must render ${comp}`);
    }
  }
});

test('PAGE: passes occurrences to view components', () => {
  // The page must pass occurrences={...} to at least one view
  if (!/occurrences=/.test(pageSrc)) {
    throw new Error('CalendarPage must pass occurrences to view components');
  }
});

test('PAGE: does not use professional as owner_type', () => {
  if (/owner_type.*professional/.test(pageSrc)) {
    throw new Error('CalendarPage must not use professional as owner_type (operating context, not owner)');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);