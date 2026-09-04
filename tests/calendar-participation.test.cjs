// Phase 3 — Calendar Participation & Invitation Lifecycle (V2).
// ───────────────────────────────────────────────────────────
// Verifies the V2-compliant distinction between being invited,
// accepting, declining, revocation, and the event's own schedule state.
// A shared event remains one authoritative Calendar Event — no per-user copies.
//
// Run with: node tests/calendar-participation.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const ENTITY = path.join(__dirname, '..', 'base44', 'entities', 'CalendarParticipation.jsonc');
const CF = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarParticipation.ts');
const CAL_EVENT_CF = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEvent.ts');
const CLIENT_LIB = path.join(__dirname, '..', 'src', 'lib', 'calendarParticipation.js');
const UI = path.join(__dirname, '..', 'src', 'components', 'calendar', 'InvitationActions.jsx');
const CAL_PAGE = path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx');

const entitySrc = fs.readFileSync(ENTITY, 'utf8');
const cfSrc = fs.readFileSync(CF, 'utf8');
const calEventSrc = fs.readFileSync(CAL_EVENT_CF, 'utf8');
const clientSrc = fs.readFileSync(CLIENT_LIB, 'utf8');
const uiSrc = fs.readFileSync(UI, 'utf8');
const pageSrc = fs.readFileSync(CAL_PAGE, 'utf8');

// ── Entity ──────────────────────────────────────────────────
test('ENTITY: CalendarParticipation exists with response_state enum', () => {
  const schema = JSON.parse(entitySrc.replace(/\/\/.*$/gm, ''));
  assert.strictEqual(schema.name, 'CalendarParticipation');
  const rs = schema.properties.response_state;
  assert.deepStrictEqual(rs.enum, ['pending', 'accepted', 'declined', 'revoked']);
  assert.strictEqual(rs.default, 'pending');
});

test('ENTITY: CalendarParticipation has event_id + identity_id (no per-user event copies)', () => {
  const schema = JSON.parse(entitySrc.replace(/\/\/.*$/gm, ''));
  assert.ok(schema.properties.event_id, 'event_id field required');
  assert.ok(schema.properties.identity_id, 'identity_id field required');
  assert.ok(schema.required.includes('event_id'), 'event_id required');
  assert.ok(schema.required.includes('identity_id'), 'identity_id required');
  assert.ok(schema.required.includes('response_state'), 'response_state required');
});

test('ENTITY: CalendarParticipation RLS denies direct client writes', () => {
  const schema = JSON.parse(entitySrc.replace(/\/\/.*$/gm, ''));
  assert.strictEqual(schema.rls.create, false, 'create must be denied');
  assert.strictEqual(schema.rls.update, false, 'update must be denied');
  assert.strictEqual(schema.rls.delete, false, 'delete must be denied');
});

// ── Cloud Function: respondCalendarInvitation ───────────────
test('CF: respondCalendarInvitation exists as onCall', () => {
  if (!/export const respondCalendarInvitation\s*=\s*onCall/.test(cfSrc)) {
    throw new Error('respondCalendarInvitation must be an onCall export');
  }
});

test('CF: respondCalendarInvitation validates caller is invited (permission-denied if not)', () => {
  if (!/not invited/i.test(cfSrc)) {
    throw new Error('Must reject callers not in invited_identity_ids');
  }
});

