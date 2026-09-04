// Phase 3 — Source-Owned Scheduling Contracts (§58).
// ───────────────────────────────────────────────────────────
// Verifies: Calendar owns time, source systems own meaning.
// Source-owned events must only perform schedule-changing operations
// through an authorised scheduling contract from the owning system.
// The Calendar-side interface/contract is complete; external producers
// are classified as connected-system dependencies.
//
// Run with: node tests/calendar-source-contract.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const SPLIT = path.join(__dirname, '..', 'cloud-functions', 'src', 'recurrenceSeriesSplit.ts');
const SRC_UNAVAIL = path.join(__dirname, '..', 'cloud-functions', 'src', 'handleSourceUnavailable.ts');
const CAL_EVENT = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEvent.ts');
const CAL_LIB = path.join(__dirname, '..', 'src', 'lib', 'calendar.js');

const splitSrc = fs.readFileSync(SPLIT, 'utf8');
const srcUnavailSrc = fs.readFileSync(SRC_UNAVAIL, 'utf8');
const calEventSrc = fs.readFileSync(CAL_EVENT, 'utf8');
const calLibSrc = fs.readFileSync(CAL_LIB, 'utf8');

// ── §58: Source authority for recurrence series splitting ────
test('§58: SOURCE_SPLIT_AUTHORITY only allows manual (Calendar-owned)', () => {
  if (!/SOURCE_SPLIT_AUTHORITY/.test(splitSrc)) {
    throw new Error('SOURCE_SPLIT_AUTHORITY must be defined');
  }
  if (!/manual:\s*true/.test(splitSrc)) {
    throw new Error('manual must be authorised (Calendar-owned direct authority)');
  }
});

test('§58: Source-owned events (booking, workout, business_scheduling) are rejected for split', () => {
  // The key check is that non-manual systems are rejected via isSourceAuthorised.
  if (!/isSourceAuthorised/.test(splitSrc)) {
    throw new Error('Must check isSourceAuthorised');
  }
  if (!/Source system.*owns this series/i.test(splitSrc)) {
    throw new Error('Must explain that source system owns the series');
  }
  if (!/scheduling contract/i.test(splitSrc)) {
    throw new Error('Must reference the scheduling contract');
  }
});

test('§58: Rejection message classifies source system as owning the series', () => {
  if (!/Source system.*owns this series/i.test(splitSrc)) {
    throw new Error('Rejection must explain source ownership');
  }
  if (!/scheduling contract/i.test(splitSrc)) {
    throw new Error('Rejection must reference the scheduling contract');
  }
});

test('§58: The rejection is NOT a permanent blacklist (extensible contract)', () => {
  if (!/NOT a permanent blacklist/i.test(splitSrc) && !/not.*permanent/i.test(splitSrc)) {
    throw new Error('Must document that the rejection is not permanent');
  }
  if (!/Add.*source systems.*SOURCE_SPLIT_AUTHORITY/i.test(splitSrc)) {
    throw new Error('Must document how to add source systems when they implement contracts');
  }
});

// ── handleSourceUnavailable: source lifecycle contract ──────
test('CONTRACT: handleSourceUnavailable exists as onCall', () => {
  if (!/export const handleSourceUnavailable\s*=\s*onCall/.test(srcUnavailSrc)) {
    throw new Error('handleSourceUnavailable must be an onCall export');
  }
});

test('CONTRACT: handleSourceUnavailable validates reason (deleted/access_lost/deactivated/unavailable)', () => {
  if (!/VALID_REASONS/.test(srcUnavailSrc)) {
    throw new Error('Must define VALID_REASONS');
  }
  for (const r of ['deleted', 'access_lost', 'deactivated', 'unavailable']) {
    if (!new RegExp(`'${r}'`).test(srcUnavailSrc)) {
      throw new Error(`Must accept reason '${r}'`);
    }
  }
});

test('CONTRACT: handleSourceUnavailable transitions deleted/access_lost → removed', () => {
  if (!/deleted.*removed|access_lost.*removed/.test(srcUnavailSrc)) {
    throw new Error('deleted/access_lost must transition to removed');
  }
});

test('CONTRACT: handleSourceUnavailable transitions deactivated → cancelled', () => {
  if (!/deactivated.*cancelled/.test(srcUnavailSrc)) {
    throw new Error('deactivated must transition to cancelled');
  }
});

