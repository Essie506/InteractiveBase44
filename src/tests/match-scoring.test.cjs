/**
 * Match Scoring Tests — validates ranked multi-select matching for
 * Directory filters (Services, Facilities, Equipment).
 *
 * Tests prove:
 *   - all-selected match ranks above partial match
 *   - 2/3 ranks above 1/3
 *   - zero-match result is excluded for an active dimension
 *   - Services ranked matching works
 *   - Facilities ranked matching works
 *   - Equipment ranked matching works
 *   - multiple dimensions combine predictably
 *   - single selections behave normally
 *   - no active selections do not affect ranking
 *   - Recommended remains deterministic
 *   - Verified sort still behaves correctly
 *   - Distance sort still behaves correctly
 */

const assert = require('assert');

// ── Import the scoring functions (ESM source via require with loader) ──
// We replicate the pure logic here for .cjs test compatibility, matching
// src/lib/matchScoring.js exactly. This mirrors the pattern used in
// distance-logic.test.cjs.

function countMatches(profileItems, selectedIds) {
  if (!selectedIds || selectedIds.length === 0) return 0;
  if (!Array.isArray(profileItems)) return 0;
  const idSet = new Set(selectedIds);
  return profileItems.filter(item => item && item.id && idSet.has(item.id)).length;
}

function computeDimensionScore(profileItems, selectedIds) {
  if (!selectedIds || selectedIds.length === 0) return null;
  const matched = countMatches(profileItems, selectedIds);
  const selected = selectedIds.length;
  return { matched_count: matched, selected_count: selected, match_ratio: matched / selected };
}

function computeMatchScore(profile, { serviceIds, facilityIds, equipmentIds } = {}) {
  const dimensions = {};
  const activeRatios = [];

  const services = computeDimensionScore(profile?.services, serviceIds);
  if (services) { dimensions.services = services; activeRatios.push(services.match_ratio); }

  const facilities = computeDimensionScore(profile?.facilities, facilityIds);
  if (facilities) { dimensions.facilities = facilities; activeRatios.push(facilities.match_ratio); }

  const equipment = computeDimensionScore(profile?.equipment, equipmentIds);
  if (equipment) { dimensions.equipment = equipment; activeRatios.push(equipment.match_ratio); }

  const activeCount = activeRatios.length;
  const totalScore = activeCount > 0
    ? activeRatios.reduce((a, b) => a + b, 0) / activeCount
    : 0;
  const isEligible = activeCount === 0 || activeRatios.every(r => r > 0);

  let matchedTotal = 0;
  let selectedTotal = 0;
  for (const dim of Object.values(dimensions)) {
    matchedTotal += dim.matched_count;
    selectedTotal += dim.selected_count;
  }

  return { totalScore, dimensions, isEligible, matchedTotal, selectedTotal, activeCount };
}

function matchScoreValue(r) {
  return r?._matchScore?.totalScore ?? 0;
}

// ── Sort comparators (mirror discoveryService.js) ──

function sortRecommended(a, b) {
  const ms = matchScoreValue(b) - matchScoreValue(a);
  if (ms !== 0) return ms;
  const av = a.verification_state === 'verified' ? 0 : 1;
  const bv = b.verification_state === 'verified' ? 0 : 1;
  if (av !== bv) return av - bv;
  return (a.display_name || a.name || '').toLowerCase()
    .localeCompare((b.display_name || b.name || '').toLowerCase());
}

function sortVerified(a, b) {
  const av = a.verification_state === 'verified' ? 0 : 1;
  const bv = b.verification_state === 'verified' ? 0 : 1;
  if (av !== bv) return av - bv;
  const ms = matchScoreValue(b) - matchScoreValue(a);
  if (ms !== 0) return ms;
  return new Date(b._updated_date || 0).getTime() - new Date(a._updated_date || 0).getTime();
}

