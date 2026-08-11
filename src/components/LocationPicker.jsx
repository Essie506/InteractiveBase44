import { useState, useEffect } from 'react';
import { MapPin, Navigation, Loader2 } from 'lucide-react';
import { requestDeviceLocation, saveLocation } from '@/lib/location';

// Authoritative Location picker — manual by default, device optional.
// Separates operational coordinates from public presentation.
export default function LocationPicker({
  ownerId,
  ownerType = 'identity',
  context = 'profile',
  initialLocationId,
  initialLabel,
  onLocationSaved,
}) {
  const [label, setLabel] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const [precision, setPrecision] = useState('city_only');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [hybrid, setHybrid] = useState(false);
  const [coords, setCoords] = useState(null);
  const [gettingDevice, setGettingDevice] = useState(false);
  const [deviceError, setDeviceError] = useState('');
  const [locationId, setLocationId] = useState(initialLocationId || '');

  useEffect(() => {
    if (initialLabel) setLabel(initialLabel);
  }, [initialLabel]);

  const handleDeviceLocation = async () => {
    setDeviceError('');
    setGettingDevice(true);
    try {
      const result = await requestDeviceLocation();
      setCoords({ latitude: result.latitude, longitude: result.longitude });
      setPrecision('approximate');
    } catch (err) {
      setDeviceError(err.message || 'Could not get device location');
    } finally {
      setGettingDevice(false);
    }
  };

  const handleSave = async () => {
    const data = {
      label,
      city,
      region,
      country,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
      precision_level: onlineOnly ? 'online_only' : precision,
      is_online_only: onlineOnly,
      is_hybrid: hybrid,
      source: coords ? 'device' : 'manual',
      public_label: onlineOnly ? 'Online' : (precision === 'exact' ? label : (city || label)),
    };
    const loc = await saveLocation(ownerId, ownerType, context, data);
    setLocationId(loc.id);
    onLocationSaved?.(loc.id, onlineOnly ? 'Online' : (city || label || 'Online'));
  };

  const inputClass = "w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";

  return (
    <div className="space-y-3 p-4 bg-stone-50 rounded-xl border border-stone-200">
      <div className="flex items-center gap-2 mb-1">
        <MapPin className="w-4 h-4 text-stone-500" />
        <span className="text-sm font-medium text-stone-700">Location</span>
      </div>

      {/* Online-only toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={onlineOnly}
          onChange={(e) => setOnlineOnly(e.target.checked)}
          className="w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-sm text-stone-700">Online only (no physical location)</span>
      </label>

      {!onlineOnly && (
        <>
          {/* Manual entry */}
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="City" className={inputClass} />
            <input type="text" value={country} onChange={e => setCountry(e.target.value)} placeholder="Country" className={inputClass} />
          </div>
          <input type="text" value={region} onChange={e => setRegion(e.target.value)} placeholder="Region/State (optional)" className={inputClass} />

          {/* Device location (optional, requires permission) */}
          <div>
            <button
              type="button"
              onClick={handleDeviceLocation}
              disabled={gettingDevice}
              className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium hover:text-indigo-700 disabled:opacity-50"
            >
              {gettingDevice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
              Use my current location
            </button>
            {deviceError && <p className="text-xs text-red-500 mt-1">{deviceError}</p>}
            {coords && <p className="text-xs text-emerald-600 mt-1">✓ Device location captured (coordinates kept private)</p>}
          </div>

          {/* Precision level */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Public precision</label>
            <select value={precision} onChange={e => setPrecision(e.target.value)} className={inputClass}>
              <option value="city_only">City only (recommended)</option>
              <option value="region_only">Region only</option>
              <option value="approximate">Approximate</option>
              <option value="exact">Exact (shows precise location)</option>
            </select>
            <p className="text-xs text-stone-500 mt-1">Controls how much location detail is visible publicly.</p>
          </div>

          {/* Hybrid */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hybrid}
              onChange={(e) => setHybrid(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-stone-700">Hybrid operation (online + physical)</span>
          </label>
        </>
      )}

      <button
        type="button"
        onClick={handleSave}
        className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
      >
        Save Location
      </button>
      {locationId && <span className="text-xs text-emerald-600 ml-2">✓ Location saved</span>}
    </div>
  );
}