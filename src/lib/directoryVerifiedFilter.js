// Directory "Verified only" filter — extracted pure helper.
// ───────────────────────────────────────────────────────────
// A Directory listing may exist without being verified: an
// unverified listing remains eligible for ordinary Directory
// discovery (visibility/location/category rules) and only
// becomes hidden when the visitor enables "Verified only".
//
// Verification state is read from the public projection's
// `verification_state` field (merged from the authoritative
// businesses / professionalProfiles collection by the
// projection writer). This helper applies that field as a
// real filter — not a cosmetic control.
//
// Reused by discoveryService.filterResults so the exact logic
// is unit-testable without the Firebase import chain.

/**
 * Filter Directory results by verified state when verifiedOnly is on.
 * An unverified listing is kept when verifiedOnly is off; excluded when on.
 * @param {Array} results - professionals + businesses (events handled separately)
 * @param {boolean} verifiedOnly
 * @returns {Array}
 */
export function filterVerifiedOnly(results, verifiedOnly) {
  if (!verifiedOnly) return results;
  return results.filter((r) => r.verification_state === 'verified');
}