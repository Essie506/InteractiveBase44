/**
 * Projection Repair Tests
 * ───────────────────────────────────────────────────────────
 * Simulates the extended backfillProfiles flow for Professional
 * public projections, verifying the canonical contract:
 *   professionalProfilesPublic/{normalizedScreenName}
 *
 * Covers:
 *   - eligible Professional projects to doc ID = normalized screen_name
 *   - old entity-ID projection for same identity is removed
 *   - screen_name change removes old and creates new canonical
 *   - connections/private Professional has no public projection
 *   - inactive Professional has no public projection
 *   - only the target identity's projections are affected
 *   - Business projection behaviour remains unchanged
 *
 * Usage: node tests/projection-repair.test.cjs
 */

const assert = require('assert');

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    results.push({ name, passed: false, error: err.message });
    console.log(`[FAIL] ${name} — ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════
// ELIGIBILITY (replicated from projectionEligibility.ts)
// ═══════════════════════════════════════════════════════════

function isProfessionalListable(data, screenName) {
  return data?.visibility === 'public'
    && data?.lifecycle_state === 'active'
    && !!screenName;
}

// ═══════════════════════════════════════════════════════════
// MOCK FIRESTORE + BACKFILL SIMULATION
// ═══════════════════════════════════════════════════════════
// Simulates the extended backfill professional section:
//   - eligible: write to doc(canonicalScreenName), delete stale
//     projections for same identity_id whose doc ID != canonical
//   - ineligible: delete ALL projections for that identity_id

function simulateBackfillProfessional(proProfiles, publicProjections) {
  let projected = 0;
  let skipped = 0;

  for (const { id, data } of proProfiles) {
    const rawScreenName = data.screen_name || null;
    const canonicalScreenName = rawScreenName
      ? String(rawScreenName).toLowerCase().trim()
      : null;
    const isEligible = isProfessionalListable(data, canonicalScreenName);

    if (isEligible) {
      publicProjections.set(canonicalScreenName, {
        identity_id: data.identity_id,
        screen_name: canonicalScreenName,
        display_name: data.display_name,
      });
      projected++;
      // Delete stale projections for this identity
      const toDelete = [];
      for (const [docId, proj] of publicProjections) {
        if (proj.identity_id === data.identity_id && docId !== canonicalScreenName) {
          toDelete.push(docId);
        }
      }
      for (const docId of toDelete) {
        publicProjections.delete(docId);
      }
    } else {
      skipped++;
      // Delete ALL projections for this ineligible identity
      const toDelete = [];
      for (const [docId, proj] of publicProjections) {
        if (proj.identity_id === data.identity_id) {
          toDelete.push(docId);
        }
      }
      for (const docId of toDelete) {
        publicProjections.delete(docId);
      }
    }
  }

  return { projected, skipped };
}

// ═══════════════════════════════════════════════════════════
// PROFESSIONAL REPAIR TESTS
// ═══════════════════════════════════════════════════════════

test('Repair: eligible Professional projects to doc ID = normalized screen_name', () => {
  const proProfiles = [
    { id: 'proDoc1', data: { identity_id: 'id1', screen_name: 'jamescarter', visibility: 'public', lifecycle_state: 'active', display_name: 'James' } },
  ];
  const publicProjections = new Map();
  const result = simulateBackfillProfessional(proProfiles, publicProjections);
  assert.strictEqual(result.projected, 1);
  assert.strictEqual(result.skipped, 0);
  assert.ok(publicProjections.has('jamescarter'), 'canonical doc should exist');
  assert.strictEqual(publicProjections.get('jamescarter').identity_id, 'id1');
});

test('Repair: old entity-ID projection for same identity is removed', () => {
  const proProfiles = [
    { id: '6a7a53174cccb7abac8c0108', data: { identity_id: 'id1', screen_name: 'jamescarter', visibility: 'public', lifecycle_state: 'active', display_name: 'James' } },
  ];
  // Legacy projection with entity ID as doc ID
  const publicProjections = new Map([
    ['6a7a53174cccb7abac8c0108', { identity_id: 'id1', screen_name: 'jamescarter' }],
  ]);
  const result = simulateBackfillProfessional(proProfiles, publicProjections);
  assert.strictEqual(result.projected, 1);
  assert.ok(publicProjections.has('jamescarter'), 'canonical doc should exist');
  assert.ok(!publicProjections.has('6a7a53174cccb7abac8c0108'), 'legacy entity-ID doc should be deleted');
});

test('Repair: screen_name change removes old and creates new canonical', () => {
  const proProfiles = [
    { id: 'proDoc1', data: { identity_id: 'id1', screen_name: 'newname', visibility: 'public', lifecycle_state: 'active', display_name: 'James' } },
  ];
  const publicProjections = new Map([
    ['oldname', { identity_id: 'id1', screen_name: 'oldname' }],
  ]);
  const result = simulateBackfillProfessional(proProfiles, publicProjections);
  assert.strictEqual(result.projected, 1);
  assert.ok(publicProjections.has('newname'), 'new canonical doc should exist');
  assert.ok(!publicProjections.has('oldname'), 'old screen_name doc should be deleted');
});

test('Repair: connections visibility removes all projections for identity', () => {
  const proProfiles = [
    { id: 'proDoc1', data: { identity_id: 'id1', screen_name: 'alice', visibility: 'connections', lifecycle_state: 'active', display_name: 'Alice' } },
  ];
  const publicProjections = new Map([
    ['alice', { identity_id: 'id1', screen_name: 'alice' }],
    ['oldname', { identity_id: 'id1', screen_name: 'oldname' }],
  ]);
  const result = simulateBackfillProfessional(proProfiles, publicProjections);
  assert.strictEqual(result.skipped, 1);
  assert.strictEqual(result.projected, 0);
  assert.ok(!publicProjections.has('alice'), 'connections projection should be deleted');
  assert.ok(!publicProjections.has('oldname'), 'stale projection should be deleted');
  assert.strictEqual(publicProjections.size, 0);
});

test('Repair: private visibility removes all projections for identity', () => {
  const proProfiles = [
    { id: 'proDoc1', data: { identity_id: 'id1', screen_name: 'alice', visibility: 'private', lifecycle_state: 'active', display_name: 'Alice' } },
  ];
  const publicProjections = new Map([
    ['alice', { identity_id: 'id1', screen_name: 'alice' }],
  ]);
  const result = simulateBackfillProfessional(proProfiles, publicProjections);
  assert.strictEqual(result.skipped, 1);
  assert.strictEqual(publicProjections.size, 0);
});

test('Repair: inactive (draft) Professional has no public projection', () => {
  const proProfiles = [
    { id: 'proDoc1', data: { identity_id: 'id1', screen_name: 'alice', visibility: 'public', lifecycle_state: 'draft', display_name: 'Alice' } },
  ];
  const publicProjections = new Map([
    ['alice', { identity_id: 'id1', screen_name: 'alice' }],
  ]);
  const result = simulateBackfillProfessional(proProfiles, publicProjections);
  assert.strictEqual(result.skipped, 1);
  assert.strictEqual(publicProjections.size, 0);
});

test('Repair: inactive (archived) Professional has no public projection', () => {
  const proProfiles = [
    { id: 'proDoc1', data: { identity_id: 'id1', screen_name: 'alice', visibility: 'public', lifecycle_state: 'archived', display_name: 'Alice' } },
  ];
  const publicProjections = new Map([
    ['alice', { identity_id: 'id1', screen_name: 'alice' }],
  ]);
  const result = simulateBackfillProfessional(proProfiles, publicProjections);
  assert.strictEqual(result.skipped, 1);
  assert.strictEqual(publicProjections.size, 0);
});

test('Repair: no screen_name → not eligible, existing projections removed', () => {
  const proProfiles = [
    { id: 'proDoc1', data: { identity_id: 'id1', screen_name: null, visibility: 'public', lifecycle_state: 'active', display_name: 'Alice' } },
  ];
  const publicProjections = new Map([
    ['oldname', { identity_id: 'id1', screen_name: 'oldname' }],
  ]);
  const result = simulateBackfillProfessional(proProfiles, publicProjections);
  assert.strictEqual(result.skipped, 1);
  assert.strictEqual(publicProjections.size, 0);
});

test('Repair: uppercase screen_name normalized to lowercase doc ID', () => {
  const proProfiles = [
    { id: 'proDoc1', data: { identity_id: 'id1', screen_name: 'JamesCarter', visibility: 'public', lifecycle_state: 'active', display_name: 'James' } },
  ];
  const publicProjections = new Map();
  const result = simulateBackfillProfessional(proProfiles, publicProjections);
  assert.strictEqual(result.projected, 1);
  assert.ok(publicProjections.has('jamescarter'), 'doc ID should be lowercase');
  assert.ok(!publicProjections.has('JamesCarter'), 'uppercase doc ID should not exist');
});

test('Repair: only the target identity projections are affected', () => {
  const proProfiles = [
    { id: 'proDoc1', data: { identity_id: 'id1', screen_name: 'alice', visibility: 'connections', lifecycle_state: 'active', display_name: 'Alice' } },
  ];
  const publicProjections = new Map([
    ['alice', { identity_id: 'id1', screen_name: 'alice' }],
    ['bob', { identity_id: 'id2', screen_name: 'bob' }],
  ]);
  const result = simulateBackfillProfessional(proProfiles, publicProjections);
  assert.strictEqual(result.skipped, 1);
  assert.ok(!publicProjections.has('alice'), 'id1 projection deleted');
  assert.ok(publicProjections.has('bob'), 'id2 projection untouched');
  assert.strictEqual(publicProjections.size, 1);
});

test('Repair: idempotent — running twice produces same result', () => {
  const proProfiles = [
    { id: 'proDoc1', data: { identity_id: 'id1', screen_name: 'jamescarter', visibility: 'public', lifecycle_state: 'active', display_name: 'James' } },
  ];
  const publicProjections = new Map([
    ['6a7a53174cccb7abac8c0108', { identity_id: 'id1', screen_name: 'jamescarter' }],
  ]);
  simulateBackfillProfessional(proProfiles, publicProjections);
  const afterFirst = new Map(publicProjections);
  simulateBackfillProfessional(proProfiles, publicProjections);
  assert.deepStrictEqual([...publicProjections.keys()], [...afterFirst.keys()]);
  assert.ok(publicProjections.has('jamescarter'));
  assert.ok(!publicProjections.has('6a7a53174cccb7abac8c0108'));
});

// ═══════════════════════════════════════════════════════════
// BUSINESS UNCHANGED TESTS
// ═══════════════════════════════════════════════════════════

test('Business: eligible business projects to doc ID = business_id (unchanged)', () => {
  // Business backfill is unchanged — uses business_id as doc ID.
  // This test verifies the contract remains: doc ID == business_id.
  const businessProfiles = [
    { id: 'bp1', data: { business_id: 'biz1', visibility: 'public', lifecycle_state: 'active', name: 'Gym A' } },
  ];
  const publicProjections = new Map();
  // Simulate business backfill (same as before — no stale cleanup by identity)
  for (const { data } of businessProfiles) {
    const businessId = data.business_id;
    const isEligible = data.visibility === 'public' && data.lifecycle_state === 'active' && !!businessId;
    if (isEligible) {
      publicProjections.set(businessId, { business_id: businessId, name: data.name });
    }
  }
  assert.ok(publicProjections.has('biz1'));
  assert.strictEqual(publicProjections.size, 1);
});

test('Business: ineligible business projection removed by business_id (unchanged)', () => {
  const businessProfiles = [
    { id: 'bp1', data: { business_id: 'biz1', visibility: 'private', lifecycle_state: 'active', name: 'Gym A' } },
  ];
  const publicProjections = new Map([
    ['biz1', { business_id: 'biz1', name: 'Gym A' }],
  ]);
  for (const { data } of businessProfiles) {
    const businessId = data.business_id;
    const isEligible = data.visibility === 'public' && data.lifecycle_state === 'active' && !!businessId;
    if (!isEligible && businessId) {
      publicProjections.delete(businessId);
    }
  }
  assert.strictEqual(publicProjections.size, 0);
});

// ═══════════════════════════════════════════════════════════
// CANONICAL LOOKUP TESTS
// ═══════════════════════════════════════════════════════════

test('Canonical lookup: /p/{screenName} succeeds after reprojection', () => {
  const proProfiles = [
    { id: '6a7a53174cccb7abac8c0108', data: { identity_id: 'id1', screen_name: 'jamescarter', visibility: 'public', lifecycle_state: 'active', display_name: 'James' } },
  ];
  const publicProjections = new Map([
    ['6a7a53174cccb7abac8c0108', { identity_id: 'id1', screen_name: 'jamescarter' }],
  ]);
  simulateBackfillProfessional(proProfiles, publicProjections);
  // Repository does: getDoc(doc(db, 'professionalProfilesPublic', screenName.toLowerCase()))
  const lookup = publicProjections.get('jamescarter');
  assert.ok(lookup, 'canonical lookup by screen_name should succeed');
  assert.strictEqual(lookup.identity_id, 'id1');
});

test('Canonical lookup: old entity-ID lookup fails after reprojection', () => {
  const proProfiles = [
    { id: '6a7a53174cccb7abac8c0108', data: { identity_id: 'id1', screen_name: 'jamescarter', visibility: 'public', lifecycle_state: 'active', display_name: 'James' } },
  ];
  const publicProjections = new Map([
    ['6a7a53174cccb7abac8c0108', { identity_id: 'id1', screen_name: 'jamescarter' }],
  ]);
  simulateBackfillProfessional(proProfiles, publicProjections);
  const lookup = publicProjections.get('6a7a53174cccb7abac8c0108');
  assert.strictEqual(lookup, undefined, 'old entity-ID lookup should fail');
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);