// Server-side geographic coordinate derivation for public projections.
// ───────────────────────────────────────────────────────────
// Derives public-safe coordinates from the authoritative Location
// record. Only exposes coordinates when the user has explicitly
// consented via precision_level 'exact' or 'approximate'.
//
// Privacy rule:
//   precision_level 'exact'       → user consented to precise  → expose coords
//   precision_level 'approximate' → user consented to approx   → expose coords
//   precision_level 'city_only'   → city-level only            → NEVER expose
//   precision_level 'region_only' → region-level only          → NEVER expose
//   precision_level 'online_only' → no physical location       → NEVER expose
//
// city_only / region_only locations may have stored lat/lng from
// device capture, but the user did NOT consent to sharing those
// precise coordinates publicly. They must never be exposed in the
// public projection — the user only consented to the city/region name.

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// Derive public-safe coordinates from a Location record's data.
// Returns null if the location is not safe to expose.
export function derivePublicGeo(locationData: any): GeoPoint | null {
  if (!locationData) return null;
  const precision = locationData.precision_level;
  // Only expose coordinates when the user has explicitly consented
  // to exact or approximate precision.
  if (precision !== 'exact' && precision !== 'approximate') return null;
  const lat = locationData.latitude;
  const lng = locationData.longitude;
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
  return { latitude: lat, longitude: lng };
}

// Fetch a Location record by ID and derive public-safe coordinates.
// Returns null if the location doesn't exist or isn't safe to expose.
export async function fetchPublicGeo(
  db: any,
  locationId: string | null | undefined,
): Promise<GeoPoint | null> {
  if (!locationId) return null;
  try {
    const snap = await db.collection('locations').doc(locationId).get();
    if (!snap.exists) return null;
    return derivePublicGeo(snap.data());
  } catch {
    return null;
  }
}