// Lifecycle state migration — V2 §14–§17 conformance tests.
// ───────────────────────────────────────────────────────────
// Tests the deterministic migration mapping from legacy lifecycle_state
// values to V2 Calendar schedule-state terminology. Verifies that
// ambiguous legacy values (confirmed, tentative, completed) are resolved
// using source_system + owner_type context.
//
// Run with: node tests/calendar-lifecycle-migration.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

// ── Source-contract: the migration function exists and is exported ──
const MIGRATION = path.join(__dirname, '..', 'cloud-functions', 'src', 'migrateCalendarLifecycleStates.ts');
const migrationSrc = fs.readFileSync(MIGRATION, 'utf8');

test('MIGRATION: migrateLifecycleState is exported', () => {
  if (!/export function migrateLifecycleState/.test(migrationSrc)) {
    throw new Error('migrateLifecycleState must be exported');
  }
});

test('MIGRATION: migrateCalendarLifecycleStates Cloud Function is exported', () => {
  if (!/export const migrateCalendarLifecycleStates/.test(migrationSrc)) {
    throw new Error('migrateCalendarLifecycleStates must be exported');
  }
});

test('MIGRATION: admin-only authorisation', () => {
  if (!/isAdmin/.test(migrationSrc)) {
    throw new Error('migration must be admin-only');
  }
});

test('MIGRATION: idempotent (skips already-V2 values)', () => {
  if (!/UNAMBIGUOUS_V2_STATES/.test(migrationSrc)) {
    throw new Error('must check UNAMBIGUOUS_V2_STATES for idempotency');
  }
});

test('MIGRATION: completed is treated as ambiguous (not in unambiguous V2 set)', () => {
  // 'completed' is both a legacy value and a V2 §16 Personal-only state.
  // It must NOT be in the unambiguous V2 set — it requires source/context resolution.
  const setStart = migrationSrc.indexOf('UNAMBIGUOUS_V2_STATES');
  if (setStart === -1) throw new Error('UNAMBIGUOUS_V2_STATES not found');
  // Extract the set definition (from the variable name to the closing ])
  const setEnd = migrationSrc.indexOf(']);', setStart);
  if (setEnd === -1) throw new Error('UNAMBIGUOUS_V2_STATES set definition not found');
  const setDef = migrationSrc.slice(setStart, setEnd);
  if (/'completed'/.test(setDef)) {
    throw new Error("'completed' must NOT be in UNAMBIGUOUS_V2_STATES — it is ambiguous");
  }
  // Must contain other V2 states to confirm it's the right set
  if (!/'scheduled'/.test(setDef)) {
    throw new Error("UNAMBIGUOUS_V2_STATES must contain 'scheduled'");
  }
});

test('MIGRATION: refreshes public projection for migrated events', () => {
  if (!/refreshEventProjection/.test(migrationSrc)) {
    throw new Error('must refresh public projection after migration');
  }
});

// ── Pure-logic: migration mapping ──
// Mirrors the migrateLifecycleState function from the Cloud Function.
// 'completed' is excluded from UNAMBIGUOUS_V2 because it is both a legacy
// value and a V2 §16 Personal-only state — it requires source/context resolution.
const UNAMBIGUOUS_V2 = new Set([
  'pending', 'held', 'scheduled', 'upcoming', 'in_progress',
  'historical', 'cancelled', 'removed', 'superseded',
  'skipped', 'rescheduled', 'archived',
]);

function migrateLifecycleState(event) {
  const current = event.lifecycle_state;
  if (!current) return null;
  if (UNAMBIGUOUS_V2.has(current)) return null;
  // 'completed' is ambiguous — resolve using source/context
  if (current === 'completed') {
    if (event.source_system === 'manual' && event.owner_type === 'identity') {
      return null; // V2 §16 Personal-only — no migration
    }
    return 'historical'; // Source-owned or business → V2 §15 'historical'
  }
  switch (current) {
    case 'confirmed':
      return 'scheduled';
    case 'tentative':
      return 'pending';
    default:
      return null;
  }
}

// ── Direct V2 matches — no migration needed ──
test('MAPPING: scheduled → no migration (already V2)', () => {
  assert.strictEqual(migrateLifecycleState({ lifecycle_state: 'scheduled' }), null);
});

test('MAPPING: cancelled → no migration (already V2)', () => {
  assert.strictEqual(migrateLifecycleState({ lifecycle_state: 'cancelled' }), null);
});

