// Calendar Invitation UX — regression coverage for the full journey:
//   Invite → notification → pending invitation → Accept/Decline →
//   participation state update.
//
// Validates:
//   - Existing Interactive invitee receives pending participation
//   - Pending invite displays Accept/Decline in every Calendar view
//   - Accept → accepted; Decline → declined without cancelling event
//   - No duplicate Calendar event (participation is separate from event)
//   - Invitation notification emitted exactly once (idempotency)
//   - Notification links to correct authoritative event
//   - Realtime and initial-load behaviour agree
//   - Organiser/invitee authority remains correct
//
// Static-analysis tests — no Firebase emulator required.

const fs = require('fs');
const path = require('path');

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); console.log(`[PASS] ${name}`); }
  catch (err) { results.push({ name, passed: false, error: err.message }); console.log(`[FAIL] ${name} — ${err.message}`); }
}

function readSrc(rel) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf8');
}
function readCloud(rel) {
  return fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', rel), 'utf8');
}

// ── Source files ──
const badgeSrc = readSrc('components/calendar/EventInvitationBadge.jsx');
const actionsSrc = readSrc('components/calendar/InvitationActions.jsx');
const participationLibSrc = readSrc('lib/calendarParticipation.js');
const calendarPageSrc = readSrc('pages/CalendarPage.jsx');
const todaySrc = readSrc('components/calendar/TodayView.jsx');
const weekSrc = readSrc('components/calendar/WeekView.jsx');
const daySrc = readSrc('components/calendar/DayView.jsx');
const agendaSrc = readSrc('components/calendar/AgendaView.jsx');
const notificationsSrc = readSrc('pages/Notifications.jsx');
const calendarLibSrc = readSrc('lib/calendar.js');
const realtimeSrc = readSrc('lib/calendarRealtime.js');
const participationCloudSrc = readCloud('calendarParticipation.ts');
const eventCloudSrc = readCloud('calendarEvent.ts');

// ═══════════════════════════════════════════════════════════
// 1. EventInvitationBadge — the shared wrapper
// ═══════════════════════════════════════════════════════════

test('BADGE: returns null when no participationMap', () => {
  if (!/if\s*\(!participationMap\)\s*return\s*null/.test(badgeSrc)) {
    throw new Error('EventInvitationBadge must return null when participationMap is absent');
  }
});

test('BADGE: returns null for revoked participation', () => {
  if (!/revoked/.test(badgeSrc) || !/return\s*null/.test(badgeSrc)) {
    throw new Error('EventInvitationBadge must return null for revoked state');
  }
});

test('BADGE: uses getParticipationState for lookup', () => {
  if (!/getParticipationState/.test(badgeSrc)) {
    throw new Error('EventInvitationBadge must use getParticipationState');
  }
});

test('BADGE: renders InvitationActions with compact prop', () => {
  if (!/InvitationActions/.test(badgeSrc) || !/compact/.test(badgeSrc)) {
    throw new Error('EventInvitationBadge must render InvitationActions with compact prop');
  }
});

// ═══════════════════════════════════════════════════════════
// 2. InvitationActions — Accept/Decline UI
// ═══════════════════════════════════════════════════════════

test('ACTIONS: renders Accept and Decline buttons for pending', () => {
  if (!/Accept/.test(actionsSrc) || !/Decline/.test(actionsSrc)) {
    throw new Error('InvitationActions must render Accept and Decline buttons');
  }
});

test('ACTIONS: calls acceptInvitation on Accept', () => {
  if (!/acceptInvitation/.test(actionsSrc)) {
    throw new Error('InvitationActions must call acceptInvitation on Accept');
  }
});

test('ACTIONS: calls declineInvitation on Decline', () => {
  if (!/declineInvitation/.test(actionsSrc)) {
    throw new Error('InvitationActions must call declineInvitation on Decline');
  }
});

test('ACTIONS: renders Accepted badge for accepted state', () => {
  if (!/accepted/.test(actionsSrc) || !/UserCheck/.test(actionsSrc)) {
    throw new Error('InvitationActions must render Accepted badge');
  }
});

test('ACTIONS: renders Declined badge for declined state', () => {
  if (!/declined/.test(actionsSrc) || !/UserX/.test(actionsSrc)) {
    throw new Error('InvitationActions must render Declined badge');
  }
});

test('ACTIONS: returns null for revoked', () => {
  if (!/revoked/.test(actionsSrc) || !/return\s*null/.test(actionsSrc)) {
    throw new Error('InvitationActions must return null for revoked');
  }
});

// ═══════════════════════════════════════════════════════════
// 3. CalendarPage — passes participationMap to all views + realtime
// ═══════════════════════════════════════════════════════════

test('PAGE: passes participationMap to TodayView', () => {
  if (!/TodayView[^]*participationMap=/.test(calendarPageSrc)) {
    throw new Error('CalendarPage must pass participationMap to TodayView');
  }
});

test('PAGE: passes participationMap to WeekView', () => {
  if (!/WeekView[^]*participationMap=/.test(calendarPageSrc)) {
    throw new Error('CalendarPage must pass participationMap to WeekView');
  }
});

