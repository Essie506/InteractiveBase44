// Public discovery location persistence (Issue 8/9).
// Stores a guest visitor's selected discovery location in localStorage
// so it persists across Feed visits without requiring an account.
// When the visitor later signs in, the location is reconciled with
// their account preferences via the normal profile/settings flow.

const STORAGE_KEY = 'interactive:discoveryLocation';

/**
 * @typedef {Object} DiscoveryLocation
 * @property {string} [label] — Display label (e.g. "London, UK")
 * @property {string} [city]
 * @property {string} [region]
 * @property {string} [country]
 * @property {number} [latitude]
 * @property {number} [longitude]
 * @property {string} [placeId] — Google Place ID if available
 */

/**
 * Load the persisted public discovery location.
 * @returns {DiscoveryLocation | null}
 */
export function getDiscoveryLocation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Persist a public discovery location.
 * @param {DiscoveryLocation | null} loc
 */
export function setDiscoveryLocation(loc) {
  try {
    if (loc) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable (private mode) — silently ignore.
  }
}

/**
 * Clear the persisted discovery location.
 */
export function clearDiscoveryLocation() {
  setDiscoveryLocation(null);
}