test('MAPPING: pending → no migration (already V2)', () => {
  assert.strictEqual(migrateLifecycleState({ lifecycle_state: 'pending' }), null);
});

test('MAPPING: historical → no migration (already V2)', () => {
  assert.strictEqual(migrateLifecycleState({ lifecycle_state: 'historical' }), null);
});

// ── Legacy → V2: confirmed ──
test('MAPPING: confirmed (booking) → scheduled', () => {
  const result = migrateLifecycleState({ lifecycle_state: 'confirmed', source_system: 'booking', owner_type: 'identity' });
  assert.strictEqual(result, 'scheduled');
});

test('MAPPING: confirmed (manual) → scheduled', () => {
  const result = migrateLifecycleState({ lifecycle_state: 'confirmed', source_system: 'manual', owner_type: 'identity' });
  assert.strictEqual(result, 'scheduled');
});

test('MAPPING: confirmed (business) → scheduled', () => {
  const result = migrateLifecycleState({ lifecycle_state: 'confirmed', source_system: 'business_scheduling', owner_type: 'business' });
  assert.strictEqual(result, 'scheduled');
});

// ── Legacy → V2: tentative ──
test('MAPPING: tentative (booking) → pending', () => {
  const result = migrateLifecycleState({ lifecycle_state: 'tentative', source_system: 'booking', owner_type: 'identity' });
  assert.strictEqual(result, 'pending');
});

test('MAPPING: tentative (manual) → pending', () => {
  const result = migrateLifecycleState({ lifecycle_state: 'tentative', source_system: 'manual', owner_type: 'identity' });
  assert.strictEqual(result, 'pending');
});

// ── Legacy → V2: completed (context-dependent) ──
test('MAPPING: completed (manual personal) → null (V2 §16 Personal-only, no migration needed)', () => {
  const result = migrateLifecycleState({ lifecycle_state: 'completed', source_system: 'manual', owner_type: 'identity' });
  assert.strictEqual(result, null);
});

test('MAPPING: completed (booking) → historical (§15 source-owned)', () => {
  const result = migrateLifecycleState({ lifecycle_state: 'completed', source_system: 'booking', owner_type: 'identity' });
  assert.strictEqual(result, 'historical');
});

test('MAPPING: completed (business) → historical (§15 business)', () => {
  const result = migrateLifecycleState({ lifecycle_state: 'completed', source_system: 'business_scheduling', owner_type: 'business' });
  assert.strictEqual(result, 'historical');
});

test('MAPPING: completed (workout) → historical (§15 source-owned)', () => {
  const result = migrateLifecycleState({ lifecycle_state: 'completed', source_system: 'workout', owner_type: 'identity' });
  assert.strictEqual(result, 'historical');
});

// ── Unknown / null ──
test('MAPPING: null lifecycle_state → null (no migration)', () => {
  assert.strictEqual(migrateLifecycleState({}), null);
});

test('MAPPING: unknown legacy value → null (do not destroy)', () => {
  assert.strictEqual(migrateLifecycleState({ lifecycle_state: 'some_unknown_state' }), null);
});

// ── Idempotency: running migration twice is a no-op ──
test('IDEMPOTENCY: migrated value is V2 — second pass returns null', () => {
  const legacy = { lifecycle_state: 'confirmed', source_system: 'booking', owner_type: 'identity' };
  const first = migrateLifecycleState(legacy);
  assert.strictEqual(first, 'scheduled');
  const migrated = { ...legacy, lifecycle_state: first };
  const second = migrateLifecycleState(migrated);
  assert.strictEqual(second, null);
});

test('IDEMPOTENCY: completed→historical is stable on second pass', () => {
  const legacy = { lifecycle_state: 'completed', source_system: 'booking', owner_type: 'identity' };
  const first = migrateLifecycleState(legacy);
  assert.strictEqual(first, 'historical');
  const migrated = { ...legacy, lifecycle_state: first };
  const second = migrateLifecycleState(migrated);
  assert.strictEqual(second, null);
});

test('IDEMPOTENCY: manual personal completed stays null (V2-valid, not re-migrated)', () => {
  const legacy = { lifecycle_state: 'completed', source_system: 'manual', owner_type: 'identity' };
  const first = migrateLifecycleState(legacy);
  assert.strictEqual(first, null);
  const second = migrateLifecycleState(legacy);
  assert.strictEqual(second, null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);