/**
 * Discovery Service — reusable Directory + Search layer.
 * ───────────────────────────────────────────────────────────
 * Reads the existing public profile projections:
 *   professionalProfilesPublic/{screenName}  (public-read, public fields only)
 *   businessProfilesPublic/{businessId}     (public-read, public fields only)
 *   calendarEventsPublic/{eventId}          (public-read, public fields only)
 *
 * These projections are maintained by the saveProfessionalProfile /
 * saveBusinessProfile / saveCalendarEvent Cloud Functions and only
 * contain docs when visibility=public AND lifecycle_state is listable,
 * so every doc in them is safe to show in the directory — including
 * to signed-out visitors.
 *
 * Directory and Search both consume this single layer:
 *   loadDirectory()   → fetch once
 *   filterResults()   → in-memory filter + deterministic rank
 *
 * No duplicate listing entities are created. Results reference the
 * existing public profile identity/business/event IDs and routes.
 *
 * Events are filtered by their own dimensions (Date, Format, Price,
 * Availability, Activity) and sorted by start time when 'date' sort
 * is selected.
 */

import { db } from '@/firebase/firebaseClient';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useFirebase } from '@/lib/backendConfig';
import { fromFirestoreDoc } from '@/data/firebase/mappers';
import { haversineMiles, getGeoCoords } from '@/lib/geo';
import { computeMatchScore, matchScoreValue } from '@/lib/matchScoring';
import { resolveDateRange, isEventInRange } from '@/lib/eventDateRanges';

const PROFESSIONAL_PUBLIC = 'professionalProfilesPublic';
const BUSINESS_PUBLIC = 'businessProfilesPublic';
const EVENTS_PUBLIC = 'calendarEventsPublic';

