// Server-side geographic coordinate derivation for public projections.
// ───────────────────────────────────────────────────────────
// PRIVACY-FIRST DESIGN
//
// Geographic accuracy (precision_level) and public visibility (visibility)
// are SEPARATE concepts:
//   precision_level = how accurate the stored coordinate is
//   visibility       = whether the user consented to public exposure
//
// A precision_level of 'exact' does NOT automatically mean the user
// consented to publishing that exact coordinate in a world-readable
// public projection. A professional may store an exact home address
// for operational reasons (booking, directions) without wanting it
// published in the Directory.
//
// DERIVATION RULES
//
// Professional profiles (deriveProfessionalPublicGeo):
//   NEVER exposes an exact coordinate. A professional's exact location
//   may be a private home address. Only 'approximate' + 'public'
//   coordinates are projected. The service_area_location_id is
//   preferred over location_id (service areas are more likely to be
//   public-facing approximate points). If no safe approximation can
//   be derived, location_geo is omitted (null).
//
// Business profiles (deriveBusinessPublicGeo):
//   A business may expose precise coordinates ONLY when the location
//   represents an intentionally public business premises
//   (location_context === 'business' && visibility === 'public').
//   Otherwise, only 'approximate' + 'public' coordinates are projected.
//   This prevents a business owner's home/device location from leaking.
//
// city_only / region_only:
//   Stored coordinates are NEVER exposed — the user only consented to
//   the city/region name. location_geo is omitted until a production
//   geocoding provider can derive city/region centroids.
//
// online_only:
//   No physical location — location_geo is always null.
//
// NOTE: The pure derivation logic is mirrored in src/tests/geo-privacy.test.cjs
// for test verification. Keep both in sync.

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// ── Professional ──────────────────────────────────────────────
// Never exposes exact coordinates. Only 'approximate' + 'public'.
export function deriveProfessionalPublicGeo(locationData: any): GeoPoint | null {
  if (!locationData) return null;
  if (locationData.visibility !== 'public') return null;
  if (locationData.precision_level !== 'approximate') return null;
  const lat = locationData.latitude;
  const lng = locationData.longitude;
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
  return { latitude: lat, longitude: lng };
}

// Fetch professional public-safe coordinates. Tries the service area
// location first (more likely to be a public-facing approximate point),
// then falls back to the primary location. Returns null if neither
// yields a safe approximate coordinate.
export async function fetchProfessionalPublicGeo(
  db: any,
  serviceAreaLocationId: string | null | undefined,
  locationId: string | null | undefined,
): Promise<GeoPoint | null> {
  const tryFetch = async (id: string | null | undefined) => {
    if (!id) return null;
    try {
      const snap = await db.collection('locations').doc(id).get();
      if (!snap.exists) return null;
      return deriveProfessionalPublicGeo(snap.data());
    } catch {
      return null;
    }
  };
  // Prefer service area (public-facing), then primary location
  return (await tryFetch(serviceAreaLocationId)) || (await tryFetch(locationId));
}

// ── Business ──────────────────────────────────────────────────
// Exposes 'approximate' + 'public', OR 'exact' + 'public' when the
// location represents an intentionally public business premises
// (location_context === 'business').
export function deriveBusinessPublicGeo(locationData: any): GeoPoint | null {
  if (!locationData) return null;
  if (locationData.visibility !== 'public') return null;
  const precision = locationData.precision_level;
  const lat = locationData.latitude;
  const lng = locationData.longitude;
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;

  if (precision === 'approximate') {
    return { latitude: lat, longitude: lng };
  }
  if (precision === 'exact' && locationData.location_context === 'business') {
    // Intentionally public business premises (gym, studio, clinic)
    return { latitude: lat, longitude: lng };
  }
  // exact + non-business context, city_only, region_only, online_only → null
  return null;
}

// Fetch business public-safe coordinates.
export async function fetchBusinessPublicGeo(
  db: any,
  locationId: string | null | undefined,
): Promise<GeoPoint | null> {
  if (!locationId) return null;
  try {
    const snap = await db.collection('locations').doc(locationId).get();
    if (!snap.exists) return null;
    return deriveBusinessPublicGeo(snap.data());
  } catch {
    return null;
  }
}