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

// ── Directory advert eligibility ────────────────────────────
// A profile is Directory-listable (has a professionalDirectoryEntries
// advert) when it is active, has a screen_name, AND the professional
// has explicitly opted into the Directory (directory_visibility ===
// 'listed'). This is INDEPENDENT of profile visibility — a
// connections-only or private profile can still publish a discovery
// advert. Profile visibility controls full-profile access; directory
// visibility controls advert presence.
export function isProfessionalDirectoryListable(
  data: { lifecycle_state?: string; directory_visibility?: string } | null | undefined,
  screenName: string | null | undefined,
): boolean {
  return data?.lifecycle_state === 'active'
    && data?.directory_visibility === 'listed'
    && !!screenName;
}