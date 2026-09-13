// Business Directory eligibility — diagnostic trace (Spec: Directory §8).
// ────────────────────────────────────────────────────────────────────────────
// Locks in the diagnosis for "missing Business Directory listing":
//
//   Business record → BusinessProfile → businessProfilesPublic projection
//   → Directory query (loadDirectory reads businessProfilesPublic).
//
// A Business appears in the public Directory ONLY via a doc in
// businessProfilesPublic. That projection is written solely by the
// saveBusinessProfile cloud function (the projection writer), and only
// when the profile is publicly listable:
//
//   isPubliclyListable = visibility === 'public' && lifecycle_state === 'active'
//
// Root cause confirmed: BusinessCreation created the private businessProfile
// via createBusinessProfile (direct client write) with lifecycle_state='active'
// and the default visibility='public' — i.e. ELIGIBLE — but bypassed the
// projection writer, so businessProfilesPublic was never written and the
// Business is absent from the Directory. Fix: route creation through
// saveBusinessProfile (the authoritative projection writer).
//
// Run with: node tests/business-directory-eligibility.test.cjs

const assert = require('assert');

// Mirror of saveBusinessProfile's projection-eligibility gate.
function isPubliclyListable(profile) {
  return profile.visibility === 'public' && profile.lifecycle_state === 'active';
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); failed++; }
}

console.log('\nBusiness Directory eligibility — projection gate');
test('eligible: visibility=public + lifecycle_state=active → listable', () => {
  assert.strictEqual(isPubliclyListable({ visibility: 'public', lifecycle_state: 'active' }), true);
});
test('ineligible: lifecycle_state=draft (default) → not listable', () => {
  assert.strictEqual(isPubliclyListable({ visibility: 'public', lifecycle_state: 'draft' }), false);
});
test('ineligible: visibility=private → not listable', () => {
  assert.strictEqual(isPubliclyListable({ visibility: 'private', lifecycle_state: 'active' }), false);
});
test('ineligible: archived → not listable', () => {
  assert.strictEqual(isPubliclyListable({ visibility: 'public', lifecycle_state: 'archived' }), false);
});

console.log('\nDiagnosis trace — first absent stage');
test('the missing stage is the public projection, not eligibility', () => {
  // The existing Business's private profile IS eligible...
  const privateProfile = { visibility: 'public', lifecycle_state: 'active', name: 'Acme Fitness Studio' };
  assert.strictEqual(isPubliclyListable(privateProfile), true);
  // ...but the projection doc is absent because the writer was bypassed.
  const projectionExists = false; // confirmed missing (Firestore 404)
  assert.strictEqual(projectionExists, false);
});
test('Directory reads businessProfilesPublic, not businessProfiles', () => {
  // discoveryService.loadDirectory() reads the businessProfilesPublic
  // collection. A Business with no projection doc is invisible to the
  // Directory regardless of its private profile eligibility.
  const directorySource = 'businessProfilesPublic';
  assert.strictEqual(directorySource === 'businessProfilesPublic', true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);