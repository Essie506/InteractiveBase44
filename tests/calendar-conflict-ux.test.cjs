// §39 Conflict UX — user-facing behaviour around the existing conflict
// infrastructure.
// ───────────────────────────────────────────────────────────
// The authoritative conflict check (shouldEnforceConflictCheck +
// hasOverlappingEvent + touchScheduleLock) stays server-side inside the
// saveCalendarEvent transaction. These tests verify the USER-FACING
// behaviour: EventModal classifies the server's failed-precondition
// rejection and shows a clear "time unavailable" message, keeping the
// modal open — and that no second, divergent client-side conflict engine
// was added.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const modalSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'calendar', 'EventModal.jsx'), 'utf8');
const ceSrc = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEvent.ts'), 'utf8');
const avSrc = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarAvailability.ts'), 'utf8');

// ── Reuse, not a second engine ──
test('EventModal does not add a client-side overlap engine', () => {
  // No client-side hasOverlappingEvent / conflict pre-flight. The
  // authoritative check remains server-side.
  if (/hasOverlappingEvent/.test(modalSrc)) {
    throw new Error('EventModal must not implement its own overlap check');
  }
  if (/shouldEnforceConflictCheck/.test(modalSrc)) {
    throw new Error('EventModal must not re-implement the conflict gate');
  }
});

test('EventModal classifies conflict errors via isConflictError', () => {
  if (!/function isConflictError\(err\)/.test(modalSrc)) {
    throw new Error('isConflictError classifier must be defined');
  }
  // Detects by Firebase code OR the word "conflict" in the message —
  // belt-and-suspenders against the server's failed-precondition throw.
  if (!/code\.includes\('failed-precondition'\)/.test(modalSrc)) {
    throw new Error('classifier must match functions/failed-precondition code');
  }
  if (!/msg\.includes\('conflict'\)/.test(modalSrc)) {
    throw new Error('classifier must match "conflict" in the message');
  }
});

test('EventModal shows a clear "time unavailable" message on conflict', () => {
  if (!/Time slot unavailable/.test(modalSrc)) {
    throw new Error('conflict toast must use a clear "Time slot unavailable" title');
  }
  if (!/conflicts with an existing event/.test(modalSrc)) {
    throw new Error('conflict toast must say the time conflicts with an existing event');
  }
});

test('EventModal keeps the modal open on conflict (no onSaved in catch)', () => {
  // onSaved is the success path that closes the modal. The catch block
  // must NOT call onSaved — the user keeps the form to adjust the time.
  const catchIdx = modalSrc.indexOf('} catch (err) {');
  const finallyIdx = modalSrc.indexOf('} finally {', catchIdx);
  const catchBlock = modalSrc.slice(catchIdx, finallyIdx);
  if (/onSaved/.test(catchBlock)) {
    throw new Error('catch block must not call onSaved (modal must stay open)');
  }
});

test('EventModal preserves the generic fallback for non-conflict errors', () => {
  // Non-conflict errors still show "Could not save event".
  if (!/Could not save event/.test(modalSrc)) {
    throw new Error('generic error fallback must be preserved');
  }
});

// ── §39 server-side infrastructure unchanged ──
test('saveCalendarEvent still throws failed-precondition on conflict', () => {
  if (!/HttpsError\('failed-precondition', 'Time slot conflicts with an existing event'\)/.test(ceSrc)) {
    throw new Error('server must throw failed-precondition with conflict message');
  }
});

test('§39 gate still excludes personal (§29) and source-owned (§45)', () => {
  // Personal events permitted to overlap; source-owned use owning system.
  if (!/if \(sourceSystem && sourceSystem !== 'manual'\) return false;/.test(avSrc)) {
    throw new Error('gate must exclude non-manual source_system (§45)');
  }
  if (!/operatingContext === 'professional'/.test(avSrc)) {
    throw new Error('gate must only enforce for professional context (§29)');
  }
});

test('§39 transaction + sentinel still guard the conflict check', () => {
  if (!/await db\.runTransaction/.test(ceSrc)) {
    throw new Error('conflict check must remain inside runTransaction');
  }
  if (!/touchScheduleLock\(tx, ownerId, nowIso\)/.test(ceSrc)) {
    throw new Error('per-owner sentinel must still be touched (§120)');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);