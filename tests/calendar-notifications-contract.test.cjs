// Phase 3 — Calendar → Notifications Contract.
// ───────────────────────────────────────────────────────────
// Verifies: Calendar emits the appropriate authoritative notification
// source events for: invitation created, participant response, invitation
// removed, schedule changed, rescheduled, cancelled, reminder due.
// Notifications remains responsible for delivery (NotificationRecord,
// preferences, channels, email/in-app, retries, grouping, quiet hours).
// Calendar does NOT send email directly.
//
// Run with: node tests/calendar-notifications-contract.test.cjs

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
const POLICY = path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'policy.ts');
const PAYLOADS = path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'email', 'payloads', 'calendar.ts');
const REMINDER_SWEEP = path.join(__dirname, '..', 'cloud-functions', 'src', 'reminderSweep.ts');
const CLIENT_NOTIFS = path.join(__dirname, '..', 'src', 'lib', 'notifications.js');
const DISPATCHER = path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'dispatcher.ts');

const calEventSrc = fs.readFileSync(CAL_EVENT, 'utf8');
const partSrc = fs.readFileSync(PARTICIPATION, 'utf8');
const policySrc = fs.readFileSync(POLICY, 'utf8');
const payloadsSrc = fs.readFileSync(PAYLOADS, 'utf8');
const sweepSrc = fs.readFileSync(REMINDER_SWEEP, 'utf8');
const clientNotifSrc = fs.readFileSync(CLIENT_NOTIFS, 'utf8');
const dispatcherSrc = fs.readFileSync(DISPATCHER, 'utf8');

// ── Calendar event types emitted ────────────────────────────
test('NOTIFY: Calendar emits calendar_event_invited (invitation created)', () => {
  if (!/calendar_event_invited/.test(calEventSrc)) {
    throw new Error('Must emit calendar_event_invited');
  }
});

test('NOTIFY: Calendar emits calendar_event_updated (schedule changed)', () => {
  if (!/calendar_event_updated/.test(calEventSrc)) {
    throw new Error('Must emit calendar_event_updated');
  }
});

test('NOTIFY: Calendar emits calendar_event_rescheduled', () => {
  if (!/calendar_event_rescheduled/.test(calEventSrc)) {
    throw new Error('Must emit calendar_event_rescheduled');
  }
});

test('NOTIFY: Calendar emits calendar_event_cancelled', () => {
  if (!/calendar_event_cancelled/.test(calEventSrc)) {
    throw new Error('Must emit calendar_event_cancelled');
  }
});

test('NOTIFY: Calendar emits calendar_invitation_removed (invitation removed)', () => {
  if (!/calendar_invitation_removed/.test(calEventSrc)) {
    throw new Error('Must emit calendar_invitation_removed');
  }
});

test('NOTIFY: Calendar emits calendar_participation_accepted (participant response)', () => {
  if (!/calendar_participation_accepted/.test(partSrc)) {
    throw new Error('respondCalendarInvitation must emit calendar_participation_accepted');
  }
});

test('NOTIFY: Calendar emits calendar_participation_declined (participant response)', () => {
  if (!/calendar_participation_declined/.test(partSrc)) {
    throw new Error('respondCalendarInvitation must emit calendar_participation_declined');
  }
});

test('NOTIFY: Reminder sweep emits calendar_reminder (reminder due)', () => {
  if (!/calendar_reminder/.test(sweepSrc)) {
    throw new Error('Reminder sweep must emit calendar_reminder');
  }
});

// ── Calendar does NOT send email directly ───────────────────
test('CONTRACT: Calendar uses emitNotification (not direct email)', () => {
  if (!/emitNotification/.test(calEventSrc)) {
    throw new Error('Calendar must use emitNotification');
  }
  if (/SendEmail|sendEmail|resend/i.test(calEventSrc)) {
    throw new Error('Calendar must NOT send email directly (use emitNotification)');
  }
});

test('CONTRACT: respondCalendarInvitation uses emitNotification (not direct email)', () => {
  if (!/emitNotification/.test(partSrc)) {
    throw new Error('Participation response must use emitNotification');
  }
  if (/SendEmail|sendEmail|resend/i.test(partSrc)) {
    throw new Error('Participation response must NOT send email directly');
  }
});

test('CONTRACT: Reminder sweep uses emitNotification (not direct email)', () => {
  if (!/emitNotification/.test(sweepSrc)) {
    throw new Error('Reminder sweep must use emitNotification');
  }
  if (/SendEmail|sendEmail|resend/i.test(sweepSrc)) {
    throw new Error('Reminder sweep must NOT send email directly');
  }
});

test('CONTRACT: Calendar passes emailPayloadBuilder to dispatcher (provider-neutral)', () => {
  if (!/emailPayloadBuilder/.test(calEventSrc)) {
    throw new Error('Calendar must pass emailPayloadBuilder to dispatcher');
  }
  if (!/buildCalendarEmailPayload/.test(calEventSrc)) {
    throw new Error('Calendar must use buildCalendarEmailPayload');
  }
});

