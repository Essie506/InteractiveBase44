/**
 * Standard session type options — used by Professional profiles only.
 *
 * Follows the same architectural pattern as standardServices and
 * standardFacilities: a simple reusable JS configuration list (NOT a
 * backend system) that encourages consistent naming so structured
 * values can support Directory and Search normalisation.
 *
 * Each entry: { id, label }
 *   - id: canonical slug used for search/filter matching
 *   - label: display text
 *
 * Selecting a standard option stores { id, label } on the profile.
 * Custom entries (not in this list) are stored with id = null.
 *
 * Session Type describes how sessions are delivered — the delivery
 * format rather than the content. Conceptually distinct from Services
 * (what you offer) and Specialisms (your area of expertise).
 */
export const STANDARD_SESSION_TYPES = [
  { id: '1-to-1', label: '1-to-1' },
  { id: 'group', label: 'Group' },
  { id: 'online', label: 'Online' },
  { id: 'outdoor', label: 'Outdoor' },
];