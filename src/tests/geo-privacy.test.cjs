// Tests for public-profile geo privacy derivation — mirrors cloud-functions/src/geo.ts
// Run with: node src/tests/geo-privacy.test.cjs
//
// Verifies that the public projection never leaks exact private coordinates,
// and that radius/distance sorting continue to work with public-safe geo.
//
// PRIVACY PRINCIPLE: precision_level (geographic accuracy) != public consent.
// A precision_level of 'exact' does NOT mean the user consented to publishing
// that exact coordinate in a world-readable public projection.

let passed = 0, failed = 0;
function assert(label, cond) {
  if (cond) { passed++; console.log('  \u2713 ' + label); }
  else { failed++; console.log('  \u2717 ' + label); }
}

// ── Derivation logic (mirrors cloud-functions/src/geo.ts) ──────────
// Professional: never exposes exact. Only 'approximate' + 'public'.
function deriveProfessionalPublicGeo(loc) {
  if (!loc) return null;
  if (loc.visibility !== 'public') return null;
  if (loc.precision_level !== 'approximate') return null;
  if (loc.latitude == null || loc.longitude == null) return null;
  if (isNaN(loc.latitude) || isNaN(loc.longitude)) return null;
  return { latitude: loc.latitude, longitude: loc.longitude };
}

// Business: 'approximate' + 'public', OR 'exact' + 'public' + business premises.
function deriveBusinessPublicGeo(loc) {
  if (!loc) return null;
  if (loc.visibility !== 'public') return null;
  const precision = loc.precision_level;
  if (loc.latitude == null || loc.longitude == null) return null;
  if (isNaN(loc.latitude) || isNaN(loc.longitude)) return null;
  if (precision === 'approximate') return { latitude: loc.latitude, longitude: loc.longitude };
  if (precision === 'exact' && loc.location_context === 'business')
    return { latitude: loc.latitude, longitude: loc.longitude };
  return null;
}

// ── Haversine + filter (mirrors src/lib/geo.js + discoveryService) ──
const EARTH_RADIUS_MILES = 3958.8;
function haversineMiles(a, b) {
  if (!a || !b || a.latitude == null || a.longitude == null ||
      b.latitude == null || b.longitude == null) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}
function getGeoCoords(profile) {
  const geo = profile?.location_geo;
  if (!geo || geo.latitude == null || geo.longitude == null) return null;
  return { latitude: geo.latitude, longitude: geo.longitude };
}
function filterResults(profiles, opts = {}) {
  const { sort = 'recommended', origin, distance } = opts;
  let results = [...profiles];
  const hasOrigin = origin && origin.latitude != null && origin.longitude != null;
  const distanceActive = hasOrigin && distance && distance > 0;
  if (distanceActive) {
    results = results.filter(r => {
      const coords = getGeoCoords(r);
      if (!coords) return false;
      const miles = haversineMiles(origin, coords);
      return miles != null && miles <= distance;
    });
  }
  if (hasOrigin) {
    results = results.map(r => {
      const coords = getGeoCoords(r);
      return { ...r, _distance: coords ? haversineMiles(origin, coords) : null };
    });
  }
  if (sort === 'distance' && hasOrigin) {
    results.sort((a, b) => {
      const ad = a._distance, bd = b._distance;
      if (ad == null && bd == null) return 0;
      if (ad == null) return 1;
      if (bd == null) return -1;
      return ad - bd;
    });
  }
  return results;
}

// ── Mock Location data ────────────────────────────────────────────
const LEEDS = { latitude: 53.7974, longitude: -1.5438 };

// Exact private home location (professional) — visibility=public, precision=exact
const proExactPublic = {
  visibility: 'public', precision_level: 'exact', location_context: 'profile',
  latitude: 53.6467, longitude: -1.7822,
};
// Exact private location — visibility=private
const proExactPrivate = {
  visibility: 'private', precision_level: 'exact', location_context: 'profile',
  latitude: 53.6467, longitude: -1.7822,
};
// Approximate public-safe location (professional service area)
const proApproxPublic = {
  visibility: 'public', precision_level: 'approximate', location_context: 'professional_service',
  latitude: 53.6467, longitude: -1.7822,
};
// Business premises — exact, public, location_context=business
const bizPublicPremises = {
  visibility: 'public', precision_level: 'exact', location_context: 'business',
  latitude: 53.7974, longitude: -1.5438,
};
// Business owner's home — exact, public, but location_context=profile
const bizOwnerHome = {
  visibility: 'public', precision_level: 'exact', location_context: 'profile',
  latitude: 53.7974, longitude: -1.5438,
};
// Business approximate location
const bizApprox = {
  visibility: 'public', precision_level: 'approximate', location_context: 'business',
  latitude: 53.7974, longitude: -1.5438,
};
// city_only with stored exact coords (device-captured)
const cityOnlyWithCoords = {
  visibility: 'public', precision_level: 'city_only', location_context: 'profile',
  city: 'Huddersfield', latitude: 53.6467, longitude: -1.7822,
};
// region_only with stored exact coords
const regionOnlyWithCoords = {
  visibility: 'public', precision_level: 'region_only', location_context: 'profile',
  region: 'West Yorkshire', latitude: 53.6467, longitude: -1.7822,
};
// online_only
const onlineOnly = {
  visibility: 'public', precision_level: 'online_only', location_context: 'profile',
  is_online_only: true, latitude: null, longitude: null,
};

// ── Tests ──────────────────────────────────────────────────────────

console.log('\n1. Professional exact/private coordinate never copied to public projection');
{
  const geo = deriveProfessionalPublicGeo(proExactPublic);
  assert('Exact + public + profile context -> null (not exposed)', geo === null);
}
{
  const geo = deriveProfessionalPublicGeo(proExactPrivate);
  assert('Exact + private visibility -> null', geo === null);
}

