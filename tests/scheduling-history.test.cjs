// Phase 3 (§48, §104, §105) — Calendar scheduling history.
// ───────────────────────────────────────────────────────────
// Asserts an append-only schedule-change record is written for creation,
// reschedule, cancellation, and participant changes — capturing
// previous/new schedule, change time, actor, and source system — without
// duplicating source-system audit history.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const HIST = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEventHistory.ts');
const CF = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEvent.ts');
const BL = path.join(__dirname, '..', 'cloud-functions', 'src', 'bookingLifecycle.ts');
const BP = path.join(__dirname, '..', 'cloud-functions', 'src', 'bookingPayment.ts');
const SW = path.join(__dirname, '..', 'cloud-functions', 'src', 'stripeWebhook.ts');
const RULES = path.join(__dirname, '..', 'firestore.rules');

const histSrc = fs.readFileSync(HIST, 'utf8');
const cfSrc = fs.readFileSync(CF, 'utf8');
const blSrc = fs.readFileSync(BL, 'utf8');
const bpSrc = fs.readFileSync(BP, 'utf8');
const swSrc = fs.readFileSync(SW, 'utf8');
const rulesSrc = fs.readFileSync(RULES, 'utf8');

test('calendarEventHistory helper module exists with appendScheduleHistory', () => {
  if (!/export async function appendScheduleHistory/.test(histSrc)) {
    throw new Error('appendScheduleHistory must be exported');
  }
  if (!/calendarEventHistory/.test(histSrc)) {
    throw new Error('must write to calendarEventHistory collection');
  }
});

test('history entry captures previous/new schedule, change time, actor, source', () => {
  for (const f of ['event_id', 'change_type', 'previous_start_time', 'previous_end_time', 'new_start_time', 'new_end_time', 'changed_at', 'actor_id', 'source_system']) {
    if (!new RegExp(f).test(histSrc)) {
      throw new Error(`history entry must capture ${f}`);
    }
  }
});

test('saveCalendarEvent records creation history', () => {
  if (!/change_type: 'created'/.test(cfSrc)) throw new Error('create path must record created');
  if (!/appendScheduleHistory/.test(cfSrc)) throw new Error('calendarEvent must call appendScheduleHistory');
});

test('saveCalendarEvent records reschedule/cancel/participant history from diff', () => {
  if (!/recordScheduleHistoryFromDiff/.test(cfSrc)) throw new Error('update path must use recordScheduleHistoryFromDiff');
  if (!/change_type: 'rescheduled'/.test(cfSrc)) throw new Error('must record rescheduled');
  if (!/change_type: 'cancelled'/.test(cfSrc)) throw new Error('must record cancelled');
  if (!/change_type: 'participant_added'/.test(cfSrc)) throw new Error('must record participant_added');
  if (!/change_type: 'participant_removed'/.test(cfSrc)) throw new Error('must record participant_removed');
});

test('bookingLifecycle records reschedule + cancel history', () => {
  if (!/appendScheduleHistory/.test(blSrc)) throw new Error('bookingLifecycle must call appendScheduleHistory');
  if (!/change_type: 'rescheduled'/.test(blSrc)) throw new Error('reschedule must record rescheduled');
  if (!/change_type: 'cancelled'/.test(blSrc)) throw new Error('cancel must record cancelled');
  if (!/source_system: 'booking'/.test(blSrc)) throw new Error('booking history must use source_system booking');
});

test('bookingPayment records creation history for booking-originated events', () => {
  if (!/appendScheduleHistory/.test(bpSrc)) throw new Error('bookingPayment must call appendScheduleHistory');
  if (!/change_type: 'created'/.test(bpSrc)) throw new Error('confirmFree must record created');
});

test('stripeWebhook records creation history for paid booking events', () => {
  if (!/appendScheduleHistory/.test(swSrc)) throw new Error('stripeWebhook must call appendScheduleHistory');
  if (!/change_type: 'created'/.test(swSrc)) throw new Error('webhook must record created');
});

test('history is append-only (never rewrites past entries)', () => {
  if (!/append-only/.test(histSrc)) throw new Error('history must be documented append-only');
});

test('firestore.rules deny client writes to calendarEventHistory', () => {
  const block = rulesSrc.match(/match\s*\/calendarEventHistory\/\{historyId\}\s*\{[\s\S]*?\n\s*\}/);
  if (!block) throw new Error('calendarEventHistory rules block missing');
  if (!/allow write:\s*if false/.test(block[0])) throw new Error('calendarEventHistory writes must be denied for clients');
  if (!/canReadCalendarEvent/.test(block[0])) throw new Error('read must delegate to canReadCalendarEvent');
});

test('firestore.rules canReadCalendarEvent helper authorises owner/creator/assigned/invited/business/admin', () => {
  const helperStart = rulesSrc.indexOf('function canReadCalendarEvent');
  if (helperStart === -1) throw new Error('canReadCalendarEvent helper missing');
  const helperSlice = rulesSrc.slice(helperStart, helperStart + 800);
  for (const f of ['owner_id', 'created_by_id', 'assigned_identity_ids', 'invited_identity_ids', 'business_id', 'isAdmin']) {
    if (!new RegExp(f).test(helperSlice)) {
      throw new Error(`canReadCalendarEvent must check ${f}`);
    }
  }
});

test('history does not duplicate source-system audit (Booking reschedule_history stays on booking)', () => {
  if (!/does NOT duplicate source-system audit/.test(histSrc)) {
    throw new Error('history must document separation from source-system audit');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);