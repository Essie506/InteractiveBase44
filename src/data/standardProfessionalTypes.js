/**
 * Standard professional type options — used by Professional profiles only.
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
 * A Professional Type is a single { id, label } on the profile (not an
 * array) — a professional is one type. The Directory filter is
 * multi-select; the match checks if the profile's type id is in the
 * selected list.
 *
 * Professional Type is conceptually distinct from Services:
 *   Professional Type = what kind of professional you are
 *   Service           = what you offer
 *
 * NOTE: Some labels overlap with Services (e.g. "Pilates", "Yoga
 * Instructor" vs "Pilates", "Yoga Instruction"). This is intentional —
 * the type describes the practitioner, the service describes the
 * offering. They are stored in separate fields so id collisions do not
 * occur.
 */
export const STANDARD_PROFESSIONAL_TYPES = [
  { id: 'class-instructor', label: 'Class Instructor' },
  { id: 'nutrition-coach', label: 'Nutrition Coach' },
  { id: 'personal-trainer', label: 'Personal Trainer' },
  { id: 'physiotherapist', label: 'Physiotherapist' },
  { id: 'pilates', label: 'Pilates' },
  { id: 'yoga-instructor', label: 'Yoga Instructor' },
];