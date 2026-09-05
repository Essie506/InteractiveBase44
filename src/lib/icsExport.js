// ICS export — guest Add-to-Calendar / .ics download (§44, §103).
// ───────────────────────────────────────────────────────────
// Generates a standards-compliant RFC 5545 .ics string for a single
// CalendarEvent so a guest can add it to any external calendar client
// (Apple Calendar, Google Calendar, Outlook). Pure client-side — no
// server round-trip. Recurring series expand their RRULE; all-day
// events use DATE values (no time). The meeting_url is exposed only if
// the caller passes it (the public projection never carries it; the
// attendance flow does).

function pad(n) { return String(n).padStart(2, '0'); }

function formatDateTime(iso, allDay) {
  const d = new Date(iso);
  if (allDay) {
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  }
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeIcs(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Build a .ics string for a CalendarEvent.
 * @param {object} event — CalendarEvent record
 * @param {object} [opts] — { meetingUrl?: string, organiserName?: string }
 * @returns {string} .ics file contents
 */
export function buildIcs(event, opts = {}) {
  if (!event) return '';
  const allDay = !!event.all_day;
  const dtStart = formatDateTime(event.start_time, allDay);
  const dtEnd = formatDateTime(event.end_time, allDay);
  const dtStamp = formatDateTime(new Date().toISOString(), false);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Interactive//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@interactive`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART${allDay ? ';VALUE=DATE' : ''}:${dtStart}`,
    `DTEND${allDay ? ';VALUE=DATE' : ''}:${dtEnd}`,
    `SUMMARY:${escapeIcs(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  if (opts.meetingUrl) lines.push(`LOCATION:${escapeIcs(opts.meetingUrl)}`);
  if (event.recurrence_rule) lines.push(`RRULE:${event.recurrence_rule}`);
  if (opts.organiserName) lines.push(`ORGANIZER:CN=${escapeIcs(opts.organiserName)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Trigger a .ics file download in the browser.
 */
export function downloadIcs(event, opts = {}) {
  const ics = buildIcs(event, opts);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(event.title || 'event').replace(/[^a-z0-9]+/gi, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Build a Google Calendar "add event" URL for the event.
 */
export function googleCalendarUrl(event, opts = {}) {
  const start = formatDateTime(event.start_time, !!event.all_day);
  const end = formatDateTime(event.end_time, !!event.all_day);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title || '',
    dates: `${start}/${end}`,
    details: event.description || '',
    location: opts.meetingUrl || event.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Build an Outlook "add event" URL (Outlook.com / Office 365 deep-link
 * compose). Uses UTC ISO timestamps for timed events and date values
 * for all-day events (Outlook treats end as exclusive for all-day).
 */
export function outlookCalendarUrl(event, opts = {}) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const toIso = (d) => d.toISOString().split('.')[0] + 'Z';
  const toDate = (d) => d.toISOString().split('T')[0];

  const params = new URLSearchParams({
    subject: event.title || '',
    body: event.description || '',
    location: opts.meetingUrl || event.location || '',
  });

  if (event.all_day) {
    params.set('start', toDate(start));
    const nextDay = new Date(end.getTime() + 86400000);
    params.set('end', toDate(nextDay));
  } else {
    params.set('start', toIso(start));
    params.set('end', toIso(end));
  }

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}