function sortDistance(a, b) {
  const ad = a._distance;
  const bd = b._distance;
  if (ad == null && bd == null) return 0;
  if (ad == null) return 1;
  if (bd == null) return -1;
  if (ad !== bd) return ad - bd;
  return matchScoreValue(b) - matchScoreValue(a);
}

// ── Test helpers ──

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

function makeBusiness(name, opts = {}) {
  return {
    _type: 'business',
    name,
    display_name: name,
    verification_state: opts.verified ? 'verified' : 'not_verified',
    services: opts.services || [],
    facilities: opts.facilities || [],
    equipment: opts.equipment || [],
    _updated_date: opts.updated || '2024-01-01T00:00:00Z',
    _distance: opts.distance ?? null,
  };
}

function ids(items) {
  return items.map(i => ({ id: i, label: i }));
}

// ── Tests ──

console.log('\nMatch Scoring Tests\n');

// 1. all-selected match ranks above partial match
test('all-selected match ranks above partial match', () => {
  const equipmentFilter = ['squat-rack', 'belt-squat', 'skierg'];
  const full = makeBusiness('Full Gym', { equipment: ids(equipmentFilter) });
  const partial = makeBusiness('Partial Gym', { equipment: ids(['squat-rack', 'belt-squat']) });

  const fullScore = computeMatchScore(full, { equipmentIds: equipmentFilter });
  const partialScore = computeMatchScore(partial, { equipmentIds: equipmentFilter });

  assert.strictEqual(fullScore.totalScore, 1.0, 'full match should be 1.0');
  assert.ok(partialScore.totalScore < fullScore.totalScore, 'partial should be lower');
  assert.ok(fullScore.isEligible, 'full should be eligible');
  assert.ok(partialScore.isEligible, 'partial should be eligible (2/3 > 0)');

  const results = [
    { ...partial, _matchScore: partialScore },
    { ...full, _matchScore: fullScore },
  ].sort(sortRecommended);
  assert.strictEqual(results[0].name, 'Full Gym', 'full match should rank first');
});

// 2. 2/3 ranks above 1/3
test('2/3 ranks above 1/3', () => {
  const filter = ['squat-rack', 'belt-squat', 'skierg'];
  const twoThirds = makeBusiness('Two Thirds', { equipment: ids(['squat-rack', 'belt-squat']) });
  const oneThird = makeBusiness('One Third', { equipment: ids(['squat-rack']) });

  const s2 = computeMatchScore(twoThirds, { equipmentIds: filter });
  const s1 = computeMatchScore(oneThird, { equipmentIds: filter });

  assert.ok(s2.totalScore > s1.totalScore, '2/3 should score higher than 1/3');
  assert.ok(Math.abs(s2.totalScore - 0.6667) < 0.001, '2/3 ≈ 0.67');
  assert.ok(Math.abs(s1.totalScore - 0.3333) < 0.001, '1/3 ≈ 0.33');

  const results = [
    { ...oneThird, _matchScore: s1 },
    { ...twoThirds, _matchScore: s2 },
  ].sort(sortRecommended);
  assert.strictEqual(results[0].name, 'Two Thirds');
});

// 3. zero-match result is excluded for an active dimension
test('zero-match result is excluded for an active dimension', () => {
  const filter = ['squat-rack', 'belt-squat'];
  const noMatch = makeBusiness('No Equipment', { equipment: ids(['treadmill', 'bike']) });

  const score = computeMatchScore(noMatch, { equipmentIds: filter });
  assert.strictEqual(score.totalScore, 0, 'zero match = score 0');
  assert.strictEqual(score.isEligible, false, 'should not be eligible');
  assert.strictEqual(score.dimensions.equipment.matched_count, 0);
});

// 4. Services ranked matching works
test('Services ranked matching works', () => {
  const filter = ['personal-training', 'sports-massage'];
  const full = makeBusiness('Full Services', { services: ids(filter) });
  const partial = makeBusiness('Partial Services', { services: ids(['personal-training']) });
  const none = makeBusiness('No Services', { services: ids(['yoga']) });

  const sFull = computeMatchScore(full, { serviceIds: filter });
  const sPartial = computeMatchScore(partial, { serviceIds: filter });
  const sNone = computeMatchScore(none, { serviceIds: filter });

  assert.ok(sFull.totalScore > sPartial.totalScore, 'full > partial');
  assert.strictEqual(sNone.isEligible, false, 'none excluded');
  assert.ok(sFull.isEligible && sPartial.isEligible, 'full and partial eligible');
});

