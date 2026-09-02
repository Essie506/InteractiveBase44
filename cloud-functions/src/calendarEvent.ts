// Calendar Event — trusted server-side operations
// ───────────────────────────────────────────────────────────
// 1. saveCalendarEvent — authoritative write to calendarEvents
//    + maintains the calendarEventsPublic projection (public fields only).
//    Enforces the price/free invariant and resolves the host + location geo
//    for the projection. Computes derived availability from capacity and
//    the count of valid (confirmed/reserved) bookings for this event.
//
// The public projection NEVER contains meeting_url, attendee identities,
// or private booking records. Availability is a derived value.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, hasBusinessRole } from './shared';
import { isEventListable, normalisePricing } from './eventProjectionEligibility';
import { buildEventPublicProjection, EventHostInfo } from './calendarEventProjection';
import { fetchProfessionalPublicGeo, fetchBusinessPublicGeo } from './geo';
import { CAPACITY_CONSUMING_STATES, sumAttendeeQuantity } from './eventCapacity';

const EVENTS = 'calendarEvents';
const PUBLIC = 'calendarEventsPublic';
const IDEMPOTENCY = 'calendarEventIdempotency';

// Booking statuses that count toward reserved capacity are defined once in
// eventCapacity.ts (CAPACITY_CONSUMING_STATES) and shared by bookingPayment,
// bookingLifecycle, and stripeWebhook so the contract never drifts.

