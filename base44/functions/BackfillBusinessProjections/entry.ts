import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  getAccessToken,
  getProjectId,
  toFirestoreFields,
  firestoreListDocs,
  firestoreRunQuery,
  firestoreBatchWrite,
  docPath,
} from '../../shared/firebaseAdmin.ts';

// ───────────────────────────────────────────────────────────
// BackfillBusinessProjections — regenerate missing businessProfilesPublic
// ───────────────────────────────────────────────────────────
// Diagnosis: a Business created before the canonical write-path fix
// (BusinessCreation now calls saveBusinessProfile) has a private
// businessProfiles doc that IS Directory-eligible (visibility=public,
// lifecycle_state=active) but NO businessProfilesPublic projection, so it
// is invisible in the Directory. This backfill regenerates the missing
// projection for every eligible business using the same field selection as
// buildBusinessPublicProjection (cloud-functions/src/businessProfileProjection.ts).
//
// It does NOT manufacture listings — it only projects businesses that
// already satisfy the Directory eligibility rules. It does NOT duplicate
// business records (writes only to businessProfilesPublic/{businessId}).
// professionals + location_geo are left empty here; the owner's next
// saveBusinessProfile save refreshes them fully.
//
// Admin-only: maintenance/backfill operation.

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const token = await getAccessToken();
    const projectId = getProjectId();

    // 1. List all businesses (private — Admin SDK bypasses rules)
    const businesses = await firestoreListDocs(projectId, 'businesses', token);

    const writes: Array<{ name: string; fields: Record<string, any> }> = [];
    const report: Array<Record<string, any>> = [];

    for (const biz of businesses) {
      const bizData = biz.data || {};
      // 2. Read the private businessProfile by business_id
      let profiles: any[] = [];
      try {
        profiles = await firestoreRunQuery(
          projectId,
          'businessProfiles',
          [{ field: 'business_id', op: '==', value: biz.id }],
          token
        );
      } catch (e) {
        report.push({ businessId: biz.id, status: 'profile_query_failed' });
        continue;
      }
      const profileDoc = profiles.length > 0 ? profiles[0] : null;
      const p = profileDoc ? profileDoc.data : null;
      if (!p) {
        report.push({ businessId: biz.id, status: 'no_profile' });
        continue;
      }

      // 3. Eligibility — visibility=public + lifecycle_state=active
      const eligible = p.visibility === 'public' && p.lifecycle_state === 'active';
      if (!eligible) {
        report.push({
          businessId: biz.id,
          status: 'ineligible',
          visibility: p.visibility,
          lifecycle_state: p.lifecycle_state,
        });
        continue;
      }

      // 4. Build projection — matches buildBusinessPublicProjection field set.
      const projection: Record<string, any> = {
        business_id: biz.id,
        profile_id: profileDoc.id,
        name: p.name || bizData.name || null,
        description: p.description || null,
        logo_url: p.logo_url || null,
        logo_media_id: p.logo_media_id || null,
        logo_position_x: p.logo_position_x ?? 0.5,
        logo_position_y: p.logo_position_y ?? 0.5,
        logo_zoom: p.logo_zoom ?? 1,
        cover_media_id: p.cover_media_id || null,
        cover_url: p.cover_url || null,
        cover_position_x: p.cover_position_x ?? 0.5,
        cover_position_y: p.cover_position_y ?? 0.5,
        cover_zoom: p.cover_zoom ?? 1,
        gallery_media_ids: Array.isArray(p.gallery_media_ids) ? p.gallery_media_ids : [],
        location: p.location || null,
        location_geo: null,
        category: p.category || null,
        services: Array.isArray(p.services) ? p.services : [],
        facilities: Array.isArray(p.facilities) ? p.facilities : [],
        equipment: Array.isArray(p.equipment) ? p.equipment : [],
        professionals: [],
        contact_email: p.contact_email || null,
        contact_phone: p.contact_phone || null,
        website: p.website || null,
        operating_hours: p.operating_hours || null,
        verification_state: bizData.verification_state || 'not_verified',
        business_type: bizData.type || null,
        visibility: p.visibility || 'public',
        lifecycle_state: p.lifecycle_state || 'draft',
        _updated_date: new Date().toISOString(),
      };

      writes.push({
        name: docPath(projectId, 'businessProfilesPublic', biz.id),
        fields: toFirestoreFields(projection),
      });
      report.push({ businessId: biz.id, status: 'projected', name: projection.name });
    }

    // 5. Batch write projections (idempotent — create-or-replace)
    let writeResult = { written: 0, errors: [] as string[] };
    if (writes.length > 0) {
      writeResult = await firestoreBatchWrite(projectId, writes, token);
    }

    return Response.json({
      businesses: businesses.length,
      projected: writes.length,
      writeErrors: writeResult.errors,
      report,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}