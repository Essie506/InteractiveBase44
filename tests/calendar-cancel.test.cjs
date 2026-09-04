// Calendar Cancel — canonical server-writer regression tests.
// ───────────────────────────────────────────────────────────
// Proves the existing Calendar Cancel button is wired to the canonical
// saveCalendarEvent Cloud Function (never to repository delete/update),
// and that the server update path:
//   - authorises against the STORED record (so a cancel-only payload works)
//   - blocks booking-owned events from generic Calendar cancellation
//   - does a partial merge (cancel does not clobber existing price)
//   - preserves the authoritative calendarEvents record (merge, not delete)
//   - removes the calendarEventsPublic projection (cancelled is non-listable)
//   - is idempotent (repeated cancel is safe)
//
// Pure/source-contract tests (no emulator required) mirroring the
// server's partial-update logic and asserting the source contracts.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const CF = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEvent.ts');
const CAL = path.join(__dirname, '..', 'src', 'lib', 'calendar.js');
const PAGE = path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx');
const RULES = path.join(__dirname, '..', 'firestore.rules');

const cfSrc = fs.readFileSync(CF, 'utf8');
const calSrc = fs.readFileSync(CAL, 'utf8');
const pageSrc = fs.readFileSync(PAGE, 'utf8');
const rulesSrc = fs.readFileSync(RULES, 'utf8');

// ── Mirror of the server's partial-update payload construction ──
function normalisePricing(pricePence, isFree) {
  const price = Math.max(0, Math.floor(pricePence || 0));
  const free = price === 0 ? true : (isFree ?? false);
  return { price_pence: free ? 0 : price, is_free: free };
}

function buildUpdatePayload(data) {
  const payload = {};
  for (const k of Object.keys(data)) {
    if (k === 'id' || k === 'event_id') continue;
    payload[k] = data[k];
  }
  if ('price_pence' in payload || 'is_free' in payload) {
    const p = normalisePricing(payload.price_pence, payload.is_free);
    payload.price_pence = p.price_pence;
    payload.is_free = p.is_free;
  }
  if ('currency' in payload && !payload.currency) payload.currency = 'GBP';
  payload._updated_date = 'NOW';
  return payload;
}

// ── 1. Manual private event can be cancelled through canonical server path ──
test('cancelEvent routes through callSaveCalendarEvent with lifecycle_state cancelled', () => {
  if (!/callSaveCalendarEvent\(\s*\{\s*id:\s*eventId,\s*lifecycle_state:\s*'cancelled'\s*\}\)/.test(calSrc)) {
    throw new Error('calendar.js cancelEvent must call callSaveCalendarEvent({ id, lifecycle_state: "cancelled" })');
  }
});

test('cancel does not call repository delete/update directly', () => {
  // cancelEvent must not reach calendarRepository.deleteEvent / updateEvent
  const cancelBlock = calSrc.match(/export async function cancelEvent[\s\S]*?\n\}/)[0];
  if (/calendarRepository\.(delete|update|create)Event/.test(cancelBlock)) {
    throw new Error('cancelEvent must not use repository direct write/delete');
  }
});

// ── 2. Cancel payload is partial — does not clobber existing price ──
test('cancel-only payload contains no price fields', () => {
  const payload = buildUpdatePayload({ id: 'evt-1', lifecycle_state: 'cancelled' });
  if ('price_pence' in payload) throw new Error('cancel must not write price_pence');
  if ('is_free' in payload) throw new Error('cancel must not write is_free');
  if (payload.lifecycle_state !== 'cancelled') throw new Error('lifecycle_state not set');
});

test('merged record preserves existing price on cancel', () => {
  const existing = { price_pence: 1500, is_free: false, currency: 'GBP', title: 'Paid', owner_id: 'id1' };
  const payload = buildUpdatePayload({ id: 'evt-1', lifecycle_state: 'cancelled' });
  const merged = { ...existing, ...payload };
  if (merged.price_pence !== 1500) throw new Error('price_pence clobbered by cancel');
  if (merged.is_free !== false) throw new Error('is_free clobbered by cancel');
  if (merged.lifecycle_state !== 'cancelled') throw new Error('lifecycle_state not cancelled');
});

test('edit with price normalises pricing invariant', () => {
  const payload = buildUpdatePayload({ id: 'evt-1', price_pence: 0 });
  if (payload.price_pence !== 0 || payload.is_free !== true) {
    throw new Error('free price must normalise to is_free true');
  }
});

