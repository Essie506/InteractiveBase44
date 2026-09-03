// Booking email payload builder — pure function.
// ───────────────────────────────────────────────────────────
// The input type BookingEmailContext contains ONLY safe fields required
// for a booking confirmation/cancellation/reschedule email (Booking V2
// §1.7.1, §2.18, §3.12). The builder cannot access meeting_url, private
// booking internal state, payment card details, or provider account
// data because they are not in its input type — compile-time privacy
// guarantee, matching the calendar email payload pattern.
//
// Email is the PRIMARY guest confirmation channel (Booking §1.7.1).
// For identity recipients, email delivery follows NotificationPreference
// (the dispatcher resolves channels).

export type BookingEventType =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_rescheduled';

export interface BookingEmailContext {
  bookingReference: string;
  providerOrBusinessName: string | null;
  serviceLabel: string | null;
  dateLabel: string;       // e.g. "Wed, 2 Sep 2026"
  timeLabel: string;       // e.g. "10:30 – 11:30"
  timezone: string;        // IANA tz
  locationLabel: string | null;
  paymentStatusLabel: string | null;
  managementRoute: string; // /bookings/{id}
  eventType: BookingEventType;
}

export interface BuiltBookingEmail {
  subject: string;
  html: string;
  text: string;
}

const TEMPLATES: Record<
  BookingEventType,
  { subject: (t: BookingEmailContext) => string; intro: (t: BookingEmailContext) => string }
> = {
  booking_confirmed: {
    subject: (t) => `Booking confirmed — ${t.serviceLabel || 'your session'}${t.providerOrBusinessName ? ' with ' + t.providerOrBusinessName : ''}`,
    intro: () => `Your booking on Interactive has been confirmed.`,
  },
  booking_cancelled: {
    subject: (t) => `Booking cancelled — ${t.serviceLabel || 'session'}${t.providerOrBusinessName ? ' with ' + t.providerOrBusinessName : ''}`,
    intro: () => `A booking on Interactive has been cancelled.`,
  },
  booking_rescheduled: {
    subject: (t) => `Booking rescheduled — ${t.serviceLabel || 'session'}${t.providerOrBusinessName ? ' with ' + t.providerOrBusinessName : ''}`,
    intro: () => `A booking on Interactive has been rescheduled.`,
  },
};

export function buildBookingEmailPayload(ctx: BookingEmailContext): BuiltBookingEmail {
  const tmpl = TEMPLATES[ctx.eventType];
  const subject = tmpl.subject(ctx);
  const intro = tmpl.intro(ctx);
  const link = ctx.managementRoute.startsWith('http')
    ? ctx.managementRoute
    : `https://app.interactive.app${ctx.managementRoute}`;

  const lines = [
    intro,
    '',
    `Booking reference: ${ctx.bookingReference}`,
    ctx.providerOrBusinessName ? `Provider: ${ctx.providerOrBusinessName}` : null,
    ctx.serviceLabel ? `Service: ${ctx.serviceLabel}` : null,
    `When: ${ctx.dateLabel}, ${ctx.timeLabel} (${ctx.timezone})`,
    ctx.locationLabel ? `Location: ${ctx.locationLabel}` : null,
    ctx.paymentStatusLabel ? `Payment: ${ctx.paymentStatusLabel}` : null,
    '',
    `View booking: ${link}`,
  ].filter((l) => l !== null) as string[];

  const text = lines.join('\n');

  const html = [
    `<div style="font-family:sans-serif;color:#1c1917;">`,
    `<p style="font-size:16px;">${escapeHtml(intro)}</p>`,
    `<div style="margin:16px 0;padding:16px;border:1px solid #e7e5e4;border-radius:8px;">`,
    `<div style="font-weight:600;font-size:16px;margin-bottom:8px;">Booking ${escapeHtml(ctx.bookingReference)}</div>`,
    ctx.providerOrBusinessName ? `<div style="font-size:14px;color:#57534e;margin-bottom:4px;">👤 ${escapeHtml(ctx.providerOrBusinessName)}</div>` : '',
    ctx.serviceLabel ? `<div style="font-size:14px;color:#57534e;margin-bottom:4px;">🏷 ${escapeHtml(ctx.serviceLabel)}</div>` : '',
    `<div style="font-size:14px;color:#57534e;margin-bottom:4px;">📅 ${escapeHtml(ctx.dateLabel)}, ${escapeHtml(ctx.timeLabel)} (${escapeHtml(ctx.timezone)})</div>`,
    ctx.locationLabel ? `<div style="font-size:14px;color:#57534e;margin-bottom:4px;">📍 ${escapeHtml(ctx.locationLabel)}</div>` : '',
    ctx.paymentStatusLabel ? `<div style="font-size:14px;color:#57534e;">💳 ${escapeHtml(ctx.paymentStatusLabel)}</div>` : '',
    `</div>`,
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;">View booking in Interactive</a></p>`,
    `</div>`,
  ].join('');

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
}