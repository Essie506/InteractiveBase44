// Post Context Authority — focused verification (architecture rule).
// ────────────────────────────────────────────────────────────────────────────
// Verifies the immutable-context + server-resolved-operating-account rules
// enforced by savePost (cloud-functions/src/post.ts):
//   1. Personal creation → Personal provenance.
//   2. Professional creation → Professional provenance only when Professional
//      authority is valid.
//   3. Personal context cannot create a Professional Post.
//   4. Professional context cannot accidentally create a Personal Post through
//      omitted context.
//   5. Business creation → Business provenance.
//   6. Invalid Business/context combinations are rejected.
//   7. Editing a Professional Post without sending operating_context keeps it
//      Professional (immutable context).
//   8. Editing Personal remains Personal.
//   9. Editing Business remains Business.
//  10. Update attempts cannot move a Post between contexts.
//  11. Business Posts cannot leak onto a staff member's Professional wall.
//
// The pure resolvers below mirror the server implementation in
// cloud-functions/src/post.ts (resolvePostOperatingAccount +
// assertNoContextConflict). Run with: node tests/post-context-authority.test.cjs

const assert = require('assert');

// ── Mirror of resolvePostOperatingAccount (cloud-functions/src/post.ts) ──
function resolvePostOperatingAccount(callerIdentityId, userData, businessMembership, clientBusinessId) {
  const activeContext = (userData && userData.active_context) || 'personal';

  if (activeContext === 'business') {
    const bizId = (userData && userData.active_business_id) || clientBusinessId || null;
    if (!bizId) throw new Error('invalid-argument: Business context requires a business.');
    if (!businessMembership || businessMembership.lifecycle_state !== 'active') {
      throw new Error('permission-denied: You must be an active member of this business to post as it.');
    }
    return {
      author_type: 'business',
      operating_context: 'business',
      business_id: bizId,
      publishing_account_id: bizId,
      publishing_account_type: 'business',
    };
  }

  if (activeContext === 'professional') {
    const isProfessionallyActivated =
      !!(userData && userData.professional_activated) ||
      (userData && userData.professional_onboarding_status === 'active');
    if (!isProfessionallyActivated) {
      throw new Error('permission-denied: Only an activated Professional context can create Professional posts.');
    }
    return {
      author_type: 'identity',
      operating_context: 'professional',
      business_id: null,
      publishing_account_id: callerIdentityId,
      publishing_account_type: 'identity',
    };
  }

  return {
    author_type: 'identity',
    operating_context: 'personal',
    business_id: null,
    publishing_account_id: callerIdentityId,
    publishing_account_type: 'identity',
  };
}

// ── Mirror of assertNoContextConflict (cloud-functions/src/post.ts) ──
function assertNoContextConflict(payload, resolved) {
  if (payload.author_type !== undefined && payload.author_type !== resolved.author_type)
    throw new Error('invalid-argument: author_type conflicts.');
  if (payload.operating_context !== undefined && payload.operating_context !== resolved.operating_context)
    throw new Error('invalid-argument: operating_context conflicts.');
  if (payload.business_id !== undefined && payload.business_id !== resolved.business_id)
    throw new Error('invalid-argument: business_id conflicts.');
  if (payload.publishing_account_id !== undefined && payload.publishing_account_id !== resolved.publishing_account_id)
    throw new Error('invalid-argument: publishing_account_id conflicts.');
  if (payload.publishing_account_type !== undefined && payload.publishing_account_type !== resolved.publishing_account_type)
    throw new Error('invalid-argument: publishing_account_type conflicts.');
}

