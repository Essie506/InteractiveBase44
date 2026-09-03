// Recurrence engine — pure RRULE (RFC 5545) parser + occurrence expander.
// ───────────────────────────────────────────────────────────
// Backend copy (typed). Identical logic to src/lib/recurrence.js.
// Used by conflict detection (expanding recurring events) and the
// occurrence query function.
//
// Supports: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT, UNTIL,
// BYDAY (MO..SU for WEEKLY), BYMONTHDAY (for MONTHLY).
//
// Occurrence identity: each occurrence has a stable ID derived from the
// series event ID + the original occurrence start time. §55.

const DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export interface ParsedRRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count: number | null;
  until: string | null;
  byDay: string[] | null;
  byMonthDay: number[] | null;
}

export interface Occurrence {
  occurrenceId: string;
  start: string;
  end: string;
}

export function parseRRule(rruleStr: string): ParsedRRule | null {
  if (!rruleStr || typeof rruleStr !== 'string') return null;
  const clean = rruleStr.replace(/^RRULE:/i, '').trim();
  const parts: Record<string, string> = {};
  for (const segment of clean.split(';')) {
    const [k, v] = segment.split('=');
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const freq = parts.FREQ;
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
  return {
    freq: freq as ParsedRRule['freq'],
    interval: parts.INTERVAL ? Math.max(1, parseInt(parts.INTERVAL, 10) || 1) : 1,
    count: parts.COUNT ? parseInt(parts.COUNT, 10) : null,
    until: parts.UNTIL ? parseUntil(parts.UNTIL) : null,
    byDay: parts.BYDAY ? parts.BYDAY.split(',').map(d => d.trim().toUpperCase()).filter(d => DAY_MAP[d] !== undefined) : null,
    byMonthDay: parts.BYMONTHDAY ? parts.BYMONTHDAY.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d)) : null,
  };
}

function parseUntil(untilStr: string): string {
  const u = untilStr.trim();
  if (/^\d{8}T\d{6}Z$/.test(u)) {
    return `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T${u.slice(9, 11)}:${u.slice(11, 13)}:${u.slice(13, 15)}Z`;
  }
  if (/^\d{8}$/.test(u)) {
    return `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T23:59:59Z`;
  }
  return u;
}

export function expandOccurrences(
  seriesEventId: string,
  rruleStr: string,
  dtStartIso: string,
  dtEndIso: string,
  rangeStartIso: string,
  rangeEndIso: string,
  maxOccurrences: number = 365,
): Occurrence[] {
  const rule = parseRRule(rruleStr);
  if (!rule) return [];

  const dtStart = new Date(dtStartIso);
  const dtEnd = new Date(dtEndIso);
  const durationMs = dtEnd.getTime() - dtStart.getTime();
  const rangeStart = new Date(rangeStartIso);
  const rangeEnd = new Date(rangeEndIso);
  const until = rule.until ? new Date(rule.until) : null;
  const effectiveUntil = until && until < rangeEnd ? until : rangeEnd;

  const occurrences: Occurrence[] = [];
  let count = 0;

  function tryOccurrence(occStart: Date): boolean {
    if (rule!.count && count >= rule!.count) return false;
    if (until && occStart > until) return false;
    count++;
    if (occStart >= rangeStart && occStart <= effectiveUntil) {
      const occEnd = new Date(occStart.getTime() + durationMs);
      occurrences.push({
        occurrenceId: occurrenceId(seriesEventId, occStart.toISOString()),
        start: occStart.toISOString(),
        end: occEnd.toISOString(),
      });
    }
    return true;
  }

  if (rule.freq === 'DAILY') {
    let current = new Date(dtStart);
    while (current <= effectiveUntil && occurrences.length < maxOccurrences) {
      if (!tryOccurrence(current)) break;
      current = new Date(current.getTime() + rule.interval * 24 * 60 * 60 * 1000);
    }
  } else if (rule.freq === 'WEEKLY') {
    const daysOfWeek = rule.byDay && rule.byDay.length > 0
      ? rule.byDay.map(d => DAY_MAP[d])
      : [dtStart.getDay()];
    daysOfWeek.sort((a, b) => a - b);
    let weekStart = startOfWeek(new Date(dtStart));
    while (weekStart <= effectiveUntil && occurrences.length < maxOccurrences) {
      for (const dow of daysOfWeek) {
        const occ = new Date(weekStart);
        occ.setDate(weekStart.getDate() + dow);
        occ.setHours(dtStart.getHours(), dtStart.getMinutes(), dtStart.getSeconds(), dtStart.getMilliseconds());
        if (occ < dtStart) continue;
        if (!tryOccurrence(occ)) return occurrences;
      }
      weekStart = new Date(weekStart.getTime() + rule.interval * 7 * 24 * 60 * 60 * 1000);
    }
  } else if (rule.freq === 'MONTHLY') {
    let year = dtStart.getFullYear();
    let month = dtStart.getMonth();
    while (occurrences.length < maxOccurrences) {
      const monthDays = rule.byMonthDay && rule.byMonthDay.length > 0
        ? rule.byMonthDay
        : [dtStart.getDate()];
      for (const dom of monthDays) {
        const occ = new Date(year, month, dom, dtStart.getHours(), dtStart.getMinutes(), dtStart.getSeconds(), dtStart.getMilliseconds());
        if (occ < dtStart) continue;
        if (!tryOccurrence(occ)) return occurrences;
      }
      month += rule.interval;
      while (month >= 12) { month -= 12; year++; }
      if (new Date(year, month, 1) > effectiveUntil) break;
    }
  } else if (rule.freq === 'YEARLY') {
    let year = dtStart.getFullYear();
    while (occurrences.length < maxOccurrences) {
      const occ = new Date(year, dtStart.getMonth(), dtStart.getDate(), dtStart.getHours(), dtStart.getMinutes(), dtStart.getSeconds(), dtStart.getMilliseconds());
      if (occ < dtStart) { year += rule.interval; continue; }
      if (!tryOccurrence(occ)) break;
      year += rule.interval;
      if (new Date(year, 0, 1) > effectiveUntil) break;
    }
  }

  return occurrences;
}

export function occurrenceId(seriesEventId: string, originalStartIso: string): string {
  return `${seriesEventId}__${originalStartIso}`;
}

export function seriesIdFromOccurrence(occId: string): string {
  const idx = occId.lastIndexOf('__');
  return idx > 0 ? occId.slice(0, idx) : occId;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}