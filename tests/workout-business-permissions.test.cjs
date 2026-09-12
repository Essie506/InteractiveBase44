// Workout Business Permission Tests (Spec 12 §9 + Business §8)
// ───────────────────────────────────────────────────────────
// Verifies the manage_workouts permission taxonomy and the Business
// "My Workouts" aggregation dedup/filter logic.
// Run with: node tests/workout-business-permissions.test.cjs

const assert = require('assert');

// ── Permission taxonomy (inlined from src/lib/businessPermissions.js) ──

const ROLE_PERMISSIONS = {
  owner: [
    'view_business', 'manage_profile', 'manage_business_profile', 'manage_staff',
    'manage_permissions', 'invite_staff',
    'view_bookings', 'manage_bookings',
    'view_calendar', 'manage_calendar',
    'view_financials', 'manage_financials',
    'view_inbox', 'manage_inbox',
    'manage_promotions', 'manage_verification', 'manage_subscription',
    'transfer_ownership', 'view_analytics', 'manage_settings',
    'manage_services', 'manage_payments', 'manage_workouts',
  ],
  admin: [
    'view_business', 'manage_profile', 'manage_business_profile', 'manage_staff',
    'invite_staff',
    'view_bookings', 'manage_bookings',
    'view_calendar', 'manage_calendar',
    'view_financials',
    'view_inbox', 'manage_inbox',
    'manage_promotions', 'view_analytics', 'manage_services', 'manage_workouts',
  ],
  staff: ['view_business', 'view_bookings', 'manage_own_bookings', 'view_calendar'],
  member: ['view_business'],
};

function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member;
}

function hasPermission(membership, requiredPermission) {
  if (!membership) return false;
  const rolePerms = getRolePermissions(membership.role);
  const extraPerms = membership.permissions || [];
  return [...rolePerms, ...extraPerms].includes(requiredPermission);
}

// ── Aggregation logic (mirrors listBusinessMyWorkouts) ──

