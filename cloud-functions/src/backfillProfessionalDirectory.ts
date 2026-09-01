// Dedicated admin-only callable for the Professional Directory/Advert
// migration ONLY. Does NOT run the Personal, Business, or Event backfill.
// ───────────────────────────────────────────────────────────
// Use this when you only need to:
//   1. Migrate directory_visibility on existing professionalProfiles
//      (only records where the field is undefined; existing values
//      are preserved exactly).
//   2. Repair professionalProfilesPublic for Professional records
//      (canonical full-public eligibility).
//   3. Create/repair/cleanup professionalDirectoryEntries (independent
//      Directory eligibility).
//   4. Clean up stale canonical Professional projections.
//
// It must NOT read/write/rebuild personalProfilesPublic,
// businessProfilesPublic, or calendarEventsPublic.
//
// Admin-only. europe-west2. Idempotent. Safe to rerun.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { allowedOrigins, requireAdmin } from './shared';
import { runProfessionalBackfill } from './professionalBackfill';

export const backfillProfessionalDirectory = onCall(
  { region: 'europe-west2', cors: allowedOrigins, timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    await requireAdmin(request.auth.uid);

    // Professional-only. No Personal/Business/Event projection work.
    const professional = await runProfessionalBackfill();
    return { professional };
  },
);