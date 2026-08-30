/**
 * Projection Cleanup Tests
 * ───────────────────────────────────────────────────────────
 * Pure unit tests for the public projection eligibility and cleanup
 * logic. Replicates the isProfessionalListable / isBusinessListable
 * functions from cloud-functions/src/projectionEligibility.ts and
 * simulates the defensive cleanup flow to verify which projection
 * docs would be created or deleted.
 *
 * Covers:
 *   - public → public projection exists
 *   - public → connections removes projection
 *   - public → private removes projection
 *   - inactive lifecycle (draft/archived) removes projection
 *   - restoring public + active recreates projection
 *   - screen_name change deletes old, creates new
 *   - stale projections under old screen names are cleaned up
 *   - only the calling identity's projections are affected
 *
 * Usage:
 *   node tests/projection-cleanup.test.cjs
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

function isBusinessListable(data, businessId) {
  return data?.visibility === 'public'
    && data?.lifecycle_state === 'active'
    && !!businessId;
}

// ═══════════════════════════════════════════════════════════
// SIMULATED CLEANUP FLOW
// ═══════════════════════════════════════════════════════════
// Simulates the defensive cleanup in saveProfessionalProfile:
//   1. Query all projections for the identity
//   2. Delete any that don't match the target screen name
//   3. If listable, write/update the projection under the screen name
//
// existingProjections: [{ id, identity_id }]
// Returns { created: string[], deleted: string[] }

function simulateProfessionalCleanup(existingProjections, identityId, data, screenName) {
  const listable = isProfessionalListable(data, screenName);
  const myProjections = existingProjections.filter(p => p.identity_id === identityId);
  const deleted = [];
  const created = [];

  for (const proj of myProjections) {
    if (!listable || proj.id !== screenName) {
      deleted.push(proj.id);
    }
  }

  if (listable) {
    created.push(screenName);
  }

  return { created, deleted };
}

function simulateBusinessCleanup(existingProjections, businessId, data) {
  const listable = isBusinessListable(data, businessId);
  const deleted = [];
  const created = [];

  const existing = existingProjections.find(p => p.id === businessId);
  if (existing && !listable) {
    deleted.push(businessId);
  }

  if (listable) {
    created.push(businessId);
  }

  return { created, deleted };
}

// ═══════════════════════════════════════════════════════════
// PROFESSIONAL ELIGIBILITY TESTS
// ═══════════════════════════════════════════════════════════

test('Pro eligibility: public + active + screen_name → listable', () => {
  assert.strictEqual(
    isProfessionalListable({ visibility: 'public', lifecycle_state: 'active' }, 'alice'),
    true
  );
});

test('Pro eligibility: public + active + no screen_name → not listable', () => {
  assert.strictEqual(
    isProfessionalListable({ visibility: 'public', lifecycle_state: 'active' }, null),
    false
  );
});

test('Pro eligibility: connections + active → not listable', () => {
  assert.strictEqual(
    isProfessionalListable({ visibility: 'connections', lifecycle_state: 'active' }, 'alice'),
    false
  );
});

test('Pro eligibility: private + active → not listable', () => {
  assert.strictEqual(
    isProfessionalListable({ visibility: 'private', lifecycle_state: 'active' }, 'alice'),
    false
  );
});

test('Pro eligibility: public + draft → not listable', () => {
  assert.strictEqual(
    isProfessionalListable({ visibility: 'public', lifecycle_state: 'draft' }, 'alice'),
    false
  );
});

test('Pro eligibility: public + archived → not listable', () => {
  assert.strictEqual(
    isProfessionalListable({ visibility: 'public', lifecycle_state: 'archived' }, 'alice'),
    false
  );
});

// ═══════════════════════════════════════════════════════════
// PROFESSIONAL CLEANUP FLOW TESTS
// ═══════════════════════════════════════════════════════════

test('Pro cleanup: public → public keeps projection', () => {
  const existing = [{ id: 'alice', identity_id: 'id1' }];
  const result = simulateProfessionalCleanup(existing, 'id1',
    { visibility: 'public', lifecycle_state: 'active' }, 'alice');
  assert.deepStrictEqual(result.deleted, []);
  assert.deepStrictEqual(result.created, ['alice']);
});

test('Pro cleanup: public → connections removes projection', () => {
  const existing = [{ id: 'alice', identity_id: 'id1' }];
  const result = simulateProfessionalCleanup(existing, 'id1',
    { visibility: 'connections', lifecycle_state: 'active' }, 'alice');
  assert.deepStrictEqual(result.deleted, ['alice']);
  assert.deepStrictEqual(result.created, []);
});

test('Pro cleanup: public → private removes projection', () => {
  const existing = [{ id: 'alice', identity_id: 'id1' }];
  const result = simulateProfessionalCleanup(existing, 'id1',
    { visibility: 'private', lifecycle_state: 'active' }, 'alice');
  assert.deepStrictEqual(result.deleted, ['alice']);
  assert.deepStrictEqual(result.created, []);
});

test('Pro cleanup: active → draft removes projection', () => {
  const existing = [{ id: 'alice', identity_id: 'id1' }];
  const result = simulateProfessionalCleanup(existing, 'id1',
    { visibility: 'public', lifecycle_state: 'draft' }, 'alice');
  assert.deepStrictEqual(result.deleted, ['alice']);
  assert.deepStrictEqual(result.created, []);
});

test('Pro cleanup: active → archived removes projection', () => {
  const existing = [{ id: 'alice', identity_id: 'id1' }];
  const result = simulateProfessionalCleanup(existing, 'id1',
    { visibility: 'public', lifecycle_state: 'archived' }, 'alice');
  assert.deepStrictEqual(result.deleted, ['alice']);
  assert.deepStrictEqual(result.created, []);
});

test('Pro cleanup: restoring public + active recreates projection', () => {
  const existing = [];
  const result = simulateProfessionalCleanup(existing, 'id1',
    { visibility: 'public', lifecycle_state: 'active' }, 'alice');
  assert.deepStrictEqual(result.deleted, []);
  assert.deepStrictEqual(result.created, ['alice']);
});

test('Pro cleanup: screen_name change deletes old, creates new', () => {
  const existing = [{ id: 'alice', identity_id: 'id1' }];
  const result = simulateProfessionalCleanup(existing, 'id1',
    { visibility: 'public', lifecycle_state: 'active' }, 'bob');
  assert.deepStrictEqual(result.deleted, ['alice']);
  assert.deepStrictEqual(result.created, ['bob']);
});

test('Pro cleanup: stale projection under old screen name is cleaned up', () => {
  const existing = [{ id: 'oldname', identity_id: 'id1' }];
  const result = simulateProfessionalCleanup(existing, 'id1',
    { visibility: 'public', lifecycle_state: 'active' }, 'newname');
  assert.deepStrictEqual(result.deleted, ['oldname']);
  assert.deepStrictEqual(result.created, ['newname']);
});

test('Pro cleanup: not listable deletes ALL projections for identity', () => {
  const existing = [
    { id: 'alice', identity_id: 'id1' },
    { id: 'bob', identity_id: 'id1' },
  ];
  const result = simulateProfessionalCleanup(existing, 'id1',
    { visibility: 'connections', lifecycle_state: 'active' }, 'alice');
  assert.deepStrictEqual(result.deleted, ['alice', 'bob']);
  assert.deepStrictEqual(result.created, []);
});

test('Pro cleanup: only deletes projections for the calling identity', () => {
  const existing = [
    { id: 'alice', identity_id: 'id1' },
    { id: 'bob', identity_id: 'id2' },
  ];
  const result = simulateProfessionalCleanup(existing, 'id1',
    { visibility: 'connections', lifecycle_state: 'active' }, 'alice');
  assert.deepStrictEqual(result.deleted, ['alice']);
  assert.deepStrictEqual(result.created, []);
});

// ═══════════════════════════════════════════════════════════
// BUSINESS ELIGIBILITY TESTS
// ═══════════════════════════════════════════════════════════

test('Biz eligibility: public + active + business_id → listable', () => {
  assert.strictEqual(
    isBusinessListable({ visibility: 'public', lifecycle_state: 'active' }, 'biz1'),
    true
  );
});

test('Biz eligibility: connections + active → not listable', () => {
  assert.strictEqual(
    isBusinessListable({ visibility: 'connections', lifecycle_state: 'active' }, 'biz1'),
    false
  );
});

test('Biz eligibility: private + active → not listable', () => {
  assert.strictEqual(
    isBusinessListable({ visibility: 'private', lifecycle_state: 'active' }, 'biz1'),
    false
  );
});

test('Biz eligibility: public + draft → not listable', () => {
  assert.strictEqual(
    isBusinessListable({ visibility: 'public', lifecycle_state: 'draft' }, 'biz1'),
    false
  );
});

test('Biz eligibility: public + archived → not listable', () => {
  assert.strictEqual(
    isBusinessListable({ visibility: 'public', lifecycle_state: 'archived' }, 'biz1'),
    false
  );
});

// ═══════════════════════════════════════════════════════════
// BUSINESS CLEANUP FLOW TESTS
// ═══════════════════════════════════════════════════════════

test('Biz cleanup: public → public keeps projection', () => {
  const existing = [{ id: 'biz1' }];
  const result = simulateBusinessCleanup(existing, 'biz1',
    { visibility: 'public', lifecycle_state: 'active' });
  assert.deepStrictEqual(result.deleted, []);
  assert.deepStrictEqual(result.created, ['biz1']);
});

test('Biz cleanup: public → connections removes projection', () => {
  const existing = [{ id: 'biz1' }];
  const result = simulateBusinessCleanup(existing, 'biz1',
    { visibility: 'connections', lifecycle_state: 'active' });
  assert.deepStrictEqual(result.deleted, ['biz1']);
  assert.deepStrictEqual(result.created, []);
});

test('Biz cleanup: public → private removes projection', () => {
  const existing = [{ id: 'biz1' }];
  const result = simulateBusinessCleanup(existing, 'biz1',
    { visibility: 'private', lifecycle_state: 'active' });
  assert.deepStrictEqual(result.deleted, ['biz1']);
  assert.deepStrictEqual(result.created, []);
});

test('Biz cleanup: active → draft removes projection', () => {
  const existing = [{ id: 'biz1' }];
  const result = simulateBusinessCleanup(existing, 'biz1',
    { visibility: 'public', lifecycle_state: 'draft' });
  assert.deepStrictEqual(result.deleted, ['biz1']);
  assert.deepStrictEqual(result.created, []);
});

test('Biz cleanup: restoring public + active recreates projection', () => {
  const existing = [];
  const result = simulateBusinessCleanup(existing, 'biz1',
    { visibility: 'public', lifecycle_state: 'active' });
  assert.deepStrictEqual(result.deleted, []);
  assert.deepStrictEqual(result.created, ['biz1']);
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);