// ── Mirror of the update-path immutability: the existing account is the
//    resolved account, and the update payload never carries authorship/
//    provenance fields. Returns the fields that would actually be written. ──
function applyImmutableUpdate(existing, clientPayload) {
  const existingAccount = {
    author_type: existing.author_type,
    operating_context: existing.operating_context,
    business_id: existing.business_id || null,
    publishing_account_id: existing.publishing_account_id,
    publishing_account_type: existing.publishing_account_type,
  };
  assertNoContextConflict(clientPayload || {}, existingAccount);
  // The update writes only mutable content fields; authorship/provenance
  // are preserved from `existing` because they are absent from the payload.
  return {
    ...existing,
    body: clientPayload.body !== undefined ? clientPayload.body : existing.body,
    visibility: clientPayload.visibility !== undefined ? clientPayload.visibility : existing.visibility,
    // Immutable fields preserved:
    author_type: existing.author_type,
    operating_context: existing.operating_context,
    business_id: existing.business_id,
    publishing_account_id: existing.publishing_account_id,
    publishing_account_type: existing.publishing_account_type,
  };
}

// ── Mirror of fetchPostsByAuthor's operating_context wall filter ──
function wallFilter(posts, operatingContext) {
  return posts.filter(p =>
    p.lifecycle_state === 'published'
    && (p.operating_context === operatingContext
      || (operatingContext === 'professional' && (p.operating_context === null || p.operating_context === undefined)))
  );
}

