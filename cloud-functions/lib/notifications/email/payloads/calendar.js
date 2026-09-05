"use strict";
// Calendar email payload builder — pure function.
// ───────────────────────────────────────────────────────────
// The input type CalendarEmailContext contains ONLY safe fields. The
// builder cannot access meeting_url, attendee lists, invited_identity_ids,
// invited_guest_emails, assigned_identity_ids, private coordinates, or
// booking-private fields because they are not in its input type. This
// makes the privacy boundary a compile-time guarantee, not a runtime
// convention.
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCalendarEmailPayload = buildCalendarEmailPayload;
const TEMPLATES = {
    calendar_event_invited: {
        subject: (t) => `${t.hostDisplayName || 'Someone'} invited you to "${t.eventTitle}"`,
        intro: () => `You've been invited to an event on Interactive.`,
    },
    calendar_event_updated: {
        subject: (t) => `"${t.eventTitle}" has been updated`,
        intro: () => `An event you're invited to has been updated.`,
    },
    calendar_event_rescheduled: {
        subject: (t) => `"${t.eventTitle}" has been rescheduled`,
        intro: () => `An event you're invited to has been rescheduled.`,
    },
    calendar_event_cancelled: {
        subject: (t) => `"${t.eventTitle}" has been cancelled`,
        intro: () => `An event you're invited to has been cancelled.`,
    },
    calendar_invitation_removed: {
        subject: (t) => `You were removed from "${t.eventTitle}"`,
        intro: () => `You were removed from an event on Interactive.`,
    },
    calendar_participation_accepted: {
        subject: (t) => `Invitation accepted for "${t.eventTitle}"`,
        intro: () => `A participant accepted your calendar invitation.`,
    },
    calendar_participation_declined: {
        subject: (t) => `Invitation declined for "${t.eventTitle}"`,
        intro: () => `A participant declined your calendar invitation.`,
    },
};
function buildCalendarEmailPayload(ctx) {
    const tmpl = TEMPLATES[ctx.eventType];
    const subject = tmpl.subject(ctx);
    const intro = tmpl.intro(ctx);
    const locationLine = ctx.safeLocationLabel ? `Location: ${ctx.safeLocationLabel}` : 'Location: Online';
    const link = ctx.eventLink.startsWith('http')
        ? ctx.eventLink
        : `https://app.interactive.app${ctx.eventLink}`;
    const text = [
        intro,
        '',
        `Event: ${ctx.eventTitle}`,
        `When: ${ctx.dateLabel}, ${ctx.timeLabel} (${ctx.timezone})`,
        locationLine,
        '',
        `View event: ${link}`,
    ].join('\n');
    const html = [
        `<div style="font-family:sans-serif;color:#1c1917;">`,
        `<p style="font-size:16px;">${escapeHtml(intro)}</p>`,
        `<div style="margin:16px 0;padding:16px;border:1px solid #e7e5e4;border-radius:8px;">`,
        `<div style="font-weight:600;font-size:16px;margin-bottom:8px;">${escapeHtml(ctx.eventTitle)}</div>`,
        `<div style="font-size:14px;color:#57534e;margin-bottom:4px;">📅 ${escapeHtml(ctx.dateLabel)}, ${escapeHtml(ctx.timeLabel)} (${escapeHtml(ctx.timezone)})</div>`,
        `<div style="font-size:14px;color:#57534e;">📍 ${escapeHtml(ctx.safeLocationLabel || 'Online')}</div>`,
        `</div>`,
        `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;">View event in Interactive</a></p>`,
        `</div>`,
    ].join('');
    return { subject, html, text };
}
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
//# sourceMappingURL=calendar.js.map