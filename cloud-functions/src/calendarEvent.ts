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

// Booking statuses that count toward reserved capacity are defined once in
// eventCapacity.ts (CAPACITY_CONSUMING_STATES) and shared by bookingPayment,
// bookingLifecycle, and stripeWebhook so the contract never drifts.

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

    // ── Authorisation ──
    // The caller must own the event (owner_id) or be a business admin
    // (if the event belongs to a business).
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

    // ── Write the authoritative calendarEvents doc ──
    let eventDocId: string;
    if (eventId) {
      await db.collection(EVENTS).doc(eventId).set(eventData, { merge: true });
      eventDocId = eventId;
    } else {
      const ref = db.collection(EVENTS).doc();
      await ref.set(eventData);
      eventDocId = ref.id;
    }

    // ── Maintain the public projection ──
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