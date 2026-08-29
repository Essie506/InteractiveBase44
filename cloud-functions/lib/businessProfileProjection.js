"use strict";
// Shared projection builder for Business profiles.
// ───────────────────────────────────────────────────────────
// Used by both saveBusinessProfile and the backfill to guarantee
// identical public-field selection. Merges BusinessProfile display
// fields with Business.verification_state and Business.type so the
// public view has everything it needs without reading private collections.
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBusinessPublicProjection = buildBusinessPublicProjection;
function buildBusinessPublicProjection(businessId, profileId, profileData, businessData) {
    return {
        business_id: businessId,
        profile_id: profileId,
        name: profileData.name || businessData?.name || null,
        description: profileData.description || null,
        logo_url: profileData.logo_url || null,
        logo_media_id: profileData.logo_media_id || null,
        logo_position_x: profileData.logo_position_x ?? 0.5,
        logo_position_y: profileData.logo_position_y ?? 0.5,
        logo_zoom: profileData.logo_zoom ?? 1,
        cover_media_id: profileData.cover_media_id || null,
        cover_url: profileData.cover_url || null,
        cover_position_x: profileData.cover_position_x ?? 0.5,
        cover_position_y: profileData.cover_position_y ?? 0.5,
        cover_zoom: profileData.cover_zoom ?? 1,
        gallery_media_ids: Array.isArray(profileData.gallery_media_ids) ? profileData.gallery_media_ids : [],
        location: profileData.location || null,
        category: profileData.category || null,
        services: Array.isArray(profileData.services) ? profileData.services : [],
        professionals: Array.isArray(profileData.professionals) ? profileData.professionals : [],
        contact_email: profileData.contact_email || null,
        contact_phone: profileData.contact_phone || null,
        website: profileData.website || null,
        operating_hours: profileData.operating_hours || null,
        verification_state: businessData?.verification_state || 'not_verified',
        business_type: businessData?.type || null,
        visibility: profileData.visibility || 'public',
        lifecycle_state: profileData.lifecycle_state || 'draft',
        _updated_date: new Date().toISOString(),
    };
}
//# sourceMappingURL=businessProfileProjection.js.map