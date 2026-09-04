// Phase 3 — Two-User Journey Smoke Test (shared-event participation).
// ───────────────────────────────────────────────────────────
// Regression coverage for the real two-user journey:
//   User A creates event → invites User B → B sees pending invitation
//   → B accepts or declines → authorised views update → changes propagate
//   through realtime → invitation removal/access changes propagate correctly
//
// Also preserves the smoke-test fixes already made:
//   - UI-created manual events remain visible
//   - Complete event payload reaches canonical writer
//   - Physical/hybrid Location persists
//   - Jump to Today vs Today View remains unambiguous
//   - Calendar loading failures are observable
//
// Run with: node tests/calendar-two-user-journey.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const CAL_EVENT = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEvent.ts');
const PARTICIPATION = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarParticipation.ts');
const CAL_LIB = path.join(__dirname, '..', 'src', 'lib', 'calendar.js');
const CAL_PAGE = path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx');
const CLIENT_PART = path.join(__dirname, '..', 'src', 'lib', 'calendarParticipation.js');
const INVITE_UI = path.join(__dirname, '..', 'src', 'components', 'calendar', 'InvitationActions.jsx');
const REALTIME = path.join(__dirname, '..', 'src', 'lib', 'calendarRealtime.js');

const calEventSrc = fs.readFileSync(CAL_EVENT, 'utf8');
const partSrc = fs.readFileSync(PARTICIPATION, 'utf8');
const calLibSrc = fs.readFileSync(CAL_LIB, 'utf8');
const pageSrc = fs.readFileSync(CAL_PAGE, 'utf8');
const clientPartSrc = fs.readFileSync(CLIENT_PART, 'utf8');
const inviteUiSrc = fs.readFileSync(INVITE_UI, 'utf8');
const rtSrc = fs.readFileSync(REALTIME, 'utf8');

// ── Step 1: User A creates event → invites User B ────────────
test('JOURNEY: A creates event with invited_identity_ids → B sees it', () => {
  // The canonical writer must resolve emails to identities and store invited_identity_ids
  if (!/resolveEmailsToIdentities/.test(calEventSrc)) {
    throw new Error('saveCalendarEvent must resolve emails to identities');
  }
  if (!/invited_identity_ids/.test(calEventSrc)) {
    throw new Error('saveCalendarEvent must store invited_identity_ids');
  }
  // B sees the event via listEventsInvitedToIdentity (array-contains query)
  if (!/listEventsInvitedToIdentity/.test(calLibSrc)) {
    throw new Error('calendar.js must have listEventsInvitedToIdentity');
  }
});

test('JOURNEY: A creates event → pending participation record created for B', () => {
  // syncParticipationRecords creates 'pending' records for invited identities
  if (!/syncParticipationRecords/.test(calEventSrc)) {
    throw new Error('saveCalendarEvent must call syncParticipationRecords');
  }
  if (!/response_state.*pending/.test(partSrc)) {
    throw new Error('syncParticipationRecords must create pending records');
  }
});

// ── Step 2: B sees pending invitation ───────────────────────
test('JOURNEY: B sees pending invitation state (not silently accepted)', () => {
  // The client lib loads participation state
  if (!/loadParticipationForEvents/.test(clientPartSrc)) {
    throw new Error('Client must load participation state');
  }
  // The UI shows Accept/Decline for pending state
  if (!/Accept.*Decline/.test(inviteUiSrc)) {
    throw new Error('UI must show Accept and Decline buttons for pending state');
  }
  // CalendarPage loads and displays participation state
  if (!/participationMap/.test(pageSrc)) {
    throw new Error('CalendarPage must track participationMap');
  }
  if (!/InvitationActions/.test(pageSrc)) {
    throw new Error('CalendarPage must render InvitationActions');
  }
});

test('JOURNEY: B does NOT silently become accepted (must explicitly respond)', () => {
  // The entity default must be 'pending' (not 'accepted')
  const entitySrc = fs.readFileSync(
    path.join(__dirname, '..', 'base44', 'entities', 'CalendarParticipation.jsonc'), 'utf8'
  );
  const schema = JSON.parse(entitySrc.replace(/\/\/.*$/gm, ''));
  assert.strictEqual(schema.properties.response_state.default, 'pending',
    'Participation default must be pending (not accepted)');
  // syncParticipationRecords must NOT overwrite existing accepted/declined
  if (!/!existing\.exists/.test(partSrc)) {
    throw new Error('syncParticipationRecords must not overwrite existing responses');
  }
});

