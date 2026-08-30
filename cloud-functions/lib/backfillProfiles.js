"use strict";
// Backfill — one-time population of public projection collections from
// existing private source records (personalProfiles, professionalProfiles,
// businessProfiles, calendarEvents).
// ───────────────────────────────────────────────────────────
// Uses the exact same projection builders as the save functions,
// so the public collections contain identical field selection.
//
// Admin-only. Idempotent: safe to run multiple times.
// Does NOT modify private source data — only writes to the public
// projection collections. Ineligible records that have a stale
// projection are cleaned up (projection deleted).
//
// Returns:
//   { personal, professional, business, events }
//   each: { total, projected, skipped, skippedDetails[] }
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillPublicProfiles = void 0;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const personalProfileProjection_1 = require("./personalProfileProjection");
const businessProfileProjection_1 = require("./businessProfileProjection");
const professionalProfile_1 = require("./professionalProfile");
const projectionEligibility_1 = require("./projectionEligibility");
const geo_1 = require("./geo");
const calendarEvent_1 = require("./calendarEvent");
exports.backfillPublicProfiles = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins, timeoutSeconds: 300 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    await (0, shared_1.requireAdmin)(request.auth.uid);
    const results = {
        personal: { total: 0, projected: 0, skipped: 0, skippedDetails: [] },
        professional: { total: 0, projected: 0, skipped: 0, skippedDetails: [] },
        business: { total: 0, projected: 0, skipped: 0, skippedDetails: [] },
        events: { total: 0, projected: 0, skipped: 0, skippedDetails: [] },
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
    // ── Professional (canonical: doc ID == normalized screen_name) ──
    // For each professional profile:
    //   - eligible: write projection to professionalProfilesPublic/{normalizedScreenName}
    //     then delete any stale projections for the same identity_id
    //     whose doc ID != normalizedScreenName (catches legacy migration
    //     docs that used the Base44 entity ID as doc ID)
    //   - ineligible: delete ALL projections for this identity_id
    //     (connections/private/inactive must have no public projection)
    const proSnap = await shared_1.db.collection('professionalProfiles').get();
    results.professional.total = proSnap.size;
    for (const doc of proSnap.docs) {
        const data = doc.data();
        const rawScreenName = data.screen_name || null;
        const canonicalScreenName = rawScreenName
            ? String(rawScreenName).toLowerCase().trim()
            : null;
        const isEligible = (0, projectionEligibility_1.isProfessionalListable)(data, canonicalScreenName);
        // isProfessionalListable requires !!screenName, so isEligible already
        // implies canonicalScreenName is a non-empty string. The explicit
        // && canonicalScreenName guard narrows the type for .doc() use and is
        // provably behaviour-neutral (isEligible => canonicalScreenName truthy).
        if (isEligible && canonicalScreenName) {
            const locationGeo = await (0, geo_1.fetchProfessionalPublicGeo)(shared_1.db, data.service_area_location_id, data.location_id);
            const projection = (0, professionalProfile_1.buildPublicProjection)(data.identity_id, doc.id, data, locationGeo);
            // Write to canonical doc ID == normalized screen_name
            await shared_1.db.collection('professionalProfilesPublic').doc(canonicalScreenName).set(projection);
            results.professional.projected++;
            // Remove stale projections for this identity whose doc ID
            // doesn't match the canonical screen_name
            const staleSnap = await shared_1.db.collection('professionalProfilesPublic')
                .where('identity_id', '==', data.identity_id)
                .get();
            for (const staleDoc of staleSnap.docs) {
                if (staleDoc.id !== canonicalScreenName) {
                    await staleDoc.ref.delete().catch(() => { });
                }
            }
        }
        else {
            results.professional.skipped++;
            const reasons = [];
            if (data.visibility !== 'public')
                reasons.push(`visibility=${data.visibility}`);
            if (data.lifecycle_state !== 'active')
                reasons.push(`lifecycle=${data.lifecycle_state}`);
            if (!canonicalScreenName)
                reasons.push('no screen_name');
            results.professional.skippedDetails.push(`${doc.id}: ${reasons.join(', ')}`);
            // Remove ALL public projections for this ineligible identity
            const staleSnap = await shared_1.db.collection('professionalProfilesPublic')
                .where('identity_id', '==', data.identity_id)
                .get();
            for (const staleDoc of staleSnap.docs) {
                await staleDoc.ref.delete().catch(() => { });
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
            const resolvedProfessionals = await (0, shared_1.resolveProfessionalReferences)(data.professionals);
            const locationGeo = await (0, geo_1.fetchBusinessPublicGeo)(shared_1.db, data.location_id);
            const projection = (0, businessProfileProjection_1.buildBusinessPublicProjection)(businessId, doc.id, data, businessData, resolvedProfessionals, locationGeo);
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
    // ── Events (calendarEventsPublic) ─────────────────────────
    // Reuses the exact same maintainProjection logic as saveCalendarEvent
    // so the projection is identical whether built live or via backfill.
    // Ineligible events (private/cancelled/past/non-public-host) have any
    // stale projection deleted.
    const eventSnap = await shared_1.db.collection('calendarEvents').get();
    results.events.total = eventSnap.size;
    for (const doc of eventSnap.docs) {
        const data = doc.data();
        try {
            await (0, calendarEvent_1.maintainProjection)(doc.id, data);
            // Check whether a projection was actually written (maintainProjection
            // deletes the projection for ineligible events). We infer success
            // by checking if the public doc exists.
            const pubDoc = await shared_1.db.collection('calendarEventsPublic').doc(doc.id).get();
            if (pubDoc.exists) {
                results.events.projected++;
            }
            else {
                results.events.skipped++;
                results.events.skippedDetails.push(`${doc.id}: ineligible`);
            }
        }
        catch (err) {
            results.events.skipped++;
            results.events.skippedDetails.push(`${doc.id}: ${err?.message || 'error'}`);
        }
    }
    return results;
});
//# sourceMappingURL=backfillProfiles.js.map