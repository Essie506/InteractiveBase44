/**
 * Discovery Service — reusable Directory + Search layer.
 * ───────────────────────────────────────────────────────────
 * Reads the existing public profile projections:
 *   professionalProfilesPublic/{screenName}  (public-read, public fields only)
 *   businessProfilesPublic/{businessId}     (public-read, public fields only)
 *
 * These projections are maintained by the saveProfessionalProfile /
 * saveBusinessProfile Cloud Functions and only contain docs when
 * visibility=public AND lifecycle_state=active, so every doc in
 * them is safe to show in the directory — including to signed-out
 * visitors.
 *
 * Directory and Search both consume this single layer:
 *   loadDirectory()   → fetch once
 *   filterResults()   → in-memory filter + deterministic rank
 *
 * No duplicate listing entities are created. Results reference the
 * existing public profile identity/business IDs and routes.
 *
 * Location filtering is text-based on the public display string
 * (location / service_area). The public projections do not carry
 * coordinates or a structured location_id, so robust geographical
 * search is not possible yet — see report.
 */

import { db } from '@/firebase/firebaseClient';
import { collection, getDocs } from 'firebase/firestore';
import { useFirebase } from '@/lib/backendConfig';
import { fromFirestoreDoc } from '@/data/firebase/mappers';
import { haversineMiles, getGeoCoords } from '@/lib/geo';
import { computeMatchScore, matchScoreValue } from '@/lib/matchScoring';

const PROFESSIONAL_PUBLIC = 'professionalProfilesPublic';
const BUSINESS_PUBLIC = 'businessProfilesPublic';

// ── Load all listable public profiles ──────────────────────
export async function loadDirectory() {
  if (!useFirebase) return { professionals: [], businesses: [] };

  const [proSnap, bizSnap] = await Promise.all([
    getDocs(collection(db, PROFESSIONAL_PUBLIC)),
    getDocs(collection(db, BUSINESS_PUBLIC)),
  ]);

  return {
    professionals: proSnap.docs.map(fromFirestoreDoc),
    businesses: bizSnap.docs.map(fromFirestoreDoc),
  };
}

// ── Text match (case-insensitive across public fields) ────
function matchesQuery(profile, q) {
  const fields = [
    profile.display_name, profile.business_name, profile.name,
    profile.headline, profile.bio, profile.profession,
    profile.professional_category, profile.category, profile.business_type,
    profile.location, profile.service_area,
    ...(Array.isArray(profile.services) ? profile.services.map(s => s.label) : []),
    ...(Array.isArray(profile.facilities) ? profile.facilities.map(f => f.label) : []),
    ...(Array.isArray(profile.equipment) ? profile.equipment.map(e => e.label) : []),
  ].filter(Boolean);
  return fields.some(f => String(f).toLowerCase().includes(q));
}