console.log('\n2. Professional approximate/public-safe coordinate can be projected');
{
  const geo = deriveProfessionalPublicGeo(proApproxPublic);
  assert('Approximate + public -> coordinates returned', geo !== null);
  assert('Latitude matches', geo.latitude === 53.6467);
  assert('Longitude matches', geo.longitude === -1.7822);
}

console.log('\n3. Public Business premises can project suitable geo');
{
  const geo = deriveBusinessPublicGeo(bizPublicPremises);
  assert('Exact + public + business context -> coordinates', geo !== null);
  assert('Latitude matches', geo.latitude === 53.7974);
}

console.log('\n4. Non-public Business location does not expose exact geo');
{
  const geo = deriveBusinessPublicGeo(bizOwnerHome);
  assert('Exact + public + profile context (owner home) -> null', geo === null);
}
{
  const locPrivate = { ...bizPublicPremises, visibility: 'private' };
  const geo = deriveBusinessPublicGeo(locPrivate);
  assert('Exact + private visibility -> null', geo === null);
}

console.log('\n5. city_only does not leak underlying exact coordinate');
{
  assert('Professional city_only -> null', deriveProfessionalPublicGeo(cityOnlyWithCoords) === null);
  assert('Business city_only -> null', deriveBusinessPublicGeo(cityOnlyWithCoords) === null);
}

console.log('\n6. region_only does not leak underlying exact coordinate');
{
  assert('Professional region_only -> null', deriveProfessionalPublicGeo(regionOnlyWithCoords) === null);
  assert('Business region_only -> null', deriveBusinessPublicGeo(regionOnlyWithCoords) === null);
}

console.log('\n7. online_only has no geo');
{
  assert('Professional online_only -> null', deriveProfessionalPublicGeo(onlineOnly) === null);
  assert('Business online_only -> null', deriveBusinessPublicGeo(onlineOnly) === null);
}

console.log('\n8. Business approximate location projects geo');
{
  const geo = deriveBusinessPublicGeo(bizApprox);
  assert('Approximate + public + business -> coordinates', geo !== null);
}

console.log('\n9. Radius and distance sorting work with public-safe geo');
{
  // Simulate public projections with location_geo from public-safe derivations
  const profiles = [
    { name: 'Pro A', type: 'professional', location_geo: deriveProfessionalPublicGeo(proApproxPublic) },
    { name: 'Biz B', type: 'business', location_geo: deriveBusinessPublicGeo(bizApprox) },
    { name: 'Pro C', type: 'professional', location_geo: deriveProfessionalPublicGeo(proExactPublic) },
    { name: 'Biz D', type: 'business', location_geo: deriveBusinessPublicGeo(bizOwnerHome) },
  ];

  // 15-mile radius from Leeds
  const r15 = filterResults(profiles, { origin: LEEDS, distance: 15, sort: 'distance' });
  assert('15-mile radius: Pro A (Huddersfield ~14mi) included', r15.some(r => r.name === 'Pro A'));
  assert('15-mile radius: Biz B (Leeds 0mi) included', r15.some(r => r.name === 'Biz B'));
  assert('15-mile radius: Pro C (exact, no geo) excluded', !r15.some(r => r.name === 'Pro C'));
  assert('15-mile radius: Biz D (owner home, no geo) excluded', !r15.some(r => r.name === 'Biz D'));
  assert('15-mile radius: exactly 2 results', r15.length === 2);

  // Distance sort (no radius filter)
  const rSorted = filterResults(profiles, { origin: LEEDS, sort: 'distance' });
  assert('Distance sort: Biz B (0mi) first', rSorted[0].name === 'Biz B');
  assert('Distance sort: Pro A (~14mi) second', rSorted[1].name === 'Pro A');
  const lastTwo = rSorted.slice(-2).map(r => r.name);
  assert('Distance sort: Pro C and Biz D (no geo) at end',
    lastTwo.includes('Pro C') && lastTwo.includes('Biz D'));
}

console.log('\n10. Professional fetch prefers service area over primary location');
{
  // Simulates fetchProfessionalPublicGeo: tries service area first, then location
  const geo = deriveProfessionalPublicGeo(proApproxPublic) || deriveProfessionalPublicGeo(proExactPublic);
  assert('Service area (approx) preferred over primary (exact)', geo !== null);
  assert('Uses service area coordinates', geo.latitude === 53.6467);
}
{
  // No service area, primary is exact -> null
  const geo = deriveProfessionalPublicGeo(null) || deriveProfessionalPublicGeo(proExactPublic);
  assert('No service area + exact primary -> null', geo === null);
}

console.log('\n11. No private fields exposed in location_geo');
{
  const geo = deriveProfessionalPublicGeo(proApproxPublic);
  assert('location_geo has only latitude/longitude', geo && Object.keys(geo).length === 2);
  assert('No address_line1 in geo', !('address_line1' in geo));
  assert('No postal_code in geo', !('postal_code' in geo));
}

console.log('\n12. visibility != public blocks all geo exposure');
{
  const approxPrivate = { ...proApproxPublic, visibility: 'connections' };
  assert('Professional approximate + connections -> null', deriveProfessionalPublicGeo(approxPrivate) === null);
  const bizPremisesPrivate = { ...bizPublicPremises, visibility: 'connections' };
  assert('Business premises + connections -> null', deriveBusinessPublicGeo(bizPremisesPrivate) === null);
}

// ── Summary ────────────────────────────────────────────────────────
console.log('\n-----------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);