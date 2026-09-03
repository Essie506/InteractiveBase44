// Lifecycle state migration — Calendar V2 §14–§17 conformance.
// ───────────────────────────────────────────────────────────
// Migrates persisted CalendarEvent.lifecycle_state values from the
// legacy enum (scheduled, confirmed, tentative, cancelled, completed)
// to the V2 Calendar schedule-state terminology.
//
// V2 §15 Calendar states: pending, held, scheduled, upcoming,
//   in_progress, historical, cancelled, removed, superseded.
// V2 §16 Personal-only states: completed, skipped, rescheduled, archived.
//
// Calendar schedule state is SEPARATE from source-system state (§14).
// Booking 'confirmed' is a Booking state, NOT a Calendar state. The
// Calendar state for a confirmed booking's event is 'scheduled'.
//
// Migration mapping (deterministic — uses source_system + owner_type
// to resolve ambiguous legacy values):
//
//   scheduled  → scheduled   (direct V2 match)
//   cancelled  → cancelled   (direct V2 match)
//   confirmed  → scheduled   (§14/§17: Booking term → Calendar 'scheduled')
//   tentative  → pending     (not a V2 state → 'pending', not yet committed)
//   completed  → completed   (§16 Personal-only, IF source_system 'manual'
//                              AND owner_type 'identity')
//   completed  → historical   (§15 Calendar state, for source-owned or
//                              business events — the scheduled period passed)
//
// Admin-only callable. Runs once before production cutover. Idempotent:
// events already on V2 values are skipped.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, isAdmin } from './shared';
import { refreshEventProjection } from './calendarEvent';

const EVENTS = 'calendarEvents';

// V2 lifecycle states that are unambiguous (never legacy values).
// 'completed' is intentionally EXCLUDED — it is both a legacy value AND
// a V2 §16 Personal-only state, so it requires source/context resolution.
const UNAMBIGUOUS_V2_STATES = new Set([
  'pending', 'held', 'scheduled', 'upcoming', 'in_progress',
  'historical', 'cancelled', 'removed', 'superseded',
  'skipped', 'rescheduled', 'archived',
]);

/**
 * Pure migration mapping — exported for testing.
 * Returns the V2 lifecycle_state for a legacy value, or null if no
 * migration is needed (already V2 or unknown value).
 *
 * Uses source_system + owner_type to resolve ambiguous legacy values:
 *   - 'completed' is BOTH a legacy value AND a V2 §16 Personal-only state.
 *     For source_system 'manual' + owner_type 'identity' it is V2-valid
 *     (no migration). For source-owned or business events it is legacy
 *     and maps to 'historical' (§15).
 *   - 'confirmed' is a Booking term (§17). It maps to 'scheduled' in
 *     all cases (the Calendar event is scheduled to occur).
 *   - 'tentative' is not a V2 state. It maps to 'pending'.
 */
export function migrateLifecycleState(event: Record<string, any>): string | null {
  const current = event.lifecycle_state;
  if (!current) return null;

  // Unambiguous V2 states — no migration needed
  if (UNAMBIGUOUS_V2_STATES.has(current)) return null;

  // 'completed' is ambiguous — resolve using source/context (§16 vs §15)
  if (current === 'completed') {
    if (event.source_system === 'manual' && event.owner_type === 'identity') {
      return null; // V2 §16 Personal-only 'completed' — no migration needed
    }
    return 'historical'; // Source-owned or business → V2 §15 'historical'
  }

  // Legacy → V2 mapping
  switch (current) {
    case 'confirmed':
      // §14/§17: 'confirmed' is a Booking state, not a Calendar state.
      // The Calendar event for a confirmed booking is 'scheduled'.
      return 'scheduled';

    case 'tentative':
      // Not a V2 Calendar state. Maps to 'pending' (not yet committed).
      return 'pending';

    default:
      // Unknown legacy value — leave as-is (do not destroy data)
      return null;
  }
}

// ── migrateCalendarLifecycleStates ───────────────────────────
// Admin-only callable. Scans all calendarEvents, migrates legacy
// lifecycle_state values to V2, and refreshes the public projection
// for each migrated event. Idempotent — safe to run multiple times.
//
// Request: { dry_run?: boolean }
// Returns: { migrated: number, skipped: number, dry_run: boolean }
export const migrateCalendarLifecycleStates = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    if (!await isAdmin(callerIdentityId)) {
      throw new HttpsError('permission-denied', 'Admin only');
    }

    const dryRun = request.data?.dry_run === true;
    let migrated = 0;
    let skipped = 0;
    let lastDoc: any = null;
    const batchSize = 500;

    while (true) {
      let q = db.collection(EVENTS)
        .orderBy('_created_date')
        .limit(batchSize);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, any>;
        const newState = migrateLifecycleState(data);
        if (newState && newState !== data.lifecycle_state) {
          if (!dryRun) {
            const nowIso = new Date().toISOString();
            await doc.ref.update({
              lifecycle_state: newState,
              _updated_date: nowIso,
            });
            // Refresh the public projection so it reflects the new state
            await refreshEventProjection(doc.id).catch(() => {});
          }
          migrated++;
        } else {
          skipped++;
        }
      }

      lastDoc = snap.docs[snap.docs.length - 1];
    }

    return { migrated, skipped, dry_run: dryRun };
  },
);