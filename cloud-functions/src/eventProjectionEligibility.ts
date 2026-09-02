// Pure eligibility checks for public Calendar Event projections.
// ───────────────────────────────────────────────────────────
// Extracted so they can be unit-tested without Firebase. Used by
// saveCalendarEvent and the backfill.
//
// A calendar event is publicly listable in the Directory when ALL hold:
//   - visibility === 'public'                    (not connections/private/staff)
//   - lifecycle_state in [scheduled, confirmed, tentative]  (not cancelled/completed)
//   - start_time is in the future (upcoming/current — no past events)
//   - owner_type in [identity (professional context), business]
//     Professional is an OPERATING CONTEXT, not an owner type. A professional
//     public event is owner_type='identity' AND operating_context='professional'.
//     Personal-context identity events are never public.
//   - source_system !== 'messaging'              (no system/message artifacts)
//   - host profile is publicly listable          (professional or business)
//
// Past events are excluded from default Directory discovery. Historic
// event discovery is a separate archive experience (not implemented here).

const LISTABLE_LIFECYCLE = ['scheduled', 'confirmed', 'tentative'];

/**
 * Core event-level eligibility — does not check host profile eligibility
 * (that requires a DB read). Use isEventListable for the full check.
 *
 * nowMs: optional injected timestamp for deterministic testing.
 */
export function isEventEligible(
  data: {
    visibility?: string;
    lifecycle_state?: string;
    owner_type?: string;
    operating_context?: string;
    source_system?: string;
    start_time?: string;
  } | null | undefined,
  nowMs?: number,
): boolean {
  if (!data) return false;
  if (data.visibility !== 'public') return false;
  if (!LISTABLE_LIFECYCLE.includes(data.lifecycle_state || '')) return false;
  // Public listability: business-owned OR identity-owned in professional context.
  // Personal-context identity events are never public.
  if (data.owner_type === 'business') {
    // business public event
  } else if (data.owner_type === 'identity' && data.operating_context === 'professional') {
    // professional public event (identity-owned, professional operating context)
  } else {
    return false;
  }
  if (data.source_system === 'messaging') return false;
  // Upcoming/current only — exclude past events
  const now = nowMs ?? Date.now();
  const start = data.start_time ? new Date(data.start_time).getTime() : NaN;
  if (isNaN(start)) return false;
  if (start < now) return false;
  return true;
}

/**
 * Derive the public host presentation type from the authoritative ownership
 * + operating context. Consumers (Directory, public pages) use this rather
 * than assuming 'professional' is an owner_type.
 *
 *   business  → 'business'
 *   identity + operating_context 'professional' → 'professional'
 *   identity + personal context → null (not publicly listable)
 */
export function deriveHostType(
  ownerType?: string,
  operatingContext?: string,
): 'professional' | 'business' | null {
  if (ownerType === 'business') return 'business';
  if (ownerType === 'identity' && operatingContext === 'professional') return 'professional';
  return null;
}

/**
 * Full listability including host profile eligibility. The hostData
 * argument is the public projection of the host professional or business
 * profile (or null if no public host profile exists).
 */
export function isEventListable(
  data: any,
  hostData: { visibility?: string; lifecycle_state?: string; screen_name?: string | null; business_id?: string | null } | null | undefined,
  nowMs?: number,
): boolean {
  if (!isEventEligible(data, nowMs)) return false;
  if (!hostData) return false;
  if (hostData.visibility !== 'public') return false;
  if (hostData.lifecycle_state !== 'active') return false;
  // Host must have a public routing key
  const hostType = deriveHostType(data.owner_type, data.operating_context);
  if (hostType === 'professional' && !hostData.screen_name) return false;
  if (hostType === 'business' && !hostData.business_id) return false;
  return true;
}

/**
 * Compute the public-safe derived availability from capacity and a
 * count of valid (confirmed/reserved) attendees.
 *
 * Returns null when the event has no capacity (one-to-one or
 * non-capacity events). Otherwise returns:
 *   { capacity, spaces_remaining, availability_state }
 *
 * availability_state:
 *   'available'   — spaces_remaining > 0
 *   'sold_out'    — spaces_remaining === 0
 */
export function computeAvailability(
  capacity: number | null | undefined,
  reservedCount: number,
): { capacity: number; spaces_remaining: number; availability_state: 'available' | 'sold_out' } | null {
  if (capacity == null || capacity < 1) return null;
  const remaining = Math.max(0, capacity - Math.max(0, reservedCount));
  return {
    capacity,
    spaces_remaining: remaining,
    availability_state: remaining === 0 ? 'sold_out' : 'available',
  };
}

/**
 * Enforce the price/free invariant. Returns the normalised pair.
 *   is_free === (price_pence === 0)
 * A free event must not carry a fabricated paid price.
 */
export function normalisePricing(
  pricePence: number | null | undefined,
  isFree: boolean | null | undefined,
): { price_pence: number; is_free: boolean } {
  const price = Math.max(0, Math.floor(pricePence || 0));
  const free = price === 0 ? true : (isFree ?? false);
  return { price_pence: free ? 0 : price, is_free: free };
}