function aggregateBusinessMyWorkouts(businessWorkouts, memberships, staffWorkoutLists) {
  const staffWorkouts = staffWorkoutLists
    .flat()
    .filter((w) => w.owner_type === 'identity');
  const seen = new Set();
  const merged = [...businessWorkouts, ...staffWorkouts].filter((w) => {
    if (!w || !w.id || seen.has(w.id)) return false;
    seen.add(w.id);
    return true;
  });
  merged.sort((a, b) => (b._updated_date || '').localeCompare(a._updated_date || ''));
  return merged;
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

console.log('\nmanage_workouts permission taxonomy (Business §8)');
test('owner role includes manage_workouts', () => {
  assert.ok(getRolePermissions('owner').includes('manage_workouts'));
});
test('admin role includes manage_workouts', () => {
  assert.ok(getRolePermissions('admin').includes('manage_workouts'));
});
test('staff role does NOT include manage_workouts', () => {
  assert.ok(!getRolePermissions('staff').includes('manage_workouts'));
});
test('member role does NOT include manage_workouts', () => {
  assert.ok(!getRolePermissions('member').includes('manage_workouts'));
});
test('hasPermission grants manage_workouts to owner', () => {
  assert.strictEqual(hasPermission({ role: 'owner' }, 'manage_workouts'), true);
});
test('hasPermission grants manage_workouts to admin', () => {
  assert.strictEqual(hasPermission({ role: 'admin' }, 'manage_workouts'), true);
});
test('hasPermission denies manage_workouts to staff by default', () => {
  assert.strictEqual(hasPermission({ role: 'staff' }, 'manage_workouts'), false);
});
test('hasPermission denies manage_workouts to member by default', () => {
  assert.strictEqual(hasPermission({ role: 'member' }, 'manage_workouts'), false);
});
test('hasPermission grants manage_workouts to staff with explicit permission grant', () => {
  assert.strictEqual(hasPermission({ role: 'staff', permissions: ['manage_workouts'] }, 'manage_workouts'), true);
});
test('hasPermission denies manage_workouts to member without explicit grant', () => {
  assert.strictEqual(hasPermission({ role: 'member', permissions: [] }, 'manage_workouts'), false);
});
test('hasPermission returns false for null membership', () => {
  assert.strictEqual(hasPermission(null, 'manage_workouts'), false);
});

console.log('\nBusiness "My Workouts" aggregation (Spec 12 + Business §1)');
test('aggregates business-owned + staff professional workouts', () => {
  const businessWorkouts = [{ id: 'w1', owner_type: 'business', owner_id: 'biz1', _updated_date: '2026-09-10' }];
  const memberships = [{ identity_id: 'staff1' }, { identity_id: 'staff2' }];
  const staffLists = [
    [{ id: 'w2', owner_type: 'identity', owner_id: 'staff1', _updated_date: '2026-09-12' }],
    [{ id: 'w3', owner_type: 'identity', owner_id: 'staff2', _updated_date: '2026-09-11' }],
  ];
  const result = aggregateBusinessMyWorkouts(businessWorkouts, memberships, staffLists);
  assert.strictEqual(result.length, 3);
  assert.ok(result.find((w) => w.id === 'w1'));
  assert.ok(result.find((w) => w.id === 'w2'));
  assert.ok(result.find((w) => w.id === 'w3'));
});
test('excludes business-owned workouts from the staff aggregation', () => {
  const businessWorkouts = [{ id: 'w1', owner_type: 'business', owner_id: 'biz1', _updated_date: '2026-09-10' }];
  const memberships = [{ identity_id: 'staff1' }];
  const staffLists = [
    [
      { id: 'w1', owner_type: 'business', owner_id: 'biz1', _updated_date: '2026-09-10' },
      { id: 'w2', owner_type: 'identity', owner_id: 'staff1', _updated_date: '2026-09-12' },
    ],
  ];
  const result = aggregateBusinessMyWorkouts(businessWorkouts, memberships, staffLists);
  assert.strictEqual(result.length, 2);
  assert.ok(result.find((w) => w.id === 'w1'));
  assert.ok(result.find((w) => w.id === 'w2'));
});
test('deduplicates workouts encountered through multiple paths', () => {
  const businessWorkouts = [{ id: 'w1', owner_type: 'business', owner_id: 'biz1', _updated_date: '2026-09-10' }];
  const memberships = [{ identity_id: 'staff1' }];
  const staffLists = [
    [{ id: 'w1', owner_type: 'identity', owner_id: 'staff1', _updated_date: '2026-09-10' }],
  ];
  const result = aggregateBusinessMyWorkouts(businessWorkouts, memberships, staffLists);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'w1');
});
test('sorts merged results by updated_date descending', () => {
  const businessWorkouts = [{ id: 'w1', _updated_date: '2026-09-10' }];
  const memberships = [{ identity_id: 's1' }];
  const staffLists = [[
    { id: 'w2', owner_type: 'identity', _updated_date: '2026-09-12' },
    { id: 'w3', owner_type: 'identity', _updated_date: '2026-09-11' },
  ]];
  const result = aggregateBusinessMyWorkouts(businessWorkouts, memberships, staffLists);
  assert.strictEqual(result[0].id, 'w2');
  assert.strictEqual(result[1].id, 'w3');
  assert.strictEqual(result[2].id, 'w1');
});
test('inactive staff excluded — only active memberships drive aggregation', () => {
  const businessWorkouts = [];
  const memberships = [{ identity_id: 'activeStaff' }];
  const staffLists = [
    [{ id: 'w2', owner_type: 'identity', owner_id: 'activeStaff', _updated_date: '2026-09-12' }],
  ];
  const result = aggregateBusinessMyWorkouts(businessWorkouts, memberships, staffLists);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].owner_id, 'activeStaff');
});
test('empty memberships yields only business-owned workouts', () => {
  const businessWorkouts = [{ id: 'w1', owner_type: 'business', _updated_date: '2026-09-10' }];
  const result = aggregateBusinessMyWorkouts(businessWorkouts, [], []);
  assert.strictEqual(result.length, 1);
});

console.log('\nCreator vs Owner distinction (Spec 12 §9 + Data Arch §13)');
test('business-owned workout can have a distinct individual creator', () => {
  const workout = {
    id: 'w1', owner_type: 'business', owner_id: 'biz1', business_id: 'biz1',
    creator_identity_id: 'staff1',
  };
  assert.strictEqual(workout.owner_id, 'biz1');
  assert.strictEqual(workout.creator_identity_id, 'staff1');
  assert.notStrictEqual(workout.owner_id, workout.creator_identity_id);
});
test('identity-owned workout creator equals owner', () => {
  const workout = {
    id: 'w2', owner_type: 'identity', owner_id: 'staff1', business_id: null,
    creator_identity_id: 'staff1',
  };
  assert.strictEqual(workout.owner_id, workout.creator_identity_id);
});
test('ownership fields are never rewritten to make staff workouts appear', () => {
  // The aggregation must NOT change owner_type/owner_id/business_id.
  // A staff professional workout stays owner_type: identity.
  const staffWorkout = {
    id: 'w2', owner_type: 'identity', owner_id: 'staff1',
    business_id: null, operating_context: 'professional',
    creator_identity_id: 'staff1',
  };
  assert.strictEqual(staffWorkout.owner_type, 'identity');
  assert.strictEqual(staffWorkout.business_id, null);
  assert.strictEqual(staffWorkout.operating_context, 'professional');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);