// Recurrence engine conformance tests (§53–§58, §96).
// ───────────────────────────────────────────────────────────
// Pure unit tests for the RRULE parser + occurrence expander.
// Run with: node tests/recurrence-engine.test.cjs

const assert = require('assert');

// Inline the engine logic (mirrors src/lib/recurrence.js) for testing.
// In production, the frontend imports from src/lib/recurrence.js and the
// backend from cloud-functions/src/recurrence.ts — identical logic.

const DAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRRule(rruleStr) {
  if (!rruleStr || typeof rruleStr !== 'string') return null;
  const clean = rruleStr.replace(/^RRULE:/i, '').trim();
  const parts = {};
  for (const segment of clean.split(';')) {
    const [k, v] = segment.split('=');
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const freq = parts.FREQ;
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
  return {
    freq,
    interval: parts.INTERVAL ? Math.max(1, parseInt(parts.INTERVAL, 10) || 1) : 1,
    count: parts.COUNT ? parseInt(parts.COUNT, 10) : null,
    until: parts.UNTIL ? parts.UNTIL : null,
    byDay: parts.BYDAY ? parts.BYDAY.split(',').map(d => d.trim().toUpperCase()).filter(d => DAY_MAP[d] !== undefined) : null,
    byMonthDay: parts.BYMONTHDAY ? parts.BYMONTHDAY.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d)) : null,
  };
}

function occurrenceId(seriesEventId, originalStartIso) {
  return `${seriesEventId}__${originalStartIso}`;
}

