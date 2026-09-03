// Calendar occurrences conformance tests (§18–§22, §53–§58, §70–§74).
// ───────────────────────────────────────────────────────────
// Tests the shared normalized occurrence model: recurring event expansion,
// exception application, range filtering, search/filter, and date grouping.
// Run with: node tests/calendar-occurrences.test.cjs

const assert = require('assert');

// Inline the occurrence model logic (mirrors src/lib/calendarOccurrences.js)
// and the recurrence engine (mirrors src/lib/recurrence.js).

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
    until: parts.UNTIL ? parseUntil(parts.UNTIL) : null,
    byDay: parts.BYDAY ? parts.BYDAY.split(',').map(d => d.trim().toUpperCase()).filter(d => DAY_MAP[d] !== undefined) : null,
    byMonthDay: parts.BYMONTHDAY ? parts.BYMONTHDAY.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d)) : null,
  };
}

function parseUntil(untilStr) {
  const u = untilStr.trim();
  if (/^\d{8}T\d{6}Z$/.test(u)) return `${u.slice(0,4)}-${u.slice(4,6)}-${u.slice(6,8)}T${u.slice(9,11)}:${u.slice(11,13)}:${u.slice(13,15)}Z`;
  if (/^\d{8}$/.test(u)) return `${u.slice(0,4)}-${u.slice(4,6)}-${u.slice(6,8)}T23:59:59Z`;
  return u;
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

// ── normalizeToOccurrences (mirrors src/lib/calendarOccurrences.js) ──
function normalizeToOccurrences(events, exceptions, rangeStart, rangeEnd) {
  if (!events || events.length === 0) return [];
  const exceptionMap = new Map();
  for (const exc of exceptions || []) {
    const key = exc.exception_id || `${exc.series_event_id}__${exc.original_start_time}`;
    exceptionMap.set(key, exc);
  }
  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();
  const occurrences = [];
  for (const event of events) {
    if (!event) continue;
    if (event.lifecycle_state === 'cancelled') continue;
    if (event.recurrence_rule) {
      const effectiveUntilIso = event.effective_until || rangeEnd.toISOString();
      const expanded = expandOccurrences(event.id, event.recurrence_rule, event.start_time, event.end_time, rangeStart.toISOString(), effectiveUntilIso);
      for (const occ of expanded) {
        const exc = exceptionMap.get(occ.occurrenceId);
        if (exc && exc.exception_type === 'cancelled') continue;
        if (exc && exc.exception_type === 'rescheduled' && exc.new_start_time && exc.new_end_time) {
          const occStartMs = new Date(exc.new_start_time).getTime();
          if (occStartMs >= rangeStartMs && occStartMs <= rangeEndMs) {
            occurrences.push({ occurrenceId: occ.occurrenceId, seriesEventId: event.id, start: exc.new_start_time, end: exc.new_end_time, event, isRecurring: true, isException: true });
          }
        } else {
          const occStartMs = new Date(occ.start).getTime();
          if (occStartMs >= rangeStartMs && occStartMs <= rangeEndMs) {
            occurrences.push({ occurrenceId: occ.occurrenceId, seriesEventId: event.id, start: occ.start, end: occ.end, event, isRecurring: true, isException: false });
          }
        }
      }
    } else {
      const occStartMs = new Date(event.start_time).getTime();
      if (occStartMs >= rangeStartMs && occStartMs <= rangeEndMs) {
        occurrences.push({ occurrenceId: event.id, seriesEventId: null, start: event.start_time, end: event.end_time, event, isRecurring: false, isException: false });
      }
    }
  }
  return occurrences.sort((a, b) => new Date(a.start) - new Date(b.start));
}

function filterOccurrences(occurrences, { search, visibility, sourceSystem, lifecycleState } = {}) {
  return occurrences.filter((occ) => {
    const event = occ.event;
    if (search) {
      const q = search.toLowerCase();
      const title = (event.title || '').toLowerCase();
      const desc = (event.description || '').toLowerCase();
      if (!title.includes(q) && !desc.includes(q)) return false;
    }
    if (visibility && event.visibility !== visibility) return false;
    if (sourceSystem && event.source_system !== sourceSystem) return false;
    if (lifecycleState && event.lifecycle_state !== lifecycleState) return false;
    return true;
  });
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

test('OCCURRENCES: non-recurring event → single occurrence', () => {
  const events = [{ id: 'ev1', title: 'Single', start_time: '2026-09-15T10:00:00Z', end_time: '2026-09-15T11:00:00Z', lifecycle_state: 'scheduled' }];
  const occs = normalizeToOccurrences(events, [], new Date('2026-09-01'), new Date('2026-09-30'));
  assert.strictEqual(occs.length, 1);
  assert.strictEqual(occs[0].occurrenceId, 'ev1');
  assert.strictEqual(occs[0].isRecurring, false);
  assert.strictEqual(occs[0].seriesEventId, null);
});

test('OCCURRENCES: recurring DAILY expands to multiple occurrences', () => {
  const events = [{ id: 'ev2', title: 'Daily', start_time: '2026-09-01T10:00:00Z', end_time: '2026-09-01T11:00:00Z', recurrence_rule: 'FREQ=DAILY;COUNT=5', lifecycle_state: 'scheduled' }];
  const occs = normalizeToOccurrences(events, [], new Date('2026-09-01'), new Date('2026-09-10'));
  assert.strictEqual(occs.length, 5);
  assert.ok(occs.every(o => o.isRecurring === true));
  assert.ok(occs.every(o => o.seriesEventId === 'ev2'));
  assert.ok(occs.every(o => o.occurrenceId.startsWith('ev2__')));
});

test('OCCURRENCES: cancelled exception removes occurrence', () => {
  const events = [{ id: 'ev3', title: 'Daily', start_time: '2026-09-01T10:00:00Z', end_time: '2026-09-01T11:00:00Z', recurrence_rule: 'FREQ=DAILY;COUNT=3', lifecycle_state: 'scheduled' }];
  const exceptions = [{ exception_id: 'ev3__2026-09-02T10:00:00.000Z', series_event_id: 'ev3', original_start_time: '2026-09-02T10:00:00.000Z', exception_type: 'cancelled' }];
  const occs = normalizeToOccurrences(events, exceptions, new Date('2026-09-01'), new Date('2026-09-05'));
  assert.strictEqual(occs.length, 2); // Sep 1 and Sep 3 (Sep 2 cancelled)
  assert.ok(!occs.find(o => o.start === '2026-09-02T10:00:00.000Z'));
});

test('OCCURRENCES: rescheduled exception moves occurrence time', () => {
  const events = [{ id: 'ev4', title: 'Daily', start_time: '2026-09-01T10:00:00Z', end_time: '2026-09-01T11:00:00Z', recurrence_rule: 'FREQ=DAILY;COUNT=3', lifecycle_state: 'scheduled' }];
  const exceptions = [{
    exception_id: 'ev4__2026-09-02T10:00:00.000Z', series_event_id: 'ev4',
    original_start_time: '2026-09-02T10:00:00.000Z', exception_type: 'rescheduled',
    new_start_time: '2026-09-02T14:00:00.000Z', new_end_time: '2026-09-02T15:00:00.000Z',
  }];
  const occs = normalizeToOccurrences(events, exceptions, new Date('2026-09-01'), new Date('2026-09-05'));
  assert.strictEqual(occs.length, 3);
  const rescheduled = occs.find(o => o.isException === true);
  assert.ok(rescheduled);
  assert.strictEqual(rescheduled.start, '2026-09-02T14:00:00.000Z');
  assert.strictEqual(rescheduled.end, '2026-09-02T15:00:00.000Z');
  // Stable identity preserved
  assert.ok(rescheduled.occurrenceId.includes('2026-09-02T10:00:00.000Z'));
});

test('OCCURRENCES: effective_until caps superseded series (§57)', () => {
  const events = [{ id: 'ev5', title: 'Daily', start_time: '2026-09-01T10:00:00Z', end_time: '2026-09-01T11:00:00Z', recurrence_rule: 'FREQ=DAILY;COUNT=30', effective_until: '2026-09-05T23:59:59Z', lifecycle_state: 'scheduled' }];
  const occs = normalizeToOccurrences(events, [], new Date('2026-09-01'), new Date('2026-09-30'));
  // effective_until caps occurrences to Sep 1-5
  assert.strictEqual(occs.length, 5);
});

test('OCCURRENCES: cancelled events are excluded', () => {
  const events = [
    { id: 'ev6', title: 'Active', start_time: '2026-09-15T10:00:00Z', end_time: '2026-09-15T11:00:00Z', lifecycle_state: 'scheduled' },
    { id: 'ev7', title: 'Cancelled', start_time: '2026-09-16T10:00:00Z', end_time: '2026-09-16T11:00:00Z', lifecycle_state: 'cancelled' },
  ];
  const occs = normalizeToOccurrences(events, [], new Date('2026-09-01'), new Date('2026-09-30'));
  assert.strictEqual(occs.length, 1);
  assert.strictEqual(occs[0].event.title, 'Active');
});

test('OCCURRENCES: range filtering excludes out-of-range events', () => {
  const events = [
    { id: 'ev8', title: 'In', start_time: '2026-09-15T10:00:00Z', end_time: '2026-09-15T11:00:00Z', lifecycle_state: 'scheduled' },
    { id: 'ev9', title: 'Out', start_time: '2026-10-15T10:00:00Z', end_time: '2026-10-15T11:00:00Z', lifecycle_state: 'scheduled' },
  ];
  const occs = normalizeToOccurrences(events, [], new Date('2026-09-01'), new Date('2026-09-30'));
  assert.strictEqual(occs.length, 1);
  assert.strictEqual(occs[0].event.title, 'In');
});

test('FILTER: search by title', () => {
  const occs = [
    { event: { title: 'Yoga Class', description: '' }, occurrenceId: '1', start: '2026-09-01', end: '2026-09-01' },
    { event: { title: 'Pilates', description: 'core strength' }, occurrenceId: '2', start: '2026-09-02', end: '2026-09-02' },
  ];
  const filtered = filterOccurrences(occs, { search: 'yoga' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].event.title, 'Yoga Class');
});

test('FILTER: search by description', () => {
  const occs = [
    { event: { title: 'Yoga Class', description: '' }, occurrenceId: '1', start: '2026-09-01', end: '2026-09-01' },
    { event: { title: 'Pilates', description: 'core strength' }, occurrenceId: '2', start: '2026-09-02', end: '2026-09-02' },
  ];
  const filtered = filterOccurrences(occs, { search: 'core' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].event.title, 'Pilates');
});

test('FILTER: by visibility', () => {
  const occs = [
    { event: { title: 'A', visibility: 'public' }, occurrenceId: '1', start: '2026-09-01', end: '2026-09-01' },
    { event: { title: 'B', visibility: 'private' }, occurrenceId: '2', start: '2026-09-02', end: '2026-09-02' },
  ];
  const filtered = filterOccurrences(occs, { visibility: 'public' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].event.title, 'A');
});

test('FILTER: by source system', () => {
  const occs = [
    { event: { title: 'A', source_system: 'manual' }, occurrenceId: '1', start: '2026-09-01', end: '2026-09-01' },
    { event: { title: 'B', source_system: 'booking' }, occurrenceId: '2', start: '2026-09-02', end: '2026-09-02' },
  ];
  const filtered = filterOccurrences(occs, { sourceSystem: 'booking' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].event.title, 'B');
});

test('FILTER: combined search + filter', () => {
  const occs = [
    { event: { title: 'Yoga', visibility: 'public', source_system: 'manual' }, occurrenceId: '1', start: '2026-09-01', end: '2026-09-01' },
    { event: { title: 'Yoga', visibility: 'private', source_system: 'manual' }, occurrenceId: '2', start: '2026-09-02', end: '2026-09-02' },
    { event: { title: 'Pilates', visibility: 'public', source_system: 'manual' }, occurrenceId: '3', start: '2026-09-03', end: '2026-09-03' },
  ];
  const filtered = filterOccurrences(occs, { search: 'yoga', visibility: 'public' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].event.title, 'Yoga');
});

test('OCCURRENCES: occurrences are sorted by start time', () => {
  const events = [
    { id: 'ev10', title: 'Late', start_time: '2026-09-20T10:00:00Z', end_time: '2026-09-20T11:00:00Z', lifecycle_state: 'scheduled' },
    { id: 'ev11', title: 'Early', start_time: '2026-09-05T10:00:00Z', end_time: '2026-09-05T11:00:00Z', lifecycle_state: 'scheduled' },
  ];
  const occs = normalizeToOccurrences(events, [], new Date('2026-09-01'), new Date('2026-09-30'));
  assert.strictEqual(occs[0].event.title, 'Early');
  assert.strictEqual(occs[1].event.title, 'Late');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);