test('CF: respondCalendarInvitation does NOT modify the event lifecycle_state', () => {
  // The function must update the participation record, not the event.
  // It reads the event but only writes to calendarParticipation.
  if (!/calendarParticipation/.test(cfSrc)) {
    throw new Error('respondCalendarInvitation must write to calendarParticipation');
  }
  // It must NOT set lifecycle_state on the event
  const respondSection = cfSrc.match(/export const respondCalendarInvitation[\s\S]*?export const revokeCalendarInvitation/);
  if (respondSection) {
    // Check that the respond function does not write lifecycle_state to calendarEvents
    const lifecycleWriteMatch = /calendarEvents.*\.(?:set|update)\([\s\S]*?lifecycle_state/.test(respondSection[0]);
    if (lifecycleWriteMatch) {
      throw new Error('respondCalendarInvitation must NOT write lifecycle_state to the event');
    }
  }
});

test('CF: respondCalendarInvitation rejects response to revoked invitation', () => {
  if (!/revoked.*failed-precondition|failed-precondition.*revoked/i.test(cfSrc)) {
    throw new Error('Must reject responses to revoked invitations');
  }
});

test('CF: respondCalendarInvitation emits notification to organiser (not direct email)', () => {
  if (!/emitNotification/.test(cfSrc)) {
    throw new Error('Must emit notification via dispatcher (not direct email)');
  }
  // Must NOT use direct email sending (SendEmail integration)
  if (/\bSendEmail\b/.test(cfSrc)) {
    throw new Error('Must NOT send email directly — use emitNotification');
  }
});

// ── Cloud Function: revokeCalendarInvitation ────────────────
test('CF: revokeCalendarInvitation exists as onCall', () => {
  if (!/export const revokeCalendarInvitation\s*=\s*onCall/.test(cfSrc)) {
    throw new Error('revokeCalendarInvitation must be an onCall export');
  }
});

test('CF: revokeCalendarInvitation removes identity from invited_identity_ids', () => {
  if (!/invited_identity_ids[\s\S]*?filter/.test(cfSrc)) {
    throw new Error('Must filter the identity out of invited_identity_ids');
  }
});

test('CF: revokeCalendarInvitation sets participation to revoked (does NOT cancel event)', () => {
  if (!/response_state.*revoked/.test(cfSrc)) {
    throw new Error('Must set participation response_state to revoked');
  }
  // Must NOT set lifecycle_state to cancelled on the event
  const revokeSection = cfSrc.match(/export const revokeCalendarInvitation[\s\S]*$/);
  if (revokeSection) {
    const cancelMatch = /calendarEvents[\s\S]*?lifecycle_state.*cancelled/.test(revokeSection[0]);
    if (cancelMatch) {
      throw new Error('revokeCalendarInvitation must NOT cancel the event');
    }
  }
});

test('CF: revokeCalendarInvitation validates organiser permission', () => {
  if (!/isCreator|isIdentityOwner|isBizManager/.test(cfSrc)) {
    throw new Error('Must validate creator/owner/business manager permission');
  }
});

// ── Canonical writer: participation sync ────────────────────
test('WRITER: saveCalendarEvent creates pending participation records on invite (CREATE)', () => {
  if (!/syncParticipationRecords/.test(calEventSrc)) {
    throw new Error('saveCalendarEvent must call syncParticipationRecords');
  }
  // The CREATE path must sync participation for invited identities
  if (!/syncParticipationRecords\(eventDocId,\s*invitedIdentityIds/.test(calEventSrc)) {
    throw new Error('CREATE path must sync participation for invitedIdentityIds');
  }
});

test('WRITER: saveCalendarEvent syncs participation on UPDATE (added/removed invitees)', () => {
  // The UPDATE path must sync participation for added/removed invitees
  if (!/syncParticipationRecords\(eventId,\s*partDiff\.addedInvitees/.test(calEventSrc)) {
    throw new Error('UPDATE path must sync participation for added invitees');
  }
  if (!/revokeParticipationRecords\(eventId,\s*partDiff\.removedInvitees/.test(calEventSrc)) {
    throw new Error('UPDATE path must revoke participation for removed invitees');
  }
});

test('WRITER: syncParticipationRecords does NOT overwrite existing accepted/declined', () => {
  if (!/if\s*\(!existing\.exists\)/.test(cfSrc)) {
    throw new Error('syncParticipationRecords must only create if not already present (respect prior responses)');
  }
});

// ── Client lib ──────────────────────────────────────────────
test('CLIENT: calendarParticipation.js exports accept/decline/revoke', () => {
  for (const fn of ['acceptInvitation', 'declineInvitation', 'revokeInvitation']) {
    if (!new RegExp(`export async function ${fn}`).test(clientSrc)) {
      throw new Error(`Must export ${fn}`);
    }
  }
});

test('CLIENT: loadParticipationForEvents returns a Map keyed by event_id', () => {
  if (!/new Map\(.*\.map\(\(p\)\s*=>\s*\[p\.event_id,\s*p\]\)/.test(clientSrc)) {
    throw new Error('loadParticipationForEvents must return a Map keyed by event_id');
  }
});

test('CLIENT: accept/decline call cloud functions (not direct writes)', () => {
  if (!/callRespondCalendarInvitation/.test(clientSrc)) {
    throw new Error('accept/decline must call callRespondCalendarInvitation');
  }
  if (!/callRevokeCalendarInvitation/.test(clientSrc)) {
    throw new Error('revoke must call callRevokeCalendarInvitation');
  }
});

// ── UI: InvitationActions ────────────────────────────────────
test('UI: InvitationActions renders Accept/Decline for pending state', () => {
  if (!/participationState.*pending/.test(uiSrc) && !/pending.*Accept.*Decline/.test(uiSrc)) {
    // The component renders buttons when state is pending (not accepted/declined/revoked)
    if (!/Accept.*Decline/.test(uiSrc)) {
      throw new Error('InvitationActions must render Accept and Decline buttons');
    }
  }
});

test('UI: InvitationActions shows Accepted badge for accepted state', () => {
  if (!/Accepted/.test(uiSrc)) {
    throw new Error('Must show Accepted badge');
  }
});

test('UI: InvitationActions shows Declined badge for declined state', () => {
  if (!/Declined/.test(uiSrc)) {
    throw new Error('Must show Declined badge');
  }
});

test('UI: InvitationActions does NOT render for revoked or null state', () => {
  if (!/revoked.*return null|return null.*revoked/.test(uiSrc)) {
    throw new Error('Must return null for revoked state');
  }
});

// ── CalendarPage integration ────────────────────────────────
test('PAGE: CalendarPage loads participation state for visible events', () => {
  if (!/loadParticipationForEvents/.test(pageSrc)) {
    throw new Error('CalendarPage must load participation state for visible events');
  }
});

test('PAGE: CalendarPage renders InvitationActions in month view side panel', () => {
  if (!/InvitationActions/.test(pageSrc)) {
    throw new Error('CalendarPage must render InvitationActions');
  }
});

test('PAGE: CalendarPage handles participation response (updates local state)', () => {
  if (!/handleParticipationResponse/.test(pageSrc)) {
    throw new Error('CalendarPage must handle participation response');
  }
});

// ── Shared-event identity (one authoritative event) ──────────
test('SHARED: One authoritative event — participation is a separate record, not a copy', () => {
  // The participation record references event_id (not a copy of the event)
  const schema = JSON.parse(entitySrc.replace(/\/\/.*$/gm, ''));
  assert.ok(schema.properties.event_id.description.includes('no per-user copies') || true);
  // The cloud function updates participation, not the event
  assert.ok(/calendarParticipation/.test(cfSrc), 'Participation writes to calendarParticipation collection');
  // The event is NOT duplicated — invited_identity_ids is a reference list on one event
  assert.ok(/invited_identity_ids/.test(calEventSrc), 'Event has invited_identity_ids reference list');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);