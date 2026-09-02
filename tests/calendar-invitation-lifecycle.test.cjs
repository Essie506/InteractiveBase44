// Calendar invitation lifecycle — integration contract regression tests.
// ───────────────────────────────────────────────────────────
// Static-analysis on cloud-functions/src/calendarEvent.ts to confirm
// saveCalendarEvent emits the correct semantic notification event for each
// lifecycle scenario, suppresses Booking-owned cancellation, and emits
// nothing on a no-op save. Also confirms Calendar never imports a concrete
// email provider and never touches connections/conversations.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const calSrc = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEvent.ts'), 'utf8');
const diffSrc = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEventDiff.ts'), 'utf8');

// ── Wiring contract ──
test('saveCalendarEvent imports the dispatcher + builder + diff', () => {
  if (!/from '\.\/notifications\/dispatcher'/.test(calSrc)) throw new Error('calendarEvent must import dispatcher');
  if (!/from '\.\/notifications\/email\/payloads\/calendar'/.test(calSrc)) throw new Error('calendarEvent must import calendar payload builder');
  if (!/from '\.\/calendarEventDiff'/.test(calSrc)) throw new Error('calendarEvent must import calendarEventDiff');
});
test('Calendar never imports a concrete email provider', () => {
  if (/from '\.\/notifications\/email\/resend'/.test(calSrc)) throw new Error('calendarEvent must not import resend directly');
  if (/from '\.\/notifications\/email\/index'/.test(calSrc)) throw new Error('calendarEvent must not import the provider factory');
});
test('Calendar never touches connections or conversations for notifications', () => {
  // notifications dispatch must not write connections/conversations
  const dispSrc = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'dispatcher.ts'), 'utf8');
  if (/connections/.test(dispSrc) || /conversations/.test(dispSrc)) throw new Error('dispatcher must not touch connections/conversations');
});

// ── Scenario event types ──
test('create path emits calendar_event_invited to identities + guests', () => {
  if (!/dispatchCreateNotifications/.test(calSrc)) throw new Error('dispatchCreateNotifications not present');
  if (!/'calendar_event_invited'/.test(calSrc)) throw new Error('invited event type not emitted');
  if (!/cal_invite:\$\{eventId\}:guest:/.test(calSrc)) throw new Error('guest invite source_id pattern missing');
});
test('update path emits reschedule, updated, and invitation_removed', () => {
  if (!/dispatchUpdateNotifications/.test(calSrc)) throw new Error('dispatchUpdateNotifications not present');
  if (!/'calendar_event_rescheduled'/.test(calSrc)) throw new Error('reschedule event type missing');
  if (!/'calendar_event_updated'/.test(calSrc)) throw new Error('updated event type missing');
  if (!/'calendar_invitation_removed'/.test(calSrc)) throw new Error('invitation_removed event type missing');
});
test('cancellation path emits calendar_event_cancelled', () => {
  if (!/'calendar_event_cancelled'/.test(calSrc)) throw new Error('cancelled event type missing');
  if (!/cal_cancel:/.test(calSrc)) throw new Error('cancel source_id pattern missing');
});
test('no-op save emits nothing (diff.isNoOp guard)', () => {
  if (!/diff\.isNoOp/.test(calSrc)) throw new Error('calendarEvent must guard on diff.isNoOp');
  if (!/isNoOp/.test(diffSrc)) throw new Error('diff must expose isNoOp');
});
test('reschedule takes precedence over material update', () => {
  if (!/diff\.isReschedule/.test(calSrc)) throw new Error('calendarEvent must branch on isReschedule');
  if (!/else if \(diff\.isMaterialUpdate\)/.test(calSrc)) throw new Error('material update must be the else branch (lower precedence)');
});

// ── Booking boundary ──
test('Booking-owned events suppress Calendar update/cancel notifications', () => {
  if (!/source_system === 'booking'/.test(calSrc)) throw new Error('calendarEvent must check source_system === booking');
  // dispatchUpdateNotifications must early-return for booking-owned events
  const m = calSrc.match(/async function dispatchUpdateNotifications[\s\S]*?if \(existing\.source_system === 'booking'\) return;/);
  if (!m) throw new Error('dispatchUpdateNotifications must early-return for booking-owned events');
});
test('Booking-owned cancellation is not cancellable via saveCalendarEvent (existing guard)', () => {
  // The booking-authority guard rejects lifecycle_state changes on booking events
  if (!/source_system === 'booking' && 'lifecycle_state' in data/.test(calSrc)) throw new Error('booking lifecycle guard missing');
});

// ── Deep link ──
test('notifications use /calendar?event= deep link (no new route)', () => {
  if (!/\/calendar\?event=/.test(calSrc)) throw new Error('action_url must use /calendar?event= deep link');
});

// ── Idempotency ──
test('update notifications use a deterministic version (computeUpdateVersion)', () => {
  if (!/computeUpdateVersion/.test(calSrc)) throw new Error('calendarEvent must use computeUpdateVersion for update/reschedule');
  if (!/computeRemovalVersion/.test(calSrc)) throw new Error('calendarEvent must use computeRemovalVersion for removal');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);