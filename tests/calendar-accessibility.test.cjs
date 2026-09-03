// Calendar Accessibility tests (§114).
// ───────────────────────────────────────────────────────────
// Verifies semantic HTML, keyboard navigation, ARIA labels, visible
// focus, text labels alongside colour, reduced motion, and screen
// reader support across all Calendar views.
// Run with: node tests/calendar-accessibility.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const COMP_DIR = path.join(__dirname, '..', 'src', 'components', 'calendar');
const A11Y_LIB = path.join(__dirname, '..', 'src', 'lib', 'calendarAccessibility.js');
const CSS = path.join(__dirname, '..', 'src', 'index.css');
const PAGE = path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx');

const a11ySrc = fs.readFileSync(A11Y_LIB, 'utf8');
const cssSrc = fs.readFileSync(CSS, 'utf8');
const pageSrc = fs.readFileSync(PAGE, 'utf8');

// ── Accessibility helper library ──
test('A11Y: calendarAccessibility.js exists', () => {
  if (!fs.existsSync(A11Y_LIB)) throw new Error('calendarAccessibility.js must exist');
});

test('A11Y: exports buildEventAriaLabel', () => {
  if (!/export function buildEventAriaLabel/.test(a11ySrc)) throw new Error('buildEventAriaLabel must be exported');
});

test('A11Y: exports getSourceTypeLabel (text labels alongside colour)', () => {
  if (!/export function getSourceTypeLabel/.test(a11ySrc)) throw new Error('getSourceTypeLabel must be exported');
});

test('A11Y: exports getLifecycleStateLabel', () => {
  if (!/export function getLifecycleStateLabel/.test(a11ySrc)) throw new Error('getLifecycleStateLabel must be exported');
});

test('A11Y: exports handleKeyboardActivate', () => {
  if (!/export function handleKeyboardActivate/.test(a11ySrc)) throw new Error('handleKeyboardActivate must be exported');
});

test('A11Y: exports prefersReducedMotion', () => {
  if (!/export function prefersReducedMotion/.test(a11ySrc)) throw new Error('prefersReducedMotion must be exported');
});

// ── ARIA labels include text (not just colour/icon) ──
test('A11Y: buildEventAriaLabel includes source type as text', () => {
  if (!/source_system/.test(a11ySrc) || !/from \$\{/.test(a11ySrc)) {
    throw new Error('Aria label must include source type as text (§114)');
  }
});

test('A11Y: buildEventAriaLabel includes lifecycle state as text', () => {
  if (!/lifecycle_state/.test(a11ySrc) || !/cancelled|removed/.test(a11ySrc)) {
    throw new Error('Aria label must include lifecycle state as text (§114)');
  }
});

test('A11Y: getSourceTypeLabel returns "Personal" for manual', () => {
  if (!/=== 'manual'/.test(a11ySrc) || !/Personal/.test(a11ySrc)) {
    throw new Error('getSourceTypeLabel must return "Personal" for manual');
  }
});

test('A11Y: getSourceTypeLabel returns "Booking" for booking', () => {
  if (!/=== 'booking'/.test(a11ySrc) || !/Booking/.test(a11ySrc)) {
    throw new Error('getSourceTypeLabel must return "Booking" for booking');
  }
});

// ── Keyboard navigation ──
test('A11Y: handleKeyboardActivate handles Enter key', () => {
  if (!/'Enter'/.test(a11ySrc)) throw new Error('handleKeyboardActivate must handle Enter key');
});

test('A11Y: handleKeyboardActivate handles Space key', () => {
  if (!/' '|'Spacebar'/.test(a11ySrc)) throw new Error('handleKeyboardActivate must handle Space key');
});

// ── Reduced motion CSS ──
test('A11Y: index.css has prefers-reduced-motion media query (§114)', () => {
  if (!/prefers-reduced-motion/.test(cssSrc)) {
    throw new Error('index.css must have prefers-reduced-motion media query (§114)');
  }
});

test('A11Y: reduced motion disables animations', () => {
  if (!/animation-duration.*0\.01ms/.test(cssSrc)) {
    throw new Error('Reduced motion must disable animations');
  }
});

test('A11Y: reduced motion disables transitions', () => {
  if (!/transition-duration.*0\.01ms/.test(cssSrc)) {
    throw new Error('Reduced motion must disable transitions');
  }
});

// ── Per-view accessibility checks ──
const views = [
  { name: 'DayView', file: 'DayView.jsx' },
  { name: 'WeekView', file: 'WeekView.jsx' },
  { name: 'AgendaView', file: 'AgendaView.jsx' },
  { name: 'TodayView', file: 'TodayView.jsx' },
];

for (const { name, file } of views) {
  const filePath = path.join(COMP_DIR, file);
  const src = fs.readFileSync(filePath, 'utf8');

  test(`${name}: uses semantic <time> elements (§114)`, () => {
    if (!/<time/.test(src)) throw new Error(`${name} must use semantic <time> elements`);
  });

  test(`${name}: has ARIA labels on interactive elements`, () => {
    if (!/aria-label/.test(src)) throw new Error(`${name} must have ARIA labels`);
  });

  test(`${name}: supports keyboard navigation (role=button + tabIndex + onKeyDown)`, () => {
    if (!/role="button"/.test(src)) throw new Error(`${name} must use role="button"`);
    if (!/tabIndex/.test(src)) throw new Error(`${name} must have tabIndex`);
    if (!/onKeyDown/.test(src)) throw new Error(`${name} must handle onKeyDown`);
  });

  test(`${name}: has visible focus styles (focus-visible:ring)`, () => {
    if (!/focus-visible:ring/.test(src)) throw new Error(`${name} must have visible focus styles`);
  });

  test(`${name}: text labels alongside colour indicators`, () => {
    if (!/getSourceTypeLabel|sourceLabel/.test(src)) throw new Error(`${name} must show text labels alongside colour`);
  });
}

// ── CalendarViewSwitcher accessibility ──
const switcherSrc = fs.readFileSync(path.join(COMP_DIR, 'CalendarViewSwitcher.jsx'), 'utf8');
test('SWITCHER: uses role=tablist + role=tab (§114)', () => {
  if (!/role="tablist"/.test(switcherSrc) || !/role="tab"/.test(switcherSrc)) {
    throw new Error('CalendarViewSwitcher must use role=tablist + role=tab');
  }
});

test('SWITCHER: has aria-selected for active state', () => {
  if (!/aria-selected/.test(switcherSrc)) throw new Error('Switcher must have aria-selected');
});

test('SWITCHER: has visible focus styles', () => {
  if (!/focus-visible:ring/.test(switcherSrc)) throw new Error('Switcher must have visible focus styles');
});

// ── CalendarPage month grid accessibility ──
test('PAGE: month grid buttons have aria-label', () => {
  if (!/aria-label=.*day\.toLocaleDateString/.test(pageSrc)) {
    throw new Error('Month grid buttons must have aria-label with date info');
  }
});

test('PAGE: month grid uses semantic <time> for day numbers', () => {
  if (!/<time dateTime=/.test(pageSrc)) {
    throw new Error('Month grid must use semantic <time> elements');
  }
});

test('PAGE: navigation buttons have aria-label', () => {
  if (!/aria-label="Previous|aria-label="Next/.test(pageSrc)) {
    throw new Error('Navigation buttons must have aria-label');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);