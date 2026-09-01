// Backfill — one-time population of public projection collections from
// existing private source records (personalProfiles, professionalProfiles,
// businessProfiles, calendarEvents).
// ───────────────────────────────────────────────────────────
// Uses the exact same projection builders as the save functions,
// so the public collections contain identical field selection.
//
// Admin-only. Idempotent: safe to run multiple times.
// Does NOT modify private source data EXCEPT for the one-time
// Professional directory_visibility migration, which explicitly writes
// the field to private professionalProfiles records so existing
// publicly-listable Professionals retain their Directory presence.
// Otherwise only writes to the public projection collections.
// Ineligible records that have a stale projection are cleaned up
// (projection deleted).
//
// Returns:
//   { personal, professional, business, events }
//   each: { total, projected, skipped, skippedDetails[] }

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, requireAdmin, resolveProfessionalReferences } from './shared';
import { buildPersonalPublicProjection } from './personalProfileProjection';
import { buildBusinessPublicProjection } from './businessProfileProjection';
import { fetchBusinessPublicGeo } from './geo';
import { maintainProjection } from './calendarEvent';
import { runProfessionalBackfill } from './professionalBackfill';

export const backfillPublicProfiles = onCall(
  { region: 'europe-west2', cors: allowedOrigins, timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    await requireAdmin(request.auth.uid);

    const results = {
      personal: { total: 0, projected: 0, skipped: 0, skippedDetails: [] as string[] },
      professional: { total: 0, projected: 0, directoryEntriesProjected: 0, directoryVisibilityMigrated: 0, skipped: 0, skippedDetails: [] as string[] },
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

    // ── Professional (canonical: doc ID == normalized screen name) ──
    // Delegated to the shared Professional-only helper so the broad
    // backfill and the dedicated backfillProfessionalDirectory callable
    // use identical logic. The helper performs the one-time
    // directory_visibility migration (only when the field is undefined),
    // maintains professionalProfilesPublic and professionalDirectoryEntries
    // independently, and cleans up stale projections. See
    // professionalBackfill.ts for the full contract.
    const professional = await runProfessionalBackfill();
    results.professional.total = professional.total;
    results.professional.projected = professional.projected;
    results.professional.directoryEntriesProjected = professional.directoryEntriesProjected;
    results.professional.directoryVisibilityMigrated = professional.directoryVisibilityMigrated;
    results.professional.skipped = professional.skipped;
    results.professional.skippedDetails = professional.skippedDetails;

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