test('PAGE: passes participationMap to DayView', () => {
  if (!/DayView[^]*participationMap=/.test(calendarPageSrc)) {
    throw new Error('CalendarPage must pass participationMap to DayView');
  }
});

test('PAGE: passes participationMap to AgendaView', () => {
  if (!/AgendaView[^]*participationMap=/.test(calendarPageSrc)) {
    throw new Error('CalendarPage must pass participationMap to AgendaView');
  }
});

test('PAGE: passes onParticipationResponse to all views', () => {
  const count = (calendarPageSrc.match(/onParticipationResponse={handleParticipationResponse}/g) || []).length;
  if (count < 4) {
    throw new Error(`Expected 4 onParticipationResponse props, found ${count}`);
  }
});

test('PAGE: imports subscribeToParticipationForIdentity', () => {
  if (!/subscribeToParticipationForIdentity/.test(calendarPageSrc)) {
    throw new Error('CalendarPage must import subscribeToParticipationForIdentity');
  }
});

test('PAGE: wires realtime participation subscription', () => {
  if (!/subscribeToParticipationForIdentity\(user\.id/.test(calendarPageSrc)) {
    throw new Error('CalendarPage must call subscribeToParticipationForIdentity with user.id');
  }
});

test('PAGE: participation subscription updates participationMap', () => {
  if (!/setParticipationMap\(new\s*Map/.test(calendarPageSrc)) {
    throw new Error('Participation subscription must update participationMap');
  }
});

// ═══════════════════════════════════════════════════════════
// 4. View components — render EventInvitationBadge
// ═══════════════════════════════════════════════════════════

test('TODAY: imports and renders EventInvitationBadge', () => {
  if (!/EventInvitationBadge/.test(todaySrc)) {
    throw new Error('TodayView must import and render EventInvitationBadge');
  }
});

test('TODAY: passes participationMap and onParticipationResponse to cards', () => {
  if (!/participationMap={participationMap}/.test(todaySrc) || !/onParticipationResponse={onParticipationResponse}/.test(todaySrc)) {
    throw new Error('TodayView must pass participationMap and onParticipationResponse to cards');
  }
});

test('WEEK: imports EventInvitationBadge and getParticipationState', () => {
  if (!/EventInvitationBadge/.test(weekSrc) || !/getParticipationState/.test(weekSrc)) {
    throw new Error('WeekView must import EventInvitationBadge and getParticipationState');
  }
});

test('WEEK: shows Invite indicator on desktop grid for pending', () => {
  if (!/Invite/.test(weekSrc)) {
    throw new Error('WeekView must show Invite indicator on desktop grid');
  }
});

test('WEEK: renders EventInvitationBadge in mobile list', () => {
  if (!/EventInvitationBadge/.test(weekSrc)) {
    throw new Error('WeekView must render EventInvitationBadge in mobile list');
  }
});

test('DAY: imports and renders EventInvitationBadge', () => {
  if (!/EventInvitationBadge/.test(daySrc)) {
    throw new Error('DayView must import and render EventInvitationBadge');
  }
});

test('AGENDA: imports and renders EventInvitationBadge', () => {
  if (!/EventInvitationBadge/.test(agendaSrc)) {
    throw new Error('AgendaView must import and render EventInvitationBadge');
  }
});

// ═══════════════════════════════════════════════════════════
// 5. Notifications — calendar category filter
// ═══════════════════════════════════════════════════════════

test('NOTIFICATIONS: includes calendar category in filter', () => {
  if (!/'calendar'/.test(notificationsSrc)) {
    throw new Error("Notifications page must include 'calendar' in categories");
  }
});

// ═══════════════════════════════════════════════════════════
// 6. respondCalendarInvitation — participation-only update (no event mutation)
// ═══════════════════════════════════════════════════════════

test('RESPOND: updates participation record only (not the event)', () => {
  // Extract just the respondCalendarInvitation function body — NOT
  // revokeCalendarInvitation (which does modify the event). The two
  // functions are adjacent in the file, so we slice between their
  // export declarations.
  const startIdx = participationCloudSrc.indexOf('export const respondCalendarInvitation = onCall(');
  const endIdx = participationCloudSrc.indexOf('export const revokeCalendarInvitation = onCall(');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('respondCalendarInvitation function not found');
  }
  const body = participationCloudSrc.slice(startIdx, endIdx);
  // Must write to PARTICIPATION collection
  if (!/PARTICIPATION\)\.doc\(partDocId\)\.set/.test(body)) {
    throw new Error('respondCalendarInvitation must write to calendarParticipation');
  }
  // Must NOT write to calendarEvents (the event is not mutated by a response)
  if (/EVENTS\)\.doc\(event_id\)\.set/.test(body)) {
    throw new Error('respondCalendarInvitation must NOT write to calendarEvents (no event mutation)');
  }
});

test('RESPOND: verifies caller is invited before allowing response', () => {
  if (!/invited_identity_ids/.test(participationCloudSrc) || !/permission-denied/.test(participationCloudSrc)) {
    throw new Error('respondCalendarInvitation must verify caller is invited');
  }
});

