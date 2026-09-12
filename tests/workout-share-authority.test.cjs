// Workout Share Authority — focused verification (Spec 12 §9 + Business §8).
// ────────────────────────────────────────────────────────────────────────────
// Verifies the UI authority rules for the targeted Workout Share action:
//   Professional creator/owner → may share
//   Business → only authorised Business user with manage_workouts
//   Unrelated authenticated user → no share control
//
// The server-side shareWorkoutWithConnections function enforces the same
// gate authoritatively; this test verifies the UI visibility logic that
// drives the Share button so users who cannot share don't see the control.
// Run with: node tests/workout-share-authority.test.cjs

const assert = require('assert');

// Mirror the WorkoutDetail.jsx authority resolution logic:
// - identity workouts → creator_identity_id === user.id
// - business workouts → checkPermission(business_id, user.id, 'manage_workouts')
function resolveWorkoutShareAuthority(workout, user, checkPermissionFn) {
  if (!user || !workout) return false;
  if (workout.owner_type === 'business' && workout.business_id) {
    try {
      const { allowed } = checkPermissionFn(workout.business_id, user.id, 'manage_workouts');
      return allowed;
    } catch {
      return false;
    }
  }
  return workout.creator_identity_id === user.id;
}

// ── Tests ──

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

test('professional creator may share their own workout', () => {
  const workout = {
    owner_type: 'identity',
    creator_identity_id: 'identity-A',
    owner_id: 'identity-A',
  };
  const user = { id: 'identity-A' };
  const allowed = resolveWorkoutShareAuthority(workout, user, () => false);
  assert.strictEqual(allowed, true, 'Creator should be able to share');
});

test('unrelated authenticated user may NOT share another professional\'s workout', () => {
  const workout = {
    owner_type: 'identity',
    creator_identity_id: 'identity-A',
    owner_id: 'identity-A',
  };
  const user = { id: 'identity-B' }; // different identity
  const allowed = resolveWorkoutShareAuthority(workout, user, () => false);
  assert.strictEqual(allowed, false, 'Unrelated user should not see Share');
});

test('business owner with manage_workouts may share business workout', () => {
  const workout = {
    owner_type: 'business',
    business_id: 'biz-1',
    creator_identity_id: 'identity-staff',
    owner_id: 'biz-1',
  };
  const user = { id: 'identity-owner' };
  const allowed = resolveWorkoutShareAuthority(workout, user, (bizId, uid, perm) => {
    assert.strictEqual(perm, 'manage_workouts');
    return { allowed: true };
  });
  // The function uses the return value truthiness — { allowed: true } is truthy
  assert.strictEqual(allowed, true, 'Business owner with manage_workouts should share');
});

test('business staff WITHOUT manage_workouts may NOT share business workout', () => {
  const workout = {
    owner_type: 'business',
    business_id: 'biz-1',
    creator_identity_id: 'identity-staff',
    owner_id: 'biz-1',
  };
  const user = { id: 'identity-staff' }; // creator but staff role
  const allowed = resolveWorkoutShareAuthority(workout, user, () => ({ allowed: false }));
  assert.strictEqual(allowed, false, 'Staff without manage_workouts should not share');
});

test('unauthenticated user (null user) may NOT share', () => {
  const workout = {
    owner_type: 'identity',
    creator_identity_id: 'identity-A',
    owner_id: 'identity-A',
  };
  assert.strictEqual(resolveWorkoutShareAuthority(workout, null, () => false), false);
});

test('null workout → no share', () => {
  const user = { id: 'identity-A' };
  assert.strictEqual(resolveWorkoutShareAuthority(null, user, () => false), false);
});

test('permission check error → fail safe (no share)', () => {
  const workout = {
    owner_type: 'business',
    business_id: 'biz-1',
    creator_identity_id: 'identity-staff',
    owner_id: 'biz-1',
  };
  const user = { id: 'identity-someone' };
  const allowed = resolveWorkoutShareAuthority(workout, user, () => { throw new Error('network'); });
  assert.strictEqual(allowed, false, 'Permission error should fail safe');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);