/**
 * Professional Directory Backfill — scoped migration tests
 * ───────────────────────────────────────────────────────────
 * Pure-node regression tests replicating the authoritative logic from
 *   - cloud-functions/src/professionalBackfill.ts (runProfessionalBackfill)
 *   - cloud-functions/src/projectionEligibility.ts (isProfessionalListable,
 *     isProfessionalDirectoryListable)
 *   - cloud-functions/src/professionalProfile.ts (buildPublicProjection,
 *     buildDirectoryEntry)
 *
 * Proves the dedicated Professional-only migration:
 *   - public + active + screen_name + missing directory_visibility → listed
 *   - connections/private + missing field → unlisted
 *   - existing explicit listed remains listed
 *   - existing explicit unlisted remains unlisted
 *   - Professional advert projection created correctly
 *   - full public Profile projection remains independent
 *   - no Personal/Business/Event projection functions execute
 *   - idempotent (rerun migrates nothing, projections stable)
 *   - stale canonical Professional projection cleaned up
 *
 * The backfill is replicated against an in-memory mock store so the
 * migration decision + projection routing can be verified without
 * Firebase. The mock tracks writes per collection so the "no
 * Personal/Business/Event" guarantee is asserted, not assumed.
 *
 * Usage: node tests/professional-directory-backfill.test.cjs
 */

const assert = require('assert');

const results = [];
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

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

function buildPublicProjection(identityId, profileId, data) {
  return {
    identity_id: identityId,
    profile_id: profileId,
    screen_name: data.screen_name || null,
    visibility: data.visibility || 'public',
    lifecycle_state: data.lifecycle_state || 'draft',
    bio: data.bio ?? null,
    _kind: 'public',
  };
}

function buildDirectoryEntry(identityId, profileId, data) {
  return {
    identity_id: identityId,
    profile_id: profileId,
    screen_name: data.screen_name || null,
    directory_visibility: data.directory_visibility || 'unlisted',
    visibility: data.visibility || 'public',
    lifecycle_state: data.lifecycle_state || 'draft',
    _kind: 'advert',
  };
}

// ── In-memory mock store ────────────────────────────────────
function makeStore(seed) {
  const collections = {
    professionalProfiles: new Map(),
    professionalProfilesPublic: new Map(),
    professionalDirectoryEntries: new Map(),
    personalProfilesPublic: new Map(),
    businessProfilesPublic: new Map(),
    calendarEventsPublic: new Map(),
  };
  const writes = {
    professionalProfiles: 0,
    professionalProfilesPublic: 0,
    professionalDirectoryEntries: 0,
    personalProfilesPublic: 0,
    businessProfilesPublic: 0,
    calendarEventsPublic: 0,
  };

  for (const p of (seed.professionalProfiles || [])) {
    collections.professionalProfiles.set(p.id, { ...p.data });
  }
  for (const p of (seed.professionalProfilesPublic || [])) {
    collections.professionalProfilesPublic.set(p.id, { ...p.data });
  }
  for (const p of (seed.professionalDirectoryEntries || [])) {
    collections.professionalDirectoryEntries.set(p.id, { ...p.data });
  }

  function makeDoc(name, id, dataObj) {
    return {
      id,
      data: () => dataObj,
      ref: {
        update: async (patch) => { Object.assign(dataObj, patch); writes[name]++; },
        delete: async () => { collections[name].delete(id); writes[name]++; },
      },
    };
  }

  function collection(name) {
    if (!collections[name]) collections[name] = new Map();
    const map = collections[name];
    return {
      get: async () => ({
        size: map.size,
        docs: [...map.entries()].map(([id, d]) => makeDoc(name, id, d)),
      }),
      doc: (id) => ({
        set: async (data) => { map.set(id, { ...data }); writes[name]++; },
        get: async () => map.has(id)
          ? makeDoc(name, id, map.get(id))
          : { exists: false, id, data: () => undefined, ref: { delete: async () => { map.delete(id); writes[name]++; } } },
        delete: async () => { map.delete(id); writes[name]++; },
      }),
      where: (field, op, value) => ({
        get: async () => ({
          docs: [...map.entries()]
            .filter(([, d]) => d[field] === value)
            .map(([id, d]) => makeDoc(name, id, d)),
        }),
      }),
    };
  }

  const db = { collection };
  return { db, collections, writes };
}