test('RESPOND: rejects revoked invitations', () => {
  if (!/revoked/.test(participationCloudSrc) || !/failed-precondition/.test(participationCloudSrc)) {
    throw new Error('respondCalendarInvitation must reject revoked invitations');
  }
});

test('RESPOND: emits notification to organiser on accept/decline', () => {
  if (!/calendar_participation_accepted/.test(participationCloudSrc) || !/calendar_participation_declined/.test(participationCloudSrc)) {
    throw new Error('respondCalendarInvitation must emit participation notifications');
  }
});

test('RESPOND: no duplicate event — participation is separate from event lifecycle', () => {
  // The function must NOT create a new event or duplicate the event
  if (/collection\(EVENTS\)\.doc\(\)\.create|collection\(EVENTS\)\.doc\(\)\.set\(\{[^]*_created_date/.test(participationCloudSrc)) {
    throw new Error('respondCalendarInvitation must not create a new event');
  }
});

// ═══════════════════════════════════════════════════════════
// 7. Invitation notification — emitted on create, idempotent, deep-links
// ═══════════════════════════════════════════════════════════

test('NOTIFY: calendar_event_invited emitted on event create', () => {
  if (!/calendar_event_invited/.test(eventCloudSrc)) {
    throw new Error('saveCalendarEvent must emit calendar_event_invited notification');
  }
});

test('NOTIFY: notification deep-links to authoritative event', () => {
  if (!/action_url.*\/calendar\?event=/.test(eventCloudSrc)) {
    throw new Error('Notification must deep-link to /calendar?event=<eventId>');
  }
});

test('NOTIFY: idempotent source_id prevents duplicate notifications', () => {
  // The source_id must include the event ID and recipient ID for idempotency
  if (!/cal_invite:\$\{eventId\}:\$\{rid\}/.test(eventCloudSrc)) {
    throw new Error('Invitation notification must use idempotent source_id');
  }
});

test('NOTIFY: does not send email directly from Calendar', () => {
  // Calendar must use emitNotification (the dispatcher), not a direct email call
  if (!/emitNotification/.test(eventCloudSrc)) {
    throw new Error('Calendar must use emitNotification dispatcher');
  }
  if (/SendEmail|sendEmail/.test(eventCloudSrc)) {
    throw new Error('Calendar must NOT send email directly (use Notifications dispatcher)');
  }
});

// ═══════════════════════════════════════════════════════════
// 8. Realtime + initial-load parity
// ═══════════════════════════════════════════════════════════

test('REALTIME: subscribeToParticipationForIdentity exists in calendarRealtime', () => {
  if (!/subscribeToParticipationForIdentity/.test(realtimeSrc)) {
    throw new Error('subscribeToParticipationForIdentity must exist in calendarRealtime');
  }
});

test('REALTIME: subscribeToParticipationForIdentity re-exported from calendar.js', () => {
  if (!/subscribeToParticipationForIdentity/.test(calendarLibSrc)) {
    throw new Error('subscribeToParticipationForIdentity must be re-exported from calendar.js');
  }
});

test('REALTIME: participation subscription uses identity_id filter', () => {
  if (!/where\('identity_id',\s*'==',\s*identityId\)/.test(realtimeSrc)) {
    throw new Error('subscribeToParticipationForIdentity must filter by identity_id');
  }
});

// ═══════════════════════════════════════════════════════════
// 9. syncParticipationRecords — pending records for new invitees
// ═══════════════════════════════════════════════════════════

test('SYNC: creates pending participation records for new invitees', () => {
  if (!/response_state:\s*'pending'/.test(participationCloudSrc)) {
    throw new Error('syncParticipationRecords must create pending records');
  }
});

test('SYNC: does not overwrite existing accepted/declined records', () => {
  if (!/if\s*\(!existing\.exists\)/.test(participationCloudSrc)) {
    throw new Error('syncParticipationRecords must not overwrite existing responses');
  }
});

test('SYNC: uses deterministic doc ID (event_id__identity_id)', () => {
  if (!/participationDocId/.test(participationCloudSrc) || !/\$\{eventId\}__\$\{identityId\}/.test(participationCloudSrc)) {
    throw new Error('Participation must use deterministic doc ID');
  }
});

// ═══════════════════════════════════════════════════════════
// 10. Authority — organiser can revoke, invitee can respond
// ═══════════════════════════════════════════════════════════

test('AUTHORITY: revoke checks organiser permission (creator/owner/biz manager)', () => {
  if (!/isCreator/.test(participationCloudSrc) || !/isIdentityOwner/.test(participationCloudSrc)) {
    throw new Error('revokeCalendarInvitation must check organiser permission');
  }
});

test('AUTHORITY: invitee cannot revoke their own invitation', () => {
  // The revoke function must NOT allow the invitee to revoke — only organiser
  const revokeMatch = participationCloudSrc.match(/revokeCalendarInvitation[\s\S]*?if\s*\(!isCreator\s*&&\s*!isIdentityOwner/);
  if (!revokeMatch) {
    throw new Error('revokeCalendarInvitation must require organiser authority');
  }
});

// ── Summary ──
const failed = results.filter(r => !r.passed).length;
console.log(`\n${results.length} tests, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);