// ── Load all listable public profiles + events ────────────
export async function loadDirectory() {
  if (!useFirebase) return { professionals: [], businesses: [], events: [] };

  const [proSnap, bizSnap, evtSnap] = await Promise.all([
    getDocs(collection(db, PROFESSIONAL_PUBLIC)),
    getDocs(collection(db, BUSINESS_PUBLIC)),
    getDocs(collection(db, EVENTS_PUBLIC)),
  ]);

  return {
    professionals: proSnap.docs.map(fromFirestoreDoc),
    businesses: bizSnap.docs.map(fromFirestoreDoc),
    events: evtSnap.docs.map(fromFirestoreDoc),
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

// ── Event text match (title, description, host, services) ─
function matchesEventQuery(event, q) {
  const fields = [
    event.title, event.description, event.location_label,
    event.host?.display_name,
    ...(Array.isArray(event.services) ? event.services.map(s => s.label) : []),
  ].filter(Boolean);
  return fields.some(f => String(f).toLowerCase().includes(q));
}

// Map location_type (physical/online/hybrid) to format filter ids.
function eventFormatId(event) {
  if (event.location_type === 'online') return 'online';
  if (event.location_type === 'hybrid') return 'hybrid';
  return 'in-person';
}

// ── Filter + rank ───────────────────────────────────────────
// opts: { query, types, serviceIds, facilityIds, businessTypeIds, equipmentIds,
//        professionalTypeIds, specialismIds, sessionTypeIds,
//        verifiedOnly, locationText, sort, maxResults, origin, distance,
//        dateFilter, dateFrom, dateTo, formatIds, priceIds, availableOnly,
//        eventTypeIds }
//   types: null = all, or ['professional'] / ['business'] / ['event'] / any combo
export function filterResults(data, opts = {}) {
  const {
    query, types, serviceIds, facilityIds, businessTypeIds, equipmentIds,
    professionalTypeIds, specialismIds, sessionTypeIds,
    verifiedOnly, locationText, sort = 'recommended', maxResults = 100,
    origin, distance,
    // Event filters
    dateFilter, dateFrom, dateTo, formatIds, priceIds, availableOnly,
    eventTypeIds,
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

  // ── Events are filtered separately then merged ──
  // Events have their own filter dimensions (date, format, price,
  // availability, activity) that don't apply to profiles. They are
  // processed in isolation then appended to the results list so the
  // shared sort can interleave them.
  let events = [];
  if (wantEvt && Array.isArray(data.events)) {
    events = data.events
      .filter(e => e.visibility === 'public' && e.lifecycle_state !== 'cancelled')
      .map(e => ({ ...e, _type: 'event' }));

    // Date range filter
    if (dateFilter) {
      const range = resolveDateRange(dateFilter, dateFrom, dateTo);
      if (range) {
        events = events.filter(e => isEventInRange(e.start_time, range));
      }
    }

    // Format filter (in-person / online / hybrid)
    if (formatIds && formatIds.length > 0) {
      events = events.filter(e => formatIds.includes(eventFormatId(e)));
    }

    // Price filter (free / paid)
    if (priceIds && priceIds.length > 0) {
      events = events.filter(e =>
        priceIds.includes(e.is_free ? 'free' : 'paid')
      );
    }

    // Availability filter — spaces remaining > 0
    if (availableOnly) {
      events = events.filter(e =>
        e.availability_state === 'available' ||
        (typeof e.spaces_remaining === 'number' && e.spaces_remaining > 0)
      );
    }

    // Activity (services) ranked match for events — uses eventTypeIds
    // (separate from serviceIds so All-type searches don't cross-apply).
    if (eventTypeIds && eventTypeIds.length > 0) {
      events = events
        .map(e => {
          const _matchScore = computeMatchScore(e, { serviceIds: eventTypeIds });
          return { ...e, _matchScore };
        })
        .filter(e => e._matchScore.isEligible);
    }

    // Verified-only for events — check host verification
    if (verifiedOnly) {
      events = events.filter(e => e.host?.verification_state === 'verified');
    }

    // Location filter for events
    const hasOrigin = origin && origin.latitude != null && origin.longitude != null;
    const distanceActive = hasOrigin && distance && distance > 0;
    if (distanceActive) {
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

    // Free-text query for events
    if (query) {
      const q = query.toLowerCase().trim();
      if (q) events = events.filter(e => matchesEventQuery(e, q));
    }

    // Attach distance for events
    if (hasOrigin) {
      events = events.map(e => ({
        ...e,
        _distance: e.location_geo ? haversineMiles(origin, e.location_geo) : null,
      }));
    }
  }

  // Verified-only filter (profiles)
  if (verifiedOnly) {
    results = results.filter(r => r.verification_state === 'verified');
  }

  // Business type filter — strict (not ranked), business only.
  if (businessTypeIds && businessTypeIds.length > 0) {
    results = results.filter(r =>
      r._type === 'business' &&
      businessTypeIds.includes(r.business_type)
    );
  }

  // Professional type filter — strict (not ranked), professional only.
  if (professionalTypeIds && professionalTypeIds.length > 0) {
    results = results.filter(r =>
      r._type === 'professional' &&
      r.professional_type &&
      professionalTypeIds.includes(r.professional_type.id)
    );
  }

  // Ranked multi-select matching for Services, Facilities, Equipment.
  const hasStructuredFilters =
    (serviceIds && serviceIds.length > 0) ||
    (facilityIds && facilityIds.length > 0) ||
    (equipmentIds && equipmentIds.length > 0) ||
    (specialismIds && specialismIds.length > 0) ||
    (sessionTypeIds && sessionTypeIds.length > 0);

  if (hasStructuredFilters) {
    results = results
      .map(r => {
        const _matchScore = computeMatchScore(r, { serviceIds, facilityIds, equipmentIds, specialismIds, sessionTypeIds });
        return { ...r, _matchScore };
      })
      .filter(r => r._matchScore.isEligible);
  }

  // Location filter — distance-based when origin is resolved,
  // text-based fallback when no origin (geocoding failed or no input).
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

  // Free-text query (profiles)
  if (query) {
    const q = query.toLowerCase().trim();
    if (q) results = results.filter(r => matchesQuery(r, q));
  }

  // Attach calculated distance to each result for display + distance sort.
  if (hasOrigin) {
    results = results.map(r => {
      const coords = getGeoCoords(r);
      return { ...r, _distance: coords ? haversineMiles(origin, coords) : null };
    });
  }

  // Merge events into results
  results.push(...events);

  // Ranking — structured match quality influences each sort mode.
  if (sort === 'date') {
    // Soonest first. Events without start_time sort last.
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
  } else {
    // 'recommended' (default) or 'distance' without origin
    results.sort((a, b) => {
      const ms = matchScoreValue(b) - matchScoreValue(a);
      if (ms !== 0) return ms;
      const av = (a.verification_state || a.host?.verification_state) === 'verified' ? 0 : 1;
      const bv = (b.verification_state || b.host?.verification_state) === 'verified' ? 0 : 1;
      if (av !== bv) return av - bv;
      const an = (a.display_name || a.name || a.title || '').toLowerCase();
      const bn = (b.display_name || b.name || b.title || '').toLowerCase();
      return an.localeCompare(bn);
    });
  }

  return results.slice(0, maxResults);
}