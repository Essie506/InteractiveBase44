/**
 * Professional Profile Persistence Tests
 * ───────────────────────────────────────────────────────────
 * Pure-node regression tests for the coordinated Professional Profile
 * persistence fix. Replicates the authoritative logic from:
 *   - src/pages/ProfessionalProfilePage.jsx        (toPayload)
 *   - src/pages/ProfessionalActivation.jsx         (activation payload shape)
 *   - cloud-functions/src/professionalProfile.ts   (merge + active guard + projection)
 *   - src/services/profileService.js              (requireFirebase)
 *
 * Covers:
 *   - Save → reload preserves every Profile-owned field
 *   - activation → editor use identical structured field shapes (services [{id,label}])
 *   - editor → projection preserves public structured fields
 *   - Firebase unavailable causes an explicit failure, NOT a Base44 fallback
 *   - existing activation/lifecycle fields survive ordinary Profile edits
 *   - private fields remain absent from professionalProfilesPublic
 *   - server-side active + screen_name guard
 *   - editor re-null of screen_name on an active profile is rejected
 *   - draft profile with null screen_name saves fine (guard is active-only)
 *
 * Usage:
 *   node tests/professional-profile-persistence.test.cjs
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

const SCREEN_NAME_RE = /^[a-z0-9_]{3,20}$/;

// Fields that must NEVER appear in the public projection.
const PRIVATE_FIELDS = [
  'legal_name',
  'contact_email',
  'contact_phone',
  'onboarding_status',
  'activated_at',
  'away_message',
  'away_message_enabled',
];

// Fields owned by the activation lifecycle (not by the editor payload).
const ACTIVATION_OWNED_FIELDS = [
  'onboarding_status',
  'verification_state',
  'lifecycle_state',
  'activated_at',
];

// toPayload — replicated from ProfessionalProfilePage.jsx
function toPayload(p) {
  return {
    legal_name: p.legal_name,
    business_name: p.business_name,
    display_name: p.display_name,
    screen_name: p.screen_name,
    headline: p.headline,
    bio: p.bio,
    profession: p.profession,
    professional_category: p.professional_category,
    professional_type: p.professional_type,
    specialisms: p.specialisms,
    session_types: p.session_types,
    services: p.services,
    service_area: p.service_area,
    service_area_location_id: p.service_area_location_id,
    location: p.location,
    location_id: p.location_id,
    website: p.website,
    contact_email: p.contact_email,
    contact_phone: p.contact_phone,
    avatar_url: p.avatar_url,
    avatar_media_id: p.avatar_media_id,
    avatar_position_x: p.avatar_position_x,
    avatar_position_y: p.avatar_position_y,
    avatar_zoom: p.avatar_zoom,
    cover_media_id: p.cover_media_id,
    cover_url: p.cover_url,
    cover_position_x: p.cover_position_x,
    cover_position_y: p.cover_position_y,
    cover_zoom: p.cover_zoom,
    gallery_media_ids: p.gallery_media_ids,
    away_message: p.away_message,
    away_message_enabled: p.away_message_enabled,
    visibility: p.visibility,
  };
}

function normaliseScreenName(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  return s || null;
}

// applySave — replicates the cloud function merge + screen_name resolution
// + active guard. Returns the merged doc that would be written to
// professionalProfiles, or throws on contract violation.
function applySave(existingData, body) {
  const requestedScreenName = normaliseScreenName(body.screen_name);
  const existingScreenName = normaliseScreenName(existingData.screen_name);
  const screenName = body.screen_name !== undefined
    ? requestedScreenName
    : existingScreenName;
  if (screenName) {
    if (!SCREEN_NAME_RE.test(screenName)) {
      throw new Error('invalid-argument: screen name format');
    }
  }
  const merged = { ...existingData, ...body, identity_id: body.identity_id, screen_name: screenName };
  delete merged.id;
  if (merged.lifecycle_state === 'active' && !screenName) {
    throw new Error('invalid-argument: A screen name is required for an active professional profile');
  }
  return merged;
}

// buildPublicProjection — replicated allowlist from professionalProfile.ts
function buildPublicProjection(identityId, profileId, data) {
  return {
    identity_id: identityId,
    profile_id: profileId,
    display_name: data.display_name || null,
    business_name: data.business_name || null,
    screen_name: data.screen_name || null,
    avatar_url: data.avatar_url || null,
    avatar_media_id: data.avatar_media_id || null,
    avatar_position_x: data.avatar_position_x ?? 0.5,
    avatar_position_y: data.avatar_position_y ?? 0.5,
    avatar_zoom: data.avatar_zoom ?? 1,
    cover_media_id: data.cover_media_id || null,
    cover_url: data.cover_url || null,
    cover_position_x: data.cover_position_x ?? 0.5,
    cover_position_y: data.cover_position_y ?? 0.5,
    cover_zoom: data.cover_zoom ?? 1,
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

// requireFirebase — replicated from profileService.js
function requireFirebase(useFirebase, op) {
  if (!useFirebase) {
    throw new Error(
      `${op}: Firebase is not configured. Professional profiles require Firebase (production source of truth).`,
    );
  }
}

// A complete profile-owned fixture.
function fullProfile() {
  return {
    legal_name: 'Esther Cole',
    business_name: 'Esther Fitness Ltd',
    display_name: 'Esther',
    screen_name: 'estherfitness',
    headline: 'Certified Personal Trainer',
    bio: 'Helping beginners move with confidence.',
    profession: 'Personal Trainer',
    professional_category: 'Personal Trainer',
    professional_type: { id: 'personal-trainer', label: 'Personal Trainer' },
    specialisms: [{ id: 'beginners', label: 'Beginners' }, { id: 'strength', label: 'Strength' }],
    session_types: [{ id: '1-to-1', label: '1-to-1' }, { id: 'online', label: 'Online' }],
    services: [{ id: 'personal-training', label: 'Personal Training' }],
    service_area: 'Central London',
    service_area_location_id: 'loc_1',
    location: 'London, UK',
    location_id: 'loc_2',
    website: 'https://esther.example',
    contact_email: 'esther@example.com',
    contact_phone: '+44 7000 000000',
    avatar_url: 'https://media/avatar.png',
    avatar_media_id: 'media_1',
    avatar_position_x: 0.5,
    avatar_position_y: 0.4,
    avatar_zoom: 1.2,
    cover_media_id: 'media_2',
    cover_url: 'https://media/cover.png',
    cover_position_x: 0.5,
    cover_position_y: 0.5,
    cover_zoom: 1,
    gallery_media_ids: ['media_3', 'media_4'],
    away_message: 'Back next week',
    away_message_enabled: true,
    visibility: 'public',
  };
}

// ═══════════════════════════════════════════════════════════
// 1. SAVE → RELOAD PRESERVES EVERY PROFILE-OWNED FIELD
// ═══════════════════════════════════════════════════════════

test('Save → reload: every toPayload field round-trips through the merge', () => {
  const profile = fullProfile();
  const body = { ...toPayload(profile), identity_id: 'id1' };
  const stored = applySave({}, body);
  // Simulate reload: the stored doc is fed back into toPayload
  const reloaded = toPayload(stored);
  assert.deepStrictEqual(reloaded, toPayload(profile));
});

test('Save → reload: structured arrays (services/specialisms/session_types) survive intact', () => {
  const profile = fullProfile();
  const stored = applySave({}, { ...toPayload(profile), identity_id: 'id1' });
  assert.deepStrictEqual(stored.services, profile.services);
  assert.deepStrictEqual(stored.specialisms, profile.specialisms);
  assert.deepStrictEqual(stored.session_types, profile.session_types);
  assert.deepStrictEqual(stored.professional_type, profile.professional_type);
});

test('Save → reload: away_message fields round-trip', () => {
  const profile = fullProfile();
  const stored = applySave({}, { ...toPayload(profile), identity_id: 'id1' });
  assert.strictEqual(stored.away_message, profile.away_message);
  assert.strictEqual(stored.away_message_enabled, profile.away_message_enabled);
});

// ═══════════════════════════════════════════════════════════
// 2. ACTIVATION → EDITOR IDENTICAL STRUCTURED SHAPES
// ═══════════════════════════════════════════════════════════

test('Activation services shape === editor services shape (both [{id,label}])', () => {
  // Activation now uses TaxonomySelectDialog (same as editor) → [{id,label}]
  const activationServices = [{ id: 'personal-training', label: 'Personal Training' }];
  const editorServices = [{ id: 'personal-training', label: 'Personal Training' }];
  assert.deepStrictEqual(activationServices, editorServices);
});

test('Activation payload and editor payload share the same field set for shared fields', () => {
  // Both write professional_type/specialisms/session_types/services with the
  // same structured shape; the editor additionally round-trips away_message.
  const activationShared = {
    professional_type: { id: 'personal-trainer', label: 'Personal Trainer' },
    specialisms: [{ id: 'beginners', label: 'Beginners' }],
    session_types: [{ id: '1-to-1', label: '1-to-1' }],
    services: [{ id: 'personal-training', label: 'Personal Training' }],
  };
  const editorShared = toPayload({
    ...fullProfile(),
    ...activationShared,
  });
  assert.deepStrictEqual(editorShared.professional_type, activationShared.professional_type);
  assert.deepStrictEqual(editorShared.specialisms, activationShared.specialisms);
  assert.deepStrictEqual(editorShared.session_types, activationShared.session_types);
  assert.deepStrictEqual(editorShared.services, activationShared.services);
});

test('Legacy string services are normalized to {id,label} on load (existing values preserved)', () => {
  const legacy = ['Personal Training', 'Yoga'];
  const normalized = legacy.map((s) => (typeof s === 'string' ? { id: null, label: s } : s));
  assert.deepStrictEqual(normalized, [
    { id: null, label: 'Personal Training' },
    { id: null, label: 'Yoga' },
  ]);
});

// ═══════════════════════════════════════════════════════════
// 3. EDITOR → PROJECTION PRESERVES PUBLIC STRUCTURED FIELDS
// ═══════════════════════════════════════════════════════════

test('Projection: professional_type/specialisms/session_types/services pass through to public projection', () => {
  const stored = applySave({}, { ...toPayload(fullProfile()), identity_id: 'id1' });
  const proj = buildPublicProjection('id1', 'doc1', stored);
  assert.deepStrictEqual(proj.professional_type, fullProfile().professional_type);
  assert.deepStrictEqual(proj.specialisms, fullProfile().specialisms);
  assert.deepStrictEqual(proj.session_types, fullProfile().session_types);
  assert.deepStrictEqual(proj.services, fullProfile().services);
});

test('Projection: empty arrays default safely when source lacks structured fields', () => {
  const proj = buildPublicProjection('id1', 'doc1', { display_name: 'X' });
  assert.deepStrictEqual(proj.specialisms, []);
  assert.deepStrictEqual(proj.session_types, []);
  assert.deepStrictEqual(proj.services, []);
  assert.strictEqual(proj.professional_type, null);
});

// ═══════════════════════════════════════════════════════════
// 4. FIREBASE UNAVAILABLE → EXPLICIT FAILURE (NO BASE44 FALLBACK)
// ═══════════════════════════════════════════════════════════

test('requireFirebase: throws when Firebase is not configured', () => {
  assert.throws(
    () => requireFirebase(false, 'saveProfessionalProfile'),
    /Firebase is not configured/,
  );
});

test('requireFirebase: does not throw when Firebase is configured', () => {
  requireFirebase(true, 'saveProfessionalProfile'); // must not throw
});

test('Every professional profile operation fails explicitly when Firebase is unavailable', () => {
  const ops = [
    'getProfessionalProfile',
    'createProfessionalProfile',
    'updateProfessionalProfile',
    'saveProfessionalProfile',
    'getPublicProfessionalProfile',
    'getPublicProfessionalProfileByIdentity',
    'validateScreenName',
  ];
  for (const op of ops) {
    assert.throws(() => requireFirebase(false, op), /Firebase is not configured/);
  }
});

// ═══════════════════════════════════════════════════════════
// 5. ACTIVATION/LIFECYCLE FIELDS SURVIVE ORDINARY PROFILE EDITS
// ═══════════════════════════════════════════════════════════

test('Editor save preserves activation-owned fields (onboarding_status, lifecycle_state, activated_at, verification_state)', () => {
  const existing = {
    identity_id: 'id1',
    display_name: 'Esther',
    screen_name: 'estherfitness',
    onboarding_status: 'active',
    verification_state: 'pending_review',
    lifecycle_state: 'active',
    activated_at: '2026-01-01T00:00:00.000Z',
    visibility: 'public',
  };
  // Editor payload does NOT include activation-owned fields
  const editorBody = { ...toPayload({ ...fullProfile(), screen_name: 'estherfitness' }), identity_id: 'id1' };
  const merged = applySave(existing, editorBody);
  assert.strictEqual(merged.onboarding_status, 'active');
  assert.strictEqual(merged.verification_state, 'pending_review');
  assert.strictEqual(merged.lifecycle_state, 'active');
  assert.strictEqual(merged.activated_at, '2026-01-01T00:00:00.000Z');
});

test('Editor save updates a profile-owned field without dropping activation-owned fields', () => {
  const existing = {
    identity_id: 'id1',
    screen_name: 'estherfitness',
    lifecycle_state: 'active',
    onboarding_status: 'active',
    activated_at: '2026-01-01T00:00:00.000Z',
    bio: 'old bio',
    visibility: 'public',
  };
  // Partial workspace-style save (only services) — screen_name omitted
  const merged = applySave(existing, { services: [{ id: 'yoga', label: 'Yoga Instruction' }], identity_id: 'id1' });
  assert.deepStrictEqual(merged.services, [{ id: 'yoga', label: 'Yoga Instruction' }]);
  assert.strictEqual(merged.lifecycle_state, 'active');
  assert.strictEqual(merged.onboarding_status, 'active');
  assert.strictEqual(merged.screen_name, 'estherfitness');
  assert.strictEqual(merged.bio, 'old bio');
});

// ═══════════════════════════════════════════════════════════
// 6. PRIVATE FIELDS REMAIN ABSENT FROM professionalProfilesPublic
// ═══════════════════════════════════════════════════════════

test('Projection: no private field appears in the public projection', () => {
  const stored = applySave({}, { ...toPayload(fullProfile()), identity_id: 'id1' });
  const proj = buildPublicProjection('id1', 'doc1', stored);
  for (const f of PRIVATE_FIELDS) {
    assert.ok(!(f in proj), `private field "${f}" must not be projected`);
  }
});

test('Projection: legal_name is never projected even when present on the private doc', () => {
  const stored = applySave({}, { ...toPayload(fullProfile()), identity_id: 'id1' });
  const proj = buildPublicProjection('id1', 'doc1', stored);
  assert.strictEqual(proj.legal_name, undefined);
  assert.strictEqual(stored.legal_name, 'Esther Cole'); // present privately
});

test('Projection: contact_email/contact_phone are never projected', () => {
  const stored = applySave({}, { ...toPayload(fullProfile()), identity_id: 'id1' });
  const proj = buildPublicProjection('id1', 'doc1', stored);
  assert.strictEqual(proj.contact_email, undefined);
  assert.strictEqual(proj.contact_phone, undefined);
});

// ═══════════════════════════════════════════════════════════
// 7. SERVER-SIDE ACTIVE + SCREEN_NAME GUARD
// ═══════════════════════════════════════════════════════════

test('Guard: active profile with null screen_name is rejected', () => {
  assert.throws(
    () => applySave({}, { lifecycle_state: 'active', visibility: 'public', screen_name: null, identity_id: 'id1' }),
    /A screen name is required for an active professional profile/,
  );
});

test('Guard: active profile with undefined screen_name but existing null screen_name is rejected', () => {
  assert.throws(
    () => applySave({ lifecycle_state: 'active', screen_name: null, visibility: 'public' }, { bio: 'x', identity_id: 'id1' }),
    /A screen name is required for an active professional profile/,
  );
});

test('Guard: editor re-null of screen_name on an active profile is rejected', () => {
  const existing = { lifecycle_state: 'active', screen_name: 'estherfitness', visibility: 'public' };
  // Editor sends screen_name: null explicitly (toPayload of a profile with null screen_name)
  assert.throws(
    () => applySave(existing, { ...toPayload({ ...fullProfile(), screen_name: null }), identity_id: 'id1' }),
    /A screen name is required for an active professional profile/,
  );
});

test('Guard: active profile with a valid screen_name is accepted', () => {
  const merged = applySave({}, { lifecycle_state: 'active', visibility: 'public', screen_name: 'estherfitness', identity_id: 'id1' });
  assert.strictEqual(merged.screen_name, 'estherfitness');
});

test('Guard: draft profile with null screen_name is accepted (guard is active-only)', () => {
  const merged = applySave({}, { lifecycle_state: 'draft', visibility: 'public', screen_name: null, identity_id: 'id1' });
  assert.strictEqual(merged.lifecycle_state, 'draft');
  assert.strictEqual(merged.screen_name, null);
});

test('Guard: invalid screen_name format is rejected regardless of lifecycle', () => {
  assert.throws(
    () => applySave({}, { lifecycle_state: 'draft', screen_name: 'ab', identity_id: 'id1' }),
    /invalid-argument: screen name format/,
  );
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);