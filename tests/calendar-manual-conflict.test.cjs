// §39 — Double-booking protection for manual Professional/Business event creation.
// ───────────────────────────────────────────────────────────
// Source-inspection tests verifying that saveCalendarEvent performs
// authoritative server-side conflict validation at commit time for
// manual Professional/Business events, with concurrency-safe semantics
// via a per-owner schedule sentinel.
//
// Emulator-dependent runtime validation (actual concurrent transactions)
// is identified separately for local validation.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const CE = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEvent.ts');
const AV = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarAvailability.ts');
const FR = path.join(__dirname, '..', 'firestore.rules');
const ceSrc = fs.readFileSync(CE, 'utf8');
const avSrc = fs.readFileSync(AV, 'utf8');
const frSrc = fs.readFileSync(FR, 'utf8');

// ── Infrastructure: conflict-check gate + sentinel ──────────────

test('calendarAvailability exports shouldEnforceConflictCheck gate', () => {
  if (!/export function shouldEnforceConflictCheck/.test(avSrc)) {
    throw new Error('shouldEnforceConflictCheck must be exported');
  }
});

test('shouldEnforceConflictCheck excludes source-owned events (§45)', () => {
  // Source-owned events (booking, workout, business_scheduling) must NOT
  // be routed through the generic manual-event conflict policy.
  if (!/sourceSystem && sourceSystem !== 'manual'/.test(avSrc)) {
    throw new Error('gate must return false for non-manual source_system');
  }
});

test('shouldEnforceConflictCheck excludes personal events (§29)', () => {
  // Personal events (identity-owned, operating_context 'personal') are
  // permitted to overlap per V2 §29 — the gate must return false for them.
  if (!/operatingContext === 'professional'/.test(avSrc)) {
    throw new Error('gate must only enforce for professional operating_context');
  }
  if (!/ownerType === 'business'/.test(avSrc)) {
    throw new Error('gate must enforce for business owner_type');
  }
});

test('calendarAvailability exports touchScheduleLock sentinel helper', () => {
  if (!/export async function touchScheduleLock/.test(avSrc)) {
    throw new Error('touchScheduleLock must be exported');
  }
});

