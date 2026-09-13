// Directory "Verified only" filter — confirms the filter is a real
// applied control, not cosmetic. Mirrors src/lib/directoryVerifiedFilter.
// Run with: node tests/directory-verified-filter.test.cjs

const assert = require('assert');

function filterVerifiedOnly(results, verifiedOnly) {
  if (!verifiedOnly) return results;
  return results.filter((r) => r.verification_state === 'verified');
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); failed++; }
}

const pro = { _type: 'professional', verification_state: 'verified' };
const proUnverified = { _type: 'professional', verification_state: 'pending_review' };
const biz = { _type: 'business', verification_state: 'verified' };
const bizUnverified = { _type: 'business', verification_state: 'not_verified' };
const all = [pro, proUnverified, biz, bizUnverified];

console.log('\nDirectory Verified only filter');
test('off: unverified listings remain eligible for normal discovery', () => {
  assert.strictEqual(filterVerifiedOnly(all, false).length, 4);
});
test('on: only verified listings pass (pro + biz)', () => {
  const r = filterVerifiedOnly(all, true);
  assert.strictEqual(r.length, 2);
  assert.ok(r.every((x) => x.verification_state === 'verified'));
});
test('on: unverified business excluded — not cosmetic', () => {
  const r = filterVerifiedOnly(all, true);
  assert.ok(!r.some((x) => x._type === 'business' && x.verification_state !== 'verified'));
});
test('on: unverified professional excluded — not cosmetic', () => {
  const r = filterVerifiedOnly(all, true);
  assert.ok(!r.some((x) => x._type === 'professional' && x.verification_state !== 'verified'));
});
test('off: an unverified business still appears (principle preserved)', () => {
  const r = filterVerifiedOnly(all, false);
  assert.ok(r.some((x) => x._type === 'business' && x.verification_state === 'not_verified'));
});
test('pro and biz stay separate even when both verified', () => {
  const r = filterVerifiedOnly([pro, biz], true);
  assert.strictEqual(r.length, 2);
  assert.ok(r.some((x) => x._type === 'professional'));
  assert.ok(r.some((x) => x._type === 'business'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);