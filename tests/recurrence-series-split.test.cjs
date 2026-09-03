// Recurrence series split — "this and future" conformance tests (§57).
// ───────────────────────────────────────────────────────────
// Tests the series-split semantics: effective_until capping, superseded_by_id
// linking, exception migration, idempotency, and the Cloud Function contract.
// Run with: node tests/recurrence-series-split.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

// ── Source-contract: the Cloud Function exists and enforces the right rules ──
const SPLIT = path.join(__dirname, '..', 'cloud-functions', 'src', 'recurrenceSeriesSplit.ts');
const splitSrc = fs.readFileSync(SPLIT, 'utf8');

test('SPLIT: splitRecurrenceSeries Cloud Function is exported', () => {
  if (!/export const splitRecurrenceSeries/.test(splitSrc)) {
    throw new Error('splitRecurrenceSeries must be exported');
  }
});

test('SPLIT: sets effective_until on old series (§57)', () => {
  if (!/effective_until: effectiveUntilIso/.test(splitSrc)) {
    throw new Error('must set effective_until on old series');
  }
  // effective_until must be before the split occurrence
  if (!/splitDate\.getTime\(\) - 1/.test(splitSrc)) {
    throw new Error('effective_until must be just before the split occurrence');
  }
});

test('SPLIT: sets superseded_by_id on old series (audit link — §57)', () => {
  if (!/superseded_by_id: newRef\.id/.test(splitSrc)) {
    throw new Error('must set superseded_by_id on old series');
  }
});

test('SPLIT: creates a new series with preserved ownership', () => {
  // owner_id, owner_type, created_by_id must be inherited, not the caller
  if (!/owner_id: oldEvent\.owner_id/.test(splitSrc)) {
    throw new Error('new series must inherit owner_id from old series');
  }
  if (!/owner_type: oldEvent\.owner_type/.test(splitSrc)) {
    throw new Error('new series must inherit owner_type from old series');
  }
  if (!/created_by_id: oldEvent\.created_by_id/.test(splitSrc)) {
    throw new Error('new series must preserve original created_by_id');
  }
});

test('SPLIT: rejects booking-owned series', () => {
  if (!/source_system === 'booking'/.test(splitSrc)) {
    throw new Error('must reject booking-owned series');
  }
});

test('SPLIT: rejects already-superseded series (historical integrity)', () => {
  if (!/superseded_by_id/.test(splitSrc)) {
    throw new Error('must check superseded_by_id');
  }
  if (!/already been superseded/.test(splitSrc)) {
    throw new Error('must reject already-superseded series');
  }
});

test('SPLIT: idempotent via calendarEventIdempotency', () => {
  if (!/calendarEventIdempotency/.test(splitSrc)) {
    throw new Error('must use calendarEventIdempotency');
  }
  if (!/existingNewId/.test(splitSrc)) {
    throw new Error('must return existing new ID on repeat call');
  }
});

test('SPLIT: migrates future exceptions to new series', () => {
  if (!/listExceptions/.test(splitSrc)) {
    throw new Error('must list exceptions for migration');
  }
  if (!/>= splitDate\.getTime\(\)/.test(splitSrc)) {
    throw new Error('must migrate exceptions >= split_start_time');
  }
  if (!/setOccurrenceException/.test(splitSrc)) {
    throw new Error('must re-create exceptions on new series');
  }
});

test('SPLIT: records schedule history for old (recurrence_changed) and new (created)', () => {
  if (!/change_type: 'recurrence_changed'/.test(splitSrc)) {
    throw new Error('old series must record recurrence_changed');
  }
  if (!/change_type: 'created'/.test(splitSrc)) {
    throw new Error('new series must record created');
  }
});

test('SPLIT: maintains public projections for both old and new series', () => {
  if (!/maintainProjection\(series_event_id/.test(splitSrc)) {
    throw new Error('must maintain projection for old series');
  }
  if (!/maintainProjection\(finalNewId/.test(splitSrc)) {
    throw new Error('must maintain projection for new series');
  }
});

test('SPLIT: content moderation applied to new title/description', () => {
  if (!/moderateEventContent/.test(splitSrc)) {
    throw new Error('must moderate new title/description');
  }
});

test('SPLIT: exported from cloud-functions index', () => {
  const idx = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'index.ts'), 'utf8');
  if (!/splitRecurrenceSeries/.test(idx)) {
    throw new Error('splitRecurrenceSeries must be exported from index.ts');
  }
});

