// §49 Drag-and-drop reschedule helper.
// ───────────────────────────────────────────────────────────
// Reschedules a calendar occurrence to a new start time, preserving
// duration. Routes through the canonical server-side writers so the
// existing authority, conflict (§39), booking/source ownership (§45),
// timezone, recurrence and security rules are preserved exactly:
//
//   - Authority: canEditEvent is the UI gate; the server-side
//     saveCalendarEvent re-checks creator/owner/business-manager.
//   - Booking-owned events are NOT draggable (source_system === 'booking'
//     is rejected before any write — they must be cancelled/rescheduled
//     via the Booking flow).
//   - Conflict: the canonical saveCalendarEvent transaction + sentinel
//     enforces §39 for professional/business manual events. A
//     'failed-precondition' rejection surfaces as a conflict error the
//     UI classifies (no divergent client-side conflict engine).
//   - Recurrence: dragging a single occurrence of a recurring series
//     creates a rescheduled EXCEPTION via saveOccurrenceException (not a
//     series-wide edit), preserving recurrence integrity (§55–§57).
//   - Timezone: the new start is computed in the viewer's timezone then
//     converted to UTC ISO, exactly like the edit modal.
//
// This helper performs NO direct Firestore writes — it only calls the
// existing canonical writers in src/lib/calendar.js.

import { canEditEvent } from '@/lib/calendarAuthority';
import { updateEvent, saveOccurrenceException, getLocalTimezone } from '@/lib/calendar';

/**
 * Classify a save error as a §39 conflict rejection (mirrors EventModal).
 * @param {Error} err
 * @returns {boolean}
 */
export function isConflictError(err) {
  const code = err?.code || '';
  const msg = (err?.message || '').toLowerCase();
  return code.includes('failed-precondition') || msg.includes('conflict');
}

/**
 * Reschedule an occurrence to a new start time (ISO, viewer-tz-aware).
 *
 * @param {object} occ — normalized occurrence ({ event, start, end, isRecurring })
 * @param {string} newStartIso — new start time as an ISO string (UTC)
 * @param {object} user — current authenticated user
 * @returns {Promise<object>} the saved event/exception result
 * @throws {Error} if not authorised, booking-owned, or conflict rejected
 */
export async function rescheduleOccurrence(occ, newStartIso, user) {
  const event = occ?.event || occ;
  if (!event) throw new Error('No event to reschedule');

  // ── Authority gate (UI) ── server re-checks authoritatively.
  if (!canEditEvent(event, user)) {
    throw new Error('You are not authorised to reschedule this event');
  }

  // ── Booking-owned events are not draggable (§45) ──
  if (event.source_system === 'booking') {
    throw new Error('Booking-owned events must be rescheduled through the Booking flow');
  }

  // ── Source-unavailable events are not mutable ──
  if (event.lifecycle_state === 'cancelled' || event.lifecycle_state === 'removed') {
    throw new Error('This event is no longer active');
  }

  // ── Preserve duration ──
  const oldStartMs = new Date(occ.start).getTime();
  const oldEndMs = new Date(occ.end).getTime();
  const durationMs = Math.max(60_000, oldEndMs - oldStartMs);
  const newStartMs = new Date(newStartIso).getTime();
  const newEndIso = new Date(newStartMs + durationMs).toISOString();

  // ── Recurring single occurrence → exception (§55–§57) ──
  if (occ.isRecurring && event.recurrence_rule) {
    return saveOccurrenceException({
      series_event_id: event.id,
      original_start_time: occ.start,
      exception_type: 'rescheduled',
      new_start_time: newStartIso,
      new_end_time: newEndIso,
    });
  }

  // ── Non-recurring → canonical update (preserves all fields) ──
  // Only start_time/end_time change; the server merges the rest.
  return updateEvent(event.id, {
    start_time: newStartIso,
    end_time: newEndIso,
    timezone: event.timezone || getLocalTimezone(),
  });
}