// ── Replicated runProfessionalBackfill (geo omitted → null) ──
async function runProfessionalBackfill(db) {
  const result = {
    total: 0,
    projected: 0,
    directoryEntriesProjected: 0,
    directoryVisibilityMigrated: 0,
    skipped: 0,
    skippedDetails: [],
  };
  const proSnap = await db.collection('professionalProfiles').get();
  result.total = proSnap.size;

  for (const doc of proSnap.docs) {
    let data = doc.data();
    const rawScreenName = data.screen_name || null;
    const canonicalScreenName = rawScreenName
      ? String(rawScreenName).toLowerCase().trim()
      : null;

    if (data.directory_visibility === undefined) {
      const wasListable = isProfessionalListable(data, canonicalScreenName);
      const migratedVisibility = wasListable ? 'listed' : 'unlisted';
      await doc.ref.update({ directory_visibility: migratedVisibility });
      data = { ...data, directory_visibility: migratedVisibility };
      result.directoryVisibilityMigrated++;
    }

    const isPublicEligible = isProfessionalListable(data, canonicalScreenName);
    const isDirectoryEligible = isProfessionalDirectoryListable(data, canonicalScreenName);

    if (isPublicEligible && canonicalScreenName) {
      const projection = buildPublicProjection(data.identity_id, doc.id, data);
      await db.collection('professionalProfilesPublic').doc(canonicalScreenName).set(projection);
      result.projected++;
      const staleSnap = await db.collection('professionalProfilesPublic')
        .where('identity_id', '==', data.identity_id).get();
      for (const staleDoc of staleSnap.docs) {
        if (staleDoc.id !== canonicalScreenName) await staleDoc.ref.delete();
      }
    } else {
      const staleSnap = await db.collection('professionalProfilesPublic')
        .where('identity_id', '==', data.identity_id).get();
      for (const staleDoc of staleSnap.docs) await staleDoc.ref.delete();
    }

    if (isDirectoryEligible && canonicalScreenName) {
      const advert = buildDirectoryEntry(data.identity_id, doc.id, data);
      await db.collection('professionalDirectoryEntries').doc(canonicalScreenName).set(advert);
      result.directoryEntriesProjected++;
      const staleAdSnap = await db.collection('professionalDirectoryEntries')
        .where('identity_id', '==', data.identity_id).get();
      for (const staleDoc of staleAdSnap.docs) {
        if (staleDoc.id !== canonicalScreenName) await staleDoc.ref.delete();
      }
    } else {
      const staleAdSnap = await db.collection('professionalDirectoryEntries')
        .where('identity_id', '==', data.identity_id).get();
      for (const staleDoc of staleAdSnap.docs) await staleDoc.ref.delete();
    }

    if (!isPublicEligible) {
      result.skipped++;
      const reasons = [];
      if (data.visibility !== 'public') reasons.push(`visibility=${data.visibility}`);
      if (data.lifecycle_state !== 'active') reasons.push(`lifecycle=${data.lifecycle_state}`);
      if (!canonicalScreenName) reasons.push('no screen_name');
      result.skippedDetails.push(`${doc.id}: ${reasons.join(', ')}`);
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════

test('public + active + screen_name + missing directory_visibility → listed', async () => {
  const { db, collections } = makeStore({
    professionalProfiles: [
      { id: 'p1', data: { identity_id: 'i1', screen_name: 'alpha', visibility: 'public', lifecycle_state: 'active', bio: 'hello' } },
    ],
  });
  const r = await runProfessionalBackfill(db);
  assert.strictEqual(r.directoryVisibilityMigrated, 1, 'field migrated');
  assert.strictEqual(collections.professionalProfiles.get('p1').directory_visibility, 'listed');
  assert.strictEqual(r.projected, 1, 'public profile projected');
  assert.strictEqual(r.directoryEntriesProjected, 1, 'advert projected');
});

test('connections + active + screen_name + missing field → unlisted', async () => {
  const { db, collections } = makeStore({
    professionalProfiles: [
      { id: 'p2', data: { identity_id: 'i2', screen_name: 'beta', visibility: 'connections', lifecycle_state: 'active' } },
    ],
  });
  const r = await runProfessionalBackfill(db);
  assert.strictEqual(r.directoryVisibilityMigrated, 1);
  assert.strictEqual(collections.professionalProfiles.get('p2').directory_visibility, 'unlisted');
  assert.strictEqual(r.projected, 0, 'not public → no public profile');
  assert.strictEqual(r.directoryEntriesProjected, 0, 'unlisted → no advert');
  assert.strictEqual(collections.professionalProfilesPublic.size, 0);
  assert.strictEqual(collections.professionalDirectoryEntries.size, 0);
});

test('private + active + screen_name + missing field → unlisted', async () => {
  const { db, collections } = makeStore({
    professionalProfiles: [
      { id: 'p2b', data: { identity_id: 'i2b', screen_name: 'betapriv', visibility: 'private', lifecycle_state: 'active' } },
    ],
  });
  const r = await runProfessionalBackfill(db);
  assert.strictEqual(collections.professionalProfiles.get('p2b').directory_visibility, 'unlisted');
  assert.strictEqual(r.directoryEntriesProjected, 0);
});

test('existing explicit listed remains listed', async () => {
  const { db, collections } = makeStore({
    professionalProfiles: [
      { id: 'p3', data: { identity_id: 'i3', screen_name: 'gamma', visibility: 'connections', lifecycle_state: 'active', directory_visibility: 'listed' } },
    ],
  });
  const r = await runProfessionalBackfill(db);
  assert.strictEqual(r.directoryVisibilityMigrated, 0, 'no migration — field present');
  assert.strictEqual(collections.professionalProfiles.get('p3').directory_visibility, 'listed');
  assert.strictEqual(r.directoryEntriesProjected, 1, 'listed → advert');
  assert.strictEqual(r.projected, 0, 'connections → no public profile');
});

test('existing explicit unlisted remains unlisted', async () => {
  const { db, collections } = makeStore({
    professionalProfiles: [
      { id: 'p4', data: { identity_id: 'i4', screen_name: 'delta', visibility: 'public', lifecycle_state: 'active', directory_visibility: 'unlisted' } },
    ],
  });
  const r = await runProfessionalBackfill(db);
  assert.strictEqual(r.directoryVisibilityMigrated, 0);
  assert.strictEqual(collections.professionalProfiles.get('p4').directory_visibility, 'unlisted');
  assert.strictEqual(r.projected, 1, 'public → public profile');
  assert.strictEqual(r.directoryEntriesProjected, 0, 'unlisted → no advert');
});

test('Professional advert projection created correctly', async () => {
  const { db, collections } = makeStore({
    professionalProfiles: [
      { id: 'p5', data: { identity_id: 'i5', screen_name: 'eps', visibility: 'private', lifecycle_state: 'active', directory_visibility: 'listed', bio: 'secret' } },
    ],
  });
  const r = await runProfessionalBackfill(db);
  assert.strictEqual(r.directoryEntriesProjected, 1);
  const advert = collections.professionalDirectoryEntries.get('eps');
  assert.ok(advert, 'advert exists');
  assert.strictEqual(advert._kind, 'advert');
  assert.strictEqual(advert.directory_visibility, 'listed');
  assert.strictEqual(advert.screen_name, 'eps');
  assert.strictEqual(advert.bio, undefined, 'advert must not carry bio');
});

test('full public Profile projection remains independent', async () => {
  const { db, collections } = makeStore({
    professionalProfiles: [
      { id: 'p6', data: { identity_id: 'i6', screen_name: 'zeta', visibility: 'public', lifecycle_state: 'active', directory_visibility: 'listed', bio: 'about me' } },
    ],
  });
  const r = await runProfessionalBackfill(db);
  assert.strictEqual(r.projected, 1);
  assert.strictEqual(r.directoryEntriesProjected, 1);
  const pub = collections.professionalProfilesPublic.get('zeta');
  const adv = collections.professionalDirectoryEntries.get('zeta');
  assert.strictEqual(pub._kind, 'public');
  assert.strictEqual(pub.bio, 'about me', 'public profile carries bio');
  assert.strictEqual(pub.directory_visibility, undefined, 'public profile has no directory_visibility');
  assert.strictEqual(adv._kind, 'advert');
  assert.strictEqual(adv.directory_visibility, 'listed');
  assert.strictEqual(adv.bio, undefined, 'advert has no bio');
});

test('no Personal/Business/Event projection functions execute', async () => {
  const { db, writes } = makeStore({
    professionalProfiles: [
      { id: 'p7', data: { identity_id: 'i7', screen_name: 'eta', visibility: 'public', lifecycle_state: 'active' } },
      { id: 'p8', data: { identity_id: 'i8', screen_name: 'theta', visibility: 'connections', lifecycle_state: 'active', directory_visibility: 'listed' } },
    ],
  });
  await runProfessionalBackfill(db);
  assert.strictEqual(writes.personalProfilesPublic, 0, 'no personal writes');
  assert.strictEqual(writes.businessProfilesPublic, 0, 'no business writes');
  assert.strictEqual(writes.calendarEventsPublic, 0, 'no event writes');
  assert.ok(writes.professionalProfilesPublic > 0, 'professional public writes occurred');
  assert.ok(writes.professionalDirectoryEntries > 0, 'directory writes occurred');
});

test('idempotent — rerun migrates nothing and projections stable', async () => {
  const seed = {
    professionalProfiles: [
      { id: 'p9', data: { identity_id: 'i9', screen_name: 'iot', visibility: 'public', lifecycle_state: 'active' } },
    ],
  };
  const s1 = makeStore(seed);
  await runProfessionalBackfill(s1.db);
  assert.strictEqual(s1.collections.professionalProfiles.get('p9').directory_visibility, 'listed');
  const r2 = await runProfessionalBackfill(s1.db);
  assert.strictEqual(r2.directoryVisibilityMigrated, 0, 'second run does not re-migrate');
  assert.strictEqual(r2.projected, 1);
  assert.strictEqual(r2.directoryEntriesProjected, 1);
});

test('stale canonical Professional projection cleaned up', async () => {
  const { db, collections } = makeStore({
    professionalProfiles: [
      { id: 'p10', data: { identity_id: 'i10', screen_name: 'kappa', visibility: 'public', lifecycle_state: 'active', directory_visibility: 'listed' } },
    ],
    professionalProfilesPublic: [
      { id: 'old_kappa', data: { identity_id: 'i10' } },
    ],
    professionalDirectoryEntries: [
      { id: 'old_kappa2', data: { identity_id: 'i10' } },
    ],
  });
  const r = await runProfessionalBackfill(db);
  assert.strictEqual(r.projected, 1);
  assert.ok(collections.professionalProfilesPublic.has('kappa'), 'new public projection written');
  assert.ok(!collections.professionalProfilesPublic.has('old_kappa'), 'stale public projection removed');
  assert.ok(collections.professionalDirectoryEntries.has('kappa'), 'new advert written');
  assert.ok(!collections.professionalDirectoryEntries.has('old_kappa2'), 'stale advert removed');
});

// ═══════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`[PASS] ${name}`);
    } catch (err) {
      results.push({ name, passed: false, error: err.message });
      console.log(`[FAIL] ${name} — ${err.message}`);
    }
  }
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(`\n${passed}/${results.length} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();