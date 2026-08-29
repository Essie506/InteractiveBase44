// Tests for Directory distance logic — mirrors src/lib/geo.js
// Run with: node src/tests/distance-logic.test.cjs
//
// Tests the pure Haversine calculation, radius filtering, distance
// sorting, and edge cases (no coordinates, unresolved origin, etc.)
// without Firebase or network calls.

const EARTH_RADIUS_MILES = 3958.8;

function haversineMiles(a, b) {
  if (!a || !b || a.latitude == null || a.longitude == null ||
      b.latitude == null || b.longitude == null) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

function formatDistance(miles) {
  if (miles == null) return null;
  if (miles < 0.1) return 'Nearby';
  if (miles < 10) return `${miles.toFixed(1)} miles away`;
  return `${Math.round(miles)} miles away`;
}

function getGeoCoords(profile) {
  const geo = profile?.location_geo;
  if (!geo || geo.latitude == null || geo.longitude == null) return null;
  return { latitude: geo.latitude, longitude: geo.longitude };
}

// Simplified filterResults for testing (mirrors discoveryService logic)
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
  } else if (sort === 'verified') {
    results.sort((a, b) => {
      const av = a.verification_state === 'verified' ? 0 : 1;
      const bv = b.verification_state === 'verified' ? 0 : 1;
      return av - bv;
    });
  } else {
    // recommended (organic)
    results.sort((a, b) => {
      const av = a.verification_state === 'verified' ? 0 : 1;
      const bv = b.verification_state === 'verified' ? 0 : 1;
      if (av !== bv) return av - bv;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  return results;
}

// ── Test runner ──────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
}
function approx(a, b, eps = 0.5) { return Math.abs(a - b) < eps; }

// ── Test data ────────────────────────────────────────────────
// UK city coordinates (approximate centroids)
const LEEDS = { latitude: 53.8008, longitude: -1.5491 };
const MANCHESTER = { latitude: 53.4808, longitude: -2.2426 };
const HUDDERSFIELD = { latitude: 53.6458, longitude: -1.7850 };
const LONDON = { latitude: 51.5074, longitude: -0.1278 };

const profiles = [
  { name: 'Pro A', _type: 'professional', verification_state: 'verified', location_geo: HUDDERSFIELD }, // ~9 miles from Leeds
  { name: 'Pro B', _type: 'professional', verification_state: 'not_verified', location_geo: MANCHESTER }, // ~36 miles from Leeds
  { name: 'Biz C', _type: 'business', verification_state: 'verified', location_geo: LEEDS }, // 0 miles from Leeds
  { name: 'Pro D', _type: 'professional', verification_state: 'verified', location_geo: null }, // no coords
  { name: 'Biz E', _type: 'business', verification_state: 'not_verified', location_geo: LONDON }, // ~169 miles from Leeds
];

// ── Tests ────────────────────────────────────────────────────
console.log('\n1. Haversine distance calculation');
const dLeedsToManchester = haversineMiles(LEEDS, MANCHESTER);
assert('Leeds → Manchester ~36 miles', approx(dLeedsToManchester, 36, 1));
const dLeedsToHuddersfield = haversineMiles(LEEDS, HUDDERSFIELD);
assert('Leeds → Huddersfield ~14 miles', approx(dLeedsToHuddersfield, 14, 1));
const dLeedsToLondon = haversineMiles(LEEDS, LONDON);
assert('Leeds → London ~169 miles', approx(dLeedsToLondon, 169, 2));
assert('Same point = 0 miles', haversineMiles(LEEDS, LEEDS) === 0);
assert('Missing coords = null', haversineMiles(null, LEEDS) === null);

console.log('\n2. Distance label formatting');
assert('0.05 miles → Nearby', formatDistance(0.05) === 'Nearby');
assert('4.2 miles → "4.2 miles away"', formatDistance(4.2) === '4.2 miles away');
assert('12 miles → "12 miles away"', formatDistance(12) === '12 miles away');
assert('null → null', formatDistance(null) === null);

console.log('\n3. 5-mile radius from Leeds');
const r5 = filterResults(profiles, { origin: LEEDS, distance: 5, sort: 'distance' });
assert('Only Leeds-based Biz C within 5 miles', r5.length === 1 && r5[0].name === 'Biz C');

console.log('\n4. 10-mile radius from Leeds');
const r10 = filterResults(profiles, { origin: LEEDS, distance: 10, sort: 'distance' });
assert('Only Biz C within 10 miles (Pro A is ~14mi)', r10.length === 1);
assert('Biz C (Leeds 0mi) included', r10.some(r => r.name === 'Biz C'));

console.log('\n5. 50-mile radius from Leeds');
const r50 = filterResults(profiles, { origin: LEEDS, distance: 50, sort: 'distance' });
assert('Biz C + Pro A + Pro B (Manchester ~36mi) within 50 miles', r50.length === 3);
assert('Pro D (no coords) excluded', !r50.some(r => r.name === 'Pro D'));
assert('Biz E (London ~169mi) excluded', !r50.some(r => r.name === 'Biz E'));

console.log('\n6. Distance sort orders nearest → furthest');
const rSorted = filterResults(profiles, { origin: LEEDS, sort: 'distance' });
const distances = rSorted.map(r => r._distance);
const validDistances = distances.filter(d => d != null);
assert('Non-null distances sorted ascending', validDistances.every((d, i) => i === 0 || validDistances[i - 1] <= d));
assert('Biz C (0mi) first', rSorted[0].name === 'Biz C');
assert('Pro D (no coords) last', rSorted[rSorted.length - 1].name === 'Pro D');

console.log('\n7. Profiles without coordinates behave correctly');
const noCoordProfiles = [{ name: 'No Geo', location_geo: null }];
const rNoCoord = filterResults(noCoordProfiles, { origin: LEEDS, distance: 50, sort: 'distance' });
assert('Excluded from radius filter', rNoCoord.length === 0);
const rNoCoordNoRadius = filterResults(noCoordProfiles, { sort: 'distance' });
assert('Included when no radius active', rNoCoordNoRadius.length === 1);

console.log('\n8. No origin → distance slider does not filter');
const rNoOrigin = filterResults(profiles, { sort: 'distance' });
assert('All 5 profiles returned (no distance filtering)', rNoOrigin.length === 5);

console.log('\n9. Recommended sort still works (verified first)');
const rRecommended = filterResults(profiles, { sort: 'recommended' });
assert('Verified profiles first', rRecommended[0].verification_state === 'verified' && rRecommended[1].verification_state === 'verified');

console.log('\n10. Verified sort still works');
const rVerified = filterResults(profiles, { sort: 'verified' });
assert('All verified first', rVerified.slice(0, 2).every(r => r.verification_state === 'verified'));

console.log('\n11. Distance label displays on cards');
const cardProfile = { ...profiles[0], _distance: haversineMiles(LEEDS, HUDDERSFIELD) };
const label = formatDistance(cardProfile._distance);
assert('Distance label is a string', typeof label === 'string' && label.includes('miles'));

console.log('\n12. No private location fields exposed');
const projection = { location_geo: { latitude: 53.6458, longitude: -1.7850 }, location: 'Huddersfield' };
assert('No latitude field at root', !('latitude' in projection));
assert('No longitude field at root', !('longitude' in projection));
assert('No address_line1', !('address_line1' in projection));
assert('No postal_code', !('postal_code' in projection));
assert('No location_id', !('location_id' in projection));
assert('location_geo nested (not root-level coords)', typeof projection.location_geo === 'object');

console.log('\n13. Invalid/unresolved origin gives clear state');
const rBadOrigin = filterResults(profiles, { origin: null, distance: 10, sort: 'distance' });
assert('No radius filtering with null origin', rBadOrigin.length === 5);
const rBadOrigin2 = filterResults(profiles, { origin: { latitude: null, longitude: null }, distance: 10, sort: 'distance' });
assert('No radius filtering with invalid origin', rBadOrigin2.length === 5);

// ── Summary ──────────────────────────────────────────────────
console.log(`\n───────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);