// ── Mirror of fetchPostsByBusiness's defensive business filter ──
function businessWallFilter(posts, businessId) {
  return posts.filter(p =>
    p.lifecycle_state === 'published'
    && p.author_type === 'business'
    && p.operating_context === 'business'
    && p.publishing_account_id === businessId
  );
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

const CALLER = 'identity-A';

console.log('\nCreate — Personal provenance');
test('Personal context (active_context=personal) produces Personal provenance', () => {
  const resolved = resolvePostOperatingAccount(CALLER, { active_context: 'personal' }, null, null);
  assert.strictEqual(resolved.author_type, 'identity');
  assert.strictEqual(resolved.operating_context, 'personal');
  assert.strictEqual(resolved.business_id, null);
  assert.strictEqual(resolved.publishing_account_id, CALLER);
  assert.strictEqual(resolved.publishing_account_type, 'identity');
});

test('Default (no active_context) falls back to Personal provenance', () => {
  const resolved = resolvePostOperatingAccount(CALLER, {}, null, null);
  assert.strictEqual(resolved.operating_context, 'personal');
  assert.strictEqual(resolved.author_type, 'identity');
});

console.log('\nCreate — Professional provenance + activation authority');
test('Professional context WITH activation produces Professional provenance', () => {
  const userData = { active_context: 'professional', professional_activated: true };
  const resolved = resolvePostOperatingAccount(CALLER, userData, null, null);
  assert.strictEqual(resolved.author_type, 'identity');
  assert.strictEqual(resolved.operating_context, 'professional');
  assert.strictEqual(resolved.business_id, null);
  assert.strictEqual(resolved.publishing_account_id, CALLER);
});

test('Professional context with onboarding_status=active produces Professional provenance', () => {
  const userData = { active_context: 'professional', professional_onboarding_status: 'active' };
  const resolved = resolvePostOperatingAccount(CALLER, userData, null, null);
  assert.strictEqual(resolved.operating_context, 'professional');
});

test('Professional context WITHOUT activation is rejected', () => {
  const userData = { active_context: 'professional', professional_activated: false, professional_onboarding_status: 'not_started' };
  assert.throws(() => resolvePostOperatingAccount(CALLER, userData, null, null), /permission-denied/);
});

test('Personal context cannot create a Professional Post (client operating_context=professional rejected)', () => {
  const userData = { active_context: 'personal' };
  const resolved = resolvePostOperatingAccount(CALLER, userData, null, null);
  assert.strictEqual(resolved.operating_context, 'personal');
  // Client attempts to claim professional context → conflict rejected.
  assert.throws(
    () => assertNoContextConflict({ operating_context: 'professional' }, resolved),
    /operating_context conflicts/,
  );
});

test('Professional context cannot accidentally create a Personal Post through omitted context', () => {
  const userData = { active_context: 'professional', professional_activated: true };
  // Client omits operating_context entirely → server resolves to professional.
  const resolved = resolvePostOperatingAccount(CALLER, userData, null, null);
  assert.strictEqual(resolved.operating_context, 'professional');
  // No conflict when operating_context is absent (undefined).
  assert.doesNotThrow(() => assertNoContextConflict({}, resolved));
});

console.log('\nCreate — Business provenance + invariant');
test('Business context with active membership produces Business provenance', () => {
  const userData = { active_context: 'business', active_business_id: 'biz-1' };
  const membership = { role: 'owner', lifecycle_state: 'active' };
  const resolved = resolvePostOperatingAccount(CALLER, userData, membership, 'biz-1');
  assert.strictEqual(resolved.author_type, 'business');
  assert.strictEqual(resolved.operating_context, 'business');
  assert.strictEqual(resolved.business_id, 'biz-1');
  assert.strictEqual(resolved.publishing_account_id, 'biz-1');
  assert.strictEqual(resolved.publishing_account_type, 'business');
});

test('Business context without active membership is rejected', () => {
  const userData = { active_context: 'business', active_business_id: 'biz-1' };
  assert.throws(
    () => resolvePostOperatingAccount(CALLER, userData, null, 'biz-1'),
    /permission-denied/,
  );
});

test('Business context with inactive membership is rejected', () => {
  const userData = { active_context: 'business', active_business_id: 'biz-1' };
  const membership = { role: 'staff', lifecycle_state: 'invited' };
  assert.throws(
    () => resolvePostOperatingAccount(CALLER, userData, membership, 'biz-1'),
    /permission-denied/,
  );
});

test('Business context without a business_id is rejected', () => {
  const userData = { active_context: 'business' };
  assert.throws(
    () => resolvePostOperatingAccount(CALLER, userData, null, null),
    /invalid-argument/,
  );
});

test('Personal context with client business_id is rejected (conflict)', () => {
  const userData = { active_context: 'personal' };
  const resolved = resolvePostOperatingAccount(CALLER, userData, null, null);
  assert.throws(
    () => assertNoContextConflict({ business_id: 'biz-1' }, resolved),
    /business_id conflicts/,
  );
});

test('Business invariant: author_type=business ⇔ operating_context=business', () => {
  const userData = { active_context: 'business', active_business_id: 'biz-1' };
  const membership = { role: 'owner', lifecycle_state: 'active' };
  const resolved = resolvePostOperatingAccount(CALLER, userData, membership, 'biz-1');
  assert.strictEqual(resolved.author_type === 'business', resolved.operating_context === 'business');
  assert.ok(resolved.business_id, 'business_id must be present for business posts');
});

console.log('\nUpdate — immutable context');
test('Editing a Professional Post without sending operating_context keeps it Professional', () => {
  const existing = {
    author_type: 'identity', operating_context: 'professional', business_id: null,
    publishing_account_id: CALLER, publishing_account_type: 'identity',
    body: 'old', visibility: 'public',
  };
  const updated = applyImmutableUpdate(existing, { body: 'new text' });
  assert.strictEqual(updated.operating_context, 'professional');
  assert.strictEqual(updated.author_type, 'identity');
  assert.strictEqual(updated.body, 'new text');
});

test('Editing a Personal Post keeps it Personal', () => {
  const existing = {
    author_type: 'identity', operating_context: 'personal', business_id: null,
    publishing_account_id: CALLER, publishing_account_type: 'identity',
    body: 'old', visibility: 'public',
  };
  const updated = applyImmutableUpdate(existing, { body: 'edited' });
  assert.strictEqual(updated.operating_context, 'personal');
});

test('Editing a Business Post keeps it Business', () => {
  const existing = {
    author_type: 'business', operating_context: 'business', business_id: 'biz-1',
    publishing_account_id: 'biz-1', publishing_account_type: 'business',
    body: 'old', visibility: 'public',
  };
  const updated = applyImmutableUpdate(existing, { body: 'edited' });
  assert.strictEqual(updated.operating_context, 'business');
  assert.strictEqual(updated.author_type, 'business');
  assert.strictEqual(updated.business_id, 'biz-1');
  assert.strictEqual(updated.publishing_account_id, 'biz-1');
});

test('Update attempt to move Professional → Personal via operating_context is rejected', () => {
  const existing = {
    author_type: 'identity', operating_context: 'professional', business_id: null,
    publishing_account_id: CALLER, publishing_account_type: 'identity',
  };
  assert.throws(
    () => applyImmutableUpdate(existing, { operating_context: 'personal', body: 'x' }),
    /operating_context conflicts/,
  );
});

test('Update attempt to move Personal → Business via author_type is rejected', () => {
  const existing = {
    author_type: 'identity', operating_context: 'personal', business_id: null,
    publishing_account_id: CALLER, publishing_account_type: 'identity',
  };
  assert.throws(
    () => applyImmutableUpdate(existing, { author_type: 'business', body: 'x' }),
    /author_type conflicts/,
  );
});

test('Update attempt to attach a business_id to an identity Post is rejected', () => {
  const existing = {
    author_type: 'identity', operating_context: 'professional', business_id: null,
    publishing_account_id: CALLER, publishing_account_type: 'identity',
  };
  assert.throws(
    () => applyImmutableUpdate(existing, { business_id: 'biz-1', body: 'x' }),
    /business_id conflicts/,
  );
});

test('Update attempt to change publishing_account_id is rejected', () => {
  const existing = {
    author_type: 'business', operating_context: 'business', business_id: 'biz-1',
    publishing_account_id: 'biz-1', publishing_account_type: 'business',
  };
  assert.throws(
    () => applyImmutableUpdate(existing, { publishing_account_id: 'biz-2', body: 'x' }),
    /publishing_account_id conflicts/,
  );
});

console.log('\nWall routing — no cross-context leakage');
test('Business Post cannot leak onto a staff member\'s Professional wall', () => {
  const businessPost = {
    id: 'p1', author_identity_id: CALLER, author_type: 'business',
    operating_context: 'business', business_id: 'biz-1',
    publishing_account_id: 'biz-1', lifecycle_state: 'published',
  };
  const professionalWall = wallFilter([businessPost], 'professional');
  assert.strictEqual(professionalWall.length, 0, 'Business post must not appear on the Professional wall');
});

test('Business Post cannot leak onto a staff member\'s Personal wall', () => {
  const businessPost = {
    id: 'p1', author_identity_id: CALLER, author_type: 'business',
    operating_context: 'business', business_id: 'biz-1',
    publishing_account_id: 'biz-1', lifecycle_state: 'published',
  };
  const personalWall = wallFilter([businessPost], 'personal');
  assert.strictEqual(personalWall.length, 0, 'Business post must not appear on the Personal wall');
});

test('Business Post appears on the Business wall', () => {
  const businessPost = {
    id: 'p1', author_identity_id: CALLER, author_type: 'business',
    operating_context: 'business', business_id: 'biz-1',
    publishing_account_id: 'biz-1', lifecycle_state: 'published',
  };
  const businessWall = businessWallFilter([businessPost], 'biz-1');
  assert.strictEqual(businessWall.length, 1);
});

test('Personal Post appears on the Personal wall only', () => {
  const personalPost = {
    id: 'p2', author_identity_id: CALLER, author_type: 'identity',
    operating_context: 'personal', business_id: null,
    publishing_account_id: CALLER, lifecycle_state: 'published',
  };
  assert.strictEqual(wallFilter([personalPost], 'personal').length, 1);
  assert.strictEqual(wallFilter([personalPost], 'professional').length, 0);
});

test('Professional Post appears on the Professional wall only', () => {
  const professionalPost = {
    id: 'p3', author_identity_id: CALLER, author_type: 'identity',
    operating_context: 'professional', business_id: null,
    publishing_account_id: CALLER, lifecycle_state: 'published',
  };
  assert.strictEqual(wallFilter([professionalPost], 'professional').length, 1);
  assert.strictEqual(wallFilter([professionalPost], 'personal').length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);