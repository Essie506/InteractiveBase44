// Calendar Event recurrence exceptions (§55–§56).
// ───────────────────────────────────────────────────────────
// An exception modifies a single occurrence of a recurring series:
//   'cancelled'  — the occurrence is skipped (does not appear, does not block)
//   'rescheduled' — the occurrence is moved to a new start/end time
//
// The exception stores the ORIGINAL occurrence start so the occurrence
// identity is stable across reschedules (§55). Past exceptions are never
// rewritten (historical recurrence integrity — §57).
//
// Collection: calendarEventExceptions
// Doc ID: {seriesEventId}__{originalOccurrenceStartIso} (deterministic,
//   so retry-safe and at most one exception per occurrence).

import { db } from './shared';
import { occurrenceId } from './recurrence';

const EXCEPTIONS = 'calendarEventExceptions';

export type ExceptionType = 'cancelled' | 'rescheduled';

export interface OccurrenceException {
  exception_id: string;
  series_event_id: string;
  original_start_time: string;  // The original occurrence start (identity key)
  exception_type: ExceptionType;
  new_start_time: string | null;  // For 'rescheduled'
  new_end_time: string | null;    // For 'rescheduled'
  reason: string | null;
  created_by_id: string;
  _created_date: string;
  _updated_date: string;
}

export function exceptionDocId(seriesEventId: string, originalStartIso: string): string {
  return occurrenceId(seriesEventId, originalStartIso);
}

/**
 * Create or update an exception for a single occurrence.
 * Idempotent: deterministic doc ID → retry overwrites the same doc.
 */
export async function setOccurrenceException(
  seriesEventId: string,
  originalStartIso: string,
  exceptionType: ExceptionType,
  actorId: string,
  newStartIso?: string | null,
  newEndIso?: string | null,
  reason?: string | null,
): Promise<string> {
  const docId = exceptionDocId(seriesEventId, originalStartIso);
  const nowIso = new Date().toISOString();
  const data: Record<string, any> = {
    exception_id: docId,
    series_event_id: seriesEventId,
    original_start_time: originalStartIso,
    exception_type: exceptionType,
    new_start_time: newStartIso || null,
    new_end_time: newEndIso || null,
    reason: reason || null,
    created_by_id: actorId,
    _created_date: nowIso,
    _updated_date: nowIso,
  };
  await db.collection(EXCEPTIONS).doc(docId).set(data, { merge: true });
  return docId;
}

/**
 * List all exceptions for a series event.
 */
export async function listExceptions(seriesEventId: string): Promise<OccurrenceException[]> {
  const snap = await db.collection(EXCEPTIONS)
    .where('series_event_id', '==', seriesEventId)
    .get();
  return snap.docs.map(d => d.data() as OccurrenceException);
}

/**
 * Apply exceptions to a list of expanded occurrences.
 * - 'cancelled' occurrences are removed.
 * - 'rescheduled' occurrences are replaced with the new time (keeping the
 *   same occurrenceId so the identity is stable).
 */
export function applyExceptions(
  occurrences: Array<{ occurrenceId: string; start: string; end: string }>,
  exceptions: OccurrenceException[],
): Array<{ occurrenceId: string; start: string; end: string }> {
  const exceptionMap = new Map(exceptions.map(e => [e.original_start_time, e]));
  const out: Array<{ occurrenceId: string; start: string; end: string }> = [];
  for (const occ of occurrences) {
    // Extract the original start from the occurrenceId (seriesId__originalStart)
    const idx = occ.occurrenceId.lastIndexOf('__');
    const originalStart = idx > 0 ? occ.occurrenceId.slice(idx + 2) : occ.start;
    const exc = exceptionMap.get(originalStart);
    if (!exc) {
      out.push(occ);
      continue;
    }
    if (exc.exception_type === 'cancelled') {
      continue; // skip
    }
    if (exc.exception_type === 'rescheduled' && exc.new_start_time && exc.new_end_time) {
      out.push({
        occurrenceId: occ.occurrenceId, // stable identity
        start: exc.new_start_time,
        end: exc.new_end_time,
      });
    }
  }
  return out;
}