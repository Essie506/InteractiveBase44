// Professional-only backfill helper — shared by the dedicated
// backfillProfessionalDirectory callable and the broad backfillPublicProfiles.
// ───────────────────────────────────────────────────────────
// Performs ONLY Professional projection work:
//   1. One-time directory_visibility migration on private
//      professionalProfiles (only when the field is undefined).
//   2. professionalProfilesPublic repair (canonical full-public
//      eligibility: visibility=public && active && screen_name).
//   3. professionalDirectoryEntries creation/repair/cleanup
//      (independent Directory eligibility: active && listed &&
//      screen_name, regardless of profile visibility).
//   4. Stale canonical Professional projection cleanup (old
//      screen_name projections for the same identity are removed).
//
// Does NOT touch personalProfilesPublic, businessProfilesPublic, or
// calendarEventsPublic. Idempotent: safe to run multiple times. An
// already-present directory_visibility value is NEVER overwritten —
// the migration writes only when the field is undefined.

import { db } from './shared';
import { buildPublicProjection, buildDirectoryEntry } from './professionalProfile';
import { isProfessionalListable, isProfessionalDirectoryListable } from './projectionEligibility';
import { fetchProfessionalPublicGeo } from './geo';

export interface ProfessionalBackfillResult {
  total: number;
  projected: number;                    // professionalProfilesPublic docs written
  directoryEntriesProjected: number;    // professionalDirectoryEntries docs written
  directoryVisibilityMigrated: number;  // private records that received the field
  skipped: number;
  skippedDetails: string[];
}

export async function runProfessionalBackfill(): Promise<ProfessionalBackfillResult> {
  const result: ProfessionalBackfillResult = {
    total: 0,
    projected: 0,
    directoryEntriesProjected: 0,
    directoryVisibilityMigrated: 0,
    skipped: 0,
    skippedDetails: [],
  };

  const proSnap = await db.collection('professionalProfiles').get();
  result.total = proSnap.size;

  for (const doc of proSnap.docs) {
    let data = doc.data();
    const rawScreenName = data.screen_name || null;
    const canonicalScreenName = rawScreenName
      ? String(rawScreenName).toLowerCase().trim()
      : null;

    // ── One-time directory_visibility migration (only when undefined) ──
    // An EXPLICIT migration write to the private profile. Profiles that
    // were publicly listable BEFORE this field existed (visibility=public
    // && active && screen_name) receive 'listed' so they do not vanish
    // from the Directory merely because the field was absent; all others
    // receive 'unlisted' (safe default — no exposure). An already-present
    // value is preserved exactly — the write is skipped entirely.
    if (data.directory_visibility === undefined) {
      const wasListable = isProfessionalListable(data, canonicalScreenName);
      const migratedVisibility = wasListable ? 'listed' : 'unlisted';
      await doc.ref.update({ directory_visibility: migratedVisibility });
      data = { ...data, directory_visibility: migratedVisibility };
      result.directoryVisibilityMigrated++;
    }

    const isPublicEligible = isProfessionalListable(data, canonicalScreenName);
    const isDirectoryEligible = isProfessionalDirectoryListable(data, canonicalScreenName);

    // ── professionalProfilesPublic (full public profile) ──
    if (isPublicEligible && canonicalScreenName) {
      const locationGeo = await fetchProfessionalPublicGeo(db, data.service_area_location_id, data.location_id);
      const projection = buildPublicProjection(data.identity_id, doc.id, data, locationGeo);
      await db.collection('professionalProfilesPublic').doc(canonicalScreenName).set(projection);
      result.projected++;
      const staleSnap = await db.collection('professionalProfilesPublic')
        .where('identity_id', '==', data.identity_id)
        .get();
      for (const staleDoc of staleSnap.docs) {
        if (staleDoc.id !== canonicalScreenName) {
          await staleDoc.ref.delete().catch(() => {});
        }
      }
    } else {
      const staleSnap = await db.collection('professionalProfilesPublic')
        .where('identity_id', '==', data.identity_id)
        .get();
      for (const staleDoc of staleSnap.docs) {
        await staleDoc.ref.delete().catch(() => {});
      }
    }

    // ── professionalDirectoryEntries (discovery advert) ──
    // Independent of the public profile projection: a connections-only
    // or private profile can still publish a discovery advert.
    if (isDirectoryEligible && canonicalScreenName) {
      const locationGeo = await fetchProfessionalPublicGeo(db, data.service_area_location_id, data.location_id);
      const advert = buildDirectoryEntry(data.identity_id, doc.id, data, locationGeo);
      await db.collection('professionalDirectoryEntries').doc(canonicalScreenName).set(advert);
      result.directoryEntriesProjected++;
      const staleAdSnap = await db.collection('professionalDirectoryEntries')
        .where('identity_id', '==', data.identity_id)
        .get();
      for (const staleDoc of staleAdSnap.docs) {
        if (staleDoc.id !== canonicalScreenName) {
          await staleDoc.ref.delete().catch(() => {});
        }
      }
    } else {
      const staleAdSnap = await db.collection('professionalDirectoryEntries')
        .where('identity_id', '==', data.identity_id)
        .get();
      for (const staleDoc of staleAdSnap.docs) {
        await staleDoc.ref.delete().catch(() => {});
      }
    }

    if (!isPublicEligible) {
      result.skipped++;
      const reasons: string[] = [];
      if (data.visibility !== 'public') reasons.push(`visibility=${data.visibility}`);
      if (data.lifecycle_state !== 'active') reasons.push(`lifecycle=${data.lifecycle_state}`);
      if (!canonicalScreenName) reasons.push('no screen_name');
      result.skippedDetails.push(`${doc.id}: ${reasons.join(', ')}`);
    }
  }

  return result;
}