// Occurrence Exception — trusted Cloud Function (§55–§57).
// ───────────────────────────────────────────────────────────
// Creates or updates an exception for a single occurrence of a recurring
// series. The exception is stored in calendarEventExceptions with a
// deterministic doc ID (seriesId__originalStart) so retries are idempotent.
//
// Exception types:
//   'cancelled'   — the occurrence is skipped (does not appear, does not block)
//   'rescheduled'  — the occurrence is moved to a new start/end time
//
// Past exceptions are never rewritten (historical recurrence integrity — §57).
// This function does NOT handle 'this and future' series splitting (§57) —
// that is a separate operation that creates a new series with effective_until
// on the old one.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, hasBusinessCalendarPermission } from './shared';
import { setOccurrenceException, ExceptionType } from './calendarEventExceptions';
import { appendScheduleHistory } from './calendarEventHistory';
import { emitCalendarSignalForEvent } from './calendarSignal';

// ── saveOccurrenceException ─────────────────────────────────
// Request: {
//   series_event_id, original_start_time, exception_type,
//   new_start_time?, new_end_time?, reason?
// }
// Returns: { exception_id }
export const saveOccurrenceException = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const {
      series_event_id, original_start_time, exception_type,
      new_start_time, new_end_time, reason,
    } = request.data || {};

    if (!series_event_id || !original_start_time || !exception_type) {
      throw new HttpsError('invalid-argument', 'series_event_id, original_start_time, exception_type required');
    }
    if (!['cancelled', 'rescheduled'].includes(exception_type)) {
      throw new HttpsError('invalid-argument', `Invalid exception_type: ${exception_type}`);
    }
    if (exception_type === 'rescheduled' && (!new_start_time || !new_end_time)) {
      throw new HttpsError('invalid-argument', 'new_start_time and new_end_time required for reschedule');
    }

    // Validate series event exists and caller has permission
    const eventDoc = await db.collection('calendarEvents').doc(series_event_id).get();
    if (!eventDoc.exists) throw new HttpsError('not-found', 'Series event not found');
    const event = eventDoc.data()!;

    const isCreator = event.created_by_id === callerIdentityId;
    const isOwner = event.owner_type === 'identity' && event.owner_id === callerIdentityId;
    let isBizManager = false;
    if (event.owner_type === 'business' && event.business_id) {
      isBizManager = await hasBusinessCalendarPermission(event.business_id, callerIdentityId);
    }
    if (!isCreator && !isOwner && !isBizManager) {
      throw new HttpsError('permission-denied', 'Not authorised to modify this series');
    }

    // Validate the event is recurring
    if (!event.recurrence_rule) {
      throw new HttpsError('failed-precondition', 'Event is not recurring');
    }

    // Create/update the exception (idempotent — deterministic doc ID)
    const docId = await setOccurrenceException(
      series_event_id,
      original_start_time,
      exception_type as ExceptionType,
      callerIdentityId,
      exception_type === 'rescheduled' ? new_start_time : null,
      exception_type === 'rescheduled' ? new_end_time : null,
      reason || null,
    );

    // Record schedule history (§48, §104)
    const nowIso = new Date().toISOString();
    await appendScheduleHistory({
      event_id: series_event_id,
      change_type: exception_type === 'cancelled' ? 'cancelled' : 'rescheduled',
      previous_start_time: original_start_time,
      previous_end_time: null,
      new_start_time: exception_type === 'rescheduled' ? new_start_time : null,
      new_end_time: exception_type === 'rescheduled' ? new_end_time : null,
      changed_at: nowIso,
      actor_id: callerIdentityId,
      source_system: 'manual',
    });

    // §99: bump realtime signals for all identities affected by the series so
    // the rescheduled/cancelled occurrence propagates to every viewer.
    await emitCalendarSignalForEvent(event);
    return { exception_id: docId };
  },
);