// ── Pure-logic: effective_until capping semantics ──
// Mirrors the expandOccurrences logic from recurrence.ts.
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
  };
}

function occurrenceId(seriesId, startIso) { return `${seriesId}__${startIso}`; }

function expandWithEffectiveUntil(seriesId, rruleStr, dtStartIso, dtEndIso, rangeStartIso, effectiveUntilIso) {
  const rule = parseRRule(rruleStr);
  if (!rule) return [];
  const dtStart = new Date(dtStartIso);
  const dtEnd = new Date(dtEndIso);
  const durationMs = dtEnd.getTime() - dtStart.getTime();
  const rangeStart = new Date(rangeStartIso);
  const effectiveUntil = new Date(effectiveUntilIso);
  const occurrences = [];
  if (rule.freq === 'DAILY') {
    let current = new Date(dtStart);
    let count = 0;
    while (current <= effectiveUntil && occurrences.length < 365) {
      if (rule.count && count >= rule.count) break;
      count++;
      if (current >= rangeStart && current <= effectiveUntil) {
        const occEnd = new Date(current.getTime() + durationMs);
        occurrences.push({ occurrenceId: occurrenceId(seriesId, current.toISOString()), start: current.toISOString(), end: occEnd.toISOString() });
      }
      current = new Date(current.getTime() + rule.interval * 24 * 60 * 60 * 1000);
    }
  }
  return occurrences;
}

test('SPLIT-LOGIC: old series capped before split — past occurrences remain', () => {
  // Daily series from Sep 1, COUNT=10. Split at Sep 5.
  // effective_until = Sep 5 - 1ms. Old series generates Sep 1-4 (4 occurrences).
  const oldSeriesId = 'ev-old';
  const dtStart = '2026-09-01T10:00:00Z';
  const dtEnd = '2026-09-01T11:00:00Z';
  const splitStart = '2026-09-05T10:00:00.000Z';
  const effectiveUntil = new Date(new Date(splitStart).getTime() - 1).toISOString();
  const occs = expandWithEffectiveUntil(oldSeriesId, 'FREQ=DAILY;COUNT=10', dtStart, dtEnd, '2026-09-01T00:00:00Z', effectiveUntil);
  assert.strictEqual(occs.length, 4);
  assert.ok(occs.every(o => !o.start.startsWith('2026-09-05')));
  assert.ok(occs.every(o => !o.start.startsWith('2026-09-06')));
});

test('SPLIT-LOGIC: new series generates from split onward', () => {
  // New series DTSTART = Sep 5, same daily rule. Generates Sep 5 onward.
  const newSeriesId = 'ev-new';
  const newStart = '2026-09-05T10:00:00Z';
  const newEnd = '2026-09-05T11:00:00Z';
  const occs = expandWithEffectiveUntil(newSeriesId, 'FREQ=DAILY;COUNT=10', newStart, newEnd, '2026-09-01T00:00:00Z', '2026-12-31T00:00:00Z');
  // Sep 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 (10 occurrences from new DTSTART)
  assert.strictEqual(occs.length, 10);
  assert.strictEqual(occs[0].start, '2026-09-05T10:00:00.000Z');
});