// 5. Facilities ranked matching works
test('Facilities ranked matching works', () => {
  const filter = ['sauna', 'pool'];
  const full = makeBusiness('Full Facilities', { facilities: ids(filter) });
  const partial = makeBusiness('Partial Facilities', { facilities: ids(['sauna']) });
  const none = makeBusiness('No Facilities', { facilities: ids(['parking']) });

  const sFull = computeMatchScore(full, { facilityIds: filter });
  const sPartial = computeMatchScore(partial, { facilityIds: filter });
  const sNone = computeMatchScore(none, { facilityIds: filter });

  assert.ok(sFull.totalScore > sPartial.totalScore, 'full > partial');
  assert.strictEqual(sNone.isEligible, false, 'none excluded');
});

// 6. Equipment ranked matching works
test('Equipment ranked matching works', () => {
  const filter = ['squat-rack', 'bench-press', 'treadmill'];
  const full = makeBusiness('Full Equipment', { equipment: ids(filter) });
  const partial = makeBusiness('Partial Equipment', { equipment: ids(['squat-rack', 'bench-press']) });
  const none = makeBusiness('No Equipment', { equipment: ids(['skierg']) });

  const sFull = computeMatchScore(full, { equipmentIds: filter });
  const sPartial = computeMatchScore(partial, { equipmentIds: filter });
  const sNone = computeMatchScore(none, { equipmentIds: filter });

  assert.ok(sFull.totalScore > sPartial.totalScore, 'full > partial');
  assert.strictEqual(sNone.isEligible, false, 'none excluded');
});

// 7. multiple dimensions combine predictably
test('multiple dimensions combine predictably', () => {
  const opts = {
    serviceIds: ['personal-training', 'sports-massage'],
    facilityIds: ['sauna', 'pool'],
    equipmentIds: ['squat-rack', 'skierg'],
  };

  const allMatch = makeBusiness('All Match', {
    services: ids(opts.serviceIds),
    facilities: ids(opts.facilityIds),
    equipment: ids(opts.equipmentIds),
  });
  const twoOfThree = makeBusiness('Two of Three', {
    services: ids(opts.serviceIds),
    facilities: ids(opts.facilityIds),
    equipment: ids(['squat-rack']), // 1/2 equipment
  });
  const oneOfThree = makeBusiness('One of Three', {
    services: ids(['personal-training']), // 1/2
    facilities: ids(['sauna']), // 1/2
    equipment: ids(['squat-rack']), // 1/2
  });

  const sAll = computeMatchScore(allMatch, opts);
  const sTwo = computeMatchScore(twoOfThree, opts);
  const sOne = computeMatchScore(oneOfThree, opts);

  assert.ok(sAll.totalScore > sTwo.totalScore, 'all > two');
  assert.ok(sTwo.totalScore > sOne.totalScore, 'two > one');
  assert.ok(sAll.isEligible && sTwo.isEligible && sOne.isEligible, 'all eligible');

  const results = [
    { ...oneOfThree, _matchScore: sOne },
    { ...twoOfThree, _matchScore: sTwo },
    { ...allMatch, _matchScore: sAll },
  ].sort(sortRecommended);
  assert.strictEqual(results[0].name, 'All Match');
  assert.strictEqual(results[1].name, 'Two of Three');
  assert.strictEqual(results[2].name, 'One of Three');
});