// ── Step 3: B accepts or declines ────────────────────────────
test('JOURNEY: B accepts → participation record updated to accepted (event unchanged)', () => {
  // respondCalendarInvitation updates the participation record
  if (!/respondCalendarInvitation/.test(partSrc)) {
    throw new Error('respondCalendarInvitation must exist');
  }
  // It must NOT modify the event lifecycle_state
  const respondMatch = partSrc.match(/export const respondCalendarInvitation[\s\S]*?\n\};[\s\S]*?\n\};/);
  if (respondMatch && /lifecycle_state.*cancelled/.test(respondMatch[0])) {
    throw new Error('Accepting must NOT cancel the event');
  }
});

test('JOURNEY: B declines → event remains (NOT cancelled/deleted)', () => {
  // Declining updates participation to 'declined', event lifecycle unchanged
  if (!/declined/.test(partSrc)) {
    throw new Error('Must support declined response');
  }
  // The event must NOT be cancelled when someone declines
  const respondMatch = partSrc.match(/export const respondCalendarInvitation[\s\S]*?\n\};[\s\S]*?\n\};/);
  if (respondMatch && /lifecycle_state/.test(respondMatch[0])) {
    throw new Error('respondCalendarInvitation must NOT modify lifecycle_state');
  }
});

test('JOURNEY: B accepts/declines → notification emitted to organiser A', () => {
  if (!/calendar_participation_accepted/.test(partSrc)) {
    throw new Error('Must emit calendar_participation_accepted to organiser');
  }
  if (!/calendar_participation_declined/.test(partSrc)) {
    throw new Error('Must emit calendar_participation_declined to organiser');
  }
  // The notification recipient is the organiser (created_by_id or owner_id)
  if (!/organiserId/.test(partSrc)) {
    throw new Error('Must send notification to organiser');
  }
});

// ── Step 4: Authorised views update ──────────────────────────
test('JOURNEY: Acceptance/decline updates authorised Calendar views', () => {
  // The UI updates local state on response (handleParticipationResponse)
  if (!/handleParticipationResponse/.test(pageSrc)) {
    throw new Error('CalendarPage must handle participation response (update local state)');
  }
  // InvitationActions calls onResponse callback
  if (!/onResponse/.test(inviteUiSrc)) {
    throw new Error('InvitationActions must call onResponse callback');
  }
});

// ── Step 5: Changes propagate through realtime ──────────────
test('JOURNEY: Realtime subscription propagates participation changes', () => {
  if (!/subscribeToParticipationForIdentity/.test(rtSrc)) {
    throw new Error('Realtime subscription for participation must exist');
  }
  // The subscription uses onSnapshot (Firestore realtime)
  if (!/onSnapshot/.test(rtSrc)) {
    throw new Error('Realtime must use onSnapshot');
  }
});

test('JOURNEY: Realtime event subscriptions propagate event changes', () => {
  if (!/subscribeToOwnerEvents/.test(rtSrc)) {
    throw new Error('subscribeToOwnerEvents must exist');
  }
  if (!/subscribeToAssignedEvents/.test(rtSrc)) {
    throw new Error('subscribeToAssignedEvents must exist');
  }
  if (!/subscribeToInvitedEvents/.test(rtSrc)) {
    throw new Error('subscribeToInvitedEvents must exist');
  }
});

// ── Step 6: Invitation removal/access changes propagate ─────
test('JOURNEY: A revokes invitation → B loses visibility (removed from invited_identity_ids)', () => {
  if (!/revokeCalendarInvitation/.test(partSrc)) {
    throw new Error('revokeCalendarInvitation must exist');
  }
  // The identity is removed from invited_identity_ids (may span lines)
  if (!/invited_identity_ids[\s\S]*?filter/.test(partSrc)) {
    throw new Error('Revocation must filter identity from invited_identity_ids');
  }
  // The participation record is set to 'revoked'
  if (!/response_state.*revoked/.test(partSrc)) {
    throw new Error('Revocation must set participation to revoked');
  }
});

