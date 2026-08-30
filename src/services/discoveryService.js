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

  // Canonical service filter — match ANY selected service id
  if (serviceIds && serviceIds.length > 0) {
    results = results.filter(r =>
      Array.isArray(r.services) &&
      serviceIds.some(sid => r.services.some(s => s.id === sid))
    );
  }

  // Canonical facility filter — business only, match ANY selected facility id
  if (facilityIds && facilityIds.length > 0) {
    results = results.filter(r =>
      r._type === 'business' &&
      Array.isArray(r.facilities) &&
      facilityIds.some(fid => r.facilities.some(f => f.id === fid))
    );
  }

  // Business type filter — business only, match ANY selected type
  // (business_type is the denormalised Business.type enum carried on
  // the public projection).
  if (businessTypeIds && businessTypeIds.length > 0) {
    results = results.filter(r =>
      r._type === 'business' &&
      businessTypeIds.includes(r.business_type)
    );
  }

  // Equipment filter — business only, match ANY selected equipment id.
  // Same OR matching semantics as Services and Facilities.
  if (equipmentIds && equipmentIds.length > 0) {
    results = results.filter(r =>
      r._type === 'business' &&
      Array.isArray(r.equipment) &&
      equipmentIds.some(eid => r.equipment.some(e => e.id === eid))
    );
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

  // Ranking — organic default is verified-first then alphabetical.
  // Distance sort is a third independent mode (requires origin).
  if (sort === 'distance' && hasOrigin) {
    // Nearest → furthest. Profiles without coordinates sort last.
    results.sort((a, b) => {
      const ad = a._distance;
      const bd = b._distance;
      if (ad == null && bd == null) return 0;
      if (ad == null) return 1;
      if (bd == null) return -1;
      return ad - bd;
    });
  } else if (sort === 'name_az') {
    results.sort((a, b) =>
      (a.display_name || a.name || '').toLowerCase()
        .localeCompare((b.display_name || b.name || '').toLowerCase()));
  } else if (sort === 'recent') {
    results.sort((a, b) =>
      new Date(b._updated_date || 0).getTime() - new Date(a._updated_date || 0).getTime());
  } else if (sort === 'verified') {
    // Verified first, then most recently updated
    results.sort((a, b) => {
      const av = a.verification_state === 'verified' ? 0 : 1;
      const bv = b.verification_state === 'verified' ? 0 : 1;
      if (av !== bv) return av - bv;
      return new Date(b._updated_date || 0).getTime() - new Date(a._updated_date || 0).getTime();
    });
  } else {
    // 'recommended' (default) or 'distance' without origin —
    // organic ranking: verified first, then alphabetical.
    results.sort((a, b) => {
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