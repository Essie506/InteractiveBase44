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

export function isProfessionalListable(
  data: { visibility?: string; lifecycle_state?: string } | null | undefined,
  screenName: string | null | undefined,
): boolean {
  return data?.visibility === 'public'
    && data?.lifecycle_state === 'active'
    && !!screenName;
}

export function isBusinessListable(
  data: { visibility?: string; lifecycle_state?: string } | null | undefined,
  businessId: string | null | undefined,
): boolean {
  return data?.visibility === 'public'
    && data?.lifecycle_state === 'active'
    && !!businessId;
}