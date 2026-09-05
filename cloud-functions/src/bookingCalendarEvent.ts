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
import { emitCalendarSignal } from './calendarSignal';

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

  // §99: bump the provider's realtime signal so the new booking event appears
  // on their Calendar without a manual refresh. (Business bookings are
  // private + assigned only to the provider, so no other member sees them.)
  if (created) {
    await emitCalendarSignal([booking.provider_identity_id]);
  }
  return { calendar_event_id: calendarEventId, created };
}

// ── §118: Hold/availability semantic events ──────────────────
// When a slot hold is placed, a 'held' lifecycle Calendar Event is created
// so the tentative booking appears on the provider's Calendar and blocks
// the time (hasOverlappingEvent includes 'held' in ACTIVE_LIFECYCLE). On
// confirmation the booking event (source_id = bookingId) supersedes it; on
// release/expiry the hold event is cancelled. History is preserved.
//
// Idempotent via calendarEventIdempotency (source_system 'booking',
// source_id `hold:${holdId}`). Owner is the provider identity (or business
// for business holds). operating_context professional/business.

export async function createHoldCalendarEvent(
  holdId: string,
  hold: Record<string, any>,
  nowIso: string,
): Promise<{ calendar_event_id: string; created: boolean }> {
  const isBusinessHold = !!hold.business_id;
  const ownerType = isBusinessHold ? 'business' : 'identity';
  const ownerId = isBusinessHold ? hold.business_id : hold.provider_identity_id;
  const sourceSystem = 'booking';
  const sourceId = `hold:${holdId}`;
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
      operating_context: isBusinessHold ? 'business' : 'professional',
      title: 'Held slot',
      description: `Hold ${holdId}`,
      start_time: hold.start_time,
      end_time: hold.end_time,
      timezone: hold.timezone || 'UTC',
      all_day: false,
      location_type: 'physical',
      visibility: 'private',
      lifecycle_state: 'held',
      source_system: sourceSystem,
      source_id: sourceId,
      business_id: hold.business_id || null,
      created_by_id: hold.created_by_identity_id || hold.provider_identity_id,
      assigned_identity_ids: isBusinessHold ? [hold.provider_identity_id] : [],
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
  if (created) {
    await appendScheduleHistory({
      event_id: calendarEventId,
      change_type: 'created',
      previous_start_time: null,
      previous_end_time: null,
      new_start_time: hold.start_time,
      new_end_time: hold.end_time,
      changed_at: nowIso,
      actor_id: hold.created_by_identity_id || hold.provider_identity_id,
      source_system: sourceSystem,
    });
  }
  // §99: bump the provider's signal so the held slot appears immediately.
  if (created) {
    await emitCalendarSignal([hold.provider_identity_id]);
  }
  return { calendar_event_id: calendarEventId, created };
}

// Release a hold's calendar event (cancel it). Called on hold release/expiry
// or when the booking is confirmed (the booking event supersedes the hold).
// Idempotent — a missing or already-cancelled event is a no-op.
export async function releaseHoldCalendarEvent(holdId: string, nowIso: string): Promise<void> {
  const snap = await db.collection(EVENTS).where('source_id', '==', `hold:${holdId}`).limit(1).get();
  if (snap.empty) return;
  const doc = snap.docs[0];
  const ev = doc.data();
  if (ev.lifecycle_state === 'cancelled' || ev.lifecycle_state === 'removed') return;
  await doc.ref.set({ lifecycle_state: 'cancelled', _updated_date: nowIso }, { merge: true });
  await appendScheduleHistory({
    event_id: doc.id,
    change_type: 'cancelled',
    previous_start_time: ev.start_time,
    previous_end_time: ev.end_time,
    new_start_time: null,
    new_end_time: null,
    changed_at: nowIso,
    actor_id: ev.created_by_id,
    source_system: ev.source_system || 'booking',
  });
  // §99: bump the provider's signal so the released/cancelled hold disappears.
  await emitCalendarSignal([ev.created_by_id, ...(ev.assigned_identity_ids || [])]);
}