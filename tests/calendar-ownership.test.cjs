// Calendar ownership / sharing / assignment / permission — regression suite.
// ───────────────────────────────────────────────────────────
// Source-contract + logic tests for the corrected Calendar architecture:
//   - ONE identity-owned event set (Personal/Professional are operating
//     contexts, not owners); 'professional' is NOT an owner_type.
//   - Business-owned events use owner_id = businessId; creator preserved.
//   - Creator OR business-calendar-manager can mutate; assignment/invitation
//     alone NEVER grants mutation.
//   - Sharing/invitation by email resolves to identity IDs (or guest emails)
//     without duplicating the authoritative event.
//   - Booking-owned events follow the corrected ownership model and cannot
//     bypass the Booking cancellation lifecycle.
//   - Public projection: identity+professional and business listable;
//     personal-context identity events never listable; cancel removes.
//   - Availability uses owner_type 'identity' for professional availability.
//
// Pure/source-contract tests — no emulator required.

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const SCHEMA = path.join(__dirname, '..', 'base44', 'entities', 'CalendarEvent.jsonc');
const AVAIL_SCHEMA = path.join(__dirname, '..', 'base44', 'entities', 'AvailabilityRule.jsonc');
const CF = path.join(__dirname, '..', 'cloud-functions', 'src', 'calendarEvent.ts');
const SHARED = path.join(__dirname, '..', 'cloud-functions', 'src', 'shared.ts');
const BOOKING = path.join(__dirname, '..', 'cloud-functions', 'src', 'bookingPayment.ts');
const ELIG = path.join(__dirname, '..', 'cloud-functions', 'src', 'eventProjectionEligibility.ts');
const CAL = path.join(__dirname, '..', 'src', 'lib', 'calendar.js');
const PAGE = path.join(__dirname, '..', 'src', 'pages', 'CalendarPage.jsx');
const RULES = path.join(__dirname, '..', 'firestore.rules');
const BACKFILL = path.join(__dirname, '..', 'cloud-functions', 'src', 'backfillCalendarOwnership.ts');

const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
const cfSrc = fs.readFileSync(CF, 'utf8');
const sharedSrc = fs.readFileSync(SHARED, 'utf8');
const bookingSrc = fs.readFileSync(BOOKING, 'utf8');
const eligSrc = fs.readFileSync(ELIG, 'utf8');
const calSrc = fs.readFileSync(CAL, 'utf8');
const pageSrc = fs.readFileSync(PAGE, 'utf8');
const rulesSrc = fs.readFileSync(RULES, 'utf8');

// ═══════════════════════════════════════════════════════════
// 1. SCHEMA — owner_type enum, creator, assignment/invitation fields
// ═══════════════════════════════════════════════════════════
test('CalendarEvent owner_type enum is [identity, business] (no professional)', () => {
  const ot = schema.properties.owner_type;
  if (!Array.isArray(ot.enum) || ot.enum.join(',') !== 'identity,business') {
    throw new Error(`owner_type enum must be [identity, business], got ${JSON.stringify(ot.enum)}`);
  }
});

test('CalendarEvent reuses created_by_id as the canonical creator field', () => {
  if (!schema.properties.created_by_id) throw new Error('created_by_id field missing');
  if (!schema.required.includes('created_by_id')) throw new Error('created_by_id must be required');
});

test('CalendarEvent has assigned_identity_ids, invited_identity_ids, invited_guest_emails', () => {
  for (const f of ['assigned_identity_ids', 'invited_identity_ids', 'invited_guest_emails']) {
    if (!schema.properties[f]) throw new Error(`${f} field missing`);
  }
});

test('AvailabilityRule owner_type enum is [identity, business] (no professional)', () => {
  const a = JSON.parse(fs.readFileSync(AVAIL_SCHEMA, 'utf8'));
  if (a.properties.owner_type.enum.join(',') !== 'identity,business') {
    throw new Error('AvailabilityRule owner_type must be [identity, business]');
  }
});

// ═══════════════════════════════════════════════════════════
// 2. CALENDAR VIEW — one identity-owned set
// ═══════════════════════════════════════════════════════════
test('CalendarPage uses owner_type identity for Personal and Professional', () => {
  if (/activeContext === 'professional' \? 'professional'/.test(pageSrc)) {
    throw new Error('CalendarPage must not derive a professional owner_type');
  }
  if (!/activeContext === 'business' \? 'business' : 'identity'/.test(pageSrc)) {
    throw new Error('CalendarPage must use identity for Personal/Professional');
  }
});

test('getAllEventsForIdentity queries identity-owned events once (no professional query)', () => {
  const fnBlock = calSrc.match(/export async function getAllEventsForIdentity[\s\S]*?\n\}/)[0];
  if (/getEvents\([^,]+,\s*'professional'/.test(fnBlock)) {
    throw new Error('must not query a separate professional set');
  }
  if (!/getEvents\(identityId,\s*'identity'/.test(fnBlock)) {
    throw new Error('must query identity-owned set once');
  }
});

test('getAllEventsForIdentity includes assigned + invited events', () => {
  const fnBlock = calSrc.match(/export async function getAllEventsForIdentity[\s\S]*?\n\}/)[0];
  if (!/listEventsAssignedToIdentity/.test(fnBlock)) throw new Error('must include assigned events');
  if (!/listEventsInvitedToIdentity/.test(fnBlock)) throw new Error('must include invited events');
});

