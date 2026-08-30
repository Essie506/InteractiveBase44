/**
 * Directory Event Price Sort Tests
 * ───────────────────────────────────────────────────────────
 * Tests for the event-only price sort + price filter behaviour:
 *   - compareEventsByPrice ascending / descending
 *   - Free === price_pence === 0
 *   - unknown / null price is never free; sorts last (asc + desc)
 *   - equal-price → soonest start_time tie-break
 *   - deterministic title / event_id final tie-break
 *   - price-asc / price-desc URL round-trip
 *   - price sort options surface ONLY for Events (not All / Pro / Biz)
 *   - event price filter in All does not exclude Professional / Business
 *
 * Pure helpers (eventPriceSort, directorySortOptions, directoryUrlState)
 * are imported directly.
 *
 * Usage: node tests/directory-price-sort.test.cjs
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

// Event price filter (entity-aware) — mirrors discoveryService.js:
// priceIds applies ONLY to the event subset; non-events pass through.
function applyEventPriceFilter(results, priceIds) {
  if (!priceIds || priceIds.length === 0) return results;
  return results.filter(r => r._type !== 'event' || priceIds.includes(r.is_free ? 'free' : 'paid'));
}

(async () => {
  const { compareEventsByPrice } = await import('../src/lib/eventPriceSort.js');
  const { getSortOptions, isPriceSort } = await import('../src/lib/directorySortOptions.js');
  const {
    parseDirectoryParams,
    serializeDirectoryParams,
    DEFAULT_DIRECTORY_FILTERS,
  } = await import('../src/lib/directoryUrlState.js');

  const ev = (event_id, opts = {}) => ({
    _type: 'event',
    event_id,
    title: opts.title != null ? opts.title : event_id,
    price_pence: opts.price_pence,
    start_time: opts.start_time || null,
  });

  // ═══════════════════════════════════════════════════════════
  // PRICE SORT
  // ═══════════════════════════════════════════════════════════

  test('Event price ascending: known prices ascending', () => {
    const events = [
      ev('a', { price_pence: 1000 }),
      ev('b', { price_pence: 500 }),
      ev('c', { price_pence: 2000 }),
    ];
    const sorted = [...events].sort((a, b) => compareEventsByPrice(a, b, 'asc'));
    assert.deepStrictEqual(sorted.map(e => e.event_id), ['b', 'a', 'c']);
  });

  test('Event price descending: known prices descending', () => {
    const events = [
      ev('a', { price_pence: 1000 }),
      ev('b', { price_pence: 500 }),
      ev('c', { price_pence: 2000 }),
    ];
    const sorted = [...events].sort((a, b) => compareEventsByPrice(a, b, 'desc'));
    assert.deepStrictEqual(sorted.map(e => e.event_id), ['c', 'a', 'b']);
  });

  test('Free === price_pence === 0 (sorts first ascending)', () => {
    const events = [
      ev('paid', { price_pence: 1000 }),
      ev('free', { price_pence: 0 }),
    ];
    const sorted = [...events].sort((a, b) => compareEventsByPrice(a, b, 'asc'));
    assert.deepStrictEqual(sorted.map(e => e.event_id), ['free', 'paid']);
  });

  test('Unknown price is never free (sorts after paid, last)', () => {
    const events = [
      ev('free', { price_pence: 0 }),
      ev('unknown', {}),
      ev('paid', { price_pence: 1000 }),
    ];
    const sorted = [...events].sort((a, b) => compareEventsByPrice(a, b, 'asc'));
    // free(0), paid(1000), unknown(last) — unknown is NOT grouped with free
    assert.deepStrictEqual(sorted.map(e => e.event_id), ['free', 'paid', 'unknown']);
  });

  test('Unknown price sorts last ascending', () => {
    const events = [
      ev('unknown', {}),
      ev('cheap', { price_pence: 500 }),
      ev('pricey', { price_pence: 5000 }),
    ];
    const sorted = [...events].sort((a, b) => compareEventsByPrice(a, b, 'asc'));
    assert.deepStrictEqual(sorted.map(e => e.event_id), ['cheap', 'pricey', 'unknown']);
  });

  test('Unknown price sorts last descending', () => {
    const events = [
      ev('unknown', {}),
      ev('cheap', { price_pence: 500 }),
      ev('pricey', { price_pence: 5000 }),
    ];
    const sorted = [...events].sort((a, b) => compareEventsByPrice(a, b, 'desc'));
    assert.deepStrictEqual(sorted.map(e => e.event_id), ['pricey', 'cheap', 'unknown']);
  });

  test('Equal-price tie-break: soonest start_time first (asc + desc)', () => {
    const events = [
      ev('later', { price_pence: 1000, start_time: '2026-09-02T10:00:00Z' }),
      ev('sooner', { price_pence: 1000, start_time: '2026-09-01T10:00:00Z' }),
    ];
    const asc = [...events].sort((a, b) => compareEventsByPrice(a, b, 'asc'));
    assert.deepStrictEqual(asc.map(e => e.event_id), ['sooner', 'later']);
    // date tie-break is always soonest-first, even in desc
    const desc = [...events].sort((a, b) => compareEventsByPrice(a, b, 'desc'));
    assert.deepStrictEqual(desc.map(e => e.event_id), ['sooner', 'later']);
  });

  test('Deterministic final tie-break: title (alphabetical)', () => {
    const events = [
      ev('z', { price_pence: 1000, start_time: '2026-09-01T10:00:00Z', title: 'Zebra' }),
      ev('a', { price_pence: 1000, start_time: '2026-09-01T10:00:00Z', title: 'Apple' }),
    ];
    const sorted = [...events].sort((a, b) => compareEventsByPrice(a, b, 'asc'));
    assert.deepStrictEqual(sorted.map(e => e.event_id), ['a', 'z']);
  });

  test('Deterministic final tie-break: event_id when titles equal', () => {
    const events = [
      ev('e2', { price_pence: 1000, start_time: '2026-09-01T10:00:00Z', title: 'Same' }),
      ev('e1', { price_pence: 1000, start_time: '2026-09-01T10:00:00Z', title: 'Same' }),
    ];
    const sorted = [...events].sort((a, b) => compareEventsByPrice(a, b, 'asc'));
    assert.deepStrictEqual(sorted.map(e => e.event_id), ['e1', 'e2']);
  });

  // ═══════════════════════════════════════════════════════════
  // URL ROUND-TRIP
  // ═══════════════════════════════════════════════════════════

  test('URL round-trip: sort=price-asc', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, sort: 'price-asc' });
    assert.strictEqual(params.get('sort'), 'price-asc');
    const parsed = parseDirectoryParams(params);
    assert.strictEqual(parsed.sort, 'price-asc');
  });

  test('URL round-trip: sort=price-desc', () => {
    const params = serializeDirectoryParams({ ...DEFAULT_DIRECTORY_FILTERS, sort: 'price-desc' });
    assert.strictEqual(params.get('sort'), 'price-desc');
    const parsed = parseDirectoryParams(params);
    assert.strictEqual(parsed.sort, 'price-desc');
  });

  // ═══════════════════════════════════════════════════════════
  // SORT OPTION VISIBILITY (event-only)
  // ═══════════════════════════════════════════════════════════

  test('Price sort options available for Events', () => {
    const opts = getSortOptions('event');
    assert.ok(opts.some(o => o.value === 'price-asc'), 'price-asc missing');
    assert.ok(opts.some(o => o.value === 'price-desc'), 'price-desc missing');
  });

  test('Price sort options unavailable for Professional', () => {
    const opts = getSortOptions('professional');
    assert.ok(!opts.some(o => isPriceSort(o.value)), 'price sort exposed for professional');
  });

  test('Price sort options unavailable for Business', () => {
    const opts = getSortOptions('business');
    assert.ok(!opts.some(o => isPriceSort(o.value)), 'price sort exposed for business');
  });

  test('Price sort options unavailable for All', () => {
    const opts = getSortOptions('all');
    assert.ok(!opts.some(o => isPriceSort(o.value)), 'price sort exposed for all');
  });

  // ═══════════════════════════════════════════════════════════
  // ENTITY-AWARE PRICE FILTER
  // ═══════════════════════════════════════════════════════════

  test('Event price filter in All does not exclude Professional/Business', () => {
    const results = [
      { _type: 'professional', identity_id: 'p1' },
      { _type: 'business', business_id: 'b1' },
      { _type: 'event', event_id: 'e1', is_free: true },
      { _type: 'event', event_id: 'e2', is_free: false },
    ];
    const kept = applyEventPriceFilter(results, ['free']);
    assert.deepStrictEqual(
      kept.map(r => r.identity_id || r.business_id || r.event_id),
      ['p1', 'b1', 'e1']
    );
  });

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();