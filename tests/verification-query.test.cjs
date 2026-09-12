// Verification query — focused regression test.
// ────────────────────────────────────────────────────────────────────────────
// Verifies the listVerificationRequestsForTarget logic that fixed the
// indefinite Verification spinner:
//   1. Queries by submitted_by_id (satisfies Firestore isOwner(submitted_by_id)
//      rule) — never by target_id alone.
//   2. Filters target_id client-side (no composite index).
//   3. Sorts client-side by created_date desc.
//   4. Returns [] when submittedById is absent (safe non-loading state).
//
// Mirrors src/data/firebase/firebaseTrustRepository.js. Run with:
//   node tests/verification-query.test.cjs

const assert = require('assert');

// ── Mirror of listVerificationRequestsForTarget ──
function listVerificationRequestsForTarget(docs, targetId, submittedById) {
  if (!submittedById) return [];
  const all = docs.filter((r) => r.submitted_by_id === submittedById);
  const filtered = targetId ? all.filter((r) => r.target_id === targetId) : all;
  return filtered.sort((a, b) => {
    const aT = a.created_date ? new Date(a.created_date).getTime() : 0;
    const bT = b.created_date ? new Date(b.created_date).getTime() : 0;
    return bT - aT;
  });
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); failed++; }
}

const DOCS = [
  { id: 'r1', target_id: 'pro-A', submitted_by_id: 'user-A', created_date: '2026-09-10T10:00:00Z', decision: 'pending' },
  { id: 'r2', target_id: 'biz-1', submitted_by_id: 'user-A', created_date: '2026-09-12T10:00:00Z', decision: 'pending' },
  { id: 'r3', target_id: 'pro-B', submitted_by_id: 'user-B', created_date: '2026-09-11T10:00:00Z', decision: 'approved' },
];

console.log('\nVerification query — submitted_by_id filter (Firestore rule)');
test('owner query filters by submitted_by_id (never returns another user\'s requests)', () => {
  const res = listVerificationRequestsForTarget(DOCS, 'pro-A', 'user-A');
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].id, 'r1');
});
test('owner query for business target filters target_id client-side', () => {
  const res = listVerificationRequestsForTarget(DOCS, 'biz-1', 'user-A');
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].id, 'r2');
});
test('owner only sees their own requests (user-B does not see user-A\'s)', () => {
  const res = listVerificationRequestsForTarget(DOCS, 'pro-A', 'user-B');
  assert.strictEqual(res.length, 0);
});
test('results are sorted by created_date desc (newest first)', () => {
  const res = listVerificationRequestsForTarget(DOCS, null, 'user-A');
  assert.strictEqual(res.length, 2);
  assert.strictEqual(res[0].id, 'r2'); // 2026-09-12
  assert.strictEqual(res[1].id, 'r1'); // 2026-09-10
});

console.log('\nSafe non-loading state');
test('absent submittedById returns [] (no spinner, no query)', () => {
  const res = listVerificationRequestsForTarget(DOCS, 'pro-A', undefined);
  assert.deepStrictEqual(res, []);
});
test('absent submittedById returns [] even with null target', () => {
  const res = listVerificationRequestsForTarget(DOCS, null, null);
  assert.deepStrictEqual(res, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);