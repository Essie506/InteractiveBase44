// Calendar invitation deep-link journey — notification → in-app record →
// deep link → event detail with Accept/Decline.
// ───────────────────────────────────────────────────────────
// Verifies the notification → invited-event journey completes:
//   1. saveCalendarEvent emits calendar_event_invited to the invitee with
//      a /calendar?event=X action_url (server side).
//   2. CalendarPage auto-opens the event detail (Accept/Decline for an
//      invitee) when arriving via the ?event= deep link.
//   3. Both notification surfaces use SPA <Link> (not a full-reload anchor).

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const calSrc = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEvent.ts'), 'utf8');
const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx'), 'utf8');
const notifSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'Notifications.jsx'), 'utf8');
const bellSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'NotificationBell.jsx'), 'utf8');

// ── Server: invitation notification + deep link ──
test('create path emits calendar_event_invited to invited identities', () => {
  if (!/'calendar_event_invited'/.test(calSrc)) {
    throw new Error('must emit calendar_event_invited');
  }
  if (!/cal_invite:\$\{eventId\}:\$\{rid\}/.test(calSrc)) {
    throw new Error('per-identity invitation source_id pattern missing');
  }
});

test('invitation notification action_url deep-links to /calendar?event=', () => {
  if (!/action_url: `\/calendar\?event=\$\{eventId\}`/.test(calSrc)) {
    throw new Error('invitation action_url must deep-link to /calendar?event=');
  }
  if (!/action_label: 'View Event'/.test(calSrc)) {
    throw new Error('invitation action_label must be View Event');
  }
});

test('dispatcher creates an in-app NotificationRecord for the invitee', () => {
  const dispSrc = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'dispatcher.ts'), 'utf8');
  if (!/recipient_id: event\.recipient_id/.test(dispSrc)) {
    throw new Error('dispatcher must write recipient_id on the record');
  }
  if (!/db\.collection\(RECORDS\)\.doc\(notificationId\)\.set/.test(dispSrc)) {
    throw new Error('dispatcher must create a NotificationRecord');
  }
});

// ── CalendarPage: auto-open on deep link ──
test('CalendarPage reads the ?event= deep-link param', () => {
  if (!/new URLSearchParams\(window\.location\.search\)\.get\('event'\)/.test(pageSrc)) {
    throw new Error('CalendarPage must read the event query param');
  }
});

test('CalendarPage auto-opens the event modal on deep-link arrival', () => {
  // The focus effect must call handleSelectEvent so an invitee following
  // a notification lands directly on the read-only detail (Accept/Decline).
  const focusEffectIdx = pageSrc.indexOf('focusEventId || focusedRef.current');
  if (focusEffectIdx === -1) throw new Error('focus effect not found');
  const after = pageSrc.slice(focusEffectIdx, focusEffectIdx + 600);
  if (!/handleSelectEvent\(ev\)/.test(after)) {
    throw new Error('focus effect must call handleSelectEvent(ev) to auto-open');
  }
});

test('auto-open is guarded to fire once (focusedRef)', () => {
  if (!/focusedRef\.current = true/.test(pageSrc)) {
    throw new Error('must set focusedRef.current to guard repeat auto-open');
  }
  if (!/if \(!focusEventId \|\| focusedRef\.current/.test(pageSrc)) {
    throw new Error('must early-return when already focused');
  }
});

test('auto-open reuses handleSelectEvent (authority-gated, no new path)', () => {
  // handleSelectEvent gates on canEditEvent: editors → EventModal,
  // invitees → EventDetailModal. The deep link must not bypass this.
  if (!/canEditEvent\(event, user\)/.test(pageSrc)) {
    throw new Error('handleSelectEvent must gate on canEditEvent');
  }
  if (!/setViewingEvent\(event\)/.test(pageSrc)) {
    throw new Error('non-editors must open EventDetailModal (viewingEvent)');
  }
});

// ── Notification surfaces: SPA navigation ──
test('Notifications page uses <Link> for the deep link (not a full-reload anchor)', () => {
  if (!/import \{ Link \} from 'react-router-dom'/.test(notifSrc)) {
    throw new Error('Notifications must import Link');
  }
  if (!/<Link to=\{n\.action_url\}/.test(notifSrc)) {
    throw new Error('Notifications must render <Link to={n.action_url}>');
  }
  // No plain anchor for action_url remains.
  if (/<a href=\{n\.action_url\}/.test(notifSrc)) {
    throw new Error('Notifications must not use a plain anchor for action_url');
  }
});

test('NotificationBell uses <Link> for the deep link', () => {
  if (!/<Link to=\{n\.action_url\}/.test(bellSrc)) {
    throw new Error('NotificationBell must render <Link to={n.action_url}>');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);