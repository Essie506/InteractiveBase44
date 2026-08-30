// Shared projection builder for public Calendar Events.
// ───────────────────────────────────────────────────────────
// Used by saveCalendarEvent and the backfill to guarantee identical
// public-field selection. Contains ONLY public-safe fields required
// for Directory discovery and the /e/:eventId public page.
//
// PRIVACY:
//   - meeting_url is NEVER projected. A public Event page says "Online Event";
//     the joining URL is revealed only through the booking/attendance flow.
//   - location_geo is derived via the existing privacy-first geo rules
//     (deriveProfessionalPublicGeo / deriveBusinessPublicGeo).
//   - Attendee identities and private Booking records are never included.
//   - availability is a DERIVED value (capacity minus reserved count), not
//     an independently editable field.

import { computeAvailability, normalisePricing } from './eventProjectionEligibility';

export interface EventHostInfo {
  type: 'professional' | 'business';
  id: string;            // identity_id (professional) or business_id (business)
  display_name: string | null;
  screen_name: string | null;   // professional only
  business_id: string | null;   // business only
  avatar_url: string | null;
  verification_state: string;
}

export function buildEventPublicProjection(
  eventId: string,
  data: any,
  host: EventHostInfo | null,
  locationGeo: { latitude: number; longitude: number } | null,
  locationLabel: string | null,
  reservedCount: number,
): Record<string, any> {
  const pricing = normalisePricing(data.price_pence, data.is_free);
  const availability = computeAvailability(data.capacity, reservedCount);

  return {
    event_id: eventId,
    title: data.title || null,
    description: data.description || null,
    start_time: data.start_time || null,
    end_time: data.end_time || null,
    timezone: data.timezone || 'UTC',
    all_day: data.all_day || false,
    // Location — public-safe
    location_type: data.location_type || 'physical',
    location_label: locationLabel || null,
    location_geo: locationGeo || null,
    // meeting_url is intentionally NOT projected — privacy by default
    // Activity / Services — shared ServiceDefinition taxonomy
    services: Array.isArray(data.services) ? data.services : [],
    // Cover media
    cover_media_id: data.cover_media_id || null,
    cover_url: data.cover_url || null,
    // Pricing
    price_pence: pricing.price_pence,
    currency: data.currency || 'GBP',
    is_free: pricing.is_free,
    // Capacity — derived availability (never expose attendee identities)
    capacity: data.capacity || null,
    spaces_remaining: availability ? availability.spaces_remaining : null,
    availability_state: availability ? availability.availability_state : null,
    // Host — resolved from public profile projection
    host: host ? {
      type: host.type,
      id: host.id,
      display_name: host.display_name,
      screen_name: host.screen_name,
      business_id: host.business_id,
      avatar_url: host.avatar_url,
      verification_state: host.verification_state,
    } : null,
    // Lifecycle / visibility for filtering
    visibility: data.visibility || 'private',
    lifecycle_state: data.lifecycle_state || 'scheduled',
    owner_type: data.owner_type || 'identity',
    owner_id: data.owner_id || null,
    business_id: data.business_id || null,
    _updated_date: new Date().toISOString(),
  };
}