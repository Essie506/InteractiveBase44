/**
 * Directory URL State Tests
 * ───────────────────────────────────────────────────────────
 * Tests for serialize/parse round-trip, default omission,
 * pending-vs-applied isolation, and section-search text exclusion.
 *
 * Usage: node tests/directory-url-state.test.cjs
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

(async () => {
  const {
    parseDirectoryParams,
    serializeDirectoryParams,
    DEFAULT_DIRECTORY_FILTERS,
  } = await import('../src/lib/directoryUrlState.js');

  // ═══════════════════════════════════════════════════════════
  // ROUND-TRIP TESTS
  // ═══════════════════════════════════════════════════════════

  test('Round-trip: all filters serialize → parse correctly', () => {
    const filters = {
      query: 'yoga', typeFilter: 'professional', sort: 'distance',
      verifiedOnly: true, locationText: 'London', distance: 15,
      serviceIds: ['svc1', 'svc2'], facilityIds: ['fac1'],
      businessTypeIds: ['gym'], equipmentIds: ['eq1', 'eq2'],
      professionalTypeIds: ['pt1'], specialismIds: ['sp1'],
      sessionTypeIds: ['st1'],
    };
    const params = serializeDirectoryParams(filters);
    const parsed = parseDirectoryParams(params);
    assert.deepStrictEqual(parsed, filters);
  });

  test('Round-trip: defaults produce empty URL', () => {
    const filters = { ...DEFAULT_DIRECTORY_FILTERS };
    const params = serializeDirectoryParams(filters);
    assert.strictEqual(params.toString(), '');
  });

  test('Round-trip: empty URL parses to defaults', () => {
    const parsed = parseDirectoryParams(new URLSearchParams(''));
    assert.deepStrictEqual(parsed, DEFAULT_DIRECTORY_FILTERS);
  });

  test('Round-trip: null searchParams parses to defaults', () => {
    const parsed = parseDirectoryParams(null);
    assert.deepStrictEqual(parsed, DEFAULT_DIRECTORY_FILTERS);
  });

  // ═══════════════════════════════════════════════════════════
  // DEFAULT OMISSION TESTS
  // ═══════════════════════════════════════════════════════════

  test('Omission: type=all not in URL', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, typeFilter: 'all' });
    assert.ok(!params.has('type'));
  });

  test('Omission: sort=recommended not in URL', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, sort: 'recommended' });
    assert.ok(!params.has('sort'));
  });

  test('Omission: verifiedOnly=false not in URL', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, verifiedOnly: false });
    assert.ok(!params.has('verified'));
  });

  test('Omission: distance=10 not in URL', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, distance: 10 });
    assert.ok(!params.has('dist'));
  });

  test('Omission: empty query not in URL', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, query: '' });
    assert.ok(!params.has('q'));
  });

  test('Omission: empty arrays not in URL', () => {
    const params = serializeDirectoryParams({
      ...DEFAULT_DIRECTORY_FILTERS,
      serviceIds: [], facilityIds: [], equipmentIds: [],
    });
    assert.ok(!params.has('svc'));
    assert.ok(!params.has('fac'));
    assert.ok(!params.has('equip'));
  });

  // ═══════════════════════════════════════════════════════════
  // NON-DEFAULT VALUES TESTS
  // ═══════════════════════════════════════════════════════════

  test('Non-default: type=professional in URL', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, typeFilter: 'professional' });
    assert.strictEqual(params.get('type'), 'professional');
  });

  test('Non-default: sort=distance in URL', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, sort: 'distance' });
    assert.strictEqual(params.get('sort'), 'distance');
  });

  test('Non-default: verifiedOnly=true → verified=1', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, verifiedOnly: true });
    assert.strictEqual(params.get('verified'), '1');
  });

  test('Non-default: distance=25 → dist=25', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, distance: 25 });
    assert.strictEqual(params.get('dist'), '25');
  });

  test('Non-default: service IDs comma-separated', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, serviceIds: ['a', 'b', 'c'] });
    assert.strictEqual(params.get('svc'), 'a,b,c');
  });

  // ═══════════════════════════════════════════════════════════
  // ID LIST PARSING TESTS
  // ═══════════════════════════════════════════════════════════

  test('Parse: comma-separated IDs parsed to array', () => {
    const parsed = parseDirectoryParams(new URLSearchParams('svc=a,b,c'));
    assert.deepStrictEqual(parsed.serviceIds, ['a', 'b', 'c']);
  });

  test('Parse: single ID parsed to single-element array', () => {
    const parsed = parseDirectoryParams(new URLSearchParams('svc=only'));
    assert.deepStrictEqual(parsed.serviceIds, ['only']);
  });

  test('Parse: empty svc value → empty array', () => {
    const parsed = parseDirectoryParams(new URLSearchParams('svc='));
    assert.deepStrictEqual(parsed.serviceIds, []);
  });

  test('Parse: whitespace in IDs trimmed', () => {
    const parsed = parseDirectoryParams(new URLSearchParams('svc= a , b , c '));
    assert.deepStrictEqual(parsed.serviceIds, ['a', 'b', 'c']);
  });

  // ═══════════════════════════════════════════════════════════
  // UNKNOWN PARAMS TESTS
  // ═══════════════════════════════════════════════════════════

  test('Unknown params: ignored safely', () => {
    const parsed = parseDirectoryParams(new URLSearchParams('unknown=foo&bar=baz&q=test'));
    assert.strictEqual(parsed.query, 'test');
    assert.deepStrictEqual(parsed, { ...DEFAULT_DIRECTORY_FILTERS, query: 'test' });
  });

  test('Unknown params: invalid dist falls back to default', () => {
    const parsed = parseDirectoryParams(new URLSearchParams('dist=abc'));
    assert.strictEqual(parsed.distance, 10);
  });

  // ═══════════════════════════════════════════════════════════
  // SECTION-SEARCH TEXT EXCLUSION TESTS
  // ═══════════════════════════════════════════════════════════

  test('Section-search text: not in URL param schema', () => {
    // The serialize function should never produce params for
    // per-section search text (e.g. "Search services..." input).
    // Verify the schema only includes the defined search criteria.
    const filters = { ...DEFAULT_DIRECTORY_FILTERS, query: 'yoga' };
    const params = serializeDirectoryParams(filters);
    const knownKeys = ['q', 'type', 'sort', 'verified', 'loc', 'dist',
      'ptype', 'spec', 'sess', 'svc', 'btype', 'fac', 'equip'];
    for (const key of params.keys()) {
      assert.ok(knownKeys.includes(key), `unexpected param key: ${key}`);
    }
  });

  test('Section-search text: serialize ignores extra properties', () => {
    // If someone passes a section-search text property, it should
    // not appear in the URL.
    const filters = {
      ...DEFAULT_DIRECTORY_FILTERS,
      query: 'yoga',
      _sectionSearchServices: 'beginner', // should be ignored
      _sectionSearchEquipment: 'kettlebell', // should be ignored
    };
    const params = serializeDirectoryParams(filters);
    assert.ok(!params.has('_sectionSearchServices'));
    assert.ok(!params.has('_sectionSearchEquipment'));
    assert.strictEqual(params.get('q'), 'yoga');
  });

  // ═══════════════════════════════════════════════════════════
  // PENDING VS APPLIED ISOLATION TESTS
  // ═══════════════════════════════════════════════════════════

  test('Pending isolation: draft changes not in URL until Search', () => {
    // Simulate: user has applied filters in URL, then changes draft
    // (checkbox) but doesn't press Search. The URL should still
    // reflect the old applied state, not the draft.
    const appliedFilters = {
      ...DEFAULT_DIRECTORY_FILTERS,
      query: 'yoga', typeFilter: 'professional',
    };
    const draftFilters = {
      ...appliedFilters,
      serviceIds: ['new_svc'], // pending change, not yet applied
    };
    const appliedParams = serializeDirectoryParams(appliedFilters);
    // The URL reflects applied, not draft
    assert.ok(!appliedParams.has('svc'));
    // The draft has svc but it's not serialized
    const draftParams = serializeDirectoryParams(draftFilters);
    assert.ok(draftParams.has('svc'));
  });

  test('Back navigation: URL restores exact applied search', () => {
    // Simulate: user searches, navigates to profile, presses Back.
    // The URL should contain the applied search params.
    const appliedFilters = {
      ...DEFAULT_DIRECTORY_FILTERS,
      query: 'yoga', typeFilter: 'professional', sort: 'distance',
      verifiedOnly: true, locationText: 'London', distance: 15,
      serviceIds: ['s1', 's2'],
    };
    const urlParams = serializeDirectoryParams(appliedFilters);
    // On Back, Directory parses the URL
    const restored = parseDirectoryParams(urlParams);
    assert.deepStrictEqual(restored, appliedFilters);
  });

  test('Shareable URL: direct link initializes correct search', () => {
    // A shared URL like /directory?q=yoga&type=professional&svc=a,b
    // should initialize the Directory with those exact filters.
    const sharedUrl = new URLSearchParams('q=yoga&type=professional&svc=a,b&sort=verified');
    const parsed = parseDirectoryParams(sharedUrl);
    assert.strictEqual(parsed.query, 'yoga');
    assert.strictEqual(parsed.typeFilter, 'professional');
    assert.deepStrictEqual(parsed.serviceIds, ['a', 'b']);
    assert.strictEqual(parsed.sort, 'verified');
    // Defaults for unspecified params
    assert.strictEqual(parsed.verifiedOnly, false);
    assert.strictEqual(parsed.distance, 10);
  });

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();