// ═══════════════════════════════════════════════════════════
// 3. MUTATION PERMISSION — creator / owner / business-calendar-manager
// ═══════════════════════════════════════════════════════════
test('update authorises: creator OR identity-owner OR business-calendar-manager', () => {
  if (!/existing\.created_by_id\s*===\s*callerIdentityId/.test(cfSrc)) throw new Error('creator auth missing');
  if (!/existing\.owner_type === 'identity' && existing\.owner_id === callerIdentityId/.test(cfSrc)) throw new Error('identity-owner auth missing');
  if (!/hasBusinessCalendarPermission\(existing\.business_id, callerIdentityId\)/.test(cfSrc)) throw new Error('business calendar manager auth missing');
  if (!/isCreator && !isIdentityOwner && !isBizCalendarManager/.test(cfSrc)) throw new Error('auth disjunction missing');
});

test('assignment/invitation alone does NOT authorise mutation', () => {
  // No authorisation path reads assigned_identity_ids/invited_identity_ids
  // for mutation permission.
  const authBlock = cfSrc.match(/UPDATE PATH[\s\S]*?maintainProjection\(eventId, mergedData\)/)[0];
  if (/assigned_identity_ids[\s\S]{0,200}permission-denied/.test(authBlock)) {
    throw new Error('assignment must not be part of mutation authorisation');
  }
});

test('business event create allows any active business member (not just manage_calendar)', () => {
  const createBlock = cfSrc.match(/CREATE PATH[\s\S]*?maintainProjection\(eventDocId, eventData\)/)[0];
  if (/hasBusinessCalendarPermission\(businessId, callerIdentityId\)/.test(createBlock)) {
    throw new Error('create must not require manage_calendar (that is the manage-others gate)');
  }
  if (!/hasBusinessCalendarCreatePermission\(businessId, callerIdentityId\)/.test(createBlock)) {
    throw new Error('create must use hasBusinessCalendarCreatePermission (active membership)');
  }
});

test('hasBusinessCalendarCreatePermission grants any active member (no manage_calendar requirement)', () => {
  if (!/export async function hasBusinessCalendarCreatePermission/.test(sharedSrc)) {
    throw new Error('hasBusinessCalendarCreatePermission helper missing');
  }
  const fnBlock = sharedSrc.match(/export async function hasBusinessCalendarCreatePermission[\s\S]*?\n\}/)[0];
  if (/manage_calendar/.test(fnBlock)) {
    throw new Error('create permission must not require manage_calendar');
  }
  if (!/lifecycle_state/.test(fnBlock)) {
    throw new Error('create permission must check active membership');
  }
});

test('hasBusinessCalendarPermission still gates managing other people\'s business events', () => {
  if (!/export async function hasBusinessCalendarPermission/.test(sharedSrc)) {
    throw new Error('hasBusinessCalendarPermission helper missing');
  }
  const fnBlock = sharedSrc.match(/export async function hasBusinessCalendarPermission[\s\S]*?\n\}/)[0];
  if (!/'owner',\s*'admin'/.test(fnBlock) || !/'manage_calendar'/.test(fnBlock)) {
    throw new Error('manage permission must keep owner/admin + manage_calendar gate');
  }
});

test('hasBusinessCalendarPermission reuses BusinessMembership + manage_calendar (no parallel system)', () => {
  if (!/export async function hasBusinessCalendarPermission/.test(sharedSrc)) {
    throw new Error('hasBusinessCalendarPermission helper missing');
  }
  if (!/'owner',\s*'admin'/.test(sharedSrc) || !/'manage_calendar'/.test(sharedSrc)) {
    throw new Error('must reuse role + manage_calendar permission taxonomy');
  }
});

// ═══════════════════════════════════════════════════════════
// 4. SHARING / INVITATION BY EMAIL — no duplication, no invented identities
// ═══════════════════════════════════════════════════════════
test('sharing stores invited_identity_ids on the SAME event doc (no duplication)', () => {
  // The create path writes invited_identity_ids into the single event doc.
  if (!/invited_identity_ids:\s*invitedIdentityIds/.test(cfSrc)) {
    throw new Error('create path must store invited_identity_ids on the event doc');
  }
  if (!/invited_guest_emails:\s*invitedGuestEmails/.test(cfSrc)) {
    throw new Error('create path must store invited_guest_emails on the event doc');
  }
});

