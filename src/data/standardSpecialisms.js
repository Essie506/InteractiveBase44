/**
 * Standard specialism options — used by Professional profiles only.
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
 * A Specialism is conceptually distinct from a Service:
 *   Service    = what you offer (e.g. Personal Training, Online Coaching)
 *   Specialism = your area of expertise (e.g. Beginners, Strength, Rehabilitation)
 *
 * The same professional can therefore have:
 *   Services:    [Personal Training, Online Coaching]
 *   Specialisms: [Beginners, Strength]
 *
 * NOTE: "Rehabilitation" appears in both Services and Specialisms.
 * This is intentional — as a Service it means "I offer rehabilitation
 * sessions", as a Specialism it means "I specialise in rehabilitation".
 * They are stored in separate arrays so id collisions do not occur.
 */
export const STANDARD_SPECIALISMS = [
  { id: 'beginners', label: 'Beginners' },
  { id: 'doctor-referrals', label: 'Doctor Referrals' },
  { id: 'fat-loss', label: 'Fat Loss' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'rehabilitation', label: 'Rehabilitation' },
  { id: 'strength', label: 'Strength' },
  { id: 'youth-nutrition-11-plus', label: 'Youth Nutrition (11+)' },
];