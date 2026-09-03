// Today View tests (§19).
// ───────────────────────────────────────────────────────────
// Verifies Today View exists, consumes the shared occurrence model,
// shows next activity, today's events, and does not duplicate
// Dashboard's broader operational prioritisation.
// Run with: node tests/today-view.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const COMP_DIR = path.join(__dirname, '..', 'src', 'components', 'calendar');
const PAGE = path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx');
const SWITCHER = path.join(COMP_DIR, 'CalendarViewSwitcher.jsx');
const TODAY = path.join(COMP_DIR, 'TodayView.jsx');

const todaySrc = fs.readFileSync(TODAY, 'utf8');
const switcherSrc = fs.readFileSync(SWITCHER, 'utf8');
const pageSrc = fs.readFileSync(PAGE, 'utf8');

// ── Today View component exists ──
test('TODAY: TodayView component file exists', () => {
  if (!fs.existsSync(TODAY)) throw new Error('TodayView.jsx must exist');
});

test('TODAY: TodayView exports default', () => {
  if (!/export default function TodayView/.test(todaySrc)) {
    throw new Error('TodayView must export default function');
  }
});

test('TODAY: TodayView consumes occurrences prop (shared model)', () => {
  if (!/\{ occurrences[,}]/.test(todaySrc)) {
    throw new Error('TodayView must accept occurrences prop (shared occurrence model)');
  }
});

test('TODAY: TodayView shows next activity (§19)', () => {
  if (!/next activity/i.test(todaySrc)) {
    throw new Error('TodayView must show "next activity" (§19)');
  }
});

test('TODAY: TodayView shows today\'s schedule', () => {
  if (!/today/i.test(todaySrc) && !/Today's schedule/.test(todaySrc)) {
    throw new Error('TodayView must show today\'s schedule (§19)');
  }
});

test('TODAY: TodayView does not duplicate Dashboard prioritisation', () => {
  // Today View should NOT contain Dashboard-specific operational widgets
  // like revenue stats, booking pipeline, etc.
  if (/revenue|pipeline|operational stats/i.test(todaySrc)) {
    throw new Error('TodayView must not duplicate Dashboard operational prioritisation');
  }
});

// ── CalendarViewSwitcher includes Today ──
test('SWITCHER: offers today view (§19)', () => {
  if (!/key: 'today'/.test(switcherSrc)) {
    throw new Error('CalendarViewSwitcher must offer today view');
  }
});

test('SWITCHER: Today has Sun icon (distinct from Day)', () => {
  if (!/Sun/.test(switcherSrc)) {
    throw new Error('Today view should have a distinct icon (Sun)');
  }
});

// ── CalendarPage wires Today view ──
test('PAGE: CalendarPage imports TodayView', () => {
  if (!/import TodayView/.test(pageSrc)) {
    throw new Error('CalendarPage must import TodayView');
  }
});

test('PAGE: CalendarPage renders TodayView for today view', () => {
  if (!/view === 'today' \?/.test(pageSrc)) {
    throw new Error('CalendarPage must render TodayView when view is today');
  }
});

test('PAGE: CalendarPage defaults to today view (§19/§115)', () => {
  if (!/useState\('today'\)/.test(pageSrc)) {
    throw new Error('CalendarPage should default to today view');
  }
});

// ── Accessibility (§114) ──
test('TODAY: uses semantic time elements', () => {
  if (!/<time/.test(todaySrc)) {
    throw new Error('TodayView must use semantic <time> elements (§114)');
  }
});

test('TODAY: has ARIA labels on interactive elements', () => {
  if (!/aria-label/.test(todaySrc)) {
    throw new Error('TodayView must have ARIA labels (§114)');
  }
});

test('TODAY: keyboard navigation (role=button + tabIndex)', () => {
  if (!/role="button"/.test(todaySrc) || !/tabIndex/.test(todaySrc)) {
    throw new Error('TodayView must support keyboard navigation (§114)');
  }
});

test('TODAY: text labels alongside colour indicators', () => {
  // Source type label as text (not just colour)
  if (!/getSourceTypeLabel/.test(todaySrc)) {
    throw new Error('TodayView must show text labels alongside colour (§114)');
  }
});

// ── Source Unavailable (§111) ──
test('TODAY: handles source-unavailable events (§111)', () => {
  if (!/isSourceUnavailable|getSafeDisplayValues/.test(todaySrc)) {
    throw new Error('TodayView must handle source-unavailable events (§111)');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);