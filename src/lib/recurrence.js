// Recurrence engine — pure RRULE (RFC 5545) parser + occurrence expander.
// ───────────────────────────────────────────────────────────
// Shared between frontend (display) and backend (conflict detection).
// The backend copy (cloud-functions/src/recurrence.ts) has identical logic
// with TypeScript types.
//
// Supports: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT, UNTIL,
// BYDAY (MO..SU for WEEKLY), BYMONTHDAY (for MONTHLY).
//
// Occurrence identity: each occurrence has a stable ID derived from the
// series event ID + the original occurrence start time (ISO). This ID is
// stable across reschedules of that occurrence (the exception records the
// original time so the identity is preserved). §55.

const DAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/**
 * Parse an RRULE string into a structured rule.
 * Returns null for invalid/unparseable rules.
 */
export function parseRRule(rruleStr) {
  if (!rruleStr || typeof rruleStr !== 'string') return null;
  const clean = rruleStr.replace(/^RRULE:/i, '').trim();
  const parts = {};
  for (const segment of clean.split(';')) {
    const [k, v] = segment.split('=');
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const freq = parts.FREQ;
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
  return {
    freq,
    interval: parts.INTERVAL ? Math.max(1, parseInt(parts.INTERVAL, 10) || 1) : 1,
    count: parts.COUNT ? parseInt(parts.COUNT, 10) : null,
    until: parts.UNTIL ? parseUntil(parts.UNTIL) : null,
    byDay: parts.BYDAY ? parts.BYDAY.split(',').map(d => d.trim().toUpperCase()).filter(d => DAY_MAP[d] !== undefined) : null,
    byMonthDay: parts.BYMONTHDAY ? parts.BYMONTHDAY.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d)) : null,
  };
}

function parseUntil(untilStr) {
  // RFC 5545 UNTIL: 20261231T235959Z or 20261231
  const u = untilStr.trim();
  if (/^\d{8}T\d{6}Z$/.test(u)) {
    // 20261231T235959Z → ISO
    return `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T${u.slice(9, 11)}:${u.slice(11, 13)}:${u.slice(13, 15)}Z`;
  }
  if (/^\d{8}$/.test(u)) {
    return `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T23:59:59Z`;
  }
  return u; // assume already ISO
}

/**
 * Expand a recurrence rule into individual occurrences within a date range.
 *
 * @param {string} seriesEventId - The stable ID of the series event.
 * @param {string} rruleStr - The RRULE string.
 * @param {string} dtStartIso - The series start time (ISO 8601).
 * @param {string} dtEndIso - The series end time (ISO 8601) — the first occurrence's end.
 * @param {string} rangeStartIso - The start of the query range.
 * @param {string} rangeEndIso - The end of the query range.
 * @param {number} maxOccurrences - Safety cap (default 365).
 * @returns {Array<{occurrenceId: string, start: string, end: string}>}
 */
export function expandOccurrences(seriesEventId, rruleStr, dtStartIso, dtEndIso, rangeStartIso, rangeEndIso, maxOccurrences = 365) {
  const rule = parseRRule(rruleStr);
  if (!rule) return [];

  const dtStart = new Date(dtStartIso);
  const dtEnd = new Date(dtEndIso);
  const durationMs = dtEnd.getTime() - dtStart.getTime();
  const rangeStart = new Date(rangeStartIso);
  const rangeEnd = new Date(rangeEndIso);
  const until = rule.until ? new Date(rule.until) : null;
  const effectiveUntil = until && until < rangeEnd ? until : rangeEnd;

  const occurrences = [];
  let count = 0;

  // Helper: check if an occurrence is within range and within COUNT/UNTIL limits
  function tryOccurrence(occStart) {
    if (rule.count && count >= rule.count) return false; // stop
    if (until && occStart > until) return false; // stop
    count++;
    if (occStart >= rangeStart && occStart <= effectiveUntil) {
      const occEnd = new Date(occStart.getTime() + durationMs);
      occurrences.push({
        occurrenceId: occurrenceId(seriesEventId, occStart.toISOString()),
        start: occStart.toISOString(),
        end: occEnd.toISOString(),
      });
    }
    return true; // continue
  }

  if (rule.freq === 'DAILY') {
    const interval = rule.interval;
    let current = new Date(dtStart);
    while (current <= effectiveUntil && occurrences.length < maxOccurrences) {
      if (!tryOccurrence(current)) break;
      current = new Date(current.getTime() + interval * 24 * 60 * 60 * 1000);
    }
  } else if (rule.freq === 'WEEKLY') {
    const interval = rule.interval;
    const daysOfWeek = rule.byDay && rule.byDay.length > 0
      ? rule.byDay.map(d => DAY_MAP[d])
      : [dtStart.getDay()];
    daysOfWeek.sort((a, b) => a - b);
    // Start from the week of dtStart
    let weekStart = startOfWeek(new Date(dtStart));
    while (weekStart <= effectiveUntil && occurrences.length < maxOccurrences) {
      for (const dow of daysOfWeek) {
        const occ = new Date(weekStart);
        occ.setDate(weekStart.getDate() + dow);
        occ.setHours(dtStart.getHours(), dtStart.getMinutes(), dtStart.getSeconds(), dtStart.getMilliseconds());
        if (occ < dtStart) continue; // before series start
        if (!tryOccurrence(occ)) {
          return occurrences;
        }
      }
      weekStart = new Date(weekStart.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
    }
  } else if (rule.freq === 'MONTHLY') {
    const interval = rule.interval;
    let year = dtStart.getFullYear();
    let month = dtStart.getMonth();
    while (occurrences.length < maxOccurrences) {
      const monthDays = rule.byMonthDay && rule.byMonthDay.length > 0
        ? rule.byMonthDay
        : [dtStart.getDate()];
      for (const dom of monthDays) {
        const occ = new Date(year, month, dom, dtStart.getHours(), dtStart.getMinutes(), dtStart.getSeconds(), dtStart.getMilliseconds());
        if (occ < dtStart) continue;
        if (!tryOccurrence(occ)) {
          return occurrences;
        }
      }
      month += interval;
      while (month >= 12) { month -= 12; year++; }
      if (new Date(year, month, 1) > effectiveUntil) break;
    }
  } else if (rule.freq === 'YEARLY') {
    const interval = rule.interval;
    let year = dtStart.getFullYear();
    while (occurrences.length < maxOccurrences) {
      const occ = new Date(year, dtStart.getMonth(), dtStart.getDate(), dtStart.getHours(), dtStart.getMinutes(), dtStart.getSeconds(), dtStart.getMilliseconds());
      if (occ < dtStart) { year += interval; continue; }
      if (!tryOccurrence(occ)) break;
      year += interval;
      if (new Date(year, 0, 1) > effectiveUntil) break;
    }
  }

  return occurrences;
}

/**
 * Deterministic occurrence ID: seriesEventId + original occurrence start.
 * Stable across reschedules (the exception records the original time). §55.
 */
export function occurrenceId(seriesEventId, originalStartIso) {
  return `${seriesEventId}__${originalStartIso}`;
}

/**
 * Extract the series event ID from an occurrence ID.
 */
export function seriesIdFromOccurrence(occId) {
  const idx = occId.lastIndexOf('__');
  return idx > 0 ? occId.slice(0, idx) : occId;
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday = 0
  return d;
}