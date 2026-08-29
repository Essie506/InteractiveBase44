"use strict";
// Backfill — one-time population of personalProfilesPublic and
// businessProfilesPublic from existing private profile records.
// ───────────────────────────────────────────────────────────
// Uses the exact same projection builders as the save functions
// (imported from personalProfileProjection / businessProfileProjection),
// so the public collections contain identical field selection.
//
// Admin-only. Idempotent: safe to run multiple times.
// Does NOT modify private source data — only writes to the public
// projection collections. Ineligible profiles that have a stale
// projection are cleaned up (projection deleted).
//
// Returns:
//   { personal: { total, projected, skipped, skippedDetails[] },
//     business: { total, projected, skipped, skippedDetails[] } }
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillPublicProfiles = void 0;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const personalProfileProjection_1 = require("./personalProfileProjection");
const businessProfileProjection_1 = require("./businessProfileProjection");
exports.backfillPublicProfiles = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins, timeoutSeconds: 300 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    await (0, shared_1.requireAdmin)(request.auth.uid);
    const results = {
        personal: { total: 0, projected: 0, skipped: 0, skippedDetails: [] },
        business: { total: 0, projected: 0, skipped: 0, skippedDetails: [] },
    };
    // ── Personal ──────────────────────────────────────────────
    const personalSnap = await shared_1.db.collection('personalProfiles').get();
    results.personal.total = personalSnap.size;
    for (const doc of personalSnap.docs) {
        const data = doc.data();
        const screenName = data.screen_name || null;
        const isEligible = data.visibility === 'public'
            && data.lifecycle_state === 'active'
            && !!screenName;
        if (isEligible) {
            const projection = (0, personalProfileProjection_1.buildPersonalPublicProjection)(data.identity_id, doc.id, data);
            await shared_1.db.collection('personalProfilesPublic').doc(screenName).set(projection);
            results.personal.projected++;
        }
        else {
            results.personal.skipped++;
            const reasons = [];
            if (data.visibility !== 'public')
                reasons.push(`visibility=${data.visibility}`);
            if (data.lifecycle_state !== 'active')
                reasons.push(`lifecycle=${data.lifecycle_state}`);
            if (!screenName)
                reasons.push('no screen_name');
            results.personal.skippedDetails.push(`${doc.id}: ${reasons.join(', ')}`);
            // Clean up stale projection if the profile is no longer eligible
            if (screenName) {
                await shared_1.db.collection('personalProfilesPublic').doc(screenName).delete().catch(() => { });
            }
        }
    }
    // ── Business ──────────────────────────────────────────────
    const businessSnap = await shared_1.db.collection('businessProfiles').get();
    results.business.total = businessSnap.size;
    for (const doc of businessSnap.docs) {
        const data = doc.data();
        const businessId = data.business_id || null;
        const isEligible = data.visibility === 'public'
            && data.lifecycle_state === 'active'
            && !!businessId;
        if (isEligible) {
            const businessDoc = await shared_1.db.collection('businesses').doc(businessId).get();
            const businessData = businessDoc.exists ? businessDoc.data() : null;
            const projection = (0, businessProfileProjection_1.buildBusinessPublicProjection)(businessId, doc.id, data, businessData);
            await shared_1.db.collection('businessProfilesPublic').doc(businessId).set(projection);
            results.business.projected++;
        }
        else {
            results.business.skipped++;
            const reasons = [];
            if (data.visibility !== 'public')
                reasons.push(`visibility=${data.visibility}`);
            if (data.lifecycle_state !== 'active')
                reasons.push(`lifecycle=${data.lifecycle_state}`);
            if (!businessId)
                reasons.push('no business_id');
            results.business.skippedDetails.push(`${doc.id}: ${reasons.join(', ')}`);
            // Clean up stale projection if the profile is no longer eligible
            if (businessId) {
                await shared_1.db.collection('businessProfilesPublic').doc(businessId).delete().catch(() => { });
            }
        }
    }
    return results;
});
//# sourceMappingURL=backfillProfiles.js.map