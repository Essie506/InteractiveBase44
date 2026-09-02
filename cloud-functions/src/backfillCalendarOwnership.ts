// One-time admin-only backfill — Calendar Event ownership correction.
// ───────────────────────────────────────────────────────────
// Converts legacy CalendarEvent ownership to the corrected model:
//   owner_type 'professional' + identity owner_id
//     → owner_type 'identity', operating_context 'professional'
//   owner_type 'business' but owner_id is an identity (not a businessId)
//     → owner_id becomes the authoritative business_id (derived from
//       business_id field or the linked booking), and the former
//       provider/admin identity is preserved in assigned_identity_ids
//       (view) and created_by_id where reliably derivable.
//
// Properties:
//   - preserves event IDs (in-place update, no new docs)
//   - preserves created_by_id / source_id / idempotency / price / capacity /
//     visibility / meeting data / timestamps
//   - never duplicates or deletes authoritative events
//   - repairs the public projection after conversion
//   - idempotent: re-running is a no-op on already-correct records
//
// This function is IMPLEMENTED but NOT invoked. It must be run via an
// admin callable before the corrected rules/code go live in production.
// See the deployment/migration order in the architecture report.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, requireAdmin } from './shared';
import { maintainProjection } from './calendarEvent';

const EVENTS = 'calendarEvents';
const BOOKINGS = 'bookings';
const BUSINESSES = 'businesses';

// True when owner_id looks like a businessId (exists in businesses) rather
// than an identity. Used to detect the legacy "business owner_type but
// identity owner_id" inconsistency.
async function isBusinessDoc(id: string): Promise<boolean> {
  if (!id) return false;
  const snap = await db.collection(BUSINESSES).doc(id).get();
  return snap.exists;
}

export const backfillCalendarOwnership = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    await requireAdmin(request.auth.uid);

    const stats = {
      scanned: 0,
      professionalToIdentity: 0,
      businessOwnerFixed: 0,
      bookingEventsFixed: 0,
      projectionsRepaired: 0,
      skipped: 0,
    };

    // Process in batches to bound memory. Re-query until exhausted.
    let lastDoc: any = null;
    let hasMore = true;
    while (hasMore) {
      let q = db.collection(EVENTS).orderBy('__name__').limit(250);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      if (snap.empty) break;
      lastDoc = snap.docs[snap.docs.length - 1];
      hasMore = snap.size === 250;

      for (const doc of snap.docs) {
        stats.scanned++;
        const data = doc.data()!;
        const update: Record<string, any> = {};
        const id = doc.id;

        // Case 1: legacy professional ownership by an identity.
        if (data.owner_type === 'professional') {
          update.owner_type = 'identity';
          if (!data.operating_context || data.operating_context === 'personal') {
            update.operating_context = 'professional';
          }
          stats.professionalToIdentity++;
        }

        // Case 2: business owner_type but owner_id is actually an identity.
        // Derive the real businessId from business_id field or the linked
        // booking, set owner_id = businessId, and preserve the former
        // owner_id identity as an assigned viewer (not owner/creator).
        if (data.owner_type === 'business') {
          const looksLikeBusiness = await isBusinessDoc(data.owner_id);
          if (!looksLikeBusiness) {
            let realBusinessId = data.business_id || null;
            if (!realBusinessId && data.source_system === 'booking' && data.source_id) {
              const b = await db.collection(BOOKINGS).doc(data.source_id).get();
              if (b.exists) realBusinessId = b.data()!.business_id || null;
            }
            if (realBusinessId && realBusinessId !== data.owner_id) {
              const formerIdentity = data.owner_id;
              update.owner_id = realBusinessId;
              update.business_id = realBusinessId;
              // Preserve the former provider/admin identity as an assigned
              // viewer so the event still appears on their Calendar.
              const existingAssigned = Array.isArray(data.assigned_identity_ids)
                ? data.assigned_identity_ids : [];
              if (!existingAssigned.includes(formerIdentity)) {
                update.assigned_identity_ids = [...existingAssigned, formerIdentity];
              }
              // Preserve creator if not already set.
              if (!data.created_by_id) update.created_by_id = formerIdentity;
              stats.businessOwnerFixed++;
            } else {
              // Cannot reliably derive businessId — leave as-is, flag skipped.
              stats.skipped++;
            }
          }
        }

        // Booking-created professional events: ensure operating_context.
        if (
          data.source_system === 'booking' &&
          data.owner_type === 'identity' &&
          (!data.operating_context || data.operating_context === 'personal')
        ) {
          update.operating_context = 'professional';
          stats.bookingEventsFixed++;
        }

        if (Object.keys(update).length === 0) continue;

        update._updated_date = new Date().toISOString();
        await db.collection(EVENTS).doc(id).set(update, { merge: true });

        // Re-read merged data and repair the public projection.
        const merged = (await db.collection(EVENTS).doc(id).get()).data()!;
        await maintainProjection(id, merged);
        stats.projectionsRepaired++;
      }
    }

    return { status: 'complete', stats };
  },
);