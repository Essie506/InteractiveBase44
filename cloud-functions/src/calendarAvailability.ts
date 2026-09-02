// Calendar availability — authoritative availability evaluation + overlap
// conflict detection (V2 §27, §29, §32, §37, §39).
// ───────────────────────────────────────────────────────────
// Calendar owns time and availability. Booking REQUESTS availability from
// Calendar (§32) and checks conflicts through these helpers. Overlap
// detection uses range queries (start_time < newEnd) + in-memory
// end_time > newStart filtering, because Firestore allows at most one
// range filter per query.
//
// Availability evaluation consumes AvailabilityRule (working_hours +
// unavailable/blocked + exceptions) to decide whether a requested slot is
// within authorised availability. When no working_hours rules are
// configured, Calendar imposes no availability restriction (eligible).

import { db } from './shared';

type Store = { get: (q: any) => Promise<any> };

const ACTIVE_LIFECYCLE = ['scheduled', 'confirmed', 'tentative'];
const ACTIVE_BOOKING_STATES = [
  'requested', 'accepted', 'awaiting_customer_confirmation',
  'awaiting_payment', 'payment_pending', 'confirmed', 'scheduled',
];

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function getZonedParts(iso: string, timezone: string): { dayOfWeek: number; hhmm: string; dateStr: string } {
  const tz = timezone || 'UTC';
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit',
    hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(iso))) parts[p.type] = p.value;
  const dow = WEEKDAY_MAP[parts.weekday] ?? new Date(iso).getDay();
  return { dayOfWeek: dow, hhmm: `${parts.hour}:${parts.minute}`, dateStr: `${parts.year}-${parts.month}-${parts.day}` };
}

// ── Overlap conflict detection (§29, §37, §39) ──────────────
// Two intervals [aStart, aEnd) and [bStart, bEnd) overlap iff
// aStart < bEnd && aEnd > bStart. We query start_time < newEnd (single
// range) and filter end_time > newStart in memory.
export async function hasOverlappingEvent(
  store: Store, ownerId: string, startIso: string, endIso: string, excludeEventId?: string,
): Promise<boolean> {
  const snap = await store.get(
    db.collection('calendarEvents')
      .where('owner_id', '==', ownerId)
      .where('start_time', '<', endIso)
      .orderBy('start_time', 'desc')
      .limit(200),
  );
  const startMs = new Date(startIso).getTime();
  for (const doc of snap.docs) {
    if (excludeEventId && doc.id === excludeEventId) continue;
    const ev = doc.data();
    if (!ACTIVE_LIFECYCLE.includes(ev.lifecycle_state)) continue;
    if (new Date(ev.end_time).getTime() > startMs) return true;
  }
  return false;
}

export async function hasOverlappingHold(
  store: Store, providerId: string, startIso: string, endIso: string, excludeHoldId?: string,
): Promise<boolean> {
  const snap = await store.get(
    db.collection('slotHolds')
      .where('provider_identity_id', '==', providerId)
      .where('start_time', '<', endIso)
      .orderBy('start_time', 'desc')
      .limit(200),
  );
  const startMs = new Date(startIso).getTime();
  for (const doc of snap.docs) {
    if (excludeHoldId && doc.id === excludeHoldId) continue;
    const h = doc.data();
    if (h.status !== 'active') continue;
    if (new Date(h.end_time).getTime() > startMs) return true;
  }
  return false;
}

export async function hasOverlappingBooking(
  store: Store, providerId: string, startIso: string, endIso: string, excludeBookingId?: string,
): Promise<boolean> {
  const snap = await store.get(
    db.collection('bookings')
      .where('provider_identity_id', '==', providerId)
      .where('start_time', '<', endIso)
      .orderBy('start_time', 'desc')
      .limit(200),
  );
  const startMs = new Date(startIso).getTime();
  for (const doc of snap.docs) {
    if (excludeBookingId && doc.id === excludeBookingId) continue;
    const b = doc.data();
    if (!ACTIVE_BOOKING_STATES.includes(b.booking_status)) continue;
    if (new Date(b.end_time).getTime() > startMs) return true;
  }
  return false;
}

// ── Availability rule evaluation (§27, §32) ──────────────────
// Booking requests availability from Calendar. Calendar evaluates
// AvailabilityRule (working_hours + unavailable/blocked + exceptions) and
// returns eligible/ineligible. No working_hours rules → no restriction.
export async function evaluateAvailabilityRule(
  ownerId: string,
  ownerType: string,
  operatingContext: string,
  startIso: string,
  endIso: string,
): Promise<{ eligible: boolean; reason?: string }> {
  const snap = await db.collection('availabilityRules')
    .where('owner_id', '==', ownerId)
    .where('owner_type', '==', ownerType)
    .where('lifecycle_state', '==', 'active')
    .get();
  const rules = snap.docs.map((d: any) => d.data());
  const workingHours = rules.filter((r: any) => r.rule_type === 'working_hours' && (r.operating_context === operatingContext || !r.operating_context));
  const blocked = rules.filter((r: any) => r.rule_type === 'unavailable' || r.rule_type === 'blocked');

  if (workingHours.length > 0) {
    const tz = workingHours[0].timezone || 'UTC';
    const { dayOfWeek, hhmm } = getZonedParts(startIso, tz);
    const { hhmm: endHhmm } = getZonedParts(endIso, tz);
    const matching = workingHours.find((r: any) => r.day_of_week === dayOfWeek && r.start_time <= hhmm && r.end_time >= endHhmm);
    if (!matching) return { eligible: false, reason: 'Outside working hours' };
  }

  for (const r of blocked) {
    const tz = r.timezone || 'UTC';
    const { dayOfWeek, hhmm, dateStr } = getZonedParts(startIso, tz);
    if (r.specific_date && r.specific_date === dateStr) return { eligible: false, reason: 'Blocked (unavailable)' };
    if (!r.specific_date && r.day_of_week === dayOfWeek && r.start_time <= hhmm && r.end_time >= hhmm) return { eligible: false, reason: 'Blocked (unavailable)' };
  }
  return { eligible: true };
}

// ── Public availability status (§31, §75, §76) ─────────────
// Privacy-safe derived availability for Profile/Directory consumption.
// Calendar owns this state; Profile/Directory consume it for presentation.
// Never exposes private event content (meeting_url, attendees).
export async function getPublicAvailabilityStatus(identityId: string): Promise<{ state: string; nextAvailable?: string | null }> {
  const snap = await db.collection('availabilityRules')
    .where('owner_id', '==', identityId)
    .where('owner_type', '==', 'identity')
    .where('lifecycle_state', '==', 'active')
    .get();
  const rules = snap.docs.map((d: any) => d.data());
  const workingHours = rules.filter((r: any) => r.rule_type === 'working_hours' && (r.operating_context === 'professional' || !r.operating_context));
  if (workingHours.length === 0) return { state: 'available', nextAvailable: null };
  const tz = workingHours[0].timezone || 'UTC';
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const day = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dow = day.getDay();
    const matching = workingHours.find((r: any) => r.day_of_week === dow);
    if (matching) {
      const dp: Record<string, string> = {};
      for (const p of new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(day)) dp[p.type] = p.value;
      const nextAvailable = `${dp.year}-${dp.month}-${dp.day}T${matching.start_time}:00`;
      const { hhmm } = getZonedParts(now.toISOString(), tz);
      if (i === 0 && hhmm >= matching.start_time && hhmm < matching.end_time) {
        return { state: 'available', nextAvailable: null };
      }
      return { state: i === 0 ? 'available' : 'next_available', nextAvailable };
    }
  }
  return { state: 'none', nextAvailable: null };
}