// Shared normalized calendar occurrence model (§18–§22, §70–§74).
// ───────────────────────────────────────────────────────────
// ALL calendar views (Month, Week, Day, Agenda) and Search/Filters
// consume this single normalized model. No view interprets raw events
// independently — they all go through normalizeToOccurrences().
//
// Recurring events are expanded into individual occurrences (projections,
// NOT persisted duplicates — §53–§56). Exceptions (cancelled/rescheduled)
// are applied so the occurrence list reflects the authoritative schedule.
// Historical series integrity is respected via effective_until (§57).
//
// Each occurrence carries:
//   occurrenceId   — stable identity (seriesId__originalStart for recurring,
//                    eventId for non-recurring)
//   seriesEventId  — the parent series event ID (null for non-recurring)
//   start / end    — ISO strings (adjusted for rescheduled exceptions)
//   event          — the parent CalendarEvent record
//   isRecurring    — whether this occurrence belongs to a recurring series
//   isException    — whether this occurrence was modified by an exception

import { expandOccurrences } from '@/lib/recurrence';

/**
 * Normalize raw CalendarEvent records into a flat list of occurrences.
 *
 * @param {Array} events — Raw CalendarEvent records (any lifecycle)
 * @param {Array} exceptions — Exception records for recurring series
 * @param {Date} rangeStart — Start of the visible date range
 * @param {Date} rangeEnd — End of the visible date range
 * @returns {Array} Sorted occurrences within the range
 */
export function normalizeToOccurrences(events, exceptions, rangeStart, rangeEnd) {
  if (!events || events.length === 0) return [];

  // Build exception lookup: occurrenceId → exception
  const exceptionMap = new Map();
  for (const exc of exceptions || []) {
    const key = exc.exception_id || `${exc.series_event_id}__${exc.original_start_time}`;
    exceptionMap.set(key, exc);
  }

  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();
  const occurrences = [];

  for (const event of events) {
    if (!event) continue;
    if (event.lifecycle_state === 'cancelled') continue;

    if (event.recurrence_rule) {
      // ── Recurring event — expand occurrences within the range ──
      // effective_until caps occurrence generation for superseded series (§57).
      const effectiveUntilIso = event.effective_until || rangeEnd.toISOString();
      const expanded = expandOccurrences(
        event.id,
        event.recurrence_rule,
        event.start_time,
        event.end_time,
        rangeStart.toISOString(),
        effectiveUntilIso,
      );

      for (const occ of expanded) {
        const exc = exceptionMap.get(occ.occurrenceId);
        if (exc && exc.exception_type === 'cancelled') continue; // skipped occurrence
        if (exc && exc.exception_type === 'rescheduled' && exc.new_start_time && exc.new_end_time) {
          // Rescheduled occurrence — use the new time, keep stable identity
          const occStartMs = new Date(exc.new_start_time).getTime();
          if (occStartMs >= rangeStartMs && occStartMs <= rangeEndMs) {
            occurrences.push({
              occurrenceId: occ.occurrenceId,
              seriesEventId: event.id,
              start: exc.new_start_time,
              end: exc.new_end_time,
              event,
              isRecurring: true,
              isException: true,
            });
          }
        } else {
          // Normal occurrence
          const occStartMs = new Date(occ.start).getTime();
          if (occStartMs >= rangeStartMs && occStartMs <= rangeEndMs) {
            occurrences.push({
              occurrenceId: occ.occurrenceId,
              seriesEventId: event.id,
              start: occ.start,
              end: occ.end,
              event,
              isRecurring: true,
              isException: false,
            });
          }
        }
      }
    } else {
      // ── Non-recurring event — single occurrence ──
      const occStartMs = new Date(event.start_time).getTime();
      if (occStartMs >= rangeStartMs && occStartMs <= rangeEndMs) {
        occurrences.push({
          occurrenceId: event.id,
          seriesEventId: null,
          start: event.start_time,
          end: event.end_time,
          event,
          isRecurring: false,
          isException: false,
        });
      }
    }
  }

  return occurrences.sort((a, b) => new Date(a.start) - new Date(b.start));
}

/**
 * Group occurrences by calendar date (viewer's local timezone for timed
 * events, UTC date for all-day events — §97).
 */
export function groupOccurrencesByDate(occurrences, timezone) {
  const byDate = new Map();
  for (const occ of occurrences) {
    const event = occ.event;
    let dateKey;
    if (event.all_day) {
      // All-day events grouped by stored UTC date (TZ-invariant — §97)
      dateKey = occ.start.slice(0, 10);
    } else {
      // Timed events grouped by viewer's local date
      const d = new Date(occ.start);
      dateKey = d.toDateString();
    }
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(occ);
  }
  return byDate;
}

/**
 * Filter occurrences by a search query (title/description) and filter criteria.
 */
export function filterOccurrences(occurrences, { search, visibility, sourceSystem, lifecycleState } = {}) {
  return occurrences.filter((occ) => {
    const event = occ.event;
    if (search) {
      const q = search.toLowerCase();
      const title = (event.title || '').toLowerCase();
      const desc = (event.description || '').toLowerCase();
      if (!title.includes(q) && !desc.includes(q)) return false;
    }
    if (visibility && event.visibility !== visibility) return false;
    if (sourceSystem && event.source_system !== sourceSystem) return false;
    if (lifecycleState && event.lifecycle_state !== lifecycleState) return false;
    return true;
  });
}