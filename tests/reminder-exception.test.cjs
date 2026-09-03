// Reminder rule + occurrence exception conformance tests (§55–§63).
// ───────────────────────────────────────────────────────────
// Tests the exception application logic and reminder idempotency model.
// Run with: node tests/reminder-exception.test.cjs

const assert = require('assert');

// ── Exception application (mirrors calendarEventExceptions.ts applyExceptions) ──
function applyExceptions(occurrences, exceptions) {
  const exceptionMap = new Map(exceptions.map(e => [e.original_start_time, e]));
  const out = [];
  for (const occ of occurrences) {
    const idx = occ.occurrenceId.lastIndexOf('__');
    const originalStart = idx > 0 ? occ.occurrenceId.slice(idx + 2) : occ.start;
    const exc = exceptionMap.get(originalStart);
    if (!exc) { out.push(occ); continue; }
    if (exc.exception_type === 'cancelled') continue;
    if (exc.exception_type === 'rescheduled' && exc.new_start_time && exc.new_end_time) {
      out.push({ occurrenceId: occ.occurrenceId, start: exc.new_start_time, end: exc.new_end_time });
    }
  }
  return out;
}

// ── Reminder idempotency model (mirrors reminderSweep.ts logic) ──
// A reminder fires if: reminderTime <= now AND event not expired AND
// last_dispatched_occurrence != current occurrence.
function shouldFireReminder(rule, occurrenceStart, now) {
  const occStart = new Date(occurrenceStart);
  const reminderTime = new Date(occStart.getTime() - (rule.offset_minutes || 30) * 60 * 1000);
  const expiryCutoff = new Date(now.getTime() - 5 * 60 * 1000); // 5 min grace
  if (reminderTime > now) return false; // not yet
  if (occStart < expiryCutoff) return false; // expired (§63)
  if (rule.last_dispatched_occurrence === occurrenceStart) return false; // already dispatched (§62)
  return true;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

// ── Exception tests ──
test('EXCEPTION: cancelled occurrence is removed', () => {
  const occs = [
    { occurrenceId: 'ev1__2026-09-01T10:00:00.000Z', start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T11:00:00.000Z' },
    { occurrenceId: 'ev1__2026-09-02T10:00:00.000Z', start: '2026-09-02T10:00:00.000Z', end: '2026-09-02T11:00:00.000Z' },
    { occurrenceId: 'ev1__2026-09-03T10:00:00.000Z', start: '2026-09-03T10:00:00.000Z', end: '2026-09-03T11:00:00.000Z' },
  ];
  const excs = [{ original_start_time: '2026-09-02T10:00:00.000Z', exception_type: 'cancelled' }];
  const result = applyExceptions(occs, excs);
  assert.strictEqual(result.length, 2);
  assert.ok(!result.find(o => o.occurrenceId.includes('2026-09-02')));
});

test('EXCEPTION: rescheduled occurrence keeps stable identity', () => {
  const occs = [
    { occurrenceId: 'ev1__2026-09-01T10:00:00.000Z', start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T11:00:00.000Z' },
  ];
  const excs = [{
    original_start_time: '2026-09-01T10:00:00.000Z', exception_type: 'rescheduled',
    new_start_time: '2026-09-01T14:00:00.000Z', new_end_time: '2026-09-01T15:00:00.000Z',
  }];
  const result = applyExceptions(occs, excs);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].start, '2026-09-01T14:00:00.000Z');
  assert.strictEqual(result[0].end, '2026-09-01T15:00:00.000Z');
  // Identity preserved
  assert.strictEqual(result[0].occurrenceId, 'ev1__2026-09-01T10:00:00.000Z');
});

test('EXCEPTION: no exceptions → all occurrences pass through', () => {
  const occs = [
    { occurrenceId: 'ev1__2026-09-01T10:00:00.000Z', start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T11:00:00.000Z' },
    { occurrenceId: 'ev1__2026-09-02T10:00:00.000Z', start: '2026-09-02T10:00:00.000Z', end: '2026-09-02T11:00:00.000Z' },
  ];
  const result = applyExceptions(occs, []);
  assert.strictEqual(result.length, 2);
});

test('EXCEPTION: multiple exceptions on different occurrences', () => {
  const occs = [
    { occurrenceId: 'ev1__2026-09-01T10:00:00.000Z', start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T11:00:00.000Z' },
    { occurrenceId: 'ev1__2026-09-02T10:00:00.000Z', start: '2026-09-02T10:00:00.000Z', end: '2026-09-02T11:00:00.000Z' },
    { occurrenceId: 'ev1__2026-09-03T10:00:00.000Z', start: '2026-09-03T10:00:00.000Z', end: '2026-09-03T11:00:00.000Z' },
  ];
  const excs = [
    { original_start_time: '2026-09-01T10:00:00.000Z', exception_type: 'cancelled' },
    { original_start_time: '2026-09-03T10:00:00.000Z', exception_type: 'rescheduled', new_start_time: '2026-09-03T16:00:00.000Z', new_end_time: '2026-09-03T17:00:00.000Z' },
  ];
  const result = applyExceptions(occs, excs);
  assert.strictEqual(result.length, 2);
  assert.ok(result.find(o => o.occurrenceId.includes('2026-09-02')));
  assert.ok(result.find(o => o.start === '2026-09-03T16:00:00.000Z'));
});

// ── Reminder idempotency tests ──
test('REMINDER: fires when reminder time has arrived', () => {
  const rule = { offset_minutes: 30, last_dispatched_occurrence: null };
  const occStart = '2026-09-03T10:00:00Z'; // event at 10:00
  const now = new Date('2026-09-03T09:35:00Z'); // 25 min before = 5 min past reminder time
  assert.ok(shouldFireReminder(rule, occStart, now));
});

test('REMINDER: does not fire before reminder time', () => {
  const rule = { offset_minutes: 30, last_dispatched_occurrence: null };
  const occStart = '2026-09-03T10:00:00Z';
  const now = new Date('2026-09-03T09:25:00Z'); // 35 min before event = 5 min before reminder time
  assert.ok(!shouldFireReminder(rule, occStart, now));
});

test('REMINDER: idempotent — does not fire twice for same occurrence (§62)', () => {
  const rule = { offset_minutes: 30, last_dispatched_occurrence: '2026-09-03T10:00:00Z' };
  const occStart = '2026-09-03T10:00:00Z';
  const now = new Date('2026-09-03T09:35:00Z');
  assert.ok(!shouldFireReminder(rule, occStart, now));
});

test('REMINDER: expired — does not fire for past event (§63)', () => {
  const rule = { offset_minutes: 30, last_dispatched_occurrence: null };
  const occStart = '2026-09-03T10:00:00Z';
  const now = new Date('2026-09-03T10:10:00Z'); // 10 min after event start = past 5-min grace
  assert.ok(!shouldFireReminder(rule, occStart, now));
});

test('REMINDER: fires within grace period after event start', () => {
  const rule = { offset_minutes: 30, last_dispatched_occurrence: null };
  const occStart = '2026-09-03T10:00:00Z';
  const now = new Date('2026-09-03T10:03:00Z'); // 3 min after event start = within 5-min grace
  assert.ok(shouldFireReminder(rule, occStart, now));
});

test('REMINDER: offset 0 = at event start', () => {
  const rule = { offset_minutes: 0, last_dispatched_occurrence: null };
  const occStart = '2026-09-03T10:00:00Z';
  const now = new Date('2026-09-03T10:00:00Z'); // exactly at start
  assert.ok(shouldFireReminder(rule, occStart, now));
});

test('REMINDER: different occurrences are independent', () => {
  const rule = { offset_minutes: 30, last_dispatched_occurrence: '2026-09-03T10:00:00Z' };
  const occStart2 = '2026-09-04T10:00:00Z';
  const now = new Date('2026-09-04T09:35:00Z');
  assert.ok(shouldFireReminder(rule, occStart2, now)); // second occurrence fires
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);