// 7b. a dimension failure excludes even if other dimensions are strong
test('dimension failure excludes despite strong other dimensions', () => {
  const opts = {
    serviceIds: ['personal-training', 'sports-massage'],
    facilityIds: ['sauna', 'pool'],
    equipmentIds: ['squat-rack', 'skierg'],
  };

  const strongButExcluded = makeBusiness('Strong But Excluded', {
    services: ids(opts.serviceIds),       // 2/2 = 1.0
    facilities: ids(opts.facilityIds),    // 2/2 = 1.0
    equipment: ids(['treadmill']),        // 0/2 = 0.0 → excluded
  });

  const score = computeMatchScore(strongButExcluded, opts);
  assert.strictEqual(score.isEligible, false, 'should be excluded');
  assert.strictEqual(score.dimensions.equipment.match_ratio, 0);
});

// 8. single selections behave normally
test('single selections behave normally', () => {
  const filter = ['squat-rack'];
  const match = makeBusiness('Has Squat Rack', { equipment: ids(['squat-rack']) });
  const noMatch = makeBusiness('No Squat Rack', { equipment: ids(['treadmill']) });

  const sMatch = computeMatchScore(match, { equipmentIds: filter });
  const sNoMatch = computeMatchScore(noMatch, { equipmentIds: filter });

  assert.strictEqual(sMatch.totalScore, 1.0, 'single match = 1.0');
  assert.strictEqual(sNoMatch.totalScore, 0, 'single no-match = 0');
  assert.ok(sMatch.isEligible, 'match eligible');
  assert.strictEqual(sNoMatch.isEligible, false, 'no-match excluded');
});

// 9. no active selections do not affect ranking
test('no active selections do not affect ranking', () => {
  const a = makeBusiness('Alpha', { verified: true });
  const b = makeBusiness('Beta', { verified: false });

  const sA = computeMatchScore(a, {});
  const sB = computeMatchScore(b, {});

  assert.strictEqual(sA.totalScore, 0, 'no filters = score 0');
  assert.strictEqual(sB.totalScore, 0, 'no filters = score 0');
  assert.ok(sA.isEligible && sB.isEligible, 'all eligible with no filters');
  assert.strictEqual(sA.activeCount, 0, 'no active dimensions');

  // Recommended sort falls back to verified + alphabetical
  const results = [{ ...b, _matchScore: sB }, { ...a, _matchScore: sA }].sort(sortRecommended);
  assert.strictEqual(results[0].name, 'Alpha', 'verified first');
});

// 10. Recommended remains deterministic
test('Recommended remains deterministic', () => {
  const filter = ['squat-rack', 'belt-squat'];
  const a = makeBusiness('Alpha Gym', { equipment: ids(filter), verified: true });
  const b = makeBusiness('Beta Gym', { equipment: ids(filter), verified: true });
  const c = makeBusiness('Gamma Gym', { equipment: ids(['squat-rack']), verified: true });

  const sA = computeMatchScore(a, { equipmentIds: filter });
  const sB = computeMatchScore(b, { equipmentIds: filter });
  const sC = computeMatchScore(c, { equipmentIds: filter });

  // A and B have same score + same verified → alphabetical tie-break
  const r1 = [
    { ...a, _matchScore: sA },
    { ...b, _matchScore: sB },
    { ...c, _matchScore: sC },
  ].sort(sortRecommended);
  const r2 = [
    { ...b, _matchScore: sB },
    { ...a, _matchScore: sA },
    { ...c, _matchScore: sC },
  ].sort(sortRecommended);

  assert.deepStrictEqual(r1.map(r => r.name), r2.map(r => r.name), 'same result regardless of input order');
  assert.strictEqual(r1[0].name, 'Alpha Gym', 'alphabetical tie-break');
  assert.strictEqual(r1[1].name, 'Beta Gym');
  assert.strictEqual(r1[2].name, 'Gamma Gym', 'lower match score sorts last');
});