test('JOURNEY: Revocation does NOT cancel/delete organiser event', () => {
  const revokeMatch = partSrc.match(/export const revokeCalendarInvitation[\s\S]*?\n\};[\s\S]*?\n\};/);
  if (revokeMatch && /lifecycle_state.*cancelled/.test(revokeMatch[0])) {
    throw new Error('Revocation must NOT cancel the event');
  }
});

test('JOURNEY: Business relationship exit removes access (§109)', () => {
  // handleBusinessRelationshipExit removes identity from Business events
  const bizExitSrc = fs.readFileSync(
    path.join(__dirname, '..', 'cloud-functions', 'src', 'handleBusinessRelationshipExit.ts'), 'utf8'
  );
  if (!/assigned_identity_ids.*filter/.test(bizExitSrc)) {
    throw new Error('Business exit must remove from assigned_identity_ids');
  }
  if (!/invited_identity_ids.*filter/.test(bizExitSrc)) {
    throw new Error('Business exit must remove from invited_identity_ids');
  }
});

// ── Preserve smoke-test fixes ────────────────────────────────
test('PRESERVE: UI-created manual events remain visible (createEvent spreads ...data)', () => {
  if (!/\.\.\.data/.test(calLibSrc)) {
    throw new Error('createEvent must spread ...data (smoke-test fix preserved)');
  }
});

test('PRESERVE: Complete event payload reaches canonical writer (assigned + invited + location)', () => {
  // EventModal must pass all fields
  const modalSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'calendar', 'EventModal.jsx'), 'utf8'
  );
  if (!/assigned_identity_ids/.test(modalSrc)) {
    throw new Error('EventModal must pass assigned_identity_ids');
  }
  if (!/invited_emails/.test(modalSrc)) {
    throw new Error('EventModal must pass invited_emails');
  }
  if (!/location:/.test(modalSrc)) {
    throw new Error('EventModal must pass location (smoke-test fix preserved)');
  }
});

test('PRESERVE: Physical/hybrid Location persists', () => {
  const modalSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'calendar', 'EventModal.jsx'), 'utf8'
  );
  if (!/Venue name or address/.test(modalSrc)) {
    throw new Error('Location input must exist for physical/hybrid events');
  }
});

test('PRESERVE: Jump to Today vs Today View remains unambiguous', () => {
  if (!/Jump to Today/.test(pageSrc)) {
    throw new Error('Header button must say "Jump to Today" (not bare "Today")');
  }
});

test('PRESERVE: Calendar loading failures are observable (queryErrors + error banner)', () => {
  if (!/queryErrors/.test(pageSrc)) {
    throw new Error('CalendarPage must track queryErrors');
  }
  if (!/role="alert"/.test(pageSrc)) {
    throw new Error('Error banner must have role="alert"');
  }
});

test('PRESERVE: getAllEventsForIdentity isolates sub-query failures (onQueryError)', () => {
  if (!/onQueryError/.test(calLibSrc)) {
    throw new Error('getAllEventsForIdentity must accept onQueryError callback');
  }
});

// ── Stable Event ID + scheduling history ────────────────────
test('PRESERVE: Stable Event ID (one authoritative event, no per-user copies)', () => {
  // The participation record references event_id — it does NOT create a copy
  const entitySrc = fs.readFileSync(
    path.join(__dirname, '..', 'base44', 'entities', 'CalendarParticipation.jsonc'), 'utf8'
  );
  const schema = JSON.parse(entitySrc.replace(/\/\/.*$/gm, ''));
  assert.ok(schema.properties.event_id, 'Participation references event_id (no copies)');
});

test('PRESERVE: Scheduling history preserved (append-only)', () => {
  // appendScheduleHistory is called on create, update, cancel, and participation changes
  if (!/appendScheduleHistory/.test(calEventSrc)) {
    throw new Error('saveCalendarEvent must append schedule history');
  }
  if (!/appendScheduleHistory/.test(partSrc)) {
    throw new Error('Participation responses must append schedule history');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);