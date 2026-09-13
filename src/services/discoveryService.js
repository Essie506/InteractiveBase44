// Search & Discovery Service — V2 §15.
// Extends the existing Directory discovery (professionals, businesses,
// events) with indexed content (posts, workouts, promotions) from the
// SearchIndexAdapter.
//
// The Directory route remains the authoritative public discovery
// surface. The SpecVault AI spec-search (src/pages/Search.jsx) stays
// separate as an administrative tool.

import { db } from '@/firebase/firebaseClient';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { useFirebase } from '@/lib/backendConfig';
import { fromFirestoreDoc } from '@/data/firebase/mappers';
import { haversineMiles, getGeoCoords } from '@/lib/geo';
import { computeMatchScore, matchScoreValue } from '@/lib/matchScoring';
import { resolveDateRange, isEventInRange } from '@/lib/eventDateRanges';
import { compareEventsByPrice } from '@/lib/eventPriceSort';
import { isPriceSort } from '@/lib/directorySortOptions';
import { filterVerifiedOnly } from '@/lib/directoryVerifiedFilter';
import { searchIndex, getSuggestions } from '@/lib/searchIndexAdapter';
import { listActiveCampaigns } from '@/services/promotionsService';

const PROFESSIONAL_DIRECTORY = 'professionalDirectoryEntries';
const BUSINESS_PUBLIC = 'businessProfilesPublic';
const EVENTS_PUBLIC = 'calendarEventsPublic';

// ── Load all listable public profiles + events ────────────
export async function loadDirectory() {
  if (!useFirebase) return { professionals: [], businesses: [], events: [], sourceErrors: {} };

  const [proRes, bizRes, evtRes] = await Promise.allSettled([
    getDocs(collection(db, PROFESSIONAL_DIRECTORY)),
    getDocs(collection(db, BUSINESS_PUBLIC)),
    getDocs(collection(db, EVENTS_PUBLIC)),
  ]);

  const professionals = proRes.status === 'fulfilled' ? proRes.value.docs.map(fromFirestoreDoc) : [];
  const businesses = bizRes.status === 'fulfilled' ? bizRes.value.docs.map(fromFirestoreDoc) : [];
  const events = evtRes.status === 'fulfilled' ? evtRes.value.docs.map(fromFirestoreDoc) : [];

  const sourceErrors = {};
  if (proRes.status === 'rejected') sourceErrors.professionals = proRes.reason?.message || 'Unavailable';
  if (bizRes.status === 'rejected') sourceErrors.businesses = bizRes.reason?.message || 'Unavailable';
  if (evtRes.status === 'rejected') sourceErrors.events = evtRes.reason?.message || 'Unavailable';

  return { professionals, businesses, events, sourceErrors };
}

// ── Public events by owner (profile content surface) ─────
export async function listPublicEventsByOwner(ownerId, maxResults = 20) {
  if (!useFirebase) return [];
  const q = query(
    collection(db, EVENTS_PUBLIC),
    where('owner_id', '==', ownerId),
    limit(100),
  );
  const snap = await getDocs(q);
  const events = snap.docs.map(fromFirestoreDoc);
  const now = Date.now();
  return events
    .filter(e => e.visibility === 'public'
      && e.lifecycle_state !== 'cancelled'
      && e.lifecycle_state !== 'removed')
    .filter(e => e.start_time && new Date(e.start_time).getTime() >= now)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, maxResults);
}

// ── Indexed content search (posts, workouts, promotions) ─────
// Queries the SearchIndexAdapter for content beyond the 3 projection-
// based discovery types. Returns index documents with content_type
// and system for the Directory to render as result cards.
export async function searchIndexedContent(searchText, opts = {}) {
  if (!searchText?.trim()) return [];
  // V2 §15.5: all authoritative searchable content types are indexed.
  const types = opts.types || ['post', 'workout', 'promotion', 'calendar_event', 'professional', 'business'];
  return searchIndex(searchText, { types, maxResults: opts.maxResults || 30 });
}

// ── Sponsored placement (V2 §19.7) ────────────────────────────
// Loads active promotional campaigns and maps their target content
// references into a lookup keyed by `${system}_${id}`. The Directory
// uses this to tag promoted results with a "Sponsored" badge and
// boost their sort position. Does NOT fabricate results — only
// annotates content that already exists in the result set.
export async function loadSponsoredTargets() {
  try {
    const campaigns = await listActiveCampaigns();
    const map = {};
    for (const c of campaigns) {
      if (!Array.isArray(c.target_content_references)) continue;
      for (const ref of c.target_content_references) {
        const key = `${ref.system}_${ref.id}`;
        if (!map[key]) map[key] = { campaign: c, system: ref.system, id: ref.id };
      }
    }
    return map;
  } catch (err) {
    return {};
  }
}

/**
 * Annotate results with sponsored placement metadata.
 * Mutates results in place: sets `_sponsored` on items that match
 * a sponsored target. Does NOT reorder — the caller decides whether
 * to boost sponsored items in the sort.
 * @param {Array} results - filterResults output
 * @param {Object} sponsoredMap - from loadSponsoredTargets
 * @returns {Array} annotated results
 */
