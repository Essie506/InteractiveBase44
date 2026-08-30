/**
 * Match Scoring — ranked multi-select matching for Directory filters.
 * ───────────────────────────────────────────────────────────
 *
 * Each active multi-select dimension (Services, Facilities, Equipment)
 * is scored independently:
 *   matched_count  = number of selected items present on the profile
 *   selected_count = number of selected items in the filter
 *   match_ratio    = matched_count / selected_count
 *
 * ELIGIBILITY: if a dimension has active selections, a result must
 * match at least ONE item (matched_count >= 1). Zero-match results
 * are excluded from that dimension.
 *
 * COMBINED SCORE: average of match_ratios across all active dimensions.
 * This treats every dimension equally regardless of how many items
 * it contains, so a dimension with 10 selections cannot dominate
 * one with 2 selections.
 *
 * SORT INTEGRATION:
 *   Recommended → match score desc, then verified, then alphabetical
 *   Verified    → verified first, then match score desc, then recency
 *   Distance    → nearest first, then match score desc as tie-breaker
 */

/**
 * Count how many of the selectedIds appear in the profile's item list.
 */
export function countMatches(profileItems, selectedIds) {
  if (!selectedIds || selectedIds.length === 0) return 0;
  if (!Array.isArray(profileItems)) return 0;
  const idSet = new Set(selectedIds);
  return profileItems.filter(item => item && item.id && idSet.has(item.id)).length;
}

/**
 * Compute the match score for a single dimension.
 * Returns null if the dimension has no active selections.
 * Returns { matched_count, selected_count, match_ratio } otherwise.
 */
export function computeDimensionScore(profileItems, selectedIds) {
  if (!selectedIds || selectedIds.length === 0) return null;
  const matched = countMatches(profileItems, selectedIds);
  const selected = selectedIds.length;
  return {
    matched_count: matched,
    selected_count: selected,
    match_ratio: matched / selected,
  };
}

/**
 * Compute the combined match score across all active dimensions.
 *
 * Returns:
 *   totalScore   — average of match_ratios across active dimensions (0–1)
 *   dimensions   — per-dimension { matched_count, selected_count, match_ratio }
 *   isEligible   — true if every active dimension has matched_count >= 1
 *   matchedTotal — aggregate matched count across active dimensions (for UI)
 *   selectedTotal— aggregate selected count across active dimensions (for UI)
 *   activeCount  — number of dimensions with active selections
 */
export function computeMatchScore(profile, { serviceIds, facilityIds, equipmentIds } = {}) {
  const dimensions = {};
  const activeRatios = [];

  const services = computeDimensionScore(profile?.services, serviceIds);
  if (services) {
    dimensions.services = services;
    activeRatios.push(services.match_ratio);
  }

  const facilities = computeDimensionScore(profile?.facilities, facilityIds);
  if (facilities) {
    dimensions.facilities = facilities;
    activeRatios.push(facilities.match_ratio);
  }

  const equipment = computeDimensionScore(profile?.equipment, equipmentIds);
  if (equipment) {
    dimensions.equipment = equipment;
    activeRatios.push(equipment.match_ratio);
  }

  const activeCount = activeRatios.length;
  const totalScore = activeCount > 0
    ? activeRatios.reduce((a, b) => a + b, 0) / activeCount
    : 0;

  // Eligibility: every active dimension must have at least 1 match
  const isEligible = activeCount === 0 || activeRatios.every(r => r > 0);

  let matchedTotal = 0;
  let selectedTotal = 0;
  for (const dim of Object.values(dimensions)) {
    matchedTotal += dim.matched_count;
    selectedTotal += dim.selected_count;
  }

  return { totalScore, dimensions, isEligible, matchedTotal, selectedTotal, activeCount };
}

/**
 * Extract the numeric match score from a result object for sort comparators.
 * Returns 0 when no structured filters are active (no _matchScore attached).
 */
export function matchScoreValue(result) {
  return result?._matchScore?.totalScore ?? 0;
}