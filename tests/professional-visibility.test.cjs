/**
 * Professional Profile Visibility Tests — Relationship System
 * ───────────────────────────────────────────────────────────
 * Pure-node regression tests replicating the authoritative logic from:
 *   - cloud-functions/src/connections.ts       (resolveProfessionalAccess)
 *   - cloud-functions/src/professionalProfile.ts (projection lifecycle)
 *   - cloud-functions/src/shared.ts             (hasAcceptedConnection)
 *
 * Covers:
 *   - public visible signed-out
 *   - public Directory eligible (projection exists)
 *   - connections-only visible to owner
 *   - connections-only visible to active Connection
 *   - connections-only denied to non-Connection
 *   - connections-only denied to signed-out visitor
 *   - connections-only not publicly projected / not Directory eligible
 *   - private visible to owner
 *   - private denied to Connection
 *   - private denied to everyone else
 *   - changing public → connections removes projection
 *   - changing connections → public restores projection
 *   - block overrides Connection access
 *   - resolver returns only public-safe fields to a Connection
 *
 * Usage:
 *   node tests/professional-visibility.test.cjs
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
// REPLICATED LOGIC
// ═══════════════════════════════════════════════════════════

function connectionPairId(a, b) {
  return [a, b].sort().join('__');
}

const PRIVATE_FIELDS = [
  'legal_name',
  'contact_email',
  'contact_phone',
  'onboarding_status',
  'activated_at',
  'away_message',
  'away_message_enabled',
];

function buildPublicProjection(identityId, profileId, data) {
  return {
    identity_id: identityId,
    profile_id: profileId,
    display_name: data.display_name || null,
    business_name: data.business_name || null,
    screen_name: data.screen_name || null,
    avatar_url: data.avatar_url || null,
    headline: data.headline || null,
    bio: data.bio || null,
    profession: data.profession || null,
    professional_category: data.professional_category || null,
    professional_type: data.professional_type || null,
    specialisms: Array.isArray(data.specialisms) ? data.specialisms : [],
    session_types: Array.isArray(data.session_types) ? data.session_types : [],
    services: Array.isArray(data.services) ? data.services : [],
    service_area: data.service_area || null,
    location: data.location || null,
    website: data.website || null,
    gallery_media_ids: Array.isArray(data.gallery_media_ids) ? data.gallery_media_ids : [],
    verification_state: data.verification_state || 'not_verified',
    visibility: data.visibility || 'public',
    lifecycle_state: data.lifecycle_state || 'draft',
  };
}

function isPubliclyListable(profile) {
  return profile.visibility === 'public'
    && profile.lifecycle_state === 'active'
    && !!profile.screen_name;
}

// Projection lifecycle — replicated from professionalProfile.ts save logic.
// Removes any projection for the identity that no longer matches, and writes
// the projection when publicly listable.
function applyProfileSave(store, identityId, profile) {
  const existingProjections = Object.entries(store.professionalProfilesPublic)
    .filter(([, p]) => p.identity_id === identityId);
  for (const [id] of existingProjections) {
    if (!isPubliclyListable(profile) || id !== profile.screen_name) {
      delete store.professionalProfilesPublic[id];
    }
  }
  if (isPubliclyListable(profile)) {
    store.professionalProfilesPublic[profile.screen_name] = buildPublicProjection(identityId, 'doc1', profile);
  }
}

function isBlocked(store, a, b) {
  const ab = store.blockRecords[`${a}__${b}`];
  const ba = store.blockRecords[`${b}__${a}`];
  return (ab && ab.status === 'active') || (ba && ba.status === 'active');
}

function hasAcceptedConnection(store, a, b) {
  if (!a || !b || a === b) return false;
  if (isBlocked(store, a, b)) return false;
  const c = store.connections[connectionPairId(a, b)];
  return !!c && c.status === 'active';
}

// resolveProfessionalAccess — replicated from connections.ts
function resolveAccess(store, screenName, callerId) {
  const pub = store.professionalProfilesPublic[screenName];
  if (pub) {
    if (callerId && pub.identity_id === callerId) {
      return { access: 'owner', profile: pub, is_owner: true };
    }
    return { access: 'public', profile: pub, is_owner: false };
  }
  const priv = Object.values(store.professionalProfiles)
    .find((p) => p.screen_name === screenName);
  if (!priv) return { access: 'not_found', profile: null, is_owner: false };
  const ownerId = priv.identity_id;
  if (callerId && ownerId === callerId) {
    return { access: 'owner', profile: buildPublicProjection(ownerId, 'doc1', priv), is_owner: true };
  }
  const visibility = priv.visibility || 'public';
  const lifecycle = priv.lifecycle_state || 'draft';
  if (lifecycle !== 'active') return { access: 'denied', profile: null, is_owner: false };
  if (visibility === 'public') {
    return { access: 'public', profile: buildPublicProjection(ownerId, 'doc1', priv), is_owner: false };
  }
  if (visibility === 'connections') {
    if (!callerId) return { access: 'denied', profile: null, is_owner: false };
    if (!hasAcceptedConnection(store, callerId, ownerId)) {
      return { access: 'denied', profile: null, is_owner: false };
    }
    return { access: 'connection', profile: buildPublicProjection(ownerId, 'doc1', priv), is_owner: false };
  }
  return { access: 'denied', profile: null, is_owner: false };
}

// ═══════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════

function createStore() {
  return {
    professionalProfiles: {},
    professionalProfilesPublic: {},
    connections: {},
    blockRecords: {},
  };
}

function publicProfile(overrides = {}) {
  return {
    identity_id: 'pro1',
    display_name: 'Esther',
    screen_name: 'estherfitness',
    headline: 'Certified Personal Trainer',
    bio: 'Helping beginners move with confidence.',
    profession: 'Personal Trainer',
    professional_category: 'Personal Trainer',
    services: [{ id: 'personal-training', label: 'Personal Training' }],
    service_area: 'Central London',
    location: 'London, UK',
    visibility: 'public',
    lifecycle_state: 'active',
    verification_state: 'verified',
    // private fields (must never be projected)
    legal_name: 'Esther Cole',
    contact_email: 'esther@example.com',
    contact_phone: '+44 7000 000000',
    away_message: 'Back next week',
    away_message_enabled: true,
    onboarding_status: 'active',
    activated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function seedPublic(store, profile = publicProfile()) {
  store.professionalProfiles['doc1'] = profile;
  applyProfileSave(store, profile.identity_id, profile);
  return profile;
}

function seedConnectionsOnly(store, overrides = {}) {
  const profile = publicProfile({
    visibility: 'connections',
    screen_name: 'estherprivate',
    ...overrides,
  });
  store.professionalProfiles['doc1'] = profile;
  applyProfileSave(store, profile.identity_id, profile);
  return profile;
}

function seedPrivate(store, overrides = {}) {
  const profile = publicProfile({
    visibility: 'private',
    screen_name: 'estherhidden',
    ...overrides,
  });
  store.professionalProfiles['doc1'] = profile;
  applyProfileSave(store, profile.identity_id, profile);
  return profile;
}

function connect(store, a, b) {
  store.connections[connectionPairId(a, b)] = {
    identity_a_id: [a, b].sort()[0],
    identity_b_id: [a, b].sort()[1],
    status: 'active',
    established_at: 'now',
    disconnected_at: null,
  };
}

// ═══════════════════════════════════════════════════════════
// PUBLIC
// ═══════════════════════════════════════════════════════════

test('public: visible to a signed-out visitor', () => {
  const store = createStore();
  seedPublic(store);
  const res = resolveAccess(store, 'estherfitness', null);
  assert.strictEqual(res.access, 'public');
  assert.ok(res.profile);
});

test('public: Directory eligible (projection exists)', () => {
  const store = createStore();
  seedPublic(store);
  assert.ok(store.professionalProfilesPublic['estherfitness']);
});

test('public: visible to an authenticated non-owner', () => {
  const store = createStore();
  seedPublic(store);
  const res = resolveAccess(store, 'estherfitness', 'viewer1');
  assert.strictEqual(res.access, 'public');
  assert.strictEqual(res.is_owner, false);
});

test('public: owner gets owner access with is_owner=true', () => {
  const store = createStore();
  seedPublic(store);
  const res = resolveAccess(store, 'estherfitness', 'pro1');
  assert.strictEqual(res.access, 'owner');
  assert.strictEqual(res.is_owner, true);
});

// ═══════════════════════════════════════════════════════════
// CONNECTIONS-ONLY
// ═══════════════════════════════════════════════════════════

test('connections-only: visible to owner', () => {
  const store = createStore();
  seedConnectionsOnly(store);
  const res = resolveAccess(store, 'estherprivate', 'pro1');
  assert.strictEqual(res.access, 'owner');
  assert.strictEqual(res.is_owner, true);
  assert.ok(res.profile);
});

test('connections-only: visible to an active Connection', () => {
  const store = createStore();
  seedConnectionsOnly(store);
  connect(store, 'viewer1', 'pro1');
  const res = resolveAccess(store, 'estherprivate', 'viewer1');
  assert.strictEqual(res.access, 'connection');
  assert.ok(res.profile);
});

test('connections-only: denied to a non-Connection', () => {
  const store = createStore();
  seedConnectionsOnly(store);
  const res = resolveAccess(store, 'estherprivate', 'stranger');
  assert.strictEqual(res.access, 'denied');
  assert.strictEqual(res.profile, null);
});

test('connections-only: denied to a signed-out visitor', () => {
  const store = createStore();
  seedConnectionsOnly(store);
  const res = resolveAccess(store, 'estherprivate', null);
  assert.strictEqual(res.access, 'denied');
  assert.strictEqual(res.profile, null);
});

test('connections-only: NOT publicly projected', () => {
  const store = createStore();
  seedConnectionsOnly(store);
  assert.ok(!store.professionalProfilesPublic['estherprivate']);
});

test('connections-only: NOT Directory eligible (no projection)', () => {
  const store = createStore();
  seedConnectionsOnly(store);
  const listable = Object.keys(store.professionalProfilesPublic);
  assert.ok(!listable.includes('estherprivate'));
});

test('connections-only: resolver returns only public-safe fields to a Connection', () => {
  const store = createStore();
  seedConnectionsOnly(store);
  connect(store, 'viewer1', 'pro1');
  const res = resolveAccess(store, 'estherprivate', 'viewer1');
  for (const f of PRIVATE_FIELDS) {
    assert.ok(!(f in res.profile), `private field "${f}" must not be returned to a connection`);
  }
});

test('connections-only: a disconnected connection is denied', () => {
  const store = createStore();
  seedConnectionsOnly(store);
  connect(store, 'viewer1', 'pro1');
  store.connections[connectionPairId('viewer1', 'pro1')].status = 'disconnected';
  const res = resolveAccess(store, 'estherprivate', 'viewer1');
  assert.strictEqual(res.access, 'denied');
});

// ═══════════════════════════════════════════════════════════
// PRIVATE
// ═══════════════════════════════════════════════════════════

test('private: visible to owner', () => {
  const store = createStore();
  seedPrivate(store);
  const res = resolveAccess(store, 'estherhidden', 'pro1');
  assert.strictEqual(res.access, 'owner');
  assert.ok(res.profile);
});

test('private: denied to a Connection', () => {
  const store = createStore();
  seedPrivate(store);
  connect(store, 'viewer1', 'pro1');
  const res = resolveAccess(store, 'estherhidden', 'viewer1');
  assert.strictEqual(res.access, 'denied');
});

test('private: denied to everyone else (non-connection, signed-out)', () => {
  const store = createStore();
  seedPrivate(store);
  assert.strictEqual(resolveAccess(store, 'estherhidden', 'stranger').access, 'denied');
  assert.strictEqual(resolveAccess(store, 'estherhidden', null).access, 'denied');
});

test('private: NOT publicly projected', () => {
  const store = createStore();
  seedPrivate(store);
  assert.ok(!store.professionalProfilesPublic['estherhidden']);
});

// ═══════════════════════════════════════════════════════════
// PROJECTION LIFECYCLE ON VISIBILITY CHANGE
// ═══════════════════════════════════════════════════════════

test('visibility change public → connections removes the projection', () => {
  const store = createStore();
  const profile = seedPublic(store);
  assert.ok(store.professionalProfilesPublic['estherfitness']);
  const updated = { ...profile, visibility: 'connections' };
  applyProfileSave(store, profile.identity_id, updated);
  assert.ok(!store.professionalProfilesPublic['estherfitness']);
});

test('visibility change connections → public restores the projection', () => {
  const store = createStore();
  const profile = seedConnectionsOnly(store);
  assert.ok(!store.professionalProfilesPublic['estherprivate']);
  const updated = { ...profile, visibility: 'public' };
  applyProfileSave(store, profile.identity_id, updated);
  assert.ok(store.professionalProfilesPublic['estherprivate']);
});

test('visibility change public → private removes the projection', () => {
  const store = createStore();
  const profile = seedPublic(store);
  const updated = { ...profile, visibility: 'private' };
  applyProfileSave(store, profile.identity_id, updated);
  assert.ok(!store.professionalProfilesPublic['estherfitness']);
});

// ═══════════════════════════════════════════════════════════
// BLOCK OVERRIDES CONNECTION ACCESS
// ═══════════════════════════════════════════════════════════

test('block: an active block overrides Connection access on a connections-only profile', () => {
  const store = createStore();
  seedConnectionsOnly(store);
  connect(store, 'viewer1', 'pro1');
  assert.strictEqual(resolveAccess(store, 'estherprivate', 'viewer1').access, 'connection');
  store.blockRecords['viewer1__pro1'] = { status: 'active' };
  assert.strictEqual(resolveAccess(store, 'estherprivate', 'viewer1').access, 'denied');
});

test('block: block in either direction overrides Connection access', () => {
  const store = createStore();
  seedConnectionsOnly(store);
  connect(store, 'viewer1', 'pro1');
  store.blockRecords['pro1__viewer1'] = { status: 'active' }; // owner blocked viewer
  assert.strictEqual(resolveAccess(store, 'estherprivate', 'viewer1').access, 'denied');
});

// ═══════════════════════════════════════════════════════════
// NOT FOUND / DRAFT
// ═══════════════════════════════════════════════════════════

test('not found: unknown screen_name returns not_found', () => {
  const store = createStore();
  assert.strictEqual(resolveAccess(store, 'nobody', 'viewer1').access, 'not_found');
});

test('draft: a draft connections profile is denied to a connection (lifecycle gate)', () => {
  const store = createStore();
  seedConnectionsOnly(store, { lifecycle_state: 'draft' });
  connect(store, 'viewer1', 'pro1');
  assert.strictEqual(resolveAccess(store, 'estherprivate', 'viewer1').access, 'denied');
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);