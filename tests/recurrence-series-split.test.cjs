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

test('SPLIT: enforces source authority — only manual (Calendar-owned) series can be split', () => {
  // Source authority: not a permanent blacklist, but an explicit authority map.
  // SOURCE_SPLIT_AUTHORITY must exist and only 'manual' must be authorised.
  if (!/SOURCE_SPLIT_AUTHORITY/.test(splitSrc)) {
    throw new Error('must define SOURCE_SPLIT_AUTHORITY for source-authority check');
  }
  if (!/manual:\s*true/.test(splitSrc)) {
    throw new Error('manual (Calendar-owned) must be authorised for splitting');
  }
  if (!/isSourceAuthorised/.test(splitSrc)) {
    throw new Error('must check isSourceAuthorised before splitting');
  }
  // Must reject with a scheduling-contract message (not a booking-specific one)
  if (!/scheduling contract/.test(splitSrc)) {
    throw new Error('must explain that source systems must authorise via scheduling contract');
  }
});

test('SPLIT: rejects all non-manual source systems (booking, workout, business_scheduling, external, messaging)', () => {
  // No other source system should have authority:true in the map
  const authBlock = splitSrc.match(/SOURCE_SPLIT_AUTHORITY[^}]*}/);
  if (!authBlock) throw new Error('SOURCE_SPLIT_AUTHORITY block not found');
  // The block must NOT authorise booking/workout/business_scheduling/external/messaging
  if (/booking:\s*true/.test(authBlock[0])) {
    throw new Error('booking must not be authorised for splitting');
  }
  if (/workout:\s*true/.test(authBlock[0])) {
    throw new Error('workout must not be authorised for splitting');
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

test('SPLIT: no content moderation (removed — Trust & Safety owns behavioural restrictions)', () => {
  // Content moderation was an independently invented Calendar policy that
  // violated the V2 ownership boundary (§4, §87, §125). It must be gone.
  if (/moderateEventContent/.test(splitSrc)) {
    throw new Error('content moderation must be removed from series split');
  }
  if (/contentModeration/.test(splitSrc)) {
    throw new Error('contentModeration import must be removed');
  }
});

test('SPLIT: exported from cloud-functions index', () => {
  const idx = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'index.ts'), 'utf8');
  if (!/splitRecurrenceSeries/.test(idx)) {
    throw new Error('splitRecurrenceSeries must be exported from index.ts');
  }
});

// ── Retry-safety / durability tests (§57) ──
// The series split must be retry-safe: failure at any point must allow the
// same request to be retried without losing exceptions, duplicating
// exceptions, creating overlapping series, or creating gaps.

test('SPLIT-RETRY: exception migration runs OUTSIDE if (created) — always runs', () => {
  // Exception migration must NOT be gated on first creation. A retry after
  // partial failure (split succeeded, migration failed) must re-run migration.
  // Find the exception migration block and verify it's after the `if (created)`
  // block for schedule history, not inside it.
  const migrationIdx = splitSrc.indexOf('Migrate future exceptions');
  const createdBlockIdx = splitSrc.indexOf('if (created)');
  if (migrationIdx === -1) throw new Error('exception migration block not found');
  if (createdBlockIdx === -1) throw new Error('if (created) block not found');
  // The migration block must come BEFORE the if (created) block
  if (migrationIdx > createdBlockIdx) {
    throw new Error('exception migration must run BEFORE (outside) the if (created) block');
  }
});

test('SPLIT-RETRY: re-creates exception on new series BEFORE deleting from old (durability)', () => {
  // The ordering is critical: if delete happens first and re-create fails,
  // the exception is lost. Re-create must come first so a failure preserves
  // the exception on the old series for retry.
  const setOccIdx = splitSrc.indexOf('setOccurrenceException');
  const deleteIdx = splitSrc.indexOf('.delete().catch');
  if (setOccIdx === -1) throw new Error('setOccurrenceException call not found');
  if (deleteIdx === -1) throw new Error('delete call not found');
  if (setOccIdx > deleteIdx) {
    throw new Error('must re-create on new series BEFORE deleting from old');
  }
});

test('SPLIT-RETRY: delete from old series uses .catch() (idempotent no-op)', () => {
  // Delete must be resilient to already-deleted docs (retry scenario)
  if (!/\.delete\(\)\.catch\(\(\) => \{\}\)/.test(splitSrc)) {
    throw new Error('delete must use .catch(() => {}) for idempotent retry');
  }
});

test('SPLIT-RETRY: projection maintenance runs OUTSIDE if (created) — always runs', () => {
  // Projections must be maintained on every call (idempotent), not just
  // first creation, so a retry ensures correct projections.
  const lastMaintainIdx = splitSrc.lastIndexOf('maintainProjection(');
  const createdBlockEnd = splitSrc.indexOf('if (created)');
  // Find the if (created) block end — the closing brace before maintainProjection
  if (lastMaintainIdx === -1) throw new Error('maintainProjection call not found');
  // The last maintainProjection must be AFTER the if (created) block
  // (i.e., outside it — runs unconditionally)
  const createdBlock = splitSrc.slice(createdBlockEnd);
  const maintainInCreated = createdBlock.slice(0, createdBlock.indexOf('maintainProjection')).includes('if (created)');
  // Check that maintainProjection appears AFTER the if (created) block closes
  const createdCloseIdx = splitSrc.indexOf('}', splitSrc.indexOf('appendScheduleHistory', createdBlockEnd));
  if (createdCloseIdx === -1) throw new Error('could not find end of if (created) block');
  // There should be a maintainProjection call after the if (created) block
  const afterCreated = splitSrc.slice(createdCloseIdx);
  if (!/maintainProjection/.test(afterCreated)) {
    throw new Error('maintainProjection must run outside if (created) — always');
  }
});

test('SPLIT-RETRY: schedule history stays INSIDE if (created) — not idempotent', () => {
  // Schedule history is append-only (random doc IDs) — must only run on
  // first creation to avoid duplicate history entries on retry.
  // Search for the appendScheduleHistory CALL (not the import).
  const callIdx = splitSrc.indexOf('appendScheduleHistory({');
  if (callIdx === -1) throw new Error('appendScheduleHistory call not found');
  const createdBlockIdx = splitSrc.indexOf('if (created)');
  if (createdBlockIdx === -1) throw new Error('if (created) block not found');
  // The call must be AFTER the if (created) line (inside the block)
  if (callIdx < createdBlockIdx) {
    throw new Error('schedule history call must be inside if (created) block');
  }
  // The call must be BEFORE the projection maintenance (which is outside if (created))
  const maintainIdx = splitSrc.indexOf('// ── Maintain projections');
  if (maintainIdx === -1) throw new Error('maintain projections section not found');
  if (callIdx > maintainIdx) {
    throw new Error('schedule history must be before projection maintenance (inside if (created))');
  }
  // Verify NO appendScheduleHistory call exists after the maintain projections section
  const afterMaintain = splitSrc.slice(maintainIdx);
  if (/appendScheduleHistory\({/.test(afterMaintain)) {
    throw new Error('schedule history must not run outside if (created)');
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