// ── Idempotency key ──────────────────────────────────────────
// Deterministic key scoped by the authoritative ownership context
// (owner_type + owner_id) + source_system + source_id — NOT caller
// identity, because Business-owned events use the Business ID as
// owner_id and caller authorisation is derived via Business membership.
// All concurrent retries of the same logical Add contend on the same
// Firestore document, so at most one authoritative event is created.
export function idempotencyDocId(
  ownerType: string,
  ownerId: string,
  sourceSystem: string,
  sourceId: string,
): string {
  return [ownerType || 'identity', ownerId || '', sourceSystem || 'manual', sourceId || '']
    .map((s) => String(s).replace(/\//g, '_'))
    .join('__');
}

// ── Host resolution ──────────────────────────────────────────
// Reads the public profile projection for the host (professional or
// business). Returns null if no public host profile exists.
async function resolveHost(
  ownerType: string,
  ownerId: string,
): Promise<EventHostInfo | null> {
  if (ownerType === 'professional') {
    // Find the professional's public projection by identity_id
    const snap = await db.collection('professionalProfilesPublic')
      .where('identity_id', '==', ownerId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0].data();
    return {
      type: 'professional',
      id: ownerId,
      display_name: d.display_name || null,
      screen_name: d.screen_name || null,
      business_id: null,
      avatar_url: d.avatar_url || null,
      verification_state: d.verification_state || 'not_verified',
    };
  }
  if (ownerType === 'business') {
    const snap = await db.collection('businessProfilesPublic').doc(ownerId).get();
    if (!snap.exists) return null;
    const d = snap.data()!;
    return {
      type: 'business',
      id: ownerId,
      display_name: d.name || null,
      screen_name: null,
      business_id: ownerId,
      avatar_url: d.logo_url || null,
      verification_state: d.verification_state || 'not_verified',
    };
  }
  return null;
}

// ── Reserved attendee count for an event ───────────────────
// Counts bookings with event_id === eventId in a reserved status.
// Attendee quantities are summed (each booking may carry attendee_quantity).
async function countReservedAttendees(eventId: string): Promise<number> {
  const snap = await db.collection('bookings')
    .where('event_id', '==', eventId)
    .where('booking_status', 'in', CAPACITY_CONSUMING_STATES)
    .get();
  return sumAttendeeQuantity(snap.docs);
}

// ── Location label resolution ───────────────────────────────
async function resolveLocationLabel(locationId: string | null | undefined): Promise<string | null> {
  if (!locationId) return null;
  try {
    const snap = await db.collection('locations').doc(locationId).get();
    if (!snap.exists) return null;
    return snap.data()!.public_label || snap.data()!.city || snap.data()!.label || null;
  } catch {
    return null;
  }
}

// ── saveCalendarEvent ───────────────────────────────────────
// Request: { data: { ...event fields, identity_id } }
// Returns: { id, ...data }
export const saveCalendarEvent = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const data = request.data || {};
    const eventId = data.id || data.event_id || null;
    const nowIso = new Date().toISOString();

    // ════════════════════════════════════════════════════════════
    // UPDATE PATH (existing event — includes Cancel)
    // ════════════════════════════════════════════════════════════
    // Authorise against the STORED record, not the request payload, so a
    // cancel-only payload (which omits owner_id/business_id) is still
    // authorised correctly and clients cannot forge owner_id to pass.
    if (eventId) {
      const existingSnap = await db.collection(EVENTS).doc(eventId).get();
      if (!existingSnap.exists) {
        throw new HttpsError('not-found', 'Calendar event not found');
      }
      const existing = existingSnap.data()!;

      // ── Ownership / permission checks (against stored record) ──
      const isOwner = existing.owner_id === callerIdentityId;
      let isBizAdmin = false;
      if (existing.business_id) {
        isBizAdmin = await hasBusinessRole(existing.business_id, callerIdentityId, ['owner', 'admin']);
      }
      if (!isOwner && !isBizAdmin) {
        throw new HttpsError('permission-denied', 'Not authorised to update this event');
      }

      // ── Booking-authority guard ──
      // Booking-owned events (source_system === 'booking') must be
      // cancelled through the Booking cancellation flow (cancelBooking),
      // which evaluates refund policy and releases the slot hold. The
      // generic Calendar Cancel must not bypass Booking authority.
      if (existing.source_system === 'booking' && 'lifecycle_state' in data) {
        throw new HttpsError(
          'failed-precondition',
          'Booking-owned events must be cancelled through the Booking cancellation flow',
        );
      }

      // ── Partial update — only fields the client provided ──
      // A cancel sends only { lifecycle_state: 'cancelled' }; it must
      // not clobber existing price/fields. Pricing is normalised only
      // when price fields are present in the request.
      const updatePayload: Record<string, any> = {};
      for (const k of Object.keys(data)) {
        if (k === 'id' || k === 'event_id') continue;
        updatePayload[k] = data[k];
      }
      if ('price_pence' in updatePayload || 'is_free' in updatePayload) {
        const pricing = normalisePricing(updatePayload.price_pence, updatePayload.is_free);
        updatePayload.price_pence = pricing.price_pence;
        updatePayload.is_free = pricing.is_free;
      }
      if ('currency' in updatePayload && !updatePayload.currency) {
        updatePayload.currency = 'GBP';
      }
      updatePayload._updated_date = nowIso;

      // Preserve the authoritative record — merge, never replace/delete.
      await db.collection(EVENTS).doc(eventId).set(updatePayload, { merge: true });

      // Projection maintenance uses the merged record so eligibility/geo
      // see the full event state. A cancel makes the event non-listable,
      // so maintainProjection deletes any calendarEventsPublic projection.
      const mergedData = { ...existing, ...updatePayload };
      await maintainProjection(eventId, mergedData);
      return { id: eventId, ...mergedData };
    }

    // ════════════════════════════════════════════════════════════
    // CREATE PATH (new event)
    // ════════════════════════════════════════════════════════════
    // Authorise against the request (the client is creating the event).
    const isOwner = data.owner_id === callerIdentityId;
    let isBizAdmin = false;
    if (data.business_id) {
      isBizAdmin = await hasBusinessRole(data.business_id, callerIdentityId, ['owner', 'admin']);
    }
    if (!isOwner && !isBizAdmin) {
      throw new HttpsError('permission-denied', 'Not authorised to save this event');
    }

    // ── Enforce price/free invariant ──
    const pricing = normalisePricing(data.price_pence, data.is_free);
    const eventData = {
      ...data,
      price_pence: pricing.price_pence,
      is_free: pricing.is_free,
      currency: data.currency || 'GBP',
    };

    // Create path — deterministic transaction-safe idempotency.
    // Two concurrent retries of the same logical Add (same
    // owner_type + owner_id + source_system + source_id) contend on
    // the same idempotency document, so exactly one authoritative
    // event is created and both requests resolve to the same Event ID.
    const sourceSystem = eventData.source_system || 'manual';
    const sourceId = eventData.source_id || null;
    if (!sourceId) {
      throw new HttpsError(
        'invalid-argument',
        'source_id is required to create an event (idempotency key)',
      );
    }
    const idempKey = idempotencyDocId(
      eventData.owner_type || 'identity',
      eventData.owner_id || '',
      sourceSystem,
      sourceId,
    );
    const idempRef = db.collection(IDEMPOTENCY).doc(idempKey);

    let existingEventId: string | null = null;
    let eventDocId = '';
    await db.runTransaction(async (tx) => {
      const idempSnap = await tx.get(idempRef);
      if (idempSnap.exists && idempSnap.data()?.event_id) {
        // A concurrent retry already created the authoritative event.
        existingEventId = idempSnap.data()!.event_id as string;
        return;
      }
      // Allocate exactly one authoritative event doc and record the
      // mapping atomically so a concurrent transaction sees it.
      const eventRef = db.collection(EVENTS).doc();
      eventDocId = eventRef.id;
      tx.set(eventRef, { ...eventData, _created_date: nowIso, _updated_date: nowIso });
      tx.set(idempRef, {
        event_id: eventRef.id,
        owner_type: eventData.owner_type || 'identity',
        owner_id: eventData.owner_id || '',
        source_system: sourceSystem,
        source_id: sourceId,
        _created_date: nowIso,
        _updated_date: nowIso,
      });
    });

    if (existingEventId) {
      // Resolve to the already-created authoritative event.
      eventDocId = existingEventId;
    }

    // ── Maintain the public projection ──
    // Runs after the transaction commits. Projection maintenance does
    // async host/geo/capacity reads and a derived write, so it cannot
    // run inside the idempotency transaction. This matches the existing
    // post-write projection pattern.
    await maintainProjection(eventDocId, eventData);

    return { id: eventDocId, ...eventData };
  },
);

