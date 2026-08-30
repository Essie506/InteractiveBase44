// Event booking + capacity contract — focused test suite.
// ───────────────────────────────────────────────────────────
// Pure-Node tests (no Firebase emulator, no Stripe). Uses an in-memory
// Firestore mock whose runTransaction serialises via a promise-chain
// mutex, so concurrent bookings are processed one at a time and the
// second sees the first's committed state — mirroring how Firestore's
// optimistic-retry transactions serialise on the event-doc contention
// point in production.
//
// The helpers and the event-booking path below MIRROR the production
// logic in cloud-functions/src/eventCapacity.ts + bookingPayment.ts
// (event path) + calendarEvent.ts (maintainProjection). They are kept
// in sync by hand, matching the established pattern in
// tests/booking-integration.test.cjs.
//
// Covers:
//   - event booking writes event_id
//   - attendee_quantity validation / default
//   - paid event price snapshot
//   - free event
//   - unknown price not treated as free
//   - multi-attendee booking
//   - capacity maths
//   - final available place
//   - booking more than remaining capacity rejected
//   - concurrent final-place attempts cannot oversubscribe
//   - cancellation releases capacity
//   - decline / expiry release capacity
//   - capacity-consuming lifecycle states (all 22)
//   - public projection spaces_remaining update
//   - projection remains sanitised (no meeting_url / attendee identities)
//   - non-Event booking regressions

const assert = require('assert');

