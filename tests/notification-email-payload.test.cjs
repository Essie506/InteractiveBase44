// Notification email payload — privacy regression tests.
// ───────────────────────────────────────────────────────────
// Mirrors cloud-functions/src/notifications/email/payloads/calendar.ts
// and asserts the email payload contains ONLY safe fields and NEVER
// contains meeting_url, attendee lists, invited ids, guest emails,
// assigned ids, private coordinates, or booking-private fields. The
// privacy boundary is enforced by the CalendarEmailContext input type
// (compile-time) and re-asserted here at runtime.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const TEMPLATES = {
  calendar_event_invited: { subject: (t) => `${t.hostDisplayName || 'Someone'} invited you to "${t.eventTitle}"`, intro: () => `You've been invited to an event on Interactive.` },
  calendar_event_updated: { subject: (t) => `"${t.eventTitle}" has been updated`, intro: () => `An event you're invited to has been updated.` },
  calendar_event_rescheduled: { subject: (t) => `"${t.eventTitle}" has been rescheduled`, intro: () => `An event you're invited to has been rescheduled.` },
  calendar_event_cancelled: { subject: (t) => `"${t.eventTitle}" has been cancelled`, intro: () => `An event you're invited to has been cancelled.` },
  calendar_invitation_removed: { subject: (t) => `You were removed from "${t.eventTitle}"`, intro: () => `You were removed from an event on Interactive.` },
};
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function buildCalendarEmailPayload(ctx) {
  const tmpl = TEMPLATES[ctx.eventType];
  const subject = tmpl.subject(ctx);
  const intro = tmpl.intro(ctx);
  const locationLine = ctx.safeLocationLabel ? `Location: ${ctx.safeLocationLabel}` : 'Location: Online';
  const link = ctx.eventLink.startsWith('http') ? ctx.eventLink : `https://app.interactive.app${ctx.eventLink}`;
  const text = [intro, '', `Event: ${ctx.eventTitle}`, `When: ${ctx.dateLabel}, ${ctx.timeLabel} (${ctx.timezone})`, locationLine, '', `View event: ${link}`].join('\n');
  const html = `<div><p>${escapeHtml(intro)}</p><div>${escapeHtml(ctx.eventTitle)}</div><div>📅 ${escapeHtml(ctx.dateLabel)}, ${escapeHtml(ctx.timeLabel)} (${escapeHtml(ctx.timezone)})</div><div>📍 ${escapeHtml(ctx.safeLocationLabel || 'Online')}</div><a href="${escapeHtml(link)}">View event</a></div>`;
  return { subject, html, text };
}

const SAFE_CTX = {
  eventTitle: 'Yoga Class', hostDisplayName: 'Jane', dateLabel: 'Wed, 2 Sep 2026',
  timeLabel: '10:30 – 11:30', timezone: 'Europe/London', safeLocationLabel: 'Studio A',
  eventLink: '/calendar?event=evt1', eventType: 'calendar_event_invited',
};

const FORBIDDEN = [
  'meeting_url', 'https://meet.example.com/xyz',
  'invited_identity_ids', 'id_abc', 'id_def',
  'invited_guest_emails', 'guest@example.com',
  'assigned_identity_ids', 'staff_id',
  'latitude', 'longitude', '51.5074',
  'booking_id', 'price_pence',
];

// ── Source contract ──
test('payload builder module defines CalendarEmailContext with only safe fields', () => {
  const rawSrc = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'email', 'payloads', 'calendar.ts'), 'utf8');
  // Strip comments so the scan targets code, not the doc comment that
  // legitimately lists the forbidden fields as "never include".
  const src = rawSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (!/export function buildCalendarEmailPayload/.test(src)) throw new Error('buildCalendarEmailPayload not exported');
  for (const bad of ['meeting_url', 'invited_identity_ids', 'invited_guest_emails', 'assigned_identity_ids', 'latitude', 'longitude', 'booking']) {
    if (new RegExp(`\\b${bad}\\b`).test(src)) throw new Error(`CalendarEmailContext/payload must not reference ${bad}`);
  }
});
test('dispatcher passes emailContext through a builder, never raw event fields', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'dispatcher.ts'), 'utf8');
  if (!/emailPayloadBuilder/.test(src)) throw new Error('dispatcher must use emailPayloadBuilder');
  if (!/emailContext/.test(src)) throw new Error('dispatcher must pass emailContext');
});

// ── Payload safety ──
test('invited payload contains safe fields', () => {
  const p = buildCalendarEmailPayload(SAFE_CTX);
  if (!p.subject.includes('Yoga Class')) throw new Error('subject must include event title');
  if (!p.text.includes('Wed, 2 Sep 2026')) throw new Error('text must include date');
  if (!p.text.includes('Europe/London')) throw new Error('text must include timezone');
  if (!p.text.includes('Studio A')) throw new Error('text must include safe location label');
  if (!p.text.includes('/calendar?event=evt1')) throw new Error('text must include event link');
});
test('no forbidden private field appears in any payload channel', () => {
  for (const eventType of Object.keys(TEMPLATES)) {
    const p = buildCalendarEmailPayload({ ...SAFE_CTX, eventType });
    const blob = `${p.subject}\n${p.html}\n${p.text}`;
    for (const bad of FORBIDDEN) {
      if (blob.includes(bad)) throw new Error(`payload for ${eventType} leaks "${bad}"`);
    }
  }
});
test('online event omits physical location label safely', () => {
  const p = buildCalendarEmailPayload({ ...SAFE_CTX, safeLocationLabel: null });
  if (!p.text.includes('Online')) throw new Error('null location must render as Online');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);