test('resolveEmailsToIdentities resolves by email without inventing identities', () => {
  if (!/export async function resolveEmailsToIdentities/.test(sharedSrc)) {
    throw new Error('resolveEmailsToIdentities helper missing');
  }
  // Must query users by email (canonical), not invent identities for unknown
  if (!/where\('email', '==', canonical\)/.test(sharedSrc)) {
    throw new Error('must resolve via users by canonical email');
  }
  if (!/unresolved\.push\(canonical\)/.test(sharedSrc)) {
    throw new Error('unknown emails must be preserved as unresolved guests, not invented');
  }
});

test('owner/creator are excluded from their own invitee list', () => {
  if (!/id !== ownerId && id !== callerIdentityId/.test(cfSrc)) {
    throw new Error('must not invite the owner/creator to their own event');
  }
});

// ═══════════════════════════════════════════════════════════
// 5. BOOKING-OWNED EVENTS — corrected ownership + lifecycle authority
// ═══════════════════════════════════════════════════════════
test('booking-created professional event is identity-owned + professional context', () => {
  const block = bookingSrc.match(/Create calendar event — corrected ownership model[\s\S]*?\}\);/)[0];
  if (!/isBusinessBooking \? 'business' : 'identity'/.test(block)) throw new Error('owner_type must be identity for non-business bookings');
  if (!/isBusinessBooking \? 'business' : 'professional'/.test(block)) throw new Error('operating_context must be professional for non-business bookings');
});

test('booking-created business event assigns the provider identity (view only)', () => {
  const block = bookingSrc.match(/Create calendar event — corrected ownership model[\s\S]*?\}\);/)[0];
  if (!/assigned_identity_ids:\s*isBusinessBooking \? \[booking\.provider_identity_id\] : \[\]/.test(block)) {
    throw new Error('business booking must assign the provider identity (not make them owner)');
  }
  if (!/created_by_id:\s*booking\.provider_identity_id/.test(block)) {
    throw new Error('booking event must preserve the provider as creator');
  }
});

test('generic Calendar cancel blocks booking-owned events', () => {
  if (!/existing\.source_system\s*===\s*'booking'/.test(cfSrc)) throw new Error('booking-source guard missing');
  if (!/Booking cancellation flow/.test(cfSrc)) throw new Error('must direct to Booking cancellation flow');
});

// ═══════════════════════════════════════════════════════════
// 6. PUBLIC PROJECTION — eligibility by ownership + operating context
// ═══════════════════════════════════════════════════════════
test('professional public event (identity + professional context) is listable', () => {
  if (!/owner_type === 'identity' && data.operating_context === 'professional'/.test(eligSrc)) {
    throw new Error('identity+professional-context must be a listable path');
  }
});

test('personal-context identity event is NOT listable', () => {
  // No listable path for identity + personal context
  if (/owner_type === 'identity' && data.operating_context === 'personal'/.test(eligSrc)) {
    throw new Error('personal-context identity events must not be listable');
  }
});

test('business public event is listable', () => {
  if (!/owner_type === 'business'/.test(eligSrc)) throw new Error('business must be a listable path');
});

test('cancelled event removes the public projection', () => {
  if (!/db\.collection\(PUBLIC\)\.doc\(eventId\)\.delete\(\)/.test(cfSrc)) {
    throw new Error('maintainProjection must delete stale public projection');
  }
});

// ═══════════════════════════════════════════════════════════
// 7. FIRESTORE RULES — assigned/invited read; availability identity read
// ═══════════════════════════════════════════════════════════
test('calendarEvents read grants assigned + invited identities (view only)', () => {
  const block = rulesSrc.match(/match \/calendarEvents\/\{eventId\}\s*\{[\s\S]*?\n\s*\}/)[0];
  if (!/assigned_identity_ids/.test(block) || !/invited_identity_ids/.test(block)) {
    throw new Error('read rule must grant assigned + invited identities');
  }
  if (!/allow create:\s*if false/.test(block) || !/allow update:\s*if false/.test(block)) {
    throw new Error('client writes must remain denied');
  }
});

test('availabilityRules read uses owner_type identity (not professional)', () => {
  const block = rulesSrc.match(/match \/availabilityRules\/\{ruleId\}\s*\{[\s\S]*?\n\s*\}/)[0];
  if (!/owner_type == 'identity' && isAuthenticated\(\)/.test(block)) {
    throw new Error('availability read must use owner_type identity for professional availability');
  }
  if (/owner_type == 'professional'/.test(block)) {
    throw new Error('availability read must not reference professional owner_type');
  }
});

// ═══════════════════════════════════════════════════════════
// 8. BACKFILL — implemented, not invoked
// ═══════════════════════════════════════════════════════════
test('backfillCalendarOwnership is implemented (admin-only, idempotent)', () => {
  if (!fs.existsSync(BACKFILL)) throw new Error('backfill file missing');
  const b = fs.readFileSync(BACKFILL, 'utf8');
  if (!/export const backfillCalendarOwnership/.test(b)) throw new Error('backfill not exported');
  if (!/requireAdmin/.test(b)) throw new Error('backfill must be admin-only');
  if (!/professionalToIdentity/.test(b) || !/businessOwnerFixed/.test(b)) {
    throw new Error('backfill must convert professional→identity and fix business owner_id');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);