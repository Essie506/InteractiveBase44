// Geographic utilities for Directory distance calculation.
// ───────────────────────────────────────────────────────────
// Haversine distance (miles) between two coordinate points.
// Origin geocoding uses the free OpenStreetMap Nominatim API
// (no API key required, rate-limited ~1 req/sec). For production
// scale, a server-side geocoding provider with an API key is
// recommended (Google Maps, Mapbox, or Geoapify — see report).
//
// Profile coordinates come from the public projection's
// location_geo field, which is derived server-side from the
// authoritative Location record. Privacy rules (cloud-functions/src/geo.ts):
//   Professional: only 'approximate' + 'public' — exact never exposed.
//   Business: 'approximate' + 'public', or 'exact' only for public
//     business premises (location_context === 'business').
//   city_only / region_only / online_only: never exposed.

const EARTH_RADIUS_MILES = 3958.8;

// Haversine great-circle distance in miles between two
// { latitude, longitude } points. Returns null if either point
// is missing coordinates.
export function haversineMiles(a, b) {
  if (!a || !b || a.latitude == null || a.longitude == null ||
      b.latitude == null || b.longitude == null) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

// Extract coordinates from a public projection's location_geo field.
// Returns { latitude, longitude } or null if not present.
export function getGeoCoords(profile) {
  const geo = profile?.location_geo;
  if (!geo || geo.latitude == null || geo.longitude == null) return null;
  return { latitude: geo.latitude, longitude: geo.longitude };
}

// Format a distance in miles for subtle display on result cards.
export function formatDistance(miles) {
  if (miles == null) return null;
  if (miles < 0.1) return 'Nearby';
  if (miles < 10) return `${miles.toFixed(1)} miles away`;
  return `${Math.round(miles)} miles away`;
}

// Resolve a place name to coordinates using OpenStreetMap Nominatim.
// Free, no API key, supports CORS. Rate-limited (~1 req/sec).
// Returns { latitude, longitude, label } or null if not found.
// Scoped to UK (countrycodes=gb) for the current Interactive market.
//
// TODO(PRODUCTION): Replace this client-side Nominatim call with a
// proper server-side geocoding / places provider (Google Maps, Mapbox,
// or Geoapify) before production scale. Nominatim is rate-limited and
// not suitable for high traffic. Do NOT introduce a Google API key /
// client dependency in the current development phase — this is a
// deferred production concern. The Directory architecture (typed
// location → geocodeOrigin → resolved lat/lng → Haversine filter)
// stays unchanged; only the provider behind geocodeOrigin swaps out.
export async function geocodeOrigin(query) {
  if (!query || !query.trim()) return null;
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    'q=' + encodeURIComponent(query) +
    '&format=json&limit=1&countrycodes=gb';
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const hit = data[0];
    return {
      latitude: parseFloat(hit.lat),
      longitude: parseFloat(hit.lon),
      label: hit.display_name || query,
    };
  } catch {
    return null;
  }
}