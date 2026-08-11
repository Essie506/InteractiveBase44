import { base44 } from '@/api/base44Client';
import { locationRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';

// Location System — M3: routes to Firebase when configured.
// Private fields (latitude, longitude, address_line1, postal_code)
// are protected by the public/private projection split:
//   locations/{id} — owner-only read (all fields)
//   locationsPublic/{id} — authenticated read (public fields only)

// Get the public-facing label for a location (respects precision level)
export function getPublicLocationLabel(location) {
  if (!location) return '';
  if (location.is_online_only) return 'Online';
  switch (location.precision_level) {
    case 'exact': return location.public_label || location.label || formatCity(location);
    case 'approximate': return location.public_label || formatCity(location);
    case 'city_only': return formatCity(location) || location.public_label || location.label;
    case 'region_only': return location.region || location.public_label || location.label;
    case 'online_only': return 'Online';
    default: return location.public_label || formatCity(location) || location.label;
  }
}

function formatCity(location) {
  const parts = [location.city, location.country].filter(Boolean);
  return parts.join(', ');
}

export function hasCoordinates(location) {
  return location && location.latitude != null && location.longitude != null;
}

export function requestDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}

// Create or update a location record
export async function saveLocation(ownerId, ownerType, context, data) {
  const payload = {
    owner_id: ownerId,
    owner_type: ownerType,
    location_context: context,
    label: data.label || data.city || '',
    address_line1: data.address_line1 || '',
    address_line2: data.address_line2 || '',
    city: data.city || '',
    region: data.region || '',
    postal_code: data.postal_code || '',
    country: data.country || '',
    latitude: data.latitude,
    longitude: data.longitude,
    public_label: data.public_label || '',
    precision_level: data.precision_level || 'city_only',
    is_online_only: data.is_online_only || false,
    is_hybrid: data.is_hybrid || false,
    source: data.source || 'manual',
    visibility: data.visibility || 'public',
    lifecycle_state: 'active',
  };

  if (useFirebase) {
    // Check for existing location
    const existing = await locationRepository.listLocationsForOwner(ownerId);
    const match = existing.find(l => l.location_context === context && l.lifecycle_state === 'active');
    if (match) {
      return locationRepository.updateLocation(match.id, payload);
    }
    return locationRepository.createLocation(payload);
  }

  const existing = await base44.entities.Location.filter({
    owner_id: ownerId,
    owner_type: ownerType,
    location_context: context,
    lifecycle_state: 'active',
  });
  if (existing.length > 0) {
    return base44.entities.Location.update(existing[0].id, payload);
  }
  return base44.entities.Location.create(payload);
}

export async function getLocation(locationId) {
  if (!locationId) return null;
  try {
    if (useFirebase) return locationRepository.getLocation(locationId);
    return await base44.entities.Location.get(locationId);
  } catch {
    return null;
  }
}