// 11. Verified sort still behaves correctly
test('Verified sort still behaves correctly', () => {
  const filter = ['squat-rack', 'belt-squat'];
  const verifiedPartial = makeBusiness('Verified Partial', {
    equipment: ids(['squat-rack']),
    verified: true,
    updated: '2024-01-01T00:00:00Z',
  });
  const verifiedFull = makeBusiness('Verified Full', {
    equipment: ids(filter),
    verified: true,
    updated: '2024-01-01T00:00:00Z',
  });
  const unverifiedFull = makeBusiness('Unverified Full', {
    equipment: ids(filter),
    verified: false,
    updated: '2024-06-01T00:00:00Z',
  });

  const sVP = computeMatchScore(verifiedPartial, { equipmentIds: filter });
  const sVF = computeMatchScore(verifiedFull, { equipmentIds: filter });
  const sUF = computeMatchScore(unverifiedFull, { equipmentIds: filter });

  const results = [
    { ...unverifiedFull, _matchScore: sUF },
    { ...verifiedPartial, _matchScore: sVP },
    { ...verifiedFull, _matchScore: sVF },
  ].sort(sortVerified);

  // Verified first (both verified), then within verified: match score
  assert.strictEqual(results[0].name, 'Verified Full', 'verified + full match first');
  assert.strictEqual(results[1].name, 'Verified Partial', 'verified + partial second');
  assert.strictEqual(results[2].name, 'Unverified Full', 'unverified last despite full match');
});

// 12. Distance sort still behaves correctly
test('Distance sort still behaves correctly', () => {
  const filter = ['squat-rack', 'belt-squat'];
  const near = makeBusiness('Near', { equipment: ids(['squat-rack']), distance: 1 });
  const far = makeBusiness('Far', { equipment: ids(filter), distance: 10 });

  const sNear = computeMatchScore(near, { equipmentIds: filter });
  const sFar = computeMatchScore(far, { equipmentIds: filter });

  // Both eligible (each has at least 1 match)
  assert.ok(sNear.isEligible && sFar.isEligible);

  const results = [
    { ...far, _matchScore: sFar },
    { ...near, _matchScore: sNear },
  ].sort(sortDistance);

  assert.strictEqual(results[0].name, 'Near', 'nearest first despite lower match score');
  assert.strictEqual(results[1].name, 'Far');
});

// 12b. Distance sort uses match score as tie-breaker for equal distances
test('Distance sort uses match score as tie-breaker for equal distances', () => {
  const filter = ['squat-rack', 'belt-squat'];
  const nearFull = makeBusiness('Near Full', { equipment: ids(filter), distance: 5 });
  const nearPartial = makeBusiness('Near Partial', { equipment: ids(['squat-rack']), distance: 5 });

  const sFull = computeMatchScore(nearFull, { equipmentIds: filter });
  const sPartial = computeMatchScore(nearPartial, { equipmentIds: filter });

  const results = [
    { ...nearPartial, _matchScore: sPartial },
    { ...nearFull, _matchScore: sFull },
  ].sort(sortDistance);

  assert.strictEqual(results[0].name, 'Near Full', 'equal distance → higher match score first');
});

// 13. Professionals excluded when business-only filters are active
test('professionals excluded when business-only filters are active', () => {
  const facilityFilter = ['sauna', 'pool'];
  const pro = {
    _type: 'professional',
    display_name: 'Trainer Joe',
    services: ids(['personal-training']),
    // no facilities array
  };

  const score = computeMatchScore(pro, { facilityIds: facilityFilter });
  assert.strictEqual(score.isEligible, false, 'professional excluded from facility filter');
  assert.strictEqual(score.dimensions.facilities.match_ratio, 0);
});

// 14. matchRatio values are exact
test('matchRatio values are exact', () => {
  const filter = ['a', 'b', 'c'];
  const score = computeMatchScore(
    { services: ids(['a', 'b']) },
    { serviceIds: filter }
  );
  assert.strictEqual(score.dimensions.services.matched_count, 2);
  assert.strictEqual(score.dimensions.services.selected_count, 3);
  assert.ok(Math.abs(score.dimensions.services.match_ratio - 0.6667) < 0.001);
  assert.ok(Math.abs(score.totalScore - 0.6667) < 0.001);
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);