// ── Projection maintenance ──────────────────────────────────
// Exported so the backfill can reuse the exact same logic.
export async function maintainProjection(eventId: string, data: any): Promise<void> {
  // Resolve host public profile
  const host = await resolveHost(data.owner_type, data.owner_id);

  // Check full listability (event + host)
  const listable = isEventListable(data, host || null);

  if (!listable) {
    // Delete any stale projection for this event
    await db.collection(PUBLIC).doc(eventId).delete().catch(() => {});
    return;
  }

  // Resolve location geo + label
  let locationGeo = null;
  if (data.owner_type === 'professional') {
    locationGeo = await fetchProfessionalPublicGeo(db, null, data.location_id);
  } else if (data.owner_type === 'business') {
    locationGeo = await fetchBusinessPublicGeo(db, data.location_id);
  }
  const locationLabel = await resolveLocationLabel(data.location_id);

  // Compute derived availability
  const reservedCount = await countReservedAttendees(eventId);

  const projection = buildEventPublicProjection(
    eventId, data, host, locationGeo, locationLabel, reservedCount,
  );
  await db.collection(PUBLIC).doc(eventId).set(projection);
}

// ── Refresh projection by event ID ──────────────────────────
// Reads the authoritative event doc and re-runs maintainProjection.
// Used by booking lifecycle functions (cancel/no-show/confirm/payment)
// that change capacity but don't have the full event data in hand.
export async function refreshEventProjection(eventId: string): Promise<void> {
  const ev = await db.collection(EVENTS).doc(eventId).get();
  if (!ev.exists) {
    await db.collection(PUBLIC).doc(eventId).delete().catch(() => {});
    return;
  }
  await maintainProjection(eventId, ev.data()!);
}