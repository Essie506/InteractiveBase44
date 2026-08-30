/**
 * Standard facility options — used by Business profiles only.
 *
 * This is a simple reusable JS configuration list, NOT a backend system.
 * It encourages consistent facility naming so structured values can later
 * support Directory and Search normalisation.
 *
 * Each entry: { id, label }
 *   - id: canonical slug used for search/filter matching
 *   - label: display text
 *
 * Selecting a standard option stores { id, label } on the business profile.
 * Custom entries (not in this list) are stored with id = null.
 *
 * This list can be expanded over time. Adding an entry here makes it
 * immediately available as an autocomplete suggestion in the Business
 * facilities editor.
 *
 * NOTE: Facilities and Services are different domain concepts and have
 * separate standard option lists. Do not merge them.
 */
export const STANDARD_FACILITIES = [
  { id: 'gym-floor', label: 'Gym Floor' },
  { id: 'free-weights-area', label: 'Free Weights Area' },
  { id: 'cardio-zone', label: 'Cardio Zone' },
  { id: 'functional-training-zone', label: 'Functional Training Zone' },
  { id: 'group-exercise-studio', label: 'Group Exercise Studio' },
  { id: 'yoga-studio', label: 'Yoga Studio' },
  { id: 'pilates-studio', label: 'Pilates Studio' },
  { id: 'spin-studio', label: 'Spin Studio' },
  { id: 'swimming-pool', label: 'Swimming Pool' },
  { id: 'sauna', label: 'Sauna' },
  { id: 'steam-room', label: 'Steam Room' },
  { id: 'jacuzzi', label: 'Jacuzzi' },
  { id: 'treatment-rooms', label: 'Treatment Rooms' },
  { id: 'consultation-room', label: 'Consultation Room' },
  { id: 'physiotherapy-room', label: 'Physiotherapy Room' },
  { id: 'massage-room', label: 'Massage Room' },
  { id: 'changing-rooms', label: 'Changing Rooms' },
  { id: 'showers', label: 'Showers' },
  { id: 'lockers', label: 'Lockers' },
  { id: 'towel-service', label: 'Towel Service' },
  { id: 'parking', label: 'Parking' },
  { id: 'disabled-access', label: 'Disabled Access' },
  { id: 'ladies-only-area', label: 'Ladies Only Area' },
  { id: 'cafe', label: 'Cafe' },
  { id: 'juice-bar', label: 'Juice Bar' },
  { id: 'childcare', label: 'Childcare' },
  { id: '24-7-access', label: '24/7 Access' },
  { id: 'personal-training-studio', label: 'Personal Training Studio' },
  { id: 'boxing-ring', label: 'Boxing Ring' },
  { id: 'martial-arts-dojo', label: 'Martial Arts Dojo' },
  { id: 'climbing-wall', label: 'Climbing Wall' },
  { id: 'sports-hall', label: 'Sports Hall' },
  { id: 'squash-courts', label: 'Squash Courts' },
  { id: 'tennis-courts', label: 'Tennis Courts' },
  { id: 'football-pitch', label: 'Football Pitch' },
  { id: 'athletics-track', label: 'Athletics Track' },
];