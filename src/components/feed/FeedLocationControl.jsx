// FeedLocationControl — public discovery location selector (Issue 8).
// Lets a public visitor set or change the location used for discovery
// without entering account Settings. Uses Interactive's shared location
// architecture (device location + manual entry) — not a Feed-only
// implementation. The selected location persists across visits (Issue 9)
// via localStorage and is treated as a discovery signal, not an absolute
// content filter.
import { useState, useEffect, useRef } from 'react';
import { MapPin, X, Navigation, Loader2, Globe } from 'lucide-react';
import { getDiscoveryLocation, setDiscoveryLocation } from '@/lib/discoveryLocation';
import { requestDeviceLocation } from '@/lib/location';

export default function FeedLocationControl({ onLocationChange }) {
  const [location, setLocation] = useState(null);
  const [editing, setEditing] = useState(false);
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [gettingDevice, setGettingDevice] = useState(false);
  const [deviceError, setDeviceError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const saved = getDiscoveryLocation();
    if (saved) {
      setLocation(saved);
      onLocationChange?.(saved);
    }
  }, [onLocationChange]);

  const handleSave = () => {
    const label = [city, country].filter(Boolean).join(', ');
    const loc = label ? { label, city, country } : null;
    setLocation(loc);
    setDiscoveryLocation(loc);
    onLocationChange?.(loc);
    setEditing(false);
  };

  const handleClear = () => {
    setLocation(null);
    setDiscoveryLocation(null);
    setCity('');
    setCountry('');
    onLocationChange?.(null);
    setEditing(false);
  };

  const handleDeviceLocation = async () => {
    setDeviceError('');
    setGettingDevice(true);
    try {
      const result = await requestDeviceLocation();
      // Reverse-geocode using the browser's geocoder (free, no API key needed)
      // Falls back to coordinates-only if reverse geocoding is unavailable.
      let label = `${result.latitude.toFixed(2)}, ${result.longitude.toFixed(2)}`;
      let resolvedCity = '';
      let resolvedCountry = '';
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${result.latitude}&lon=${result.longitude}&zoom=10`,
          { headers: { 'Accept-Language': 'en' } },
        );
        const data = await response.json();
        resolvedCity = data.address?.city || data.address?.town || data.address?.village || '';
        resolvedCountry = data.address?.country || '';
        if (resolvedCity || resolvedCountry) {
          label = [resolvedCity, resolvedCountry].filter(Boolean).join(', ');
        }
      } catch {
        // Reverse geocoding failed — use coordinates as label.
      }
      const loc = {
        label,
        city: resolvedCity,
        country: resolvedCountry,
        latitude: result.latitude,
        longitude: result.longitude,
      };
      setLocation(loc);
      setDiscoveryLocation(loc);
      onLocationChange?.(loc);
      setEditing(false);
    } catch (err) {
      setDeviceError(err.message || 'Could not get device location');
    } finally {
      setGettingDevice(false);
    }
  };

  if (!editing && location) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-full text-sm">
        <MapPin className="w-3.5 h-3.5 text-indigo-600" />
        <span className="text-stone-700">{location.label}</span>
        <button
          onClick={handleClear}
          className="ml-1 p-0.5 hover:bg-stone-100 rounded-full"
          title="Clear location"
        >
          <X className="w-3 h-3 text-stone-400" />
        </button>
      </div>
    );
  }

  if (!editing && !location) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-full text-sm text-stone-600 hover:bg-stone-50"
      >
        <Globe className="w-3.5 h-3.5" />
        <span>Set location for local discovery</span>
      </button>
    );
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-stone-700 flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-indigo-600" /> Discovery location
        </span>
        <button onClick={() => setEditing(false)} className="p-1 hover:bg-stone-100 rounded-lg">
          <X className="w-3.5 h-3.5 text-stone-400" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          ref={inputRef}
          type="text"
          value={city}
          onChange={e => setCity(e.target.value)}
          placeholder="City"
          className="px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
        />
        <input
          type="text"
          value={country}
          onChange={e => setCountry(e.target.value)}
          placeholder="Country"
          className="px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleDeviceLocation}
          disabled={gettingDevice}
          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium hover:text-indigo-700 disabled:opacity-50"
        >
          {gettingDevice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
          Use my current location
        </button>
        {deviceError && <span className="text-xs text-red-500">{deviceError}</span>}
      </div>
      <p className="text-xs text-stone-400">
        Location is used as a discovery signal, not an absolute filter. Your precise location stays private.
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!city.trim() && !country.trim()}
          className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          Save
        </button>
        {location && (
          <button
            onClick={handleClear}
            className="px-3 py-2 bg-stone-100 text-stone-600 rounded-lg text-sm font-medium hover:bg-stone-200"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}