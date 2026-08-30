"use strict";
// Pure eligibility checks for public profile projections.
// ───────────────────────────────────────────────────────────
// Extracted from the save functions so they can be unit-tested
// without Firebase. Used by saveProfessionalProfile,
// saveBusinessProfile, and the backfill.
//
// A profile is publicly listable when:
//   - visibility === 'public' (not connections or private)
//   - lifecycle_state === 'active' (not draft or archived)
//   - the projection doc ID key is present (screen_name for
//     professionals, business_id for businesses)
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProfessionalListable = isProfessionalListable;
exports.isBusinessListable = isBusinessListable;
function isProfessionalListable(data, screenName) {
    return data?.visibility === 'public'
        && data?.lifecycle_state === 'active'
        && !!screenName;
}
function isBusinessListable(data, businessId) {
    return data?.visibility === 'public'
        && data?.lifecycle_state === 'active'
        && !!businessId;
}
//# sourceMappingURL=projectionEligibility.js.map