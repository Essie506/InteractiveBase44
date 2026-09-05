// Identity deactivation handling (§108).
// ───────────────────────────────────────────────────────────
// When an identity deactivates their Interactive account, their Calendar
// events must be handled safely: history is preserved (§108), but upcoming
// events are cancelled so they no longer block time or mislead invitees,
// and public projections are removed so the events are no longer discoverable.
//
// This is a server-only operation (Admin SDK bypasses Firestore rules).
// The identity's past/historical events are retained for audit; future
// active events are transitioned to 'cancelled' (not deleted — history is
// preserved per §108). Public projections (calendarEventsPublic) for the
// identity's events are deleted.
//
// Booking-owned events are NOT cancelled here — the Booking system owns
// their lifecycle and must apply its own deactivation policy (refunds,
// notifications). This function only cancels manual/identity-owned events.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, isAdmin } from './shared';
import { appendScheduleHistory } from './calendarEventHistory';

const EVENTS = 'calendarEvents';
const PUBLIC = 'calendarEventsPublic';

// Future-active lifecycle states that should be cancelled on deactivation.
const FUTURE_ACTIVE_STATES = ['held', 'scheduled', 'upcoming', 'in_progress'];

export const deactivateIdentityCalendar = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const nowIso = new Date().toISOString();

    // Only the identity themselves or an admin may deactivate their calendar.
    const { target_identity_id } = request.data || {};
    const targetId = target_identity_id || callerIdentityId;
    const isSelf = targetId === callerIdentityId;
    const isPlatformAdmin = await isAdmin(callerIdentityId);
    if (!isSelf && !isPlatformAdmin) {
      throw new HttpsError('permission-denied', 'Not authorised to deactivate this identity\u2019s calendar');
    }

    // Identity-owned events (manual + messaging). Booking-owned events are
    // left to the Booking system's own deactivation policy.
    const snap = await db.collection(EVENTS)
      .where('owner_type', '==', 'identity')
      .where('owner_id', '==', targetId)
      .get();

    let cancelled = 0;
    const batch = db.batch();
    for (const doc of snap.docs) {
      const ev = doc.data();
      // Skip already-terminal events (history preserved as-is).
      if (['cancelled', 'removed', 'historical', 'archived', 'superseded'].includes(ev.lifecycle_state)) continue;
      // Only cancel future-active events; past events become historical naturally.
      if (!FUTURE_ACTIVE_STATES.includes(ev.lifecycle_state)) continue;
      // Booking-owned events are managed by the Booking system.
      if (ev.source_system === 'booking') continue;

      batch.set(doc.ref, { lifecycle_state: 'cancelled', _updated_date: nowIso }, { merge: true });
      // Remove the public projection so the event is no longer discoverable.
      batch.delete(db.collection(PUBLIC).doc(doc.id));
      cancelled++;
      // Append schedule history (audit — §108 history preservation).
      await appendScheduleHistory({
        event_id: doc.id,
        change_type: 'cancelled',
        previous_start_time: ev.start_time,
        previous_end_time: ev.end_time,
        new_start_time: null,
        new_end_time: null,
        changed_at: nowIso,
        actor_id: callerIdentityId,
        source_system: ev.source_system || 'manual',
      }).catch(() => {});
    }
    if (cancelled > 0) await batch.commit();
    return { identity_id: targetId, cancelled_count: cancelled };
  },
);