// ── 3. Cancellation preserves the authoritative calendarEvents record ──
test('server update path merges (never deletes) the authoritative event', () => {
  if (!/db\.collection\(EVENTS\)\.doc\(eventId\)\.set\(updatePayload,\s*\{\s*merge:\s*true\s*\}\)/.test(cfSrc)) {
    throw new Error('update path must use set(..., { merge: true })');
  }
  // No direct .delete() chained on a calendarEvents doc in the writer
  // (maintainProjection deletes the PUBLIC projection, which is correct).
  const eventsDelete = cfSrc.match(/db\.collection\(EVENTS\)\.doc\([^)]*\)\.delete\(\)/g);
  if (eventsDelete && eventsDelete.length) {
    throw new Error('writer must not delete calendarEvents docs');
  }
});

test('server update path authorises against the stored record', () => {
  // Must read the existing doc before authorising
  if (!/db\.collection\(EVENTS\)\.doc\(eventId\)\.get\(\)/.test(cfSrc)) {
    throw new Error('update path must load the existing event doc');
  }
  if (!/existing\.owner_id\s*===\s*callerIdentityId/.test(cfSrc)) {
    throw new Error('update path must authorise against stored owner_id');
  }
  if (!/existing\.business_id/.test(cfSrc)) {
    throw new Error('update path must check stored business_id for admin role');
  }
});

test('server rejects cancel of a non-existent event', () => {
  if (!/Calendar event not found/.test(cfSrc)) {
    throw new Error('update path must throw not-found for missing event');
  }
});

// ── 4. Manual public event cancellation removes calendarEventsPublic projection ──
test('cancelled event is non-listable so projection is removed', () => {
  // isEventEligible excludes cancelled lifecycle_state
  const elig = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'eventProjectionEligibility.ts'), 'utf8');
  // V2 §15: listable lifecycle = scheduled, upcoming, in_progress
  if (!/LISTABLE_LIFECYCLE/.test(elig) || !/\['scheduled',\s*'upcoming',\s*'in_progress'\]/.test(elig)) {
    throw new Error('listable lifecycle must be V2 states (scheduled, upcoming, in_progress)');
  }
  // maintainProjection deletes the public doc when not listable
  if (!/db\.collection\(PUBLIC\)\.doc\(eventId\)\.delete\(\)/.test(cfSrc)) {
    throw new Error('maintainProjection must delete stale public projection');
  }
  // projection maintenance uses merged data (full state) on update
  if (!/maintainProjection\(eventId,\s*mergedData\)/.test(cfSrc)) {
    throw new Error('update path must maintain projection with merged data');
  }
});

// ── 5. Client direct delete remains denied ──
test('firestore.rules deny direct client delete on calendarEvents', () => {
  const block = rulesSrc.match(/match\s*\/calendarEvents\/\{eventId\}\s*\{[\s\S]*?\n\s*\}/)[0];
  if (!/allow delete:\s*if false/.test(block)) {
    throw new Error('calendarEvents delete must be denied for clients');
  }
  if (!/allow create:\s*if false/.test(block) || !/allow update:\s*if false/.test(block)) {
    throw new Error('calendarEvents client writes must be denied');
  }
});

// ── 6. Cancelling does not create a second event ──
test('cancel uses the update path (no idempotency mapping created)', () => {
  // The update path returns early before the create/idempotency block.
  if (!/return\s*\{\s*id:\s*eventId,\s*\.\.\.mergedData\s*\}/.test(cfSrc)) {
    throw new Error('update path must return early without create');
  }
  // idempotency collection write must be inside the create path only
  const idempWriteIdx = cfSrc.indexOf('tx.set(idempRef');
  const updateReturnIdx = cfSrc.indexOf('return { id: eventId, ...mergedData }');
  if (idempWriteIdx === -1) throw new Error('idempotency write not found');
  if (updateReturnIdx === -1) throw new Error('update return not found');
  if (idempWriteIdx < updateReturnIdx) {
    throw new Error('idempotency write must come after the update-path early return');
  }
});

