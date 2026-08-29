"use strict";
// Shared projection builder for Personal profiles.
// ───────────────────────────────────────────────────────────
// Used by both savePersonalProfile and the backfill to guarantee
// identical public-field selection. Personal profiles have no
// private-only fields — all display fields are public.
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPersonalPublicProjection = buildPersonalPublicProjection;
function buildPersonalPublicProjection(identityId, profileId, data) {
    return {
        identity_id: identityId,
        profile_id: profileId,
        display_name: data.display_name || null,
        screen_name: data.screen_name || null,
        avatar_url: data.avatar_url || null,
        avatar_media_id: data.avatar_media_id || null,
        avatar_position_x: data.avatar_position_x ?? 0.5,
        avatar_position_y: data.avatar_position_y ?? 0.5,
        avatar_zoom: data.avatar_zoom ?? 1,
        cover_media_id: data.cover_media_id || null,
        cover_url: data.cover_url || null,
        cover_position_x: data.cover_position_x ?? 0.5,
        cover_position_y: data.cover_position_y ?? 0.5,
        cover_zoom: data.cover_zoom ?? 1,
        headline: data.headline || null,
        bio: data.bio || null,
        interests: Array.isArray(data.interests) ? data.interests : [],
        location: data.location || null,
        visibility: data.visibility || 'public',
        lifecycle_state: data.lifecycle_state || 'draft',
        _updated_date: new Date().toISOString(),
    };
}
//# sourceMappingURL=personalProfileProjection.js.map