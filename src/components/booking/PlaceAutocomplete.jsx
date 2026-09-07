// PlaceAutocomplete — shared Interactive location autocomplete (Issue 1).
// Uses the Google Places Autocomplete API when a Google API key is
// configured. Falls back to manual text entry when no key is available.
// This is a shared platform boundary — not Booking-only — so other
// surfaces (Profile, Events, Business) can reuse it.
//
// The selected place propagates structured data:
//   venue/display name, formatted address, lat/lng, Google Place ID
//
// Google API configuration is external — if no key is set, the component
// renders a plain text input (manual fallback) and reports nothing.
import { useState, useRef, useEffect } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';

// Google Places API key — read from a global config if available.
// This is set via index.html script tag or environment variable.
function getGoogleMapsApiKey() {
  if (typeof window !== 'undefined' && window.__GOOGLE_MAPS_API_KEY__) {
    return window.__GOOGLE_MAPS_API_KEY__;
  }
  return '';
}

let googleMapsLoaded = false;
let loadPromise = null;

function loadGoogleMapsScript(key) {
  if (googleMapsLoaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => { googleMapsLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

/**
 * @param {{
 *   value: string,
 *   onChange: (val: string) => void,
 *   onPlaceSelect: (place: {
 *     label: string,
 *     formatted_address: string,
 *     latitude: number,
 *     longitude: number,
 *     place_id: string,
 *     name: string,
 *   }) => void,
 *   placeholder?: string,
 *   className?: string,
 * }} props
 */
export default function PlaceAutocomplete({ value, onChange, onPlaceSelect, placeholder, className }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const apiKey = getGoogleMapsApiKey();

  useEffect(() => {
    if (!apiKey) {
      setLoadError(true);
      return;
    }
    loadGoogleMapsScript(apiKey)
      .then(() => setLoaded(true))
      .catch(() => setLoadError(true));
  }, [apiKey]);

  useEffect(() => {
    if (!loaded || !inputRef.current || !window.google?.maps?.places) return;
    try {
      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['geocode', 'establishment'],
        fields: ['formatted_address', 'geometry', 'place_id', 'name'],
      });
      const listener = autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        if (!place || !place.formatted_address) return;
        const result = {
          label: place.name || place.formatted_address,
          formatted_address: place.formatted_address,
          latitude: place.geometry?.location?.lat() ?? null,
          longitude: place.geometry?.location?.lng() ?? null,
          place_id: place.place_id || null,
          name: place.name || '',
        };
        onChange(result.label);
        onPlaceSelect?.(result);
      });
      return () => {
        if (window.google?.maps?.event && listener) {
          window.google.maps.event.removeListener(listener);
        }
      };
    } catch {
      setLoadError(true);
    }
  }, [loaded, onChange, onPlaceSelect]);

  const inputClass = className || "w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400";

  // No API key or load failed — render plain text input (manual fallback).
  if (!apiKey || loadError) {
    return (
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || "Venue name or address"}
          className={inputClass + " pl-9"}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
      {!loaded ? (
        <div className={inputClass + " pl-9 flex items-center gap-2"}>
          <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />
          <span className="text-stone-400 text-sm">Loading maps...</span>
        </div>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || "Start typing an address or venue..."}
          className={inputClass + " pl-9 pr-9"}
        />
      )}
      {value && loaded && (
        <button
          onClick={() => { onChange(''); onPlaceSelect?.(null); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-stone-100 rounded-full"
        >
          <X className="w-3.5 h-3.5 text-stone-400" />
        </button>
      )}
    </div>
  );
}