test('sentinel is read AND written (concurrency-safe)', () => {
  // The sentinel must be both tx.get (read-tracked) AND tx.set (write) so
  // Firestore's optimistic concurrency control detects concurrent mutations.
  if (!/await tx\.get\(ref\)/.test(avSrc)) {
    throw new Error('sentinel must be read via tx.get');
  }
  if (!/tx\.set\(ref,/.test(avSrc)) {
    throw new Error('sentinel must be written via tx.set');
  }
});

// ── CREATE path: conflict check inside the transaction ──────────

test('saveCalendarEvent imports conflict infrastructure', () => {
  if (!/import \{ hasOverlappingEvent, touchScheduleLock, shouldEnforceConflictCheck \} from '\.\/calendarAvailability'/.test(ceSrc)) {
    throw new Error('must import hasOverlappingEvent, touchScheduleLock, shouldEnforceConflictCheck');
  }
});

test('CREATE path checks conflicts inside the transaction (§39)', () => {
  // The conflict check must run inside db.runTransaction, not as a pre-write read.
  if (!/shouldEnforceConflictCheck\(sourceSystem, data\.operating_context, ownerType\)/.test(ceSrc)) {
    throw new Error('CREATE path must gate on shouldEnforceConflictCheck');
  }
  if (!/hasOverlappingEvent\(tx, ownerId, eventData\.start_time, eventData\.end_time\)/.test(ceSrc)) {
    throw new Error('CREATE path must call hasOverlappingEvent with tx');
  }
});

test('CREATE path rejects overlapping protected time', () => {
  if (!/Time slot conflicts with an existing event/.test(ceSrc)) {
    throw new Error('CREATE path must throw failed-precondition on conflict');
  }
});

test('CREATE path touches sentinel for concurrency safety (§120)', () => {
  if (!/touchScheduleLock\(tx, ownerId, nowIso\)/.test(ceSrc)) {
    throw new Error('CREATE path must touch schedule sentinel inside transaction');
  }
});

test('CREATE conflict check is inside runTransaction (not pre-write)', () => {
  // Verify the conflict check appears AFTER db.runTransaction opens and
  // BEFORE tx.set(eventRef — i.e. inside the transaction body.
  const txIdx = ceSrc.indexOf('await db.runTransaction(async (tx) => {');
  const conflictIdx = ceSrc.indexOf('shouldEnforceConflictCheck(sourceSystem, data.operating_context, ownerType)');
  const eventSetIdx = ceSrc.indexOf('tx.set(eventRef,');
  if (txIdx === -1) throw new Error('CREATE path must use runTransaction');
  if (conflictIdx === -1) throw new Error('CREATE path must call shouldEnforceConflictCheck');
  if (eventSetIdx === -1) throw new Error('CREATE path must tx.set eventRef');
  if (!(txIdx < conflictIdx && conflictIdx < eventSetIdx)) {
    throw new Error('conflict check must be inside the transaction, before the event write');
  }
});

// ── UPDATE path: conflict check on reschedule ──────────────────

test('UPDATE path checks conflicts when time changes', () => {
  if (!/shouldEnforceConflictCheck\(\s*existing\.source_system/.test(ceSrc)) {
    throw new Error('UPDATE path must gate on existing.source_system');
  }
  if (!/hasOverlappingEvent\(tx, existing\.owner_id, newStart, newEnd, eventId\)/.test(ceSrc)) {
    throw new Error('UPDATE path must call hasOverlappingEvent with self-exclusion (eventId)');
  }
});

test('UPDATE path excludes self from conflict detection', () => {
  // The eventId (excludeEventId) parameter must be passed so the event
  // being edited does not conflict with itself.
  if (!/hasOverlappingEvent\(tx, existing\.owner_id, newStart, newEnd, eventId\)/.test(ceSrc)) {
    throw new Error('UPDATE path must exclude self via eventId parameter');
  }
});

test('UPDATE path only checks when time actually changes', () => {
  if (!/startChanged/.test(ceSrc) || !/endChanged/.test(ceSrc)) {
    throw new Error('UPDATE path must compute startChanged/endChanged');
  }
  if (!/timeChanging = startChanged \|\| endChanged/.test(ceSrc)) {
    throw new Error('UPDATE path must gate on timeChanging');
  }
});

test('UPDATE path preserves non-conflict-checked direct write', () => {
  // Personal events, source-owned events, and non-time-changing updates
  // must retain the existing direct-write behaviour (no transaction).
  if (!/Non-conflict-checked path/.test(ceSrc)) {
    throw new Error('UPDATE path must preserve direct-write for non-conflict cases');
  }
});

// ── Lifecycle state filtering (§15) ─────────────────────────────

test('hasOverlappingEvent only blocks active lifecycle states (§15)', () => {
  // cancelled, removed, superseded, historical, completed, skipped, archived
  // must NOT block — only held/scheduled/upcoming/in_progress block time.
  if (!/ACTIVE_LIFECYCLE = \['held', 'scheduled', 'upcoming', 'in_progress'\]/.test(avSrc)) {
    throw new Error('ACTIVE_LIFECYCLE must be held/scheduled/upcoming/in_progress only');
  }
  if (!/if \(!ACTIVE_LIFECYCLE\.includes\(ev\.lifecycle_state\)\) continue;/.test(avSrc)) {
    throw new Error('must skip non-active lifecycle states');
  }
});

// ── Source-owned authority preserved (§45) ──────────────────────

test('source-owned events bypass manual conflict policy (§45)', () => {
  // Booking-owned events (source_system 'booking') must NOT be conflict-checked
  // by saveCalendarEvent — they use the Booking system's scheduling contract.
  // The gate returns false for non-manual source_system.
  const gateMatch = avSrc.match(/if \(sourceSystem && sourceSystem !== 'manual'\) return false;/);
  if (!gateMatch) {
    throw new Error('gate must return false for non-manual source_system');
  }
});

// ── Firestore rules: sentinel is server-only ─────────────────────

test('calendarScheduleLocks is server-only in firestore.rules', () => {
  if (!/match \/calendarScheduleLocks\/\{ownerId\}/.test(frSrc)) {
    throw new Error('firestore.rules must define calendarScheduleLocks collection');
  }
  // The sentinel must be server-only (clients cannot read or write it).
  const sentinelBlock = frSrc.match(/match \/calendarScheduleLocks\/\{ownerId\} \{[\s\S]*?\}/);
  if (!sentinelBlock) throw new Error('sentinel rules block not found');
  if (!/allow read: if false;/.test(sentinelBlock[0])) {
    throw new Error('sentinel must deny client reads');
  }
  if (!/allow write: if false;/.test(sentinelBlock[0])) {
    throw new Error('sentinel must deny client writes');
  }
});

// ── Concurrency safety (§120) ───────────────────────────────────

test('concurrent attempts serialize via sentinel (§120)', () => {
  // The sentinel is read AND written inside the same transaction as the
  // conflict check. Two concurrent transactions for the same owner both
  // read+write the same sentinel doc → Firestore retries one → on retry
  // the conflict check sees the other's newly committed event.
  //
  // This is the standard Firestore optimistic-concurrency sentinel pattern,
  // not a new locking architecture. It reuses hasOverlappingEvent (no second
  // conflict engine) and adds only a minimal per-owner doc.
  const sentinelImpl = avSrc.match(/export async function touchScheduleLock[\s\S]*?^}/m);
  if (!sentinelImpl) throw new Error('touchScheduleLock implementation not found');
  const body = sentinelImpl[0];
  if (!/tx\.get\(ref\)/.test(body)) throw new Error('sentinel must tx.get (read-track)');
  if (!/tx\.set\(ref,/.test(body)) throw new Error('sentinel must tx.set (write)');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);