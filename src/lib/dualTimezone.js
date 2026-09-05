// Dual-timezone presentation (§95).
// ───────────────────────────────────────────────────────────
// An event carries an IANA timezone (the timezone in which it was
// authored / should be displayed). A viewer may be in a different
// timezone. §95 requires both to be shown so a participant in another
// region understands the event time in both the organiser's timezone
// and their own.
//
// This helper formats an instant in two timezones using the platform
// Intl API (no external dependency). It degrades gracefully to a single
// timezone label when the two are identical.

function formatInTz(iso, tz, allDay) {
  if (allDay) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) + ' (All day)';
  }
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: tz || undefined,
    });
  } catch {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}

function tzShortLabel(iso, tz) {
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(d);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : tz;
  } catch {
    return tz || 'UTC';
  }
}

/**
 * Returns the dual-timezone presentation for an event start/end.
 * @param {object} event — CalendarEvent
 * @param {string} viewerTz — the viewer's IANA timezone
 * @returns {{ sameZone: boolean, eventTzLabel: string, viewerTzLabel: string, eventTzTime: string, viewerTzTime: string }}
 */
export function dualTimezoneDisplay(event, viewerTz) {
  const eventTz = event?.timezone || 'UTC';
  const allDay = !!event?.all_day;
  const eventTzTime = formatInTz(event?.start_time, eventTz, allDay);
  const viewerTzTime = formatInTz(event?.start_time, viewerTz, allDay);
  const eventTzLabel = tzShortLabel(event?.start_time, eventTz);
  const viewerTzLabel = tzShortLabel(event?.start_time, viewerTz);
  let sameZone = false;
  try {
    sameZone = new Intl.DateTimeFormat('en-GB', { timeZone: eventTz, timeZoneName: 'short' }).format(new Date(event?.start_time)) ===
      new Intl.DateTimeFormat('en-GB', { timeZone: viewerTz, timeZoneName: 'short' }).format(new Date(event?.start_time));
  } catch {
    sameZone = eventTz === viewerTz;
  }
  return { sameZone, eventTzLabel, viewerTzLabel, eventTzTime, viewerTzTime };
}