// ── Filter + rank ───────────────────────────────────────────
// opts: { query, types, serviceId, facilityId, verifiedOnly, locationText, maxResults }
//   types: null = all, or ['professional'] / ['business'] / both
export function filterResults(data, opts = {}) {
  const {
    query, types, serviceIds, facilityIds, businessTypeIds, equipmentIds,
    verifiedOnly, locationText, sort = 'recommended', maxResults = 100,
    origin, distance,
  } = opts;

  const wantPro = !types || types.includes('professional');
  const wantBiz = !types || types.includes('business');

  let results = [];
  if (wantPro) {
    results.push(...data.professionals.map(p => ({ ...p, _type: 'professional' })));
  }
  if (wantBiz) {
    results.push(...data.businesses.map(b => ({ ...b, _type: 'business' })));
  }

  // Verified-only filter
  if (verifiedOnly) {
    results = results.filter(r => r.verification_state === 'verified');
  }

  // Business type filter — strict (not ranked), business only.
  // (business_type is the denormalised Business.type enum carried on
  // the public projection).
  if (businessTypeIds && businessTypeIds.length > 0) {
    results = results.filter(r =>
      r._type === 'business' &&
      businessTypeIds.includes(r.business_type)
    );
  }

  // Ranked multi-select matching for Services, Facilities, Equipment.
  // Each active dimension is scored independently (match_ratio =
  // matched_count / selected_count). Results with 0 matches in any
  // active dimension are excluded. The combined score (average of
  // dimension ratios) influences sort order — see ranking below.
  const hasStructuredFilters =
    (serviceIds && serviceIds.length > 0) ||
    (facilityIds && facilityIds.length > 0) ||
    (equipmentIds && equipmentIds.length > 0);

  if (hasStructuredFilters) {
    results = results
      .map(r => {
        const _matchScore = computeMatchScore(r, { serviceIds, facilityIds, equipmentIds });
        return { ...r, _matchScore };
      })
      .filter(r => r._matchScore.isEligible);
  }

  // Location filter — distance-based when origin is resolved,
  // text-based fallback when no origin (geocoding failed or no input).
  const hasOrigin = origin && origin.latitude != null && origin.longitude != null;
  const distanceActive = hasOrigin && distance && distance > 0;

  if (distanceActive) {
    // Radius filter — exclude profiles without public coordinates
    results = results.filter(r => {
      const coords = getGeoCoords(r);
      if (!coords) return false;
      const miles = haversineMiles(origin, coords);
      return miles != null && miles <= distance;
    });
  } else if (locationText) {
    // Text-based fallback (no origin resolved)
    const loc = locationText.toLowerCase().trim();
    if (loc) {
      results = results.filter(r => {
        const fields = [r.location, r.service_area].filter(Boolean);
        return fields.some(f => String(f).toLowerCase().includes(loc));
      });
    }
  }

  // Free-text query
  if (query) {
    const q = query.toLowerCase().trim();
    if (q) results = results.filter(r => matchesQuery(r, q));
  }

  // Attach calculated distance to each result for display + distance sort.
  // Profiles without coordinates get _distance = null.
  if (hasOrigin) {
    results = results.map(r => {
      const coords = getGeoCoords(r);
      return { ...r, _distance: coords ? haversineMiles(origin, coords) : null };
    });
  }

  // Ranking — structured match quality influences each sort mode.
  //   Recommended → match score desc, then verified, then alphabetical
  //   Verified    → verified first, then match score desc, then recency
  //   Distance    → nearest first, then match score desc as tie-breaker
  if (sort === 'distance' && hasOrigin) {
    // Nearest → furthest. Profiles without coordinates sort last.
    // Match score is a tie-breaker for equal distances.
    results.sort((a, b) => {
      const ad = a._distance;
      const bd = b._distance;
      if (ad == null && bd == null) return matchScoreValue(b) - matchScoreValue(a);
      if (ad == null) return 1;
      if (bd == null) return -1;
      if (ad !== bd) return ad - bd;
      return matchScoreValue(b) - matchScoreValue(a);
    });
  } else if (sort === 'name_az') {
    results.sort((a, b) =>
      (a.display_name || a.name || '').toLowerCase()
        .localeCompare((b.display_name || b.name || '').toLowerCase()));
  } else if (sort === 'recent') {
    results.sort((a, b) =>
      new Date(b._updated_date || 0).getTime() - new Date(a._updated_date || 0).getTime());
  } else if (sort === 'verified') {
    // Verified first, then stronger filter match, then most recently updated
    results.sort((a, b) => {
      const av = a.verification_state === 'verified' ? 0 : 1;
      const bv = b.verification_state === 'verified' ? 0 : 1;
      if (av !== bv) return av - bv;
      const ms = matchScoreValue(b) - matchScoreValue(a);
      if (ms !== 0) return ms;
      return new Date(b._updated_date || 0).getTime() - new Date(a._updated_date || 0).getTime();
    });
  } else {
    // 'recommended' (default) or 'distance' without origin —
    // strongest structured match first, then verified, then alphabetical.
    results.sort((a, b) => {
      const ms = matchScoreValue(b) - matchScoreValue(a);
      if (ms !== 0) return ms;
      const av = a.verification_state === 'verified' ? 0 : 1;
      const bv = b.verification_state === 'verified' ? 0 : 1;
      if (av !== bv) return av - bv;
      const an = (a.display_name || a.name || '').toLowerCase();
      const bn = (b.display_name || b.name || '').toLowerCase();
      return an.localeCompare(bn);
    });
  }

  return results.slice(0, maxResults);
}