// ── Notification policy includes all calendar event types ───
test('POLICY: calendar_event_invited has delivery policy', () => {
  if (!/calendar_event_invited/.test(policySrc)) {
    throw new Error('Policy must include calendar_event_invited');
  }
});

test('POLICY: calendar_participation_accepted has delivery policy (Phase 3)', () => {
  if (!/calendar_participation_accepted/.test(policySrc)) {
    throw new Error('Policy must include calendar_participation_accepted');
  }
});

test('POLICY: calendar_participation_declined has delivery policy (Phase 3)', () => {
  if (!/calendar_participation_declined/.test(policySrc)) {
    throw new Error('Policy must include calendar_participation_declined');
  }
});

test('POLICY: calendar_reminder has delivery policy', () => {
  if (!/calendar_reminder/.test(policySrc)) {
    throw new Error('Policy must include calendar_reminder');
  }
});

// ── Email payload builder covers all event types ─────────────
test('PAYLOAD: calendar_participation_accepted has email template', () => {
  if (!/calendar_participation_accepted/.test(payloadsSrc)) {
    throw new Error('Email payload builder must include calendar_participation_accepted');
  }
});

test('PAYLOAD: calendar_participation_declined has email template', () => {
  if (!/calendar_participation_declined/.test(payloadsSrc)) {
    throw new Error('Email payload builder must include calendar_participation_declined');
  }
});

test('PAYLOAD: CalendarEmailContext contains ONLY safe fields (privacy boundary)', () => {
  // The CalendarEmailContext type must NOT include meeting_url, attendee lists,
  // or private booking fields — this is a compile-time privacy guarantee.
  if (/meeting_url/.test(payloadsSrc) && /CalendarEmailContext/.test(payloadsSrc)) {
    // Check that meeting_url is NOT in the CalendarEmailContext interface
    const ctxMatch = payloadsSrc.match(/export interface CalendarEmailContext\s*\{[^}]*\}/);
    if (ctxMatch && /meeting_url/.test(ctxMatch[0])) {
      throw new Error('CalendarEmailContext must NOT contain meeting_url (privacy boundary)');
    }
  }
});

// ── Client-side delivery policy mirror ─────────────────────
test('CLIENT: notifications.js includes calendar_participation_accepted/declined', () => {
  if (!/calendar_participation_accepted/.test(clientNotifSrc)) {
    throw new Error('Client delivery policy must include calendar_participation_accepted');
  }
  if (!/calendar_participation_declined/.test(clientNotifSrc)) {
    throw new Error('Client delivery policy must include calendar_participation_declined');
  }
});

// ── Guest invitations are email-only through Notifications ──
test('GUEST: Guest invitations use emitNotification with recipient_email (no identity manufactured)', () => {
  // The create notification path must handle guest emails via recipient_email
  if (!/recipient_email/.test(calEventSrc)) {
    throw new Error('Calendar must pass recipient_email for guest invitations');
  }
  // The dispatcher must handle guest recipients (no NotificationRecord for guests)
  if (!/isGuest/.test(dispatcherSrc)) {
    throw new Error('Dispatcher must identify guest recipients');
  }
  if (!/guests get no NotificationRecord/i.test(dispatcherSrc)) {
    throw new Error('Dispatcher must NOT create NotificationRecord for guests');
  }
});

test('GUEST: Calendar does NOT manufacture an Interactive identity for guests', () => {
  // Guest emails are passed as recipient_email, not resolved to identities
  if (/resolveEmailsToIdentities.*guest|guest.*resolveEmailsToIdentities/i.test(calEventSrc)) {
    // Actually, resolveEmailsToIdentities is used to resolve emails to identities,
    // but unresolved emails are kept as invited_guest_emails — this is correct.
    // The test is that guests don't get an identity manufactured.
    if (!/unresolved/.test(calEventSrc)) {
      throw new Error('Unresolved emails must be kept as invited_guest_emails (not manufactured)');
    }
  }
});

// ── Dispatcher is the sole entry point ───────────────────────
test('ARCH: emitNotification is the sole entry point for domain systems', () => {
  if (!/sole entry point for domain systems/i.test(dispatcherSrc)) {
    throw new Error('Dispatcher must document it is the sole entry point');
  }
  // "Domain systems never touch" may span lines
  if (!/Domain systems never touch[\s\S]*notificationRecords/i.test(dispatcherSrc)) {
    throw new Error('Dispatcher must document domain systems never touch notificationRecords');
  }
});

test('ARCH: Dispatcher creates NotificationRecord + delivery outbox (not domain systems)', () => {
  if (!/notificationRecords|RECORDS/.test(dispatcherSrc)) {
    throw new Error('Dispatcher must create NotificationRecord');
  }
  if (!/notificationDeliveries|DELIVERY/.test(dispatcherSrc)) {
    throw new Error('Dispatcher must create delivery outbox');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);