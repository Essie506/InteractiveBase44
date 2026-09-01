"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillProfessionalDirectory = void 0;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const professionalBackfill_1 = require("./professionalBackfill");
exports.backfillProfessionalDirectory = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins, timeoutSeconds: 300 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    await (0, shared_1.requireAdmin)(request.auth.uid);
    // Professional-only. No Personal/Business/Event projection work.
    const professional = await (0, professionalBackfill_1.runProfessionalBackfill)();
    return { professional };
});
//# sourceMappingURL=backfillProfessionalDirectory.js.map