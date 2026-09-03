// Shared booking→Calendar event creation — the canonical writer for
// booking-owned Calendar Events (§4, §10, §42, §119).
// ───────────────────────────────────────────────────────────
// Used by both confirmFreeBooking (bookingPayment.ts) and
// handlePaymentSuccess (stripeWebhook.ts) so the two paid/free paths
// are consistent: correct owner_type ('identity'|'business', NEVER
// 'professional'), idempotent creation via calendarEventIdempotency,
// and append-only schedule history.
//
// 'professional' is NOT an owner type — Professional is an
// operating_context. A professional (non-business) booking creates an
// identity-owned event with operating_context 'professional'.

import { db } from './shared';
import { idempotencyDocId } from './calendarEvent';
import { appendScheduleHistory } from './calendarEventHistory';

const EVENTS = 'calendarEvents';
const IDEMPOTENCY = 'calendarEventIdempotency';

/**
 * Create the Calendar Event for a booking (idempotent). Returns the
 * calendar_event_id and whether the event was newly created (so the
 * caller can decide whether to emit a "created" schedule-history entry).
 *
 * Idempotency: the calendarEventIdempotency key
 * (ownerType__ownerId__booking__bookingId) guarantees one event per
 * booking even under concurrent webhook redelivery.
 */
export async function createBookingCalendarEvent(
  bookingId: string,
  booking: Record<string, any>,
  nowIso: string,
): Promise<{ calendar_event_id: string; created: boolean }> {
  const isBusinessBooking = !!booking.business_id;
  const ownerType = isBusinessBooking ? 'business' : 'identity';
  const ownerId = isBusinessBooking ? booking.business_id : booking.provider_identity_id;
  const sourceSystem = 'booking';
  const sourceId = bookingId;

  const idempKey = idempotencyDocId(ownerType, ownerId, sourceSystem, sourceId);
  const idempRef = db.collection(IDEMPOTENCY).doc(idempKey);

  let existingEventId: string | null = null;
  let eventDocId = '';
  await db.runTransaction(async (tx) => {
    const idempSnap = await tx.get(idempRef);
    if (idempSnap.exists && idempSnap.data()?.event_id) {
      existingEventId = idempSnap.data()!.event_id as string;
      return;
    }
    const eventRef = db.collection(EVENTS).doc();
    eventDocId = eventRef.id;
    tx.set(eventRef, {
      owner_id: ownerId,
      owner_type: ownerType,
      operating_context: isBusinessBooking ? 'business' : 'professional',
      title: `Booking: ${booking.booking_type || 'session'}`,
      description: `Booking ${bookingId}`,
      start_time: booking.start_time,
      end_time: booking.end_time,
      timezone: booking.timezone || 'UTC',
      all_day: false,
      location_type: booking.location_context || 'physical',
      meeting_url: booking.meeting_url || null,
      visibility: 'private',
      lifecycle_state: 'scheduled',
      source_system: sourceSystem,
      source_id: sourceId,
      business_id: booking.business_id || null,
      created_by_id: booking.provider_identity_id,
      assigned_identity_ids: isBusinessBooking ? [booking.provider_identity_id] : [],
      invited_identity_ids: [],
      invited_guest_emails: [],
      _created_date: nowIso,
      _updated_date: nowIso,
    });
    tx.set(idempRef, {
      event_id: eventRef.id,
      owner_type: ownerType,
      owner_id: ownerId,
      source_system: sourceSystem,
      source_id: sourceId,
      _created_date: nowIso,
      _updated_date: nowIso,
    });
  });

  const calendarEventId = existingEventId || eventDocId;
  const created = !existingEventId;

  // Record schedule history only on first creation (§48, §104).
  if (created) {
    await appendScheduleHistory({
      event_id: calendarEventId,
      change_type: 'created',
      previous_start_time: null,
      previous_end_time: null,
      new_start_time: booking.start_time,
      new_end_time: booking.end_time,
      changed_at: nowIso,
      actor_id: booking.provider_identity_id,
      source_system: sourceSystem,
    });
  }

  return { calendar_event_id: calendarEventId, created };
}