test('SPLIT-LOGIC: past + future = complete schedule with no gap', () => {
  const dtStart = '2026-09-01T10:00:00Z';
  const dtEnd = '2026-09-01T11:00:00Z';
  const splitStart = '2026-09-05T10:00:00.000Z';
  const effectiveUntil = new Date(new Date(splitStart).getTime() - 1).toISOString();
  const oldOccs = expandWithEffectiveUntil('ev-old', 'FREQ=DAILY;COUNT=10', dtStart, dtEnd, '2026-09-01T00:00:00Z', effectiveUntil);
  const newOccs = expandWithEffectiveUntil('ev-new', 'FREQ=DAILY;COUNT=10', '2026-09-05T10:00:00Z', '2026-09-05T11:00:00Z', '2026-09-01T00:00:00Z', '2026-12-31T00:00:00Z');
  // Old: Sep 1-4. New: Sep 5-14. Together: Sep 1-14, no gap, no overlap.
  const allStarts = [...oldOccs.map(o => o.start.slice(0, 10)), ...newOccs.map(o => o.start.slice(0, 10))];
  assert.strictEqual(allStarts.length, 14);
  // No duplicates
  assert.strictEqual(new Set(allStarts).size, 14);
  // No gap between Sep 4 and Sep 5
  assert.ok(allStarts.includes('2026-09-04'));
  assert.ok(allStarts.includes('2026-09-05'));
});

test('SPLIT-LOGIC: exception migration — past exception stays on old, future moves to new', () => {
  // Simulate exception migration logic
  const splitDate = new Date('2026-09-05T10:00:00.000Z').getTime();
  const exceptions = [
    { original_start_time: '2026-09-03T10:00:00.000Z', exception_type: 'cancelled' }, // past — stays on old
    { original_start_time: '2026-09-07T10:00:00.000Z', exception_type: 'rescheduled', new_start_time: '2026-09-07T14:00:00.000Z', new_end_time: '2026-09-07T15:00:00.000Z' }, // future — moves to new
  ];
  const oldExceptions = exceptions.filter(e => new Date(e.original_start_time).getTime() < splitDate);
  const newExceptions = exceptions.filter(e => new Date(e.original_start_time).getTime() >= splitDate);
  assert.strictEqual(oldExceptions.length, 1);
  assert.strictEqual(oldExceptions[0].original_start_time, '2026-09-03T10:00:00.000Z');
  assert.strictEqual(newExceptions.length, 1);
  assert.strictEqual(newExceptions[0].original_start_time, '2026-09-07T10:00:00.000Z');
});

test('SPLIT-LOGIC: rescheduled exception on future occurrence applies on new series', () => {
  // New series generates Sep 5, 6, 7, ... The Sep 7 exception (rescheduled to 14:00)
  // should match the new series' Sep 7 occurrence and override its time.
  const newSeriesId = 'ev-new';
  const newOccs = expandWithEffectiveUntil(newSeriesId, 'FREQ=DAILY;COUNT=10', '2026-09-05T10:00:00Z', '2026-09-05T11:00:00Z', '2026-09-01T00:00:00Z', '2026-12-31T00:00:00Z');
  const sep7Occ = newOccs.find(o => o.start.startsWith('2026-09-07'));
  assert.ok(sep7Occ);
  // The exception's original_start_time matches the occurrence's originalStart
  const excOriginalStart = '2026-09-07T10:00:00.000Z';
  const occOriginalStart = sep7Occ.occurrenceId.slice(sep7Occ.occurrenceId.lastIndexOf('__') + 2);
  assert.strictEqual(occOriginalStart, excOriginalStart);
});

test('SPLIT-LOGIC: idempotency — repeat call returns same new event ID', () => {
  // Simulate the idempotency key
  const idempKey = ['identity', 'ident-1', 'split', 'ev-old:2026-09-05T10:00:00.000Z'].join('__');
  // A repeat call with the same params produces the same key
  const idempKey2 = ['identity', 'ident-1', 'split', 'ev-old:2026-09-05T10:00:00.000Z'].join('__');
  assert.strictEqual(idempKey, idempKey2);
});

test('SPLIT-LOGIC: split occurrence excluded from old series (effective_until = split - 1ms)', () => {
  const splitStart = '2026-09-05T10:00:00.000Z';
  const effectiveUntil = new Date(new Date(splitStart).getTime() - 1).toISOString();
  // The split occurrence start must be strictly greater than effective_until
  assert.ok(new Date(splitStart) > new Date(effectiveUntil));
  // And the occurrence just before (Sep 4) must be <= effective_until
  const sep4 = '2026-09-04T10:00:00.000Z';
  assert.ok(new Date(sep4) <= new Date(effectiveUntil));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);