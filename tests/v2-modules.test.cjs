// V2 Module Conformance Tests — Post, Media, Search, Promotions, Growth Hub, Dashboard.
// ───────────────────────────────────────────────────────────
// Pure unit tests for the new V2 platform module logic.
// Run with: node tests/v2-modules.test.cjs

const assert = require('assert');

// ── Search Index Adapter (V2 §15.5) ──────────────────────────
// Inlined from src/lib/searchIndexAdapter.js — tokenisation + buildIndexDocument.

function tokenise(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function buildIndexDocument({ contentId, contentType, system, title, description, tags, ownerId, visibility }) {
  const textFields = [title, description, ...(tags || [])].filter(Boolean).join(' ');
  const tokens = [...new Set(tokenise(textFields))];
  return {
    content_id: contentId,
    content_type: contentType,
    system,
    title: title || '',
    description: (description || '').slice(0, 300),
    tags: tags || [],
    tokens,
    owner_id: ownerId || null,
    visibility: visibility || 'public',
  };
}

// ── Growth Hub Service (V2 §4) ──────────────────────────────
// Inlined from src/services/growthHubService.js — determineStage.

function determineStage(profile, signals = {}) {
  const { bookingCount = 0, campaignCount = 0 } = signals;
  const isProfileComplete = profile?.bio && profile?.headline && (profile?.services?.length || 0) > 0;
  if (!isProfileComplete || bookingCount === 0) return 'build';
  if (bookingCount < 20 && campaignCount < 3) return 'grow';
  return 'scale';
}

// ── Promotions Service (V2 §19) ──────────────────────────────
// Inlined from src/services/promotionsService.js — entitlement checks.

function isCampaignTypeAllowed(growthPackage, campaignType) {
  if (!growthPackage) return false;
  if (!Array.isArray(growthPackage.campaign_types)) return false;
  return growthPackage.campaign_types.includes(campaignType);
}

function canCreateCampaign(existingCampaigns, growthPackage) {
  if (!growthPackage) return false;
  const activeCount = existingCampaigns.filter((c) => c.status === 'active').length;
  return activeCount < (growthPackage.max_active_campaigns || 1);
}

// ── Dashboard Module Registry (V2 Dashboard §4) ──────────────
// Inlined from src/components/dashboard/moduleRegistry.js.

const REGISTRY = [
  { key: 'profile-completeness', contexts: ['personal', 'professional', 'business'] },
  { key: 'upcoming-events', contexts: ['personal', 'professional', 'business'] },
  { key: 'growth-hub-teaser', contexts: ['professional', 'business'] },
  { key: 'businesses', contexts: ['personal', 'professional'] },
  { key: 'quick-actions', contexts: ['personal', 'professional', 'business'] },
];

function getModulesForContext(context) {
  return REGISTRY.filter((m) => m.contexts.includes(context));
}

// ── Sponsored Placement (V2 §19.7) ───────────────────────────
// Inlined from src/services/discoveryService.js — annotateSponsored.

function annotateSponsored(results, sponsoredMap) {
  if (!sponsoredMap || Object.keys(sponsoredMap).length === 0) return results;
  return results.map((r) => {
    const system = r._type === 'professional' ? 'professional'
      : r._type === 'business' ? 'business'
      : r._type === 'event' ? 'calendar_event'
      : r.system || r._type;
    const id = r.id || r.content_id;
    if (!system || !id) return r;
    const key = `${system}_${id}`;
    const sponsored = sponsoredMap[key];
    if (sponsored) return { ...r, _sponsored: true, _campaign: sponsored.campaign };
    return r;
  });
}

// ── Tests ───────────────────────────────────────────────────

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

console.log('\nSearch Index Adapter (V2 §15.5)');
test('tokenise lowercases and splits on non-alphanumeric', () => {
  assert.deepStrictEqual(tokenise('Hello World!'), ['hello', 'world']);
});
test('tokenise filters tokens shorter than 2 chars', () => {
  assert.deepStrictEqual(tokenise('a I am here'), ['am', 'here']);
});
test('tokenise handles empty/null', () => {
  assert.deepStrictEqual(tokenise(null), []);
  assert.deepStrictEqual(tokenise(''), []);
});
test('tokenise deduplicates via buildIndexDocument', () => {
  const doc = buildIndexDocument({
    contentId: 'p1', contentType: 'post', system: 'post',
    title: 'Fitness Fitness', description: 'strength', tags: ['fitness'],
  });
  assert.ok(doc.tokens.includes('fitness'));
  assert.strictEqual(doc.tokens.indexOf('fitness'), doc.tokens.lastIndexOf('fitness'), 'tokens should be deduplicated');
});
test('buildIndexDocument truncates description to 300 chars', () => {
  const long = 'x'.repeat(400);
  const doc = buildIndexDocument({ contentId: 'p1', contentType: 'post', system: 'post', description: long });
  assert.strictEqual(doc.description.length, 300);
});
test('buildIndexDocument defaults visibility to public', () => {
  const doc = buildIndexDocument({ contentId: 'p1', contentType: 'post', system: 'post' });
  assert.strictEqual(doc.visibility, 'public');
});

console.log('\nGrowth Hub Service (V2 §4)');
test('determineStage returns build for incomplete profile', () => {
  assert.strictEqual(determineStage({ bio: null, headline: null }, {}), 'build');
});
test('determineStage returns build when no bookings', () => {
  const profile = { bio: 'x', headline: 'y', services: [{ label: 'a' }] };
  assert.strictEqual(determineStage(profile, { bookingCount: 0 }), 'build');
});
test('determineStage returns grow for moderate activity', () => {
  const profile = { bio: 'x', headline: 'y', services: [{ label: 'a' }] };
  assert.strictEqual(determineStage(profile, { bookingCount: 10, campaignCount: 1 }), 'grow');
});
test('determineStage returns scale for high activity', () => {
  const profile = { bio: 'x', headline: 'y', services: [{ label: 'a' }] };
  assert.strictEqual(determineStage(profile, { bookingCount: 25, campaignCount: 5 }), 'scale');
});

console.log('\nPromotions Service (V2 §19)');
test('isCampaignTypeAllowed returns true for allowed type', () => {
  const pkg = { campaign_types: ['service_boost', 'event_boost'] };
  assert.strictEqual(isCampaignTypeAllowed(pkg, 'service_boost'), true);
});
test('isCampaignTypeAllowed returns false for disallowed type', () => {
  const pkg = { campaign_types: ['service_boost'] };
  assert.strictEqual(isCampaignTypeAllowed(pkg, 'event_boost'), false);
});
test('isCampaignTypeAllowed returns false for null package', () => {
  assert.strictEqual(isCampaignTypeAllowed(null, 'service_boost'), false);
});
test('canCreateCampaign returns true when under max', () => {
  const existing = [{ status: 'active' }, { status: 'draft' }];
  const pkg = { max_active_campaigns: 2 };
  assert.strictEqual(canCreateCampaign(existing, pkg), true);
});
test('canCreateCampaign returns false at max', () => {
  const existing = [{ status: 'active' }, { status: 'active' }];
  const pkg = { max_active_campaigns: 2 };
  assert.strictEqual(canCreateCampaign(existing, pkg), false);
});
test('canCreateCampaign returns false without package', () => {
  assert.strictEqual(canCreateCampaign([], null), false);
});

console.log('\nDashboard Module Registry (V2 Dashboard §4)');
test('getModulesForContext returns modules for personal', () => {
  const mods = getModulesForContext('personal');
  const keys = mods.map((m) => m.key);
  assert.ok(keys.includes('profile-completeness'));
  assert.ok(keys.includes('quick-actions'));
  assert.ok(!keys.includes('growth-hub-teaser'), 'growth-hub-teaser should not appear in personal');
});
test('getModulesForContext returns growth-hub-teaser for professional', () => {
  const mods = getModulesForContext('professional');
  const keys = mods.map((m) => m.key);
  assert.ok(keys.includes('growth-hub-teaser'));
  assert.ok(keys.includes('businesses'));
});
test('getModulesForContext returns growth-hub-teaser for business', () => {
  const mods = getModulesForContext('business');
  const keys = mods.map((m) => m.key);
  assert.ok(keys.includes('growth-hub-teaser'));
  assert.ok(!keys.includes('businesses'), 'businesses module should not appear in business context');
});

console.log('\nSponsored Placement (V2 §19.7)');
test('annotateSponsored tags matching results', () => {
  const results = [
    { id: 'pro1', _type: 'professional' },
    { id: 'biz1', _type: 'business' },
    { id: 'evt1', _type: 'event' },
  ];
  const map = { professional_pro1: { campaign: { name: 'Boost' } } };
  const annotated = annotateSponsored(results, map);
  assert.strictEqual(annotated[0]._sponsored, true);
  assert.strictEqual(annotated[0]._campaign.name, 'Boost');
  assert.strictEqual(annotated[1]._sponsored, undefined);
});
test('annotateSponsored maps event type to calendar_event system', () => {
  const results = [{ id: 'evt1', _type: 'event' }];
  const map = { calendar_event_evt1: { campaign: {} } };
  const annotated = annotateSponsored(results, map);
  assert.strictEqual(annotated[0]._sponsored, true);
});
test('annotateSponsored returns unchanged for empty map', () => {
  const results = [{ id: 'x', _type: 'professional' }];
  const annotated = annotateSponsored(results, {});
  assert.strictEqual(annotated, results);
  assert.strictEqual(annotated[0]._sponsored, undefined);
});
test('annotateSponsored does not fabricate results', () => {
  const results = [{ id: 'pro1', _type: 'professional' }];
  const map = { professional_pro2: { campaign: {} } };
  const annotated = annotateSponsored(results, map);
  assert.strictEqual(annotated.length, 1);
  assert.strictEqual(annotated[0]._sponsored, undefined);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);