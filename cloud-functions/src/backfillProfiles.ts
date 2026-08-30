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

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, requireAdmin, resolveProfessionalReferences } from './shared';
import { buildPersonalPublicProjection } from './personalProfileProjection';
import { buildBusinessPublicProjection } from './businessProfileProjection';
import { buildPublicProjection } from './professionalProfile';
import { isProfessionalListable } from './projectionEligibility';
import { fetchProfessionalPublicGeo, fetchBusinessPublicGeo } from './geo';
import { maintainProjection } from './calendarEvent';

export const backfillPublicProfiles = onCall(
  { region: 'europe-west2', cors: allowedOrigins, timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    await requireAdmin(request.auth.uid);

    const results = {
      personal: { total: 0, projected: 0, skipped: 0, skippedDetails: [] as string[] },
      professional: { total: 0, projected: 0, skipped: 0, skippedDetails: [] as string[] },
      business: { total: 0, projected: 0, skipped: 0, skippedDetails: [] as string[] },
      events: { total: 0, projected: 0, skipped: 0, skippedDetails: [] as string[] },
    };

    // ── Personal ──────────────────────────────────────────────
    const personalSnap = await db.collection('personalProfiles').get();
    results.personal.total = personalSnap.size;

    for (const doc of personalSnap.docs) {
      const data = doc.data();
      const screenName = data.screen_name || null;
      const isEligible = data.visibility === 'public'
        && data.lifecycle_state === 'active'
        && !!screenName;

      if (isEligible) {
        const projection = buildPersonalPublicProjection(data.identity_id, doc.id, data);
        await db.collection('personalProfilesPublic').doc(screenName).set(projection);
        results.personal.projected++;
      } else {
        results.personal.skipped++;
        const reasons: string[] = [];
        if (data.visibility !== 'public') reasons.push(`visibility=${data.visibility}`);
        if (data.lifecycle_state !== 'active') reasons.push(`lifecycle=${data.lifecycle_state}`);
        if (!screenName) reasons.push('no screen_name');
        results.personal.skippedDetails.push(`${doc.id}: ${reasons.join(', ')}`);
        // Clean up stale projection if the profile is no longer eligible
        if (screenName) {
          await db.collection('personalProfilesPublic').doc(screenName).delete().catch(() => {});
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
    const proSnap = await db.collection('professionalProfiles').get();
    results.professional.total = proSnap.size;

    for (const doc of proSnap.docs) {
      const data = doc.data();
      const rawScreenName = data.screen_name || null;
      const canonicalScreenName = rawScreenName
        ? String(rawScreenName).toLowerCase().trim()
        : null;
      const isEligible = isProfessionalListable(data, canonicalScreenName);

      if (isEligible) {
        const locationGeo = await fetchProfessionalPublicGeo(db, data.service_area_location_id, data.location_id);
        const projection = buildPublicProjection(data.identity_id, doc.id, data, locationGeo);
        // Write to canonical doc ID == normalized screen_name
        await db.collection('professionalProfilesPublic').doc(canonicalScreenName).set(projection);
        results.professional.projected++;
        // Remove stale projections for this identity whose doc ID
        // doesn't match the canonical screen_name
        const staleSnap = await db.collection('professionalProfilesPublic')
          .where('identity_id', '==', data.identity_id)
          .get();
        for (const staleDoc of staleSnap.docs) {
          if (staleDoc.id !== canonicalScreenName) {
            await staleDoc.ref.delete().catch(() => {});
          }
        }
      } else {
        results.professional.skipped++;
        const reasons: string[] = [];
        if (data.visibility !== 'public') reasons.push(`visibility=${data.visibility}`);
        if (data.lifecycle_state !== 'active') reasons.push(`lifecycle=${data.lifecycle_state}`);
        if (!canonicalScreenName) reasons.push('no screen_name');
        results.professional.skippedDetails.push(`${doc.id}: ${reasons.join(', ')}`);
        // Remove ALL public projections for this ineligible identity
        const staleSnap = await db.collection('professionalProfilesPublic')
          .where('identity_id', '==', data.identity_id)
          .get();
        for (const staleDoc of staleSnap.docs) {
          await staleDoc.ref.delete().catch(() => {});
        }
      }
    }

    // ── Business ──────────────────────────────────────────────
    const businessSnap = await db.collection('businessProfiles').get();
    results.business.total = businessSnap.size;

    for (const doc of businessSnap.docs) {
      const data = doc.data();
      const businessId = data.business_id || null;
      const isEligible = data.visibility === 'public'
        && data.lifecycle_state === 'active'
        && !!businessId;

      if (isEligible) {
        const businessDoc = await db.collection('businesses').doc(businessId).get();
        const businessData = businessDoc.exists ? businessDoc.data() : null;
        const resolvedProfessionals = await resolveProfessionalReferences(data.professionals);
        const locationGeo = await fetchBusinessPublicGeo(db, data.location_id);
        const projection = buildBusinessPublicProjection(
          businessId, doc.id, data, businessData, resolvedProfessionals, locationGeo,
        );
        await db.collection('businessProfilesPublic').doc(businessId).set(projection);
        results.business.projected++;
      } else {
        results.business.skipped++;
        const reasons: string[] = [];
        if (data.visibility !== 'public') reasons.push(`visibility=${data.visibility}`);
        if (data.lifecycle_state !== 'active') reasons.push(`lifecycle=${data.lifecycle_state}`);
        if (!businessId) reasons.push('no business_id');
        results.business.skippedDetails.push(`${doc.id}: ${reasons.join(', ')}`);
        // Clean up stale projection if the profile is no longer eligible
        if (businessId) {
          await db.collection('businessProfilesPublic').doc(businessId).delete().catch(() => {});
        }
      }
    }

    // ── Events (calendarEventsPublic) ─────────────────────────
    // Reuses the exact same maintainProjection logic as saveCalendarEvent
    // so the projection is identical whether built live or via backfill.
    // Ineligible events (private/cancelled/past/non-public-host) have any
    // stale projection deleted.
    const eventSnap = await db.collection('calendarEvents').get();
    results.events.total = eventSnap.size;

    for (const doc of eventSnap.docs) {
      const data = doc.data();
      try {
        await maintainProjection(doc.id, data);
        // Check whether a projection was actually written (maintainProjection
        // deletes the projection for ineligible events). We infer success
        // by checking if the public doc exists.
        const pubDoc = await db.collection('calendarEventsPublic').doc(doc.id).get();
        if (pubDoc.exists) {
          results.events.projected++;
        } else {
          results.events.skipped++;
          results.events.skippedDetails.push(`${doc.id}: ineligible`);
        }
      } catch (err: any) {
        results.events.skipped++;
        results.events.skippedDetails.push(`${doc.id}: ${err?.message || 'error'}`);
      }
    }

    return results;
  },
);