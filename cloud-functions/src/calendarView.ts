// Calendar View — server-side authoritative read aggregator (§65, §70–§74, §99).
// ───────────────────────────────────────────────────────────
// WHY THIS EXISTS:
// Firestore security rules resolve the caller's Interactive identity via
// get(identityMappings/uid) and check resource.data fields against it
// (isOwner, assigned_identity_ids array-contains, etc.). Firestore's
// query validator CANNOT evaluate get()/exists()-derived values for
// list/query requests, so direct client queries on calendarEvents
// (owner / array-contains assigned / array-contains invited) and
// calendarParticipation fail with "Missing or insufficient permissions" —
// a permission denial, NOT a missing composite index.
//
// This callable is the authoritative read path for the Calendar view. It
// runs under the Admin SDK (bypassing client rules) and enforces the SAME
// authorization the rules express — it only returns events the caller is
// authorised to see (owner, creator, business member, assigned, invited)
// and only the caller's own participation records. Security is preserved;
// the rules remain the boundary for any direct client access (which is
// denied for these query shapes).
//
// Real-time (§99) is presentation-only. Because onSnapshot queries cannot
// be rule-validated for the same reason, the client uses this callable +
// periodic refresh + mutation-triggered reload instead of direct
// onSnapshot subscriptions.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, getBusinessMembership } from './shared';

const EVENTS = 'calendarEvents';
const PARTICIPATION = 'calendarParticipation';

interface CalendarViewResult {
  events: any[];
  participation: any[];
}

export const getCalendarView = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request): Promise<CalendarViewResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const data = request.data || {};
    const startIso = data.start_time ? new Date(data.start_time).toISOString() : null;
    const endIso = data.end_time ? new Date(data.end_time).toISOString() : null;
    const businessId = data.business_id || null;

    const startMs = startIso ? new Date(startIso).getTime() : 0;
    const endMs = endIso ? new Date(endIso).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000;

    const byId = new Map<string, any>();

    // ── Owner events (identity-owned) ──
    // owner_id == callerIdentityId, owner_type == 'identity'. Personal and
    // Professional are operating contexts of ONE identity — both render the
    // same identity-owned set.
    const ownerSnap = await db.collection(EVENTS)
      .where('owner_id', '==', callerIdentityId)
      .where('owner_type', '==', 'identity')
      .get();
    for (const d of ownerSnap.docs) byId.set(d.id, { id: d.id, ...d.data() });

    // ── Assigned events (Business staff assignment — view/participation only) ──
    const assignedSnap = await db.collection(EVENTS)
      .where('assigned_identity_ids', 'array-contains', callerIdentityId)
      .get();
    for (const d of assignedSnap.docs) {
      if (!byId.has(d.id)) byId.set(d.id, { id: d.id, ...d.data() });
    }

    // ── Invited events (via email resolution — view/participation only) ──
    const invitedSnap = await db.collection(EVENTS)
      .where('invited_identity_ids', 'array-contains', callerIdentityId)
      .get();
    for (const d of invitedSnap.docs) {
      if (!byId.has(d.id)) byId.set(d.id, { id: d.id, ...d.data() });
    }

    // ── Business-owned events (active business context) ──
    // Only when the caller is an active member of the business. Business-owned
    // events remain owned by businessId (a separate organisational owner).
    if (businessId) {
      const membership = await getBusinessMembership(businessId, callerIdentityId);
      if (membership && membership.lifecycle_state === 'active') {
        const bizSnap = await db.collection(EVENTS)
          .where('owner_id', '==', businessId)
          .where('owner_type', '==', 'business')
          .get();
        for (const d of bizSnap.docs) {
          if (!byId.has(d.id)) byId.set(d.id, { id: d.id, ...d.data() });
        }
      }
    }

    // ── Filter lifecycle + visible range ──
    const events = Array.from(byId.values())
      .filter((e: any) => e.lifecycle_state !== 'cancelled' && e.lifecycle_state !== 'removed')
      .filter((e: any) => {
        const eventStart = new Date(e.start_time).getTime();
        return eventStart >= startMs && eventStart <= endMs;
      })
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    // ── Participation records (caller's own only) ──
    const partSnap = await db.collection(PARTICIPATION)
      .where('identity_id', '==', callerIdentityId)
      .get();
    const participation = partSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return { events, participation };
  },
);