/**
 * Directory Events Tests
 * ───────────────────────────────────────────────────────────
 * Tests for the Events discovery extension to the Directory:
 *   - date-range resolution (today / tomorrow / week / weekend / custom)
 *   - isEventInRange inclusion
 *   - event visibility + lifecycle gating (public, not cancelled)
 *   - format filter (in-person / online / hybrid)
 *   - price filter (free / paid)
 *   - availability filter (spaces remaining)
 *   - activity (services) ranked match via computeMatchScore
 *   - recommended sort: event date relevance (sooner future ranks higher)
 *   - URL state round-trip for event filters
 *
 * Pure helpers (eventDateRanges, matchScoring, directoryUrlState) are
 * imported directly. The format/price/availability/visibility helpers
 * live inside discoveryService.js (which imports Firebase and so cannot
 * be imported in a plain node test); they are replicated here exactly,
 * mirroring the pattern in match-scoring.test.cjs.
 *
 * Usage: node tests/directory-events.test.cjs
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

// ── Replicated helpers (mirror src/services/discoveryService.js) ──

// Map location_type → format filter id.
function eventFormatId(event) {
  if (event.location_type === 'online') return 'online';
  if (event.location_type === 'hybrid') return 'hybrid';
  return 'in-person';
}

// Visibility + lifecycle gate applied to events before filtering.
function isEventListable(event) {
  return event.visibility === 'public' && event.lifecycle_state !== 'cancelled';
}

// Format filter (in-person / online / hybrid)
function applyFormatFilter(events, formatIds) {
  if (!formatIds || formatIds.length === 0) return events;
  return events.filter(e => formatIds.includes(eventFormatId(e)));
}

// Price filter (free / paid)
function applyPriceFilter(events, priceIds) {
  if (!priceIds || priceIds.length === 0) return events;
  return events.filter(e => priceIds.includes(e.is_free ? 'free' : 'paid'));
}

// Availability filter — spaces remaining > 0
function applyAvailabilityFilter(events, availableOnly) {
  if (!availableOnly) return events;
  return events.filter(e =>
    e.availability_state === 'available' ||
    (typeof e.spaces_remaining === 'number' && e.spaces_remaining > 0)
  );
}

// Recommended sort — event date relevance comparator (Layer Cc).
// Sooner future start_time ranks higher; past / no date ranks last.
// Only compares event-vs-event (mixed event/profile skips this signal).
function eventDateRelevanceCompare(a, b) {
  if (a._type !== 'event' || b._type !== 'event') return 0;
  const now = Date.now();
  const at = a.start_time ? new Date(a.start_time).getTime() : null;
  const bt = b.start_time ? new Date(b.start_time).getTime() : null;
  const aRank = at != null && at >= now ? at : Infinity;
  const bRank = bt != null && bt >= now ? bt : Infinity;
  if (aRank !== bRank) return aRank - bRank;
  return 0;
}

function makeEvent(id, opts = {}) {
  return {
    _type: 'event',
    event_id: id,
    title: opts.title || id,
    visibility: opts.visibility || 'public',
    lifecycle_state: opts.lifecycle_state || 'scheduled',
    location_type: opts.location_type || 'physical',
    is_free: opts.is_free != null ? opts.is_free : true,
    start_time: opts.start_time || null,
    spaces_remaining: opts.spaces_remaining,
    availability_state: opts.availability_state,
    services: opts.services || [],
    host: opts.host || {},
  };
}

function ids(arr) {
  return arr.map(s => ({ id: s, label: s }));
}

(async () => {
  const { resolveDateRange, isEventInRange } = await import('../src/lib/eventDateRanges.js');
  const { computeMatchScore } = await import('../src/lib/matchScoring.js');
  const {
    parseDirectoryParams,
    serializeDirectoryParams,
    DEFAULT_DIRECTORY_FILTERS,
  } = await import('../src/lib/directoryUrlState.js');

  // Fixed "now" so date tests are deterministic. Monday 2026-08-24.
  const NOW = new Date('2026-08-24T10:00:00');
  // A helper to build ISO strings relative to NOW (in ms).
  const isoFrom = (ms) => new Date(NOW.getTime() + ms).toISOString();
  // ISO strings relative to the REAL current time — used by the
  // recommended date-relevance tests, which call the production
  // comparator that uses Date.now() internally (not injectable).
  const realIsoFrom = (ms) => new Date(Date.now() + ms).toISOString();

  // ═══════════════════════════════════════════════════════════
  // DATE RANGE RESOLUTION
  // ═══════════════════════════════════════════════════════════

  test('Date range: today spans 00:00 → 23:59 of today', () => {
    const r = resolveDateRange('today', null, null, NOW);
    assert.strictEqual(r.start.getDate(), NOW.getDate());
    assert.strictEqual(r.start.getHours(), 0);
    assert.strictEqual(r.end.getHours(), 23);
  });

  test('Date range: tomorrow is the next calendar day', () => {
    const r = resolveDateRange('tomorrow', null, null, NOW);
    const tomorrow = new Date(NOW);
    tomorrow.setDate(tomorrow.getDate() + 1);
    assert.strictEqual(r.start.getDate(), tomorrow.getDate());
  });

  test('Date range: this week starts Monday, ends Sunday', () => {
    const r = resolveDateRange('week', null, null, NOW);
    // 2026-08-24 is a Monday
    assert.strictEqual(r.start.getDay(), 1, 'week starts Monday');
    const endDay = new Date(r.end);
    assert.strictEqual(endDay.getDay(), 0, 'week ends Sunday');
  });

  test('Date range: this weekend is Saturday → Sunday', () => {
    const r = resolveDateRange('weekend', null, null, NOW);
    assert.strictEqual(r.start.getDay(), 6, 'weekend starts Saturday');
    assert.strictEqual(new Date(r.end).getDay(), 0, 'weekend ends Sunday');
  });

  test('Date range: custom uses provided from/to', () => {
    const r = resolveDateRange('custom', '2026-09-01', '2026-09-05', NOW);
    assert.strictEqual(r.start.getDate(), 1);
    assert.strictEqual(r.end.getDate(), 5);
  });

  test('Date range: custom with only from → single-day range', () => {
    const r = resolveDateRange('custom', '2026-09-03', null, NOW);
    assert.strictEqual(r.start.getDate(), 3);
    assert.strictEqual(r.end.getDate(), 3);
  });

  test('Date range: custom without from → null', () => {
    assert.strictEqual(resolveDateRange('custom', null, null, NOW), null);
  });

  test('Date range: unknown token → null', () => {
    assert.strictEqual(resolveDateRange('next-year', null, null, NOW), null);
  });

  // ═══════════════════════════════════════════════════════════
  // IS EVENT IN RANGE
  // ═══════════════════════════════════════════════════════════

  test('isEventInRange: event within today returns true', () => {
    const r = resolveDateRange('today', null, null, NOW);
    const eventTime = isoFrom(5 * 60 * 60 * 1000); // 5h after NOW
    assert.strictEqual(isEventInRange(eventTime, r), true);
  });

  test('isEventInRange: event outside range returns false', () => {
    const r = resolveDateRange('today', null, null, NOW);
    const eventTime = isoFrom(30 * 24 * 60 * 60 * 1000); // 30 days later
    assert.strictEqual(isEventInRange(eventTime, r), false);
  });

  test('isEventInRange: null start or null range returns false', () => {
    const r = resolveDateRange('today', null, null, NOW);
    assert.strictEqual(isEventInRange(null, r), false);
    assert.strictEqual(isEventInRange(isoFrom(1000), null), false);
  });

  test('isEventInRange: boundary inclusive (start of range)', () => {
    const r = resolveDateRange('today', null, null, NOW);
    assert.strictEqual(isEventInRange(r.start.toISOString(), r), true);
  });

  // ═══════════════════════════════════════════════════════════
  // VISIBILITY + LIFECYCLE GATING
  // ═══════════════════════════════════════════════════════════

  test('Gating: public non-cancelled events are listable', () => {
    assert.strictEqual(isEventListable(makeEvent('e1')), true);
  });

  test('Gating: private events excluded', () => {
    assert.strictEqual(isEventListable(makeEvent('e1', { visibility: 'private' })), false);
  });

  test('Gating: cancelled events excluded', () => {
    assert.strictEqual(isEventListable(makeEvent('e1', { lifecycle_state: 'cancelled' })), false);
  });

  test('Gating: connections-visible events excluded from public directory', () => {
    assert.strictEqual(isEventListable(makeEvent('e1', { visibility: 'connections' })), false);
  });

  // ═══════════════════════════════════════════════════════════
  // FORMAT FILTER
  // ═══════════════════════════════════════════════════════════

  test('Format: physical → in-person', () => {
    assert.strictEqual(eventFormatId(makeEvent('e', { location_type: 'physical' })), 'in-person');
  });

  test('Format: online → online', () => {
    assert.strictEqual(eventFormatId(makeEvent('e', { location_type: 'online' })), 'online');
  });

  test('Format: hybrid → hybrid', () => {
    assert.strictEqual(eventFormatId(makeEvent('e', { location_type: 'hybrid' })), 'hybrid');
  });

  test('Format filter: keeps only selected formats', () => {
    const events = [
      makeEvent('e1', { location_type: 'physical' }),
      makeEvent('e2', { location_type: 'online' }),
      makeEvent('e3', { location_type: 'hybrid' }),
    ];
    const kept = applyFormatFilter(events, ['online', 'hybrid']);
    assert.deepStrictEqual(kept.map(e => e.event_id), ['e2', 'e3']);
  });

  test('Format filter: empty selection keeps all', () => {
    const events = [makeEvent('e1'), makeEvent('e2', { location_type: 'online' })];
    assert.strictEqual(applyFormatFilter(events, []).length, 2);
  });

  // ═══════════════════════════════════════════════════════════
  // PRICE FILTER
  // ═══════════════════════════════════════════════════════════

  test('Price: free event has is_free true', () => {
    const events = [
      makeEvent('e1', { is_free: true }),
      makeEvent('e2', { is_free: false }),
    ];
    const free = applyPriceFilter(events, ['free']);
    assert.deepStrictEqual(free.map(e => e.event_id), ['e1']);
  });

  test('Price: paid event selected', () => {
    const events = [
      makeEvent('e1', { is_free: true }),
      makeEvent('e2', { is_free: false }),
    ];
    const paid = applyPriceFilter(events, ['paid']);
    assert.deepStrictEqual(paid.map(e => e.event_id), ['e2']);
  });

  test('Price filter: both selected keeps all', () => {
    const events = [makeEvent('e1', { is_free: true }), makeEvent('e2', { is_free: false })];
    assert.strictEqual(applyPriceFilter(events, ['free', 'paid']).length, 2);
  });

  // ═══════════════════════════════════════════════════════════
  // AVAILABILITY FILTER
  // ═══════════════════════════════════════════════════════════

  test('Availability: spaces_remaining > 0 passes', () => {
    const events = [
      makeEvent('e1', { spaces_remaining: 5 }),
      makeEvent('e2', { spaces_remaining: 0 }),
    ];
    const kept = applyAvailabilityFilter(events, true);
    assert.deepStrictEqual(kept.map(e => e.event_id), ['e1']);
  });

  test('Availability: availability_state=available passes', () => {
    const events = [
      makeEvent('e1', { availability_state: 'available' }),
      makeEvent('e2', { availability_state: 'full' }),
    ];
    const kept = applyAvailabilityFilter(events, true);
    assert.deepStrictEqual(kept.map(e => e.event_id), ['e1']);
  });

  test('Availability: disabled keeps all', () => {
    const events = [makeEvent('e1', { spaces_remaining: 0 }), makeEvent('e2')];
    assert.strictEqual(applyAvailabilityFilter(events, false).length, 2);
  });

  // ═══════════════════════════════════════════════════════════
  // ACTIVITY (SERVICES) RANKED MATCH
  // ═══════════════════════════════════════════════════════════

  test('Activity match: full match scores 1.0 and is eligible', () => {
    const activities = ['yoga', 'pilates'];
    const event = makeEvent('e1', { services: ids(activities) });
    const score = computeMatchScore(event, { serviceIds: activities });
    assert.strictEqual(score.totalScore, 1.0);
    assert.strictEqual(score.isEligible, true);
  });

  test('Activity match: partial match is eligible (1/2)', () => {
    const activities = ['yoga', 'pilates'];
    const event = makeEvent('e1', { services: ids(['yoga']) });
    const score = computeMatchScore(event, { serviceIds: activities });
    assert.ok(Math.abs(score.totalScore - 0.5) < 0.001);
    assert.strictEqual(score.isEligible, true);
  });

  test('Activity match: zero match is excluded', () => {
    const activities = ['yoga', 'pilates'];
    const event = makeEvent('e1', { services: ids(['hiit']) });
    const score = computeMatchScore(event, { serviceIds: activities });
    assert.strictEqual(score.totalScore, 0);
    assert.strictEqual(score.isEligible, false);
  });

  test('Activity match: higher match ranks above lower match', () => {
    const activities = ['yoga', 'pilates', 'meditation'];
    const full = makeEvent('full', { services: ids(activities) });
    const partial = makeEvent('partial', { services: ids(['yoga']) });
    const sFull = computeMatchScore(full, { serviceIds: activities });
    const sPartial = computeMatchScore(partial, { serviceIds: activities });
    assert.ok(sFull.totalScore > sPartial.totalScore);
  });

  // ═══════════════════════════════════════════════════════════
  // RECOMMENDED SORT — EVENT DATE RELEVANCE
  // ═══════════════════════════════════════════════════════════

  test('Recommended date relevance: sooner future event ranks first', () => {
    const soon = makeEvent('soon', { start_time: realIsoFrom(2 * 24 * 60 * 60 * 1000) }); // +2d
    const later = makeEvent('later', { start_time: realIsoFrom(10 * 24 * 60 * 60 * 1000) }); // +10d
    const sorted = [later, soon].sort(eventDateRelevanceCompare);
    assert.strictEqual(sorted[0].event_id, 'soon');
    assert.strictEqual(sorted[1].event_id, 'later');
  });

  test('Recommended date relevance: past event ranks after future', () => {
    const past = makeEvent('past', { start_time: realIsoFrom(-3 * 24 * 60 * 60 * 1000) }); // -3d
    const future = makeEvent('future', { start_time: realIsoFrom(1 * 24 * 60 * 60 * 1000) }); // +1d
    const sorted = [past, future].sort(eventDateRelevanceCompare);
    assert.strictEqual(sorted[0].event_id, 'future');
    assert.strictEqual(sorted[1].event_id, 'past');
  });

  test('Recommended date relevance: no start_time ranks last', () => {
    const noDate = makeEvent('noDate', { start_time: null });
    const future = makeEvent('future', { start_time: realIsoFrom(1 * 24 * 60 * 60 * 1000) });
    const sorted = [noDate, future].sort(eventDateRelevanceCompare);
    assert.strictEqual(sorted[0].event_id, 'future');
    assert.strictEqual(sorted[1].event_id, 'noDate');
  });

  test('Recommended date relevance: mixed event/profile is neutral', () => {
    const event = makeEvent('e1', { start_time: isoFrom(1 * 24 * 60 * 60 * 1000) });
    const profile = { _type: 'professional', display_name: 'Pro' };
    // Should return 0 (no reordering signal between event and profile)
    assert.strictEqual(eventDateRelevanceCompare(event, profile), 0);
    assert.strictEqual(eventDateRelevanceCompare(profile, event), 0);
  });

  // ═══════════════════════════════════════════════════════════
  // URL STATE ROUND-TRIP — EVENT FILTERS
  // ═══════════════════════════════════════════════════════════

  test('URL round-trip: event filters serialize → parse correctly', () => {
    const filters = {
      ...DEFAULT_DIRECTORY_FILTERS,
      typeFilter: 'event',
      dateFilter: 'weekend',
      formatIds: ['online', 'hybrid'],
      priceIds: ['free'],
      availableOnly: true,
      serviceIds: ['yoga', 'pilates'], // Activities reuse canonical svc
    };
    const params = serializeDirectoryParams(filters);
    assert.strictEqual(params.get('svc'), 'yoga,pilates');
    assert.ok(!params.has('etype'), 'etype must not be serialized');
    const parsed = parseDirectoryParams(params);
    assert.deepStrictEqual(parsed, filters);
  });

  test('URL round-trip: custom date range serializes from/to', () => {
    const filters = {
      ...DEFAULT_DIRECTORY_FILTERS,
      dateFilter: 'custom',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-05',
    };
    const params = serializeDirectoryParams(filters);
    assert.strictEqual(params.get('date'), 'custom');
    assert.strictEqual(params.get('from'), '2026-09-01');
    assert.strictEqual(params.get('to'), '2026-09-05');
    const parsed = parseDirectoryParams(params);
    assert.deepStrictEqual(parsed, filters);
  });

  test('URL round-trip: default event filters produce empty URL', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS });
    assert.ok(!params.has('date'));
    assert.ok(!params.has('format'));
    assert.ok(!params.has('price'));
    assert.ok(!params.has('avail'));
    assert.ok(!params.has('etype'));
  });

  test('URL round-trip: availableOnly=true → avail=1', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, availableOnly: true });
    assert.strictEqual(params.get('avail'), '1');
  });

  test('URL round-trip: Activities (serviceIds) comma-separated as svc', () => {
    const params = serializeDirectoryParams({
      ...DEFAULT_DIRECTORY_FILTERS,
      typeFilter: 'event',
      serviceIds: ['yoga', 'pilates', 'meditation'],
    });
    assert.strictEqual(params.get('svc'), 'yoga,pilates,meditation');
    assert.ok(!params.has('etype'));
  });

  test('URL round-trip: shared link restores exact event search', () => {
    // Modern link uses the canonical svc param for Activities.
    const sharedUrl = new URLSearchParams('type=event&date=week&format=online&price=free&avail=1&svc=yoga');
    const parsed = parseDirectoryParams(sharedUrl);
    assert.strictEqual(parsed.typeFilter, 'event');
    assert.strictEqual(parsed.dateFilter, 'week');
    assert.deepStrictEqual(parsed.formatIds, ['online']);
    assert.deepStrictEqual(parsed.priceIds, ['free']);
    assert.strictEqual(parsed.availableOnly, true);
    assert.deepStrictEqual(parsed.serviceIds, ['yoga']);
  });

  test('URL round-trip: legacy etype link folds into serviceIds (backwards-safe)', () => {
    // Old shared links used etype for event Activities. They must still
    // restore the search by merging etype into the canonical serviceIds.
    const legacyUrl = new URLSearchParams('type=event&etype=yoga,pilates');
    const parsed = parseDirectoryParams(legacyUrl);
    assert.deepStrictEqual(parsed.serviceIds, ['yoga', 'pilates']);
  });

  test('URL round-trip: svc + legacy etype merge without duplicates', () => {
    const mergedUrl = new URLSearchParams('svc=yoga&etype=pilates,yoga');
    const parsed = parseDirectoryParams(mergedUrl);
    assert.deepStrictEqual(parsed.serviceIds, ['yoga', 'pilates']);
  });

  // ═══════════════════════════════════════════════════════════
  // INTEGRATION — COMBINED EVENT FILTERING
  // ═══════════════════════════════════════════════════════════

  test('Integration: combined filters narrow events correctly', () => {
    const events = [
      makeEvent('e1', { location_type: 'online', is_free: true, spaces_remaining: 5,
        start_time: isoFrom(2 * 24 * 60 * 60 * 1000), services: ids(['yoga']) }),
      makeEvent('e2', { location_type: 'physical', is_free: false, spaces_remaining: 0,
        start_time: isoFrom(3 * 24 * 60 * 60 * 1000), services: ids(['yoga']) }),
      makeEvent('e3', { location_type: 'online', is_free: true, spaces_remaining: 3,
        start_time: isoFrom(5 * 24 * 60 * 60 * 1000), services: ids(['pilates']) }),
    ];

    let kept = events.filter(isEventListable);
    kept = applyFormatFilter(kept, ['online']);
    kept = applyPriceFilter(kept, ['free']);
    kept = applyAvailabilityFilter(kept, true);

    // e1 (online, free, spaces) and e3 (online, free, spaces) survive
    assert.deepStrictEqual(kept.map(e => e.event_id), ['e1', 'e3']);
  });

  test('Integration: activity filter excludes non-matching events', () => {
    const events = [
      makeEvent('e1', { services: ids(['yoga']) }),
      makeEvent('e2', { services: ids(['pilates']) }),
      makeEvent('e3', { services: ids(['yoga', 'pilates']) }),
    ];
    const activityFilter = ['yoga'];
    const kept = events
      .map(e => ({ ...e, _matchScore: computeMatchScore(e, { serviceIds: activityFilter }) }))
      .filter(e => e._matchScore.isEligible);
    assert.deepStrictEqual(kept.map(e => e.event_id), ['e1', 'e3']);
  });

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();