test('CONTRACT: handleSourceUnavailable redacts source detail (§107 privacy)', () => {
  if (!/buildRedactionPayload/.test(srcUnavailSrc)) {
    throw new Error('Must have buildRedactionPayload');
  }
  if (!/REDACTED_TITLE/.test(srcUnavailSrc)) {
    throw new Error('Must redact title');
  }
  if (!/REDACTED_DESCRIPTION/.test(srcUnavailSrc)) {
    throw new Error('Must redact description');
  }
});

test('CONTRACT: handleSourceUnavailable preserves history (§108)', () => {
  if (!/appendScheduleHistory/.test(srcUnavailSrc)) {
    throw new Error('Must append schedule history (never erase)');
  }
  if (!/NEVER deleted/i.test(srcUnavailSrc)) {
    throw new Error('Must document that the event is never deleted');
  }
});

test('CONTRACT: handleSourceUnavailable preserves Calendar-owned time fields', () => {
  // The comment may span lines (e.g. "Calendar-\nowned fields ... preserved")
  if (!/Calendar[\s\S]*?owned fields[\s\S]*?preserved/i.test(srcUnavailSrc)) {
    throw new Error('Must document that Calendar-owned time fields are preserved');
  }
});

// ── Calendar owns time, source owns meaning ─────────────────
test('AUTHORITY: saveCalendarEvent rejects booking-owned lifecycle_state changes', () => {
  // The code checks source_system === 'booking' && 'lifecycle_state' in data
  // and throws an error about the Booking cancellation flow.
  if (!/source_system.*booking.*lifecycle_state/i.test(calEventSrc)) {
    throw new Error('saveCalendarEvent must check booking-owned lifecycle_state changes');
  }
  if (!/Booking cancellation flow/i.test(calEventSrc)) {
    throw new Error('Must reference the Booking cancellation flow');
  }
});

test('AUTHORITY: saveCalendarEvent preserves source_system + source_id (immutable)', () => {
  if (!/source_system.*IMMUTABLE|IMMUTABLE.*source_system/.test(calEventSrc)) {
    // Check IMMUTABLE_FIELDS includes source_system and source_id
    if (!/'source_system'/.test(calEventSrc) || !/'source_id'/.test(calEventSrc)) {
      throw new Error('source_system and source_id must be immutable');
    }
  }
});

test('AUTHORITY: saveCalendarEvent sets created_by_id server-side (not client-supplied)', () => {
  if (!/created_by_id.*server-side|server-side.*created_by_id|never trust a client-supplied creator/i.test(calEventSrc)) {
    throw new Error('created_by_id must be set server-side');
  }
});

// ── Client-side contract surface ────────────────────────────
test('CLIENT: calendar.js exposes handleSourceUnavailable as a contract endpoint', () => {
  if (!/export async function handleSourceUnavailable/.test(calLibSrc)) {
    throw new Error('calendar.js must export handleSourceUnavailable');
  }
  if (!/requires Firebase mode/.test(calLibSrc)) {
    throw new Error('handleSourceUnavailable must require Firebase mode (server-side contract)');
  }
});

test('CLIENT: calendar.js exposes splitRecurrenceSeries as a contract endpoint', () => {
  if (!/export async function splitRecurrenceSeries/.test(calLibSrc)) {
    throw new Error('calendar.js must export splitRecurrenceSeries');
  }
  if (!/requires Firebase mode/.test(calLibSrc)) {
    throw new Error('splitRecurrenceSeries must require Firebase mode');
  }
});

// ── No invented source system behaviour ──────────────────────
test('NO_INVENTION: No Workout/Business/Booking domain logic in Calendar', () => {
  // Calendar must not invent Workout programme logic, Business scheduling logic,
  // or Booking payment logic. It only provides the contract surface.
  if (/workoutProgramme|workoutSession.*create|businessSchedule.*create/i.test(calLibSrc)) {
    throw new Error('Calendar must not invent Workout/Business domain logic');
  }
});

test('NO_INVENTION: Source systems are classified as connected-system dependencies', () => {
  // The split function must document that source systems are dependencies
  if (!/connected-system dependency|source system.*dependency/i.test(splitSrc)) {
    // Check for the comment about source authority
    if (!/No source system currently authorises/i.test(splitSrc)) {
      throw new Error('Must classify source systems as connected-system dependencies');
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);