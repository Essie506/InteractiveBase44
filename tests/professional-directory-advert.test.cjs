/**
 * Professional Directory / Advert Architecture Tests
 * ───────────────────────────────────────────────────────────
 * Pure-node regression tests replicating the authoritative logic from:
 *   - cloud-functions/src/projectionEligibility.ts (isProfessionalListable,
 *     isProfessionalDirectoryListable)
 *   - cloud-functions/src/professionalProfile.ts (buildPublicProjection,
 *     buildDirectoryEntry, dual-projection save lifecycle)
 *   - cloud-functions/src/connections.ts (resolveProfessionalAccess with
 *     the restricted/advert tier)
 *
 * Covers the full visibility × directory_visibility matrix:
 *   Public + Listed | Public + Unlisted
 *   Connections + Listed | Connections + Unlisted
 *   Private + Listed | Private + Unlisted
 *
 * Tests:
 *   - public Profile projection (professionalProfilesPublic) independently
 *   - Directory advert projection (professionalDirectoryEntries) independently
 *   - Directory appearance
 *   - restricted advert route (stranger on connections/private listed)
 *   - owner access
 *   - Connection access
 *   - non-Connection access
 *   - public contact visibility flags
 *   - private contact never leaks
 *   - website visibility
 *   - public/contact hours
 *   - projection removal/restoration across setting transitions
 *
 * Usage: node tests/professional-directory-advert.test.cjs
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

function isProfessionalListable(data, screenName) {
  return data?.visibility === 'public'
    && data?.lifecycle_state === 'active'
    && !!screenName;
}

function isProfessionalDirectoryListable(data, screenName) {
  return data?.lifecycle_state === 'active'
    && data?.directory_visibility === 'listed'
    && !!screenName;
}

const PRIVATE_FIELDS = [
  'legal_name',
  'contact_email',
  'contact_phone',
  'away_message',
  'away_message_enabled',
  'onboarding_status',
  'activated_at',
  'bio',
  'gallery_media_ids',
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

function buildDirectoryEntry(identityId, profileId, data) {
  const pc = data.public_contact || {};
  return {
    identity_id: identityId,
    profile_id: profileId,
    screen_name: data.screen_name || null,
    display_name: data.display_name || null,
    business_name: data.business_name || null,
    avatar_url: data.avatar_url || null,
    cover_url: data.cover_url || null,
    headline: data.headline || null,
    profession: data.profession || null,
    professional_category: data.professional_category || null,
    professional_type: data.professional_type || null,
    services: Array.isArray(data.services) ? data.services : [],
    specialisms: Array.isArray(data.specialisms) ? data.specialisms : [],
    session_types: Array.isArray(data.session_types) ? data.session_types : [],
    service_area: data.service_area || null,
    location: data.location || null,
    verification_state: data.verification_state || 'not_verified',
    website: !!pc.website_visible ? (data.website || null) : null,
    public_email: !!pc.email_visible ? (pc.email || null) : null,
    public_phone: !!pc.phone_visible ? (pc.phone || null) : null,
    public_hours: Array.isArray(data.public_hours) ? data.public_hours : [],
    visibility: data.visibility || 'public',
    directory_visibility: data.directory_visibility || 'unlisted',
    lifecycle_state: data.lifecycle_state || 'draft',
  };
}

function connectionPairId(a, b) {
  return [a, b].sort().join('__');
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

// Dual-projection save — replicated from professionalProfile.ts.
// Maintains professionalProfilesPublic and professionalDirectoryEntries
// independently.
function applyProfileSave(store, identityId, profile) {
  const screenName = profile.screen_name || null;
  const isPub = isProfessionalListable(profile, screenName);
  const isDir = isProfessionalDirectoryListable(profile, screenName);

  // professionalProfilesPublic cleanup + write
  for (const [id, p] of Object.entries(store.professionalProfilesPublic)) {
    if (p.identity_id === identityId && (!isPub || id !== screenName)) {
      delete store.professionalProfilesPublic[id];
    }
  }
  if (isPub) {
    store.professionalProfilesPublic[screenName] = buildPublicProjection(identityId, 'doc1', profile);
  }

  // professionalDirectoryEntries cleanup + write
  for (const [id, p] of Object.entries(store.professionalDirectoryEntries)) {
    if (p.identity_id === identityId && (!isDir || id !== screenName)) {
      delete store.professionalDirectoryEntries[id];
    }
  }
  if (isDir) {
    store.professionalDirectoryEntries[screenName] = buildDirectoryEntry(identityId, 'doc1', profile);
  }
}

// resolveProfessionalAccess — replicated from connections.ts with the
// restricted/advert tier.
function resolveAccess(store, screenName, callerId) {
  // 1. public projection fast path
  const pub = store.professionalProfilesPublic[screenName];
  if (pub) {
    if (callerId && pub.identity_id === callerId) {
      return { access: 'owner', profile: pub, is_owner: true };
    }
    return { access: 'public', profile: pub, is_owner: false };
  }
  // 2. read private profile by screen_name
  const priv = Object.values(store.professionalProfiles)
    .find((p) => p.screen_name === screenName);
  if (!priv) return { access: 'not_found', profile: null, is_owner: false };
  const ownerId = priv.identity_id;
  if (callerId && ownerId === callerId) {
    return { access: 'owner', profile: buildPublicProjection(ownerId, 'doc1', priv), is_owner: true };
  }
  const visibility = priv.visibility || 'public';
  const lifecycle = priv.lifecycle_state || 'draft';
  const dirVis = priv.directory_visibility || 'unlisted';
  if (lifecycle !== 'active') return { access: 'denied', profile: null, is_owner: false };
  if (visibility === 'public') {
    return { access: 'public', profile: buildPublicProjection(ownerId, 'doc1', priv), is_owner: false };
  }
  if (visibility === 'connections') {
    if (!callerId) {
      if (dirVis === 'listed') return { access: 'restricted', profile: buildDirectoryEntry(ownerId, 'doc1', priv), is_owner: false };
      return { access: 'denied', profile: null, is_owner: false };
    }
    if (hasAcceptedConnection(store, callerId, ownerId)) {
      return { access: 'connection', profile: buildPublicProjection(ownerId, 'doc1', priv), is_owner: false };
    }
    if (dirVis === 'listed') return { access: 'restricted', profile: buildDirectoryEntry(ownerId, 'doc1', priv), is_owner: false };
    return { access: 'denied', profile: null, is_owner: false };
  }
  // private
  if (dirVis === 'listed') return { access: 'restricted', profile: buildDirectoryEntry(ownerId, 'doc1', priv), is_owner: false };
  return { access: 'denied', profile: null, is_owner: false };
}

// ═══════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════

function createStore() {
  return {
    professionalProfiles: {},
    professionalProfilesPublic: {},
    professionalDirectoryEntries: {},
    connections: {},
    blockRecords: {},
  };
}

function baseProfile(overrides = {}) {
  return {
    identity_id: 'pro1',
    display_name: 'Esther',
    screen_name: 'estherfitness',
    headline: 'Certified Personal Trainer',
    bio: 'Private bio — full profile only.',
    profession: 'Personal Trainer',
    professional_category: 'Personal Trainer',
    services: [{ id: 'personal-training', label: 'Personal Training' }],
    specialisms: [{ id: 'beginners', label: 'Beginners' }],
    session_types: [{ id: '1-to-1', label: '1-to-1' }],
    service_area: 'Central London',
    location: 'London, UK',
    website: 'https://esther.example.com',
    public_contact: {
      email: 'hello@esther.example.com',
      email_visible: false,
      phone: '+44 7000 000000',
      phone_visible: false,
      website_visible: false,
    },
    public_hours: [{ day: 'mon', open: '09:00', close: '18:00', closed: false }],
    visibility: 'public',
    directory_visibility: 'unlisted',
    lifecycle_state: 'active',
    verification_state: 'verified',
    // private fields (must never leak to any public projection)
    legal_name: 'Esther Cole',
    contact_email: 'esther@example.com',
    contact_phone: '+44 7000 000000',
    away_message: 'Back next week',
    away_message_enabled: true,
    onboarding_status: 'active',
    activated_at: '2026-01-01T00:00:00.000Z',
    gallery_media_ids: ['media_3', 'media_4'],
    ...overrides,
  };
}

function seed(store, overrides = {}) {
  const profile = baseProfile(overrides);
  store.professionalProfiles['doc1'] = profile;
  applyProfileSave(store, profile.identity_id, profile);
  return profile;
}

function connect(store, a, b) {
  store.connections[connectionPairId(a, b)] = {
    identity_a_id: [a, b].sort()[0],
    identity_b_id: [a, b].sort()[1],
    status: 'active',
  };
}

// ═══════════════════════════════════════════════════════════
// MATRIX: PUBLIC + LISTED
// ═══════════════════════════════════════════════════════════

test('Public + Listed: public projection exists', () => {
  const store = createStore();
  seed(store, { directory_visibility: 'listed' });
  assert.ok(store.professionalProfilesPublic['estherfitness']);
});

test('Public + Listed: directory entry exists', () => {
  const store = createStore();
  seed(store, { directory_visibility: 'listed' });
  assert.ok(store.professionalDirectoryEntries['estherfitness']);
});

test('Public + Listed: stranger gets public access (full profile)', () => {
  const store = createStore();
  seed(store, { directory_visibility: 'listed' });
  const res = resolveAccess(store, 'estherfitness', 'stranger');
  assert.strictEqual(res.access, 'public');
  assert.ok(res.profile);
});

test('Public + Listed: owner gets owner access', () => {
  const store = createStore();
  seed(store, { directory_visibility: 'listed' });
  const res = resolveAccess(store, 'estherfitness', 'pro1');
  assert.strictEqual(res.access, 'owner');
  assert.strictEqual(res.is_owner, true);
});

// ═══════════════════════════════════════════════════════════
// MATRIX: PUBLIC + UNLISTED
// ═══════════════════════════════════════════════════════════

test('Public + Unlisted: public projection exists', () => {
  const store = createStore();
  seed(store, { directory_visibility: 'unlisted' });
  assert.ok(store.professionalProfilesPublic['estherfitness']);
});

test('Public + Unlisted: NO directory entry', () => {
  const store = createStore();
  seed(store, { directory_visibility: 'unlisted' });
  assert.ok(!store.professionalDirectoryEntries['estherfitness']);
});

test('Public + Unlisted: stranger still gets public access by URL', () => {
  const store = createStore();
  seed(store, { directory_visibility: 'unlisted' });
  const res = resolveAccess(store, 'estherfitness', 'stranger');
  assert.strictEqual(res.access, 'public');
});

// ═══════════════════════════════════════════════════════════
// MATRIX: CONNECTIONS + LISTED
// ═══════════════════════════════════════════════════════════

test('Connections + Listed: NO public projection', () => {
  const store = createStore();
  seed(store, { visibility: 'connections', directory_visibility: 'listed' });
  assert.ok(!store.professionalProfilesPublic['estherfitness']);
});

test('Connections + Listed: directory entry exists', () => {
  const store = createStore();
  seed(store, { visibility: 'connections', directory_visibility: 'listed' });
  assert.ok(store.professionalDirectoryEntries['estherfitness']);
});

test('Connections + Listed: stranger gets restricted (advert only)', () => {
  const store = createStore();
  seed(store, { visibility: 'connections', directory_visibility: 'listed' });
  const res = resolveAccess(store, 'estherfitness', 'stranger');
  assert.strictEqual(res.access, 'restricted');
  assert.ok(res.profile);
});

test('Connections + Listed: accepted Connection gets connection access (full profile)', () => {
  const store = createStore();
  seed(store, { visibility: 'connections', directory_visibility: 'listed' });
  connect(store, 'viewer1', 'pro1');
  const res = resolveAccess(store, 'estherfitness', 'viewer1');
  assert.strictEqual(res.access, 'connection');
});

test('Connections + Listed: signed-out visitor gets restricted (advert)', () => {
  const store = createStore();
  seed(store, { visibility: 'connections', directory_visibility: 'listed' });
  const res = resolveAccess(store, 'estherfitness', null);
  assert.strictEqual(res.access, 'restricted');
});

test('Connections + Listed: owner gets owner access', () => {
  const store = createStore();
  seed(store, { visibility: 'connections', directory_visibility: 'listed' });
  const res = resolveAccess(store, 'estherfitness', 'pro1');
  assert.strictEqual(res.access, 'owner');
});

// ═══════════════════════════════════════════════════════════
// MATRIX: CONNECTIONS + UNLISTED
// ═══════════════════════════════════════════════════════════

test('Connections + Unlisted: NO public projection', () => {
  const store = createStore();
  seed(store, { visibility: 'connections', directory_visibility: 'unlisted' });
  assert.ok(!store.professionalProfilesPublic['estherfitness']);
});

test('Connections + Unlisted: NO directory entry', () => {
  const store = createStore();
  seed(store, { visibility: 'connections', directory_visibility: 'unlisted' });
  assert.ok(!store.professionalDirectoryEntries['estherfitness']);
});

test('Connections + Unlisted: stranger gets denied', () => {
  const store = createStore();
  seed(store, { visibility: 'connections', directory_visibility: 'unlisted' });
  const res = resolveAccess(store, 'estherfitness', 'stranger');
  assert.strictEqual(res.access, 'denied');
  assert.strictEqual(res.profile, null);
});

test('Connections + Unlisted: accepted Connection still gets connection access by URL', () => {
  const store = createStore();
  seed(store, { visibility: 'connections', directory_visibility: 'unlisted' });
  connect(store, 'viewer1', 'pro1');
  const res = resolveAccess(store, 'estherfitness', 'viewer1');
  assert.strictEqual(res.access, 'connection');
});

// ═══════════════════════════════════════════════════════════
// MATRIX: PRIVATE + LISTED
// ═══════════════════════════════════════════════════════════

test('Private + Listed: NO public projection', () => {
  const store = createStore();
  seed(store, { visibility: 'private', directory_visibility: 'listed' });
  assert.ok(!store.professionalProfilesPublic['estherfitness']);
});

test('Private + Listed: directory entry exists (business-card mode)', () => {
  const store = createStore();
  seed(store, { visibility: 'private', directory_visibility: 'listed' });
  assert.ok(store.professionalDirectoryEntries['estherfitness']);
});

test('Private + Listed: stranger gets restricted (advert only, no full profile)', () => {
  const store = createStore();
  seed(store, { visibility: 'private', directory_visibility: 'listed' });
  const res = resolveAccess(store, 'estherfitness', 'stranger');
  assert.strictEqual(res.access, 'restricted');
});

test('Private + Listed: Connection gets restricted (advert only — private means private)', () => {
  const store = createStore();
  seed(store, { visibility: 'private', directory_visibility: 'listed' });
  connect(store, 'viewer1', 'pro1');
  const res = resolveAccess(store, 'estherfitness', 'viewer1');
  assert.strictEqual(res.access, 'restricted');
});

test('Private + Listed: owner gets owner access (full profile)', () => {
  const store = createStore();
  seed(store, { visibility: 'private', directory_visibility: 'listed' });
  const res = resolveAccess(store, 'estherfitness', 'pro1');
  assert.strictEqual(res.access, 'owner');
});

// ═══════════════════════════════════════════════════════════
// MATRIX: PRIVATE + UNLISTED
// ═══════════════════════════════════════════════════════════

test('Private + Unlisted: NO public projection', () => {
  const store = createStore();
  seed(store, { visibility: 'private', directory_visibility: 'unlisted' });
  assert.ok(!store.professionalProfilesPublic['estherfitness']);
});

test('Private + Unlisted: NO directory entry', () => {
  const store = createStore();
  seed(store, { visibility: 'private', directory_visibility: 'unlisted' });
  assert.ok(!store.professionalDirectoryEntries['estherfitness']);
});

test('Private + Unlisted: stranger gets denied', () => {
  const store = createStore();
  seed(store, { visibility: 'private', directory_visibility: 'unlisted' });
  assert.strictEqual(resolveAccess(store, 'estherfitness', 'stranger').access, 'denied');
});

test('Private + Unlisted: Connection gets denied', () => {
  const store = createStore();
  seed(store, { visibility: 'private', directory_visibility: 'unlisted' });
  connect(store, 'viewer1', 'pro1');
  assert.strictEqual(resolveAccess(store, 'estherfitness', 'viewer1').access, 'denied');
});

test('Private + Unlisted: owner gets owner access', () => {
  const store = createStore();
  seed(store, { visibility: 'private', directory_visibility: 'unlisted' });
  assert.strictEqual(resolveAccess(store, 'estherfitness', 'pro1').access, 'owner');
});

// ═══════════════════════════════════════════════════════════
// ADVERT CONTENT SAFETY
// ═══════════════════════════════════════════════════════════

test('Advert: buildDirectoryEntry excludes every private field', () => {
  const entry = buildDirectoryEntry('pro1', 'doc1', baseProfile({ directory_visibility: 'listed' }));
  for (const f of PRIVATE_FIELDS) {
    assert.ok(!(f in entry), `private field "${f}" must not appear in the directory advert`);
  }
});

test('Advert: restricted-tier profile (returned to a stranger) has no private fields', () => {
  const store = createStore();
  seed(store, { visibility: 'connections', directory_visibility: 'listed' });
  const res = resolveAccess(store, 'estherfitness', 'stranger');
  for (const f of PRIVATE_FIELDS) {
    assert.ok(!(f in res.profile), `private field "${f}" leaked to restricted advert`);
  }
});

test('Advert: contains discovery-safe fields (services, specialisms, session_types, headline, location)', () => {
  const entry = buildDirectoryEntry('pro1', 'doc1', baseProfile({ directory_visibility: 'listed' }));
  assert.ok('services' in entry);
  assert.ok('specialisms' in entry);
  assert.ok('session_types' in entry);
  assert.ok('headline' in entry);
  assert.ok('service_area' in entry);
  assert.strictEqual(entry.display_name, 'Esther');
});

// ═══════════════════════════════════════════════════════════
// PUBLIC CONTACT VISIBILITY FLAGS
// ═══════════════════════════════════════════════════════════

test('Public contact: website hidden when website_visible=false', () => {
  const entry = buildDirectoryEntry('pro1', 'doc1', baseProfile({ directory_visibility: 'listed' }));
  assert.strictEqual(entry.website, null);
});

test('Public contact: website shown when website_visible=true', () => {
  const p = baseProfile({ directory_visibility: 'listed' });
  p.public_contact.website_visible = true;
  const entry = buildDirectoryEntry('pro1', 'doc1', p);
  assert.strictEqual(entry.website, 'https://esther.example.com');
});

test('Public contact: email hidden when email_visible=false', () => {
  const entry = buildDirectoryEntry('pro1', 'doc1', baseProfile({ directory_visibility: 'listed' }));
  assert.strictEqual(entry.public_email, null);
});

test('Public contact: email shown when email_visible=true', () => {
  const p = baseProfile({ directory_visibility: 'listed' });
  p.public_contact.email_visible = true;
  const entry = buildDirectoryEntry('pro1', 'doc1', p);
  assert.strictEqual(entry.public_email, 'hello@esther.example.com');
});

test('Public contact: phone hidden when phone_visible=false', () => {
  const entry = buildDirectoryEntry('pro1', 'doc1', baseProfile({ directory_visibility: 'listed' }));
  assert.strictEqual(entry.public_phone, null);
});

test('Public contact: phone shown when phone_visible=true', () => {
  const p = baseProfile({ directory_visibility: 'listed' });
  p.public_contact.phone_visible = true;
  const entry = buildDirectoryEntry('pro1', 'doc1', p);
  assert.strictEqual(entry.public_phone, '+44 7000 000000');
});

test('Private contact: contact_email and contact_phone NEVER appear in the advert', () => {
  const p = baseProfile({ directory_visibility: 'listed' });
  p.public_contact.email_visible = true;
  p.public_contact.phone_visible = true;
  const entry = buildDirectoryEntry('pro1', 'doc1', p);
  assert.ok(!('contact_email' in entry));
  assert.ok(!('contact_phone' in entry));
  // public_email is the explicitly-enabled public field, distinct from contact_email
  assert.strictEqual(entry.public_email, 'hello@esther.example.com');
});

// ═══════════════════════════════════════════════════════════
// PUBLIC / CONTACT HOURS
// ═══════════════════════════════════════════════════════════

test('Public hours: included in the advert when provided', () => {
  const entry = buildDirectoryEntry('pro1', 'doc1', baseProfile({ directory_visibility: 'listed' }));
  assert.deepStrictEqual(entry.public_hours, [{ day: 'mon', open: '09:00', close: '18:00', closed: false }]);
});

test('Public hours: empty array when not provided', () => {
  const p = baseProfile({ directory_visibility: 'listed' });
  delete p.public_hours;
  const entry = buildDirectoryEntry('pro1', 'doc1', p);
  assert.deepStrictEqual(entry.public_hours, []);
});

// ═══════════════════════════════════════════════════════════
// PROJECTION INDEPENDENCE ACROSS SETTING TRANSITIONS
// ═══════════════════════════════════════════════════════════

test('Transition Public+Listed → Connections+Listed: public projection removed, directory entry retained', () => {
  const store = createStore();
  const profile = seed(store, { directory_visibility: 'listed' });
  assert.ok(store.professionalProfilesPublic['estherfitness']);
  assert.ok(store.professionalDirectoryEntries['estherfitness']);
  const updated = { ...profile, visibility: 'connections' };
  applyProfileSave(store, profile.identity_id, updated);
  assert.ok(!store.professionalProfilesPublic['estherfitness']);
  assert.ok(store.professionalDirectoryEntries['estherfitness']);
});

test('Transition Public+Listed → Public+Unlisted: directory entry removed, public projection retained', () => {
  const store = createStore();
  const profile = seed(store, { directory_visibility: 'listed' });
  const updated = { ...profile, directory_visibility: 'unlisted' };
  applyProfileSave(store, profile.identity_id, updated);
  assert.ok(store.professionalProfilesPublic['estherfitness']);
  assert.ok(!store.professionalDirectoryEntries['estherfitness']);
});

test('Transition Connections+Listed → Private+Listed: directory entry retained, no public projection', () => {
  const store = createStore();
  const profile = seed(store, { visibility: 'connections', directory_visibility: 'listed' });
  const updated = { ...profile, visibility: 'private' };
  applyProfileSave(store, profile.identity_id, updated);
  assert.ok(!store.professionalProfilesPublic['estherfitness']);
  assert.ok(store.professionalDirectoryEntries['estherfitness']);
});

test('Transition Listed → Unlisted does NOT alter profile visibility', () => {
  const store = createStore();
  const profile = seed(store, { directory_visibility: 'listed' });
  const updated = { ...profile, directory_visibility: 'unlisted' };
  applyProfileSave(store, profile.identity_id, updated);
  // visibility is unchanged on the private profile
  assert.strictEqual(store.professionalProfiles['doc1'].visibility, 'public');
  assert.ok(!store.professionalDirectoryEntries['estherfitness']);
});

test('Transition Unlisted → Listed creates the advert without altering visibility', () => {
  const store = createStore();
  const profile = seed(store, { visibility: 'connections', directory_visibility: 'unlisted' });
  assert.ok(!store.professionalDirectoryEntries['estherfitness']);
  const updated = { ...profile, directory_visibility: 'listed' };
  applyProfileSave(store, profile.identity_id, updated);
  assert.ok(store.professionalDirectoryEntries['estherfitness']);
  assert.strictEqual(store.professionalProfiles['doc1'].visibility, 'connections');
  assert.ok(!store.professionalProfilesPublic['estherfitness']);
});

test('Screen-name change removes old advert and creates new (directory)', () => {
  const store = createStore();
  const profile = seed(store, { directory_visibility: 'listed' });
  const updated = { ...profile, screen_name: 'esthernew' };
  applyProfileSave(store, profile.identity_id, updated);
  assert.ok(!store.professionalDirectoryEntries['estherfitness']);
  assert.ok(store.professionalDirectoryEntries['esthernew']);
});

// ═══════════════════════════════════════════════════════════
// BLOCK OVERRIDE
// ═══════════════════════════════════════════════════════════

test('Block: a block overrides Connection access on a connections+listed profile (stranger gets restricted, not connection)', () => {
  const store = createStore();
  seed(store, { visibility: 'connections', directory_visibility: 'listed' });
  connect(store, 'viewer1', 'pro1');
  assert.strictEqual(resolveAccess(store, 'estherfitness', 'viewer1').access, 'connection');
  store.blockRecords['viewer1__pro1'] = { status: 'active' };
  // blocked → no connection access; listed → restricted advert
  assert.strictEqual(resolveAccess(store, 'estherfitness', 'viewer1').access, 'restricted');
});

// ═══════════════════════════════════════════════════════════
// DIRECTORY APPEARANCE
// ═══════════════════════════════════════════════════════════

test('Directory appearance: only listed profiles appear in professionalDirectoryEntries', () => {
  const store = createStore();
  seed(store, { screen_name: 'listed1', directory_visibility: 'listed' });
  seed(store, { identity_id: 'pro2', screen_name: 'unlisted1', directory_visibility: 'unlisted' });
  const ids = Object.keys(store.professionalDirectoryEntries);
  assert.ok(ids.includes('listed1'));
  assert.ok(!ids.includes('unlisted1'));
});

test('Directory appearance: a private+listed profile appears in the Directory (business-card mode)', () => {
  const store = createStore();
  seed(store, { visibility: 'private', directory_visibility: 'listed' });
  assert.ok(store.professionalDirectoryEntries['estherfitness']);
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);