// ── 7. Repeated cancellation is safe / idempotent ──
test('repeated cancel produces the same partial payload (idempotent)', () => {
  const p1 = buildUpdatePayload({ id: 'evt-1', lifecycle_state: 'cancelled' });
  const p2 = buildUpdatePayload({ id: 'evt-1', lifecycle_state: 'cancelled' });
  if (p1.lifecycle_state !== p2.lifecycle_state) throw new Error('payloads differ');
  if (p1.lifecycle_state !== 'cancelled') throw new Error('not cancelled');
  // Merging twice into an already-cancelled record is a no-op on lifecycle
  const existing = { lifecycle_state: 'cancelled', price_pence: 2000, is_free: false };
  const merged = { ...existing, ...p2 };
  if (merged.lifecycle_state !== 'cancelled' || merged.price_pence !== 2000) {
    throw new Error('repeated cancel altered preserved fields');
  }
});

// ── 8. Booking-owned event does not bypass Booking cancellation authority ──
test('server blocks lifecycle changes on booking-owned events', () => {
  if (!/existing\.source_system\s*===\s*'booking'/.test(cfSrc)) {
    throw new Error('booking-source guard not found');
  }
  if (!/'lifecycle_state'\s*in\s*data/.test(cfSrc)) {
    throw new Error('guard must check lifecycle_state presence in request');
  }
  if (!/Booking cancellation flow/.test(cfSrc)) {
    throw new Error('guard must direct to Booking cancellation flow');
  }
  if (!/failed-precondition/.test(cfSrc)) {
    throw new Error('guard must throw failed-precondition');
  }
});

test('UI hides generic Cancel for booking-owned events and directs to Bookings', () => {
  // V2 authority: Cancel is gated by canCancelEvent, which returns false
  // for booking-owned events (they must go through the Booking flow).
  // The old inline `e.source_system !== 'booking'` check was refactored
  // into canCancelEvent — verify the authority helper blocks booking events.
  const authSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'calendarAuthority.js'), 'utf8');
  if (!/source_system\s*===\s*'booking'/.test(authSrc)) {
    throw new Error('canCancelEvent must block booking-owned events');
  }
  if (!/canCancelEvent\(e,\s*user\)/.test(pageSrc)) {
    throw new Error('CalendarPage Cancel button must use canCancelEvent');
  }
  if (!/Cancel via Bookings/.test(pageSrc)) {
    throw new Error('CalendarPage must show a Bookings redirect note for booking events');
  }
});

test('UI Cancel button shows loading and is disabled while cancelling', () => {
  if (!/cancellingId/.test(pageSrc)) {
    throw new Error('CalendarPage must track cancellingId state');
  }
  if (!/disabled=\{cancellingId\s*===\s*e\.id\}/.test(pageSrc)) {
    throw new Error('Cancel button must be disabled while its event is cancelling');
  }
  if (!/Loader2/.test(pageSrc) || !/Cancelling/.test(pageSrc)) {
    throw new Error('Cancel button must show a loading indicator');
  }
});

test('UI surfaces failure and leaves the event unchanged on error', () => {
  if (!/variant:\s*'destructive'/.test(pageSrc)) {
    throw new Error('CalendarPage must surface cancel errors via destructive toast');
  }
  // On error the event is not removed — loadEvents only runs on success
  if (!/catch\s*\(err\)/.test(pageSrc)) {
    throw new Error('CalendarPage must catch cancel errors');
  }
});

// ── 9. Creator-based authorisation + immutable ownership/creator ──
test('created_by_id and ownership fields are immutable on update', () => {
  if (!/IMMUTABLE_FIELDS/.test(cfSrc)) throw new Error('IMMUTABLE_FIELDS set missing');
  for (const f of ['created_by_id', 'owner_id', 'owner_type', 'business_id', 'source_id', 'source_system']) {
    if (!new RegExp(`'${f}'`).test(cfSrc)) {
      throw new Error(`${f} must be listed in IMMUTABLE_FIELDS`);
    }
  }
});

test('creator identity can update/cancel an event they created (business event)', () => {
  if (!/existing\.created_by_id\s*===\s*callerIdentityId/.test(cfSrc)) {
    throw new Error('update path must authorise the creator identity');
  }
});

test('business event authorisation uses manage_calendar permission, not assignment', () => {
  if (!/hasBusinessCalendarPermission/.test(cfSrc)) {
    throw new Error('update path must use hasBusinessCalendarPermission for business events');
  }
  if (!/isCreator && !isIdentityOwner && !isBizCalendarManager/.test(cfSrc)) {
    throw new Error('authorisation must be creator OR identity-owner OR business-calendar-manager');
  }
});

test('created_by_id is set server-side on create (never trusted from client)', () => {
  if (!/created_by_id:\s*callerIdentityId/.test(cfSrc)) {
    throw new Error('create path must set created_by_id to the caller server-side');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);