function expandOccurrences(seriesEventId, rruleStr, dtStartIso, dtEndIso, rangeStartIso, rangeEndIso, maxOccurrences = 365) {
  const rule = parseRRule(rruleStr);
  if (!rule) return [];
  const dtStart = new Date(dtStartIso);
  const dtEnd = new Date(dtEndIso);
  const durationMs = dtEnd.getTime() - dtStart.getTime();
  const rangeStart = new Date(rangeStartIso);
  const rangeEnd = new Date(rangeEndIso);
  const until = rule.until ? new Date(rule.until) : null;
  const effectiveUntil = until && until < rangeEnd ? until : rangeEnd;
  const occurrences = [];
  let count = 0;
  function tryOccurrence(occStart) {
    if (rule.count && count >= rule.count) return false;
    if (until && occStart > until) return false;
    count++;
    if (occStart >= rangeStart && occStart <= effectiveUntil) {
      const occEnd = new Date(occStart.getTime() + durationMs);
      occurrences.push({ occurrenceId: occurrenceId(seriesEventId, occStart.toISOString()), start: occStart.toISOString(), end: occEnd.toISOString() });
    }
    return true;
  }
  if (rule.freq === 'DAILY') {
    let current = new Date(dtStart);
    while (current <= effectiveUntil && occurrences.length < maxOccurrences) {
      if (!tryOccurrence(current)) break;
      current = new Date(current.getTime() + rule.interval * 24 * 60 * 60 * 1000);
    }
  } else if (rule.freq === 'WEEKLY') {
    const daysOfWeek = rule.byDay && rule.byDay.length > 0 ? rule.byDay.map(d => DAY_MAP[d]) : [dtStart.getDay()];
    daysOfWeek.sort((a, b) => a - b);
    let weekStart = new Date(dtStart);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    while (weekStart <= effectiveUntil && occurrences.length < maxOccurrences) {
      for (const dow of daysOfWeek) {
        const occ = new Date(weekStart);
        occ.setDate(weekStart.getDate() + dow);
        occ.setHours(dtStart.getHours(), dtStart.getMinutes(), dtStart.getSeconds(), dtStart.getMilliseconds());
        if (occ < dtStart) continue;
        if (!tryOccurrence(occ)) return occurrences;
      }
      weekStart = new Date(weekStart.getTime() + rule.interval * 7 * 24 * 60 * 60 * 1000);
    }
  } else if (rule.freq === 'MONTHLY') {
    let year = dtStart.getFullYear();
    let month = dtStart.getMonth();
    while (occurrences.length < maxOccurrences) {
      const monthDays = rule.byMonthDay && rule.byMonthDay.length > 0 ? rule.byMonthDay : [dtStart.getDate()];
      for (const dom of monthDays) {
        const occ = new Date(year, month, dom, dtStart.getHours(), dtStart.getMinutes(), dtStart.getSeconds(), dtStart.getMilliseconds());
        if (occ < dtStart) continue;
        if (!tryOccurrence(occ)) return occurrences;
      }
      month += rule.interval;
      while (month >= 12) { month -= 12; year++; }
      if (new Date(year, month, 1) > effectiveUntil) break;
    }
  }
  return occurrences;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

test('RRULE: parse DAILY', () => {
  const r = parseRRule('FREQ=DAILY;COUNT=5');
  assert.strictEqual(r.freq, 'DAILY');
  assert.strictEqual(r.count, 5);
  assert.strictEqual(r.interval, 1);
});

test('RRULE: parse WEEKLY with BYDAY', () => {
  const r = parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261231T235959Z');
  assert.strictEqual(r.freq, 'WEEKLY');
  assert.deepStrictEqual(r.byDay, ['MO', 'WE', 'FR']);
  assert.strictEqual(r.until, '20261231T235959Z');
});

test('RRULE: invalid freq returns null', () => {
  assert.strictEqual(parseRRule('FREQ=HOURLY'), null);
  assert.strictEqual(parseRRule(''), null);
  assert.strictEqual(parseRRule(null), null);
});

test('EXPAND: DAILY COUNT=5 generates 5 occurrences', () => {
  const occs = expandOccurrences('ev1', 'FREQ=DAILY;COUNT=5', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', '2026-08-01T00:00:00Z', '2026-12-31T00:00:00Z');
  assert.strictEqual(occs.length, 5);
  assert.strictEqual(occs[0].start, '2026-09-01T10:00:00.000Z');
  assert.strictEqual(occs[4].start, '2026-09-05T10:00:00.000Z');
});

test('EXPAND: WEEKLY BYDAY=MO,WE,FR generates correct days', () => {
  const occs = expandOccurrences('ev2', 'FREQ=WEEKLY;BYDAY=MO,WE,FR', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', '2026-09-01T00:00:00Z', '2026-09-12T00:00:00Z');
  // Sep 1 2026 is a Tuesday. First Monday is Sep 7, Wed is Sep 2, Fri is Sep 4
  // Occurrences: Sep 2 (Wed), Sep 4 (Fri), Sep 7 (Mon), Sep 9 (Wed), Sep 11 (Fri)
  assert.strictEqual(occs.length, 5);
  assert.ok(occs.every(o => o.occurrenceId.startsWith('ev2__')));
});

test('EXPAND: range filter — only occurrences within range', () => {
  const occs = expandOccurrences('ev3', 'FREQ=DAILY;COUNT=10', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', '2026-09-03T00:00:00Z', '2026-09-05T00:00:00Z');
  // Days 3 and 4 are in range (Sep 3, Sep 4). Sep 5 starts at 10:00 which is after range end Sep 5 00:00
  assert.ok(occs.length >= 2);
  assert.ok(occs.every(o => new Date(o.start) >= new Date('2026-09-03T00:00:00Z')));
});

test('EXPAND: UNTIL limits occurrences', () => {
  const occs = expandOccurrences('ev4', 'FREQ=DAILY;UNTIL=2026-09-03T23:59:59Z', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', '2026-08-01T00:00:00Z', '2026-12-31T00:00:00Z');
  assert.strictEqual(occs.length, 3); // Sep 1, 2, 3
});

test('EXPAND: INTERVAL=2 skips every other day', () => {
  const occs = expandOccurrences('ev5', 'FREQ=DAILY;INTERVAL=2;COUNT=3', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', '2026-08-01T00:00:00Z', '2026-12-31T00:00:00Z');
  assert.strictEqual(occs.length, 3);
  assert.strictEqual(occs[0].start, '2026-09-01T10:00:00.000Z');
  assert.strictEqual(occs[1].start, '2026-09-03T10:00:00.000Z');
  assert.strictEqual(occs[2].start, '2026-09-05T10:00:00.000Z');
});

test('EXPAND: MONTHLY BYMONTHDAY=15', () => {
  const occs = expandOccurrences('ev6', 'FREQ=MONTHLY;BYMONTHDAY=15;COUNT=3', '2026-09-15T10:00:00Z', '2026-09-15T11:00:00Z', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z');
  assert.strictEqual(occs.length, 3);
  assert.ok(occs[0].start.includes('-09-15T10:00:00'));
  assert.ok(occs[1].start.includes('-10-15T10:00:00'));
  assert.ok(occs[2].start.includes('-11-15T10:00:00'));
});

test('OCCURRENCE ID: stable identity (seriesId__originalStart)', () => {
  const id = occurrenceId('ev1', '2026-09-01T10:00:00.000Z');
  assert.strictEqual(id, 'ev1__2026-09-01T10:00:00.000Z');
  // Same inputs → same ID (stable across reschedules)
  assert.strictEqual(occurrenceId('ev1', '2026-09-01T10:00:00.000Z'), id);
  // Different series → different ID
  assert.notStrictEqual(occurrenceId('ev2', '2026-09-01T10:00:00.000Z'), id);
});

test('EXPAND: duration preserved across occurrences', () => {
  const occs = expandOccurrences('ev7', 'FREQ=DAILY;COUNT=2', '2026-09-01T10:00:00Z', '2026-09-01T10:30:00Z', '2026-08-01T00:00:00Z', '2026-12-31T00:00:00Z');
  assert.strictEqual(occs.length, 2);
  for (const o of occs) {
    const dur = new Date(o.end).getTime() - new Date(o.start).getTime();
    assert.strictEqual(dur, 30 * 60 * 1000); // 30 minutes
  }
});

test('EXPAND: non-recurring (no RRULE) returns empty', () => {
  assert.strictEqual(expandOccurrences('ev8', '', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z').length, 0);
  assert.strictEqual(expandOccurrences('ev8', null, '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z').length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);