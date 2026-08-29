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
  ].filter(Boolean);
  return fields.some(f => String(f).toLowerCase().includes(q));
}

// ── Filter + rank ───────────────────────────────────────────
// opts: { query, types, serviceId, facilityId, verifiedOnly, locationText, maxResults }
//   types: null = all, or ['professional'] / ['business'] / both
export function filterResults(data, opts = {}) {
  const {
    query, types, serviceId, facilityId,
    verifiedOnly, locationText, maxResults = 100,
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

  // Canonical service filter (matches service.id against taxonomy slug)
  if (serviceId) {
    results = results.filter(r =>
      Array.isArray(r.services) && r.services.some(s => s.id === serviceId)
    );
  }

  // Canonical facility filter (business only)
  if (facilityId) {
    results = results.filter(r =>
      r._type === 'business' &&
      Array.isArray(r.facilities) &&
      r.facilities.some(f => f.id === facilityId)
    );
  }

  // Location text filter (public display string only)
  if (locationText) {
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

  // Deterministic ranking: verified first, then alphabetical by name.
  results.sort((a, b) => {
    const av = a.verification_state === 'verified' ? 0 : 1;
    const bv = b.verification_state === 'verified' ? 0 : 1;
    if (av !== bv) return av - bv;
    const an = (a.display_name || a.name || '').toLowerCase();
    const bn = (b.display_name || b.name || '').toLowerCase();
    return an.localeCompare(bn);
  });

  return results.slice(0, maxResults);
}