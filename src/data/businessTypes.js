/**
 * Business type options — derived from the Business entity `type` enum
 * (gym, studio, clinic, freelancer, club, charity, other).
 *
 * The public projection (businessProfilesPublic) carries `business_type`
 * as a denormalised string, so the Directory can filter on it without
 * reading the private businesses collection.
 *
 * Each entry: { id, label }
 *   - id: matches the Business.type enum value stored on the projection
 *   - label: display text (pluralised for filter UI)
 */
export const BUSINESS_TYPES = [
  { id: 'gym', label: 'Gyms' },
  { id: 'studio', label: 'Studios' },
  { id: 'clinic', label: 'Clinics' },
  { id: 'freelancer', label: 'Freelancers' },
  { id: 'club', label: 'Clubs' },
  { id: 'charity', label: 'Charities' },
  { id: 'other', label: 'Other' },
];