export function annotateSponsored(results, sponsoredMap) {
  if (!sponsoredMap || Object.keys(sponsoredMap).length === 0) return results;
  return results.map((r) => {
    const system = r._type === 'professional' ? 'professional'
      : r._type === 'business' ? 'business'
      : r._type === 'event' ? 'calendar_event'
      : r.system || r._type;
    const id = r.id || r.content_id;
    if (!system || !id) return r;
    const key = `${system}_${id}`;
    const sponsored = sponsoredMap[key];
    if (sponsored) return { ...r, _sponsored: true, _campaign: sponsored.campaign };
    return r;
  });
}

// ── Search suggestions (autocomplete) ─────
export async function getSearchSuggestions(prefix) {
  return getSuggestions(prefix);
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

function matchesEventQuery(event, q) {
  const fields = [
    event.title, event.description, event.location_label,
    event.host?.display_name,
    ...(Array.isArray(event.services) ? event.services.map(s => s.label) : []),
  ].filter(Boolean);
  return fields.some(f => String(f).toLowerCase().includes(q));
}

function eventFormatId(event) {
  if (event.location_type === 'online') return 'online';
  if (event.location_type === 'hybrid') return 'hybrid';
  return 'in-person';
}

// ── Filter + rank ───────────────────────────────────────────
export function filterResults(data, opts = {}) {
  const {
    query, types, serviceIds, facilityIds, businessTypeIds, equipmentIds,
    professionalTypeIds, specialismIds, sessionTypeIds,
    verifiedOnly, locationText, sort = 'recommended', maxResults = 100,
    origin, distance,
    dateFilter, dateFrom, dateTo, formatIds, priceIds, availableOnly,
  } = opts;

  const wantPro = !types || types.includes('professional');
  const wantBiz = !types || types.includes('business');
  const wantEvt = !types || types.includes('event');

  let results = [];
  if (wantPro) {
    results.push(...data.professionals.map(p => ({ ...p, _type: 'professional' })));
  }
  if (wantBiz) {
    results.push(...data.businesses.map(b => ({ ...b, _type: 'business' })));
  }

  let events = [];
  if (wantEvt && Array.isArray(data.events)) {
    events = data.events
      .filter(e => e.visibility === 'public' && e.lifecycle_state !== 'cancelled')
      .map(e => ({ ...e, _type: 'event' }));

    if (dateFilter) {
      const range = resolveDateRange(dateFilter, dateFrom, dateTo);
      if (range) {
        events = events.filter(e => isEventInRange(e.start_time, range));
      }
    }

    if (formatIds && formatIds.length > 0) {
      events = events.filter(e => formatIds.includes(eventFormatId(e)));
    }

    if (priceIds && priceIds.length > 0) {
      events = events.filter(e =>
        priceIds.includes(e.is_free ? 'free' : 'paid')
      );
    }

    if (availableOnly) {
      events = events.filter(e =>
        e.availability_state === 'available' ||
        (typeof e.spaces_remaining === 'number' && e.spaces_remaining > 0)
      );
    }

    if (serviceIds && serviceIds.length > 0) {
      events = events
        .map(e => {
          const _matchScore = computeMatchScore(e, { serviceIds });
          return { ...e, _matchScore };
        })
        .filter(e => e._matchScore.isEligible);
    }

    if (verifiedOnly) {
      events = events.filter(e => e.host?.verification_state === 'verified');
    }

    const evtHasOrigin = origin && origin.latitude != null && origin.longitude != null;
    const evtDistanceActive = evtHasOrigin && distance && distance > 0;
    if (evtDistanceActive) {
      events = events.filter(e => {
        const coords = e.location_geo;
        if (!coords) return false;
        const miles = haversineMiles(origin, coords);
        return miles != null && miles <= distance;
      });
    } else if (locationText) {
      const loc = locationText.toLowerCase().trim();
      if (loc) {
        events = events.filter(e => {
          const fields = [e.location_label].filter(Boolean);
          return fields.some(f => String(f).toLowerCase().includes(loc));
        });
      }
    }

    if (query) {
      const q = query.toLowerCase().trim();
      if (q) events = events.filter(e => matchesEventQuery(e, q));
    }

    if (evtHasOrigin) {
      events = events.map(e => ({
        ...e,
        _distance: e.location_geo ? haversineMiles(origin, e.location_geo) : null,
      }));
    }
  }

  // "Verified only" — a real filter on the projection's verification_state.
  // An unverified listing stays eligible for normal discovery; it is
  // excluded only when the visitor enables Verified only.
  results = filterVerifiedOnly(results, verifiedOnly);

  if (businessTypeIds && businessTypeIds.length > 0) {
    results = results.filter(r =>
      r._type !== 'business' ||
      businessTypeIds.includes(r.business_type)
    );
  }

  if (professionalTypeIds && professionalTypeIds.length > 0) {
    results = results.filter(r =>
      r._type !== 'professional' ||
      (r.professional_type && professionalTypeIds.includes(r.professional_type.id))
    );
  }

  const hasStructuredFilters =
    (serviceIds && serviceIds.length > 0) ||
    (facilityIds && facilityIds.length > 0) ||
    (equipmentIds && equipmentIds.length > 0) ||
    (specialismIds && specialismIds.length > 0) ||
    (sessionTypeIds && sessionTypeIds.length > 0);

  if (hasStructuredFilters) {
    results = results
      .map(r => {
        const dims = r._type === 'professional'
          ? { serviceIds, specialismIds, sessionTypeIds }
          : { serviceIds, facilityIds, equipmentIds };
        const _matchScore = computeMatchScore(r, dims);
        return { ...r, _matchScore };
      })
      .filter(r => r._matchScore.isEligible);
  }

  const hasOrigin = origin && origin.latitude != null && origin.longitude != null;
  const distanceActive = hasOrigin && distance && distance > 0;

  if (distanceActive) {
    results = results.filter(r => {
      const coords = getGeoCoords(r);
      if (!coords) return false;
      const miles = haversineMiles(origin, coords);
      return miles != null && miles <= distance;
    });
  } else if (locationText) {
    const loc = locationText.toLowerCase().trim();
    if (loc) {
      results = results.filter(r => {
        const fields = [r.location, r.service_area].filter(Boolean);
        return fields.some(f => String(f).toLowerCase().includes(loc));
      });
    }
  }

  if (query) {
    const q = query.toLowerCase().trim();
    if (q) results = results.filter(r => matchesQuery(r, q));
  }

  if (hasOrigin) {
    results = results.map(r => {
      const coords = getGeoCoords(r);
      return { ...r, _distance: coords ? haversineMiles(origin, coords) : null };
    });
  }

  results.push(...events);

  if (sort === 'date') {
    results.sort((a, b) => {
      const at = a.start_time ? new Date(a.start_time).getTime() : null;
      const bt = b.start_time ? new Date(b.start_time).getTime() : null;
      if (at == null && bt == null) return matchScoreValue(b) - matchScoreValue(a);
      if (at == null) return 1;
      if (bt == null) return -1;
      return at - bt;
    });
  } else if (sort === 'distance' && hasOrigin) {
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
      (a.display_name || a.name || a.title || '').toLowerCase()
        .localeCompare((b.display_name || b.name || b.title || '').toLowerCase()));
  } else if (sort === 'recent') {
    results.sort((a, b) =>
      new Date(b._updated_date || 0).getTime() - new Date(a._updated_date || 0).getTime());
  } else if (sort === 'verified') {
    results.sort((a, b) => {
      const av = (a.verification_state || a.host?.verification_state) === 'verified' ? 0 : 1;
      const bv = (b.verification_state || b.host?.verification_state) === 'verified' ? 0 : 1;
      if (av !== bv) return av - bv;
      const ms = matchScoreValue(b) - matchScoreValue(a);
      if (ms !== 0) return ms;
      return new Date(b._updated_date || 0).getTime() - new Date(a._updated_date || 0).getTime();
    });
  } else if (isPriceSort(sort)) {
    const direction = sort === 'price-asc' ? 'asc' : 'desc';
    results.sort((a, b) => compareEventsByPrice(a, b, direction));
  } else {
    results.sort((a, b) => {
      // V2 §19.7: sponsored placements are boosted to the top of
      // recommended results. This does NOT weaken organic results —
      // sponsored items are simply ordered first, then organic results
      // follow in their normal match-score order.
      const as = a._sponsored ? 1 : 0;
      const bs = b._sponsored ? 1 : 0;
      if (as !== bs) return bs - as;
      const ms = matchScoreValue(b) - matchScoreValue(a);
      if (ms !== 0) return ms;
      if (hasOrigin) {
        const ad = a._distance;
        const bd = b._distance;
        if (ad == null && bd == null) {
        } else if (ad == null) {
          return 1;
        } else if (bd == null) {
          return -1;
        } else if (ad !== bd) {
          return ad - bd;
        }
      }
      const av = (a.verification_state || a.host?.verification_state) === 'verified' ? 0 : 1;
      const bv = (b.verification_state || b.host?.verification_state) === 'verified' ? 0 : 1;
      if (av !== bv) return av - bv;
      if (a._type === 'event' && b._type === 'event') {
        const now = Date.now();
        const at = a.start_time ? new Date(a.start_time).getTime() : null;
        const bt = b.start_time ? new Date(b.start_time).getTime() : null;
        const aRank = at != null && at >= now ? at : Infinity;
        const bRank = bt != null && bt >= now ? bt : Infinity;
        if (aRank !== bRank) return aRank - bRank;
      }
      const an = (a.display_name || a.name || a.title || '').toLowerCase();
      const bn = (b.display_name || b.name || b.title || '').toLowerCase();
      return an.localeCompare(bn);
    });
  }

  return results.slice(0, maxResults);
}