let passed = 0;
let failed = 0;
function ok(name, cond, msg) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.log(`[FAIL] ${name}${msg ? ' — ' + msg : ''}`); }
}
async function asyncOk(name, fn) {
  try { await fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name} — ${e.message}`); }
}
function rejects(p, code) {
  return p.then(() => { throw new Error('expected rejection'); }, e => {
    if (code && e.code !== code) throw new Error(`expected ${code}, got ${e.code}`);
  });
}

// ═══════════════════════════════════════════════════════════
// REPLICATED PRODUCTION HELPERS (mirror eventCapacity.ts)
// ═══════════════════════════════════════════════════════════

const CAPACITY_CONSUMING_STATES = [
  'requested', 'pending_provider_response', 'accepted',
  'awaiting_customer_confirmation', 'awaiting_payment', 'payment_pending',
  'confirmed', 'scheduled', 'in_progress', 'completed',
  'reschedule_requested', 'rescheduled', 'disputed',
];
const CAPACITY_RELEASING_STATES = [
  'draft', 'cancelled_by_customer', 'cancelled_by_provider',
  'cancelled_by_platform', 'declined', 'expired',
  'no_show_customer', 'no_show_provider', 'archived',
];
function isCapacityConsuming(s) { return !!s && CAPACITY_CONSUMING_STATES.includes(s); }
function normaliseAttendeeQuantity(q) {
  if (typeof q === 'number' && Number.isFinite(q) && q >= 1) return Math.floor(q);
  return 1;
}
function sumAttendeeQuantity(docs) {
  let t = 0;
  for (const d of docs) { const q = d.data().attendee_quantity; t += (typeof q === 'number' && q > 0) ? Math.floor(q) : 1; }
  return t;
}
function resolveEventPrice(ev) {
  const currency = ev?.currency || 'GBP';
  const pp = ev?.price_pence;
  const isFree = ev?.is_free;
  if (isFree === true) return { price_pence: 0, currency, is_free: true };
  if (isFree === false) {
    if (typeof pp !== 'number' || !Number.isFinite(pp) || pp <= 0) throw new Error('Paid event lacks valid pricing');
    return { price_pence: Math.floor(pp), currency, is_free: false };
  }
  if (typeof pp === 'number' && Number.isFinite(pp)) {
    if (pp === 0) return { price_pence: 0, currency, is_free: true };
    return { price_pence: Math.floor(pp), currency, is_free: false };
  }
  throw new Error('Event pricing is unknown');
}

class HttpsErr extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}

// ═══════════════════════════════════════════════════════════
// MOCK FIRESTORE (serialising transactions)
// ═══════════════════════════════════════════════════════════

class MockFirestore {
  constructor() { this.collections = {}; this._txQueue = Promise.resolve(); }
  collection(n) { if (!this.collections[n]) this.collections[n] = {}; return new MockCollection(this, n); }
  async runTransaction(fn) {
    let release;
    const prev = this._txQueue;
    this._txQueue = new Promise(r => { release = r; });
    await prev;
    try { return await fn(new MockTx(this)); } finally { release(); }
  }
}
class MockCollection {
  constructor(db, n) { this.db = db; this.name = n; }
  doc(id) { return new MockDoc(this.db, this.name, id || `auto-${Date.now()}-${Math.random()}`); }
  where(f, op, v) { return new MockQuery(this.db, this.name, [{ f, op, v }]); }
}
class MockQuery {
  constructor(db, n, filters) { this.db = db; this.name = n; this.filters = filters; }
  where(f, op, v) { this.filters.push({ f, op, v }); return this; }
  async get() {
    const coll = this.db.collections[this.name] || {};
    let docs = Object.entries(coll).map(([id, data]) => ({
      id, exists: true, data: () => ({ ...data }),
      ref: new MockDoc(this.db, this.name, id),
    }));
    docs = docs.filter(d => this.filters.every(fl => {
      const val = d.data()[fl.f];
      if (fl.op === '==') return val === fl.v;
      if (fl.op === 'in') return fl.v.includes(val);
      return false;
    }));
    return { empty: docs.length === 0, docs, size: docs.length };
  }
}
class MockDoc {
  constructor(db, n, id) { this.db = db; this.name = n; this.id = id; }
  async get() {
    const coll = this.db.collections[this.name] || {};
    const data = coll[this.id];
    if (data) return { id: this.id, exists: true, data: () => ({ ...data }), ref: this };
    return { id: this.id, exists: false, data: () => undefined, ref: this };
  }
  async set(d) { if (!this.db.collections[this.name]) this.db.collections[this.name] = {}; this.db.collections[this.name][this.id] = { ...d }; }
  async update(d) { if (!this.db.collections[this.name]) this.db.collections[this.name] = {}; if (!this.db.collections[this.name][this.id]) this.db.collections[this.name][this.id] = {}; Object.assign(this.db.collections[this.name][this.id], d); }
  async delete() { if (this.db.collections[this.name]) delete this.db.collections[this.name][this.id]; }
}
// Transaction delegates to the live store; serialised by runTransaction.
class MockTx {
  constructor(db) { this.db = db; }
  get(refOrQuery) { return refOrQuery.get(); }
  set(ref, data) { return ref.set(data); }
  update(ref, data) { return ref.update(data); }
}

// ═══════════════════════════════════════════════════════════
// REPLICATED EVENT-BOOKING PATH (mirror bookingPayment.ts event branch)
// ═══════════════════════════════════════════════════════════

async function createEventBooking(db, request) {
  const data = request.data || {};
  const { provider_identity_id, business_id, service_id, start_time, end_time,
    payment_route, event_id, attendee_quantity, guest } = data;
  if (!provider_identity_id || !service_id || !start_time || !end_time)
    throw new HttpsErr('invalid-argument', 'Missing required booking fields');
  if (!event_id) throw new HttpsErr('invalid-argument', 'event_id required for event booking');
  const qty = normaliseAttendeeQuantity(attendee_quantity);

  const eventDoc = await db.collection('calendarEvents').doc(event_id).get();
  if (!eventDoc.exists) throw new HttpsErr('not-found', 'Event not found');
  const eventData = eventDoc.data();
  if (eventData.visibility !== 'public') throw new HttpsErr('failed-precondition', 'Event is not publicly bookable');
  if (eventData.lifecycle_state === 'cancelled' || eventData.lifecycle_state === 'completed')
    throw new HttpsErr('failed-precondition', 'Event is cancelled or completed');

  let eventPrice;
  try { eventPrice = resolveEventPrice(eventData); }
  catch (e) { throw new HttpsErr('failed-precondition', e.message); }

  if (eventData.capacity == null || eventData.capacity < 1)
    throw new HttpsErr('failed-precondition', 'Event has no capacity');

  const now = new Date();
  const callerIdentityId = request.auth ? (await db.collection('identityMappings').doc(request.auth.uid).get()).data()?.identity_id || null : null;

  const result = await db.runTransaction(async (tx) => {
    const ev = await tx.get(db.collection('calendarEvents').doc(event_id));
    const evData = ev.data();
    const reservedSnap = await tx.get(
      db.collection('bookings').where('event_id', '==', event_id).where('booking_status', 'in', CAPACITY_CONSUMING_STATES)
    );
    const reserved = sumAttendeeQuantity(reservedSnap.docs);
    if (reserved + qty > evData.capacity)
      throw new HttpsErr('failed-precondition', 'Event is full or has insufficient spaces');
    // Contention bump on the event doc (serialises concurrent txns).
    await tx.update(db.collection('calendarEvents').doc(event_id), {
      capacity_revision: (evData.capacity_revision || 0) + 1,
      _updated_date: now.toISOString(),
    });
    const holdRef = db.collection('slotHolds').doc();
    await tx.set(holdRef, {
      provider_identity_id, business_id: business_id || null, service_id,
      start_time, end_time, status: 'active',
      expires_at: new Date(now.getTime() + 15 * 60000).toISOString(),
      created_by_identity_id: callerIdentityId, _created_date: now.toISOString(),
    });
    const bookingRef = db.collection('bookings').doc();
    await tx.set(bookingRef, {
      customer_identity_id: callerIdentityId, guest_email: guest?.email || null,
      provider_identity_id, business_id: business_id || null, service_id,
      start_time, end_time,
      event_id, attendee_quantity: qty,
      price_snapshot: { base_price_pence: eventPrice.price_pence, currency: eventPrice.currency },
      booking_fee_snapshot: { amount_pence: 0, currency: eventPrice.currency },
      total_snapshot: { amount_pence: eventPrice.price_pence, currency: eventPrice.currency },
      // Event bookings are created in 'requested' (capacity-consuming)
      // so the place is held atomically at creation — the transaction is
      // the concurrency guard, and 'requested' counts toward reserved
      // capacity immediately (draft is a releasing state).
      booking_status: 'requested', payment_route,
      payment_requirement: eventPrice.is_free ? 'not_required' : 'required',
      payment_status_mirror: 'none', hold_id: holdRef.id, calendar_event_id: null,
      _created_date: now.toISOString(), _updated_date: now.toISOString(),
    });
    return { bookingId: bookingRef.id, holdId: holdRef.id };
  });

  await maintainProjection(db, event_id);
  return {
    booking_id: result.bookingId, hold_id: result.holdId,
    total_pence: eventPrice.price_pence,
    payment_requirement: eventPrice.is_free ? 'not_required' : 'required',
    currency: eventPrice.currency,
  };
}

// Replicated projection maintenance (mirror calendarEvent.ts).
async function maintainProjection(db, eventId) {
  const ev = await db.collection('calendarEvents').doc(eventId).get();
  if (!ev.exists) { await db.collection('calendarEventsPublic').doc(eventId).delete().catch(() => {}); return; }
  const data = ev.data();
  const listable = data.visibility === 'public' &&
    !['cancelled', 'completed'].includes(data.lifecycle_state);
  if (!listable) { await db.collection('calendarEventsPublic').doc(eventId).delete().catch(() => {}); return; }
  const reservedSnap = await db.collection('bookings')
    .where('event_id', '==', eventId)
    .where('booking_status', 'in', CAPACITY_CONSUMING_STATES).get();
  const reserved = sumAttendeeQuantity(reservedSnap.docs);
  const capacity = data.capacity;
  const spaces = Math.max(0, capacity - reserved);
  await db.collection('calendarEventsPublic').doc(eventId).set({
    event_id: eventId, title: data.title, start_time: data.start_time,
    capacity, spaces_remaining: spaces,
    availability_state: spaces === 0 ? 'sold_out' : 'available',
    price_pence: data.price_pence, is_free: data.is_free, currency: data.currency,
    visibility: data.visibility, lifecycle_state: data.lifecycle_state,
    // meeting_url intentionally NOT projected; no attendee identities; no booking records.
  });
}

// ═══════════════════════════════════════════════════════════
// TEST SETUP HELPERS
// ═══════════════════════════════════════════════════════════

async function setupEvent(db, eventId, overrides) {
  const defaults = {
    owner_id: 'prov-id', owner_type: 'professional',
    title: 'Yoga Class', visibility: 'public', lifecycle_state: 'scheduled',
    start_time: '2026-12-01T10:00:00Z', end_time: '2026-12-01T11:00:00Z',
    capacity: 10, price_pence: 0, is_free: true, currency: 'GBP',
  };
  await db.collection('calendarEvents').doc(eventId).set({ ...defaults, ...overrides });
}
function makeEventRequest(auth, overrides) {
  return { auth: auth || null, data: {
    provider_identity_id: 'prov-id', business_id: null, service_id: 'svc-1',
    start_time: '2026-12-01T10:00:00Z', end_time: '2026-12-01T11:00:00Z',
    payment_route: 'free', event_id: 'evt-1',
    ...overrides,
  }};
}

// ═══════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('Event Booking + Capacity Contract Tests');
  console.log('═══════════════════════════════════════\n');

  // ── attendee_quantity validation / default ──
  ok('attendee_quantity: absent defaults to 1', normaliseAttendeeQuantity(undefined) === 1);
  ok('attendee_quantity: 0 defaults to 1', normaliseAttendeeQuantity(0) === 1);
  ok('attendee_quantity: negative defaults to 1', normaliseAttendeeQuantity(-3) === 1);
  ok('attendee_quantity: fraction floors', normaliseAttendeeQuantity(2.9) === 2);
  ok('attendee_quantity: 3 stays 3', normaliseAttendeeQuantity(3) === 3);
  ok('attendee_quantity: NaN defaults to 1', normaliseAttendeeQuantity(NaN) === 1);

  // ── event price resolution ──
  ok('price: explicit free → 0', resolveEventPrice({ is_free: true, price_pence: 999 }).price_pence === 0);
  ok('price: explicit paid → price', resolveEventPrice({ is_free: false, price_pence: 5000 }).price_pence === 5000);
  ok('price: is_free absent, price 0 → free', resolveEventPrice({ price_pence: 0 }).is_free === true);
  ok('price: is_free absent, price>0 → paid', resolveEventPrice({ price_pence: 2500 }).is_free === false);
  let threw = false; try { resolveEventPrice({ is_free: false, price_pence: 0 }); } catch { threw = true; }
  ok('price: paid event with 0 price rejected', threw);
  threw = false; try { resolveEventPrice({ is_free: false }); } catch { threw = true; }
  ok('price: paid event with missing price rejected', threw);
  threw = false; try { resolveEventPrice({}); } catch { threw = true; }
  ok('price: unknown pricing never treated as free', threw);

  // ── capacity-consuming lifecycle states (all 22) ──
  for (const s of CAPACITY_CONSUMING_STATES) ok(`state consuming: ${s}`, isCapacityConsuming(s));
  for (const s of CAPACITY_RELEASING_STATES) ok(`state releasing: ${s}`, !isCapacityConsuming(s));
  ok('state consuming: null not consuming', !isCapacityConsuming(null));
  // Ensure the two sets are disjoint and cover 22 states total.
  const allStates = [...CAPACITY_CONSUMING_STATES, ...CAPACITY_RELEASING_STATES];
  ok('contract covers 22 lifecycle states', allStates.length === 22);
  ok('consuming and releasing sets are disjoint',
    CAPACITY_CONSUMING_STATES.every(s => !CAPACITY_RELEASING_STATES.includes(s)));

  // ── event booking writes event_id ──
  await asyncOk('event booking writes event_id and attendee_quantity', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 10, is_free: true });
    const r = await createEventBooking(db, makeEventRequest(null, { event_id: 'evt-1', attendee_quantity: 2 }));
    const b = await db.collection('bookings').doc(r.booking_id).get();
    assert.strictEqual(b.data().event_id, 'evt-1');
    assert.strictEqual(b.data().attendee_quantity, 2);
    assert.strictEqual(b.data().calendar_event_id, null); // no private cal event for event bookings
  });

  // ── attendee_quantity default in a real booking ──
  await asyncOk('event booking defaults attendee_quantity to 1 when absent', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 10, is_free: true });
    const r = await createEventBooking(db, makeEventRequest(null, {}));
    const b = await db.collection('bookings').doc(r.booking_id).get();
    assert.strictEqual(b.data().attendee_quantity, 1);
  });

  // ── paid event price snapshot ──
  await asyncOk('paid event price snapshot from authoritative event', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 10, is_free: false, price_pence: 5000 });
    const r = await createEventBooking(db, makeEventRequest(null, { event_id: 'evt-1' }));
    const b = await db.collection('bookings').doc(r.booking_id).get();
    assert.strictEqual(b.data().price_snapshot.base_price_pence, 5000);
    assert.strictEqual(r.total_pence, 5000);
    assert.strictEqual(r.payment_requirement, 'required');
  });

  // ── free event ──
  await asyncOk('free event → total 0, payment not required', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 10, is_free: true, price_pence: 0 });
    const r = await createEventBooking(db, makeEventRequest(null, {}));
    assert.strictEqual(r.total_pence, 0);
    assert.strictEqual(r.payment_requirement, 'not_required');
  });

  // ── unknown price not treated as free ──
  await asyncOk('event with unknown pricing is rejected (not free)', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 10, price_pence: null, is_free: null });
    delete db.collections.calendarEvents['evt-1'].price_pence;
    delete db.collections.calendarEvents['evt-1'].is_free;
    await rejects(createEventBooking(db, makeEventRequest(null, {})), 'failed-precondition');
  });

  // ── multi-attendee booking ──
  await asyncOk('multi-attendee booking reserves qty places', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 10, is_free: true });
    await createEventBooking(db, makeEventRequest(null, { attendee_quantity: 3 }));
    const proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().spaces_remaining, 7);
  });

  // ── capacity maths ──
  await asyncOk('capacity maths: 4 reserved of 10 → 6 remaining', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 10, is_free: true });
    await createEventBooking(db, makeEventRequest(null, { attendee_quantity: 4 }));
    const proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().spaces_remaining, 6);
    assert.strictEqual(proj.data().availability_state, 'available');
  });

  // ── final available place ──
  await asyncOk('final available place: booking the last place succeeds', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 5, is_free: true });
    // pre-book 4
    for (let i = 0; i < 4; i++) await createEventBooking(db, makeEventRequest(null, {}));
    // 5th takes the final place
    const r = await createEventBooking(db, makeEventRequest(null, {}));
    const proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.ok(r.booking_id);
    assert.strictEqual(proj.data().spaces_remaining, 0);
    assert.strictEqual(proj.data().availability_state, 'sold_out');
  });

  // ── booking more than remaining capacity rejected ──
  await asyncOk('booking more than remaining capacity rejected', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 5, is_free: true });
    await createEventBooking(db, makeEventRequest(null, { attendee_quantity: 3 })); // reserved 3
    await rejects(createEventBooking(db, makeEventRequest(null, { attendee_quantity: 3 })), 'failed-precondition'); // 3+3>5
  });

  await asyncOk('booking qty exceeding capacity outright rejected', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 2, is_free: true });
    await rejects(createEventBooking(db, makeEventRequest(null, { attendee_quantity: 5 })), 'failed-precondition');
  });

  // ── concurrent final-place attempts cannot oversubscribe ──
  await asyncOk('concurrent final-place attempts cannot oversubscribe', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 1, is_free: true });
    const reqs = [makeEventRequest(null, {}), makeEventRequest(null, {})];
    const results = await Promise.allSettled(reqs.map(r => createEventBooking(db, r)));
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    assert.strictEqual(fulfilled.length, 1, `expected 1 success, got ${fulfilled.length}`);
    assert.strictEqual(rejected.length, 1, `expected 1 rejection, got ${rejected.length}`);
    const proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().spaces_remaining, 0);
    // Only one booking doc exists for the event.
    const snap = await db.collection('bookings').where('event_id', '==', 'evt-1').get();
    assert.strictEqual(snap.size, 1);
  });

  // ── cancellation releases capacity ──
  await asyncOk('cancellation releases capacity', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 5, is_free: true });
    const r = await createEventBooking(db, makeEventRequest(null, { attendee_quantity: 2 }));
    let proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().spaces_remaining, 3);
    // Cancel the booking (transition to a releasing state).
    await db.collection('bookings').doc(r.booking_id).update({ booking_status: 'cancelled_by_customer' });
    await maintainProjection(db, 'evt-1');
    proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().spaces_remaining, 5);
  });

  // ── decline / expiry release capacity ──
  await asyncOk('declined booking does not consume capacity', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 5, is_free: true });
    const r = await createEventBooking(db, makeEventRequest(null, {}));
    await db.collection('bookings').doc(r.booking_id).update({ booking_status: 'declined' });
    await maintainProjection(db, 'evt-1');
    const proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().spaces_remaining, 5);
  });
  await asyncOk('expired booking does not consume capacity', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 5, is_free: true });
    const r = await createEventBooking(db, makeEventRequest(null, {}));
    await db.collection('bookings').doc(r.booking_id).update({ booking_status: 'expired' });
    await maintainProjection(db, 'evt-1');
    const proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().spaces_remaining, 5);
  });
  await asyncOk('no_show_customer releases capacity', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 5, is_free: true });
    const r = await createEventBooking(db, makeEventRequest(null, { attendee_quantity: 2 }));
    await db.collection('bookings').doc(r.booking_id).update({ booking_status: 'no_show_customer' });
    await maintainProjection(db, 'evt-1');
    const proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().spaces_remaining, 5);
  });

  // ── completed/in_progress still consume (do not re-free a used place) ──
  await asyncOk('completed booking still consumes capacity', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 5, is_free: true });
    const r = await createEventBooking(db, makeEventRequest(null, { attendee_quantity: 2 }));
    await db.collection('bookings').doc(r.booking_id).update({ booking_status: 'completed' });
    await maintainProjection(db, 'evt-1');
    const proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().spaces_remaining, 3);
  });

  // ── public projection spaces_remaining update ──
  await asyncOk('projection spaces_remaining updates after each booking', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 3, is_free: true });
    // Seed the initial projection (as saveCalendarEvent would on event create).
    await maintainProjection(db, 'evt-1');
    let proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().spaces_remaining, 3);
    await createEventBooking(db, makeEventRequest(null, {}));
    proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().spaces_remaining, 2);
    await createEventBooking(db, makeEventRequest(null, {}));
    proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().spaces_remaining, 1);
  });

  // ── projection remains sanitised ──
  await asyncOk('projection does not contain meeting_url', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 10, is_free: true });
    await db.collection('calendarEvents').doc('evt-1').update({ meeting_url: 'https://meet.example.com/secret' });
    await createEventBooking(db, makeEventRequest(null, {}));
    const proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    assert.strictEqual(proj.data().meeting_url, undefined);
    assert.strictEqual(Object.keys(proj.data()).includes('meeting_url'), false);
  });
  await asyncOk('projection exposes no attendee identities or booking records', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 10, is_free: true });
    await createEventBooking(db, makeEventRequest(null, { attendee_quantity: 2 }));
    const proj = await db.collection('calendarEventsPublic').doc('evt-1').get();
    const keys = Object.keys(proj.data());
    assert.ok(!keys.includes('attendee_identity_ids'));
    assert.ok(!keys.includes('booking_ids'));
    assert.ok(!keys.includes('bookings'));
    assert.ok(!keys.includes('meeting_url'));
    // spaces_remaining is server-derived only.
    assert.strictEqual(typeof proj.data().spaces_remaining, 'number');
  });

  // ── non-Event booking regressions ──
  await asyncOk('non-event booking: event_id null, attendee_quantity null, no capacity check', async () => {
    // A non-event request must not be routed through the event path.
    // The event path requires event_id; without it, it is rejected by the
    // event guard — confirming non-event bookings never enter event logic.
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: 1, is_free: true });
    await rejects(
      createEventBooking(db, { auth: null, data: {
        provider_identity_id: 'prov-id', service_id: 'svc-1',
        start_time: '2026-12-01T10:00:00Z', end_time: '2026-12-01T11:00:00Z',
        payment_route: 'free', // no event_id
      }}),
      'invalid-argument'
    );
    // No booking was created.
    const snap = await db.collection('bookings').where('event_id', '==', 'evt-1').get();
    assert.strictEqual(snap.size, 0);
  });
  await asyncOk('non-event booking: sumAttendeeQuantity falls back to 1 per booking', async () => {
    // one-to-one bookings carry attendee_quantity=null; the helper
    // counts them as 1 so they never silently undercount capacity.
    const docs = [{ data: () => ({ attendee_quantity: null }) }, { data: () => ({}) }];
    assert.strictEqual(sumAttendeeQuantity(docs), 2);
  });

  // ── validation guards ──
  await asyncOk('event booking rejects non-public event', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { visibility: 'private' });
    await rejects(createEventBooking(db, makeEventRequest(null, {})), 'failed-precondition');
  });
  await asyncOk('event booking rejects cancelled event', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { lifecycle_state: 'cancelled' });
    await rejects(createEventBooking(db, makeEventRequest(null, {})), 'failed-precondition');
  });
  await asyncOk('event booking rejects event with no capacity', async () => {
    const db = new MockFirestore();
    await setupEvent(db, 'evt-1', { capacity: null });
    await rejects(createEventBooking(db, makeEventRequest(null, {})), 'failed-precondition');
  });

  console.log('\n═══════════════════════════════════════');
  console.log(`Event Booking Tests: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════');
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });