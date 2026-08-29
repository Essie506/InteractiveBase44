/**
 * Standard service options — shared by Professional and Business profiles.
 *
 * This is a simple reusable JS configuration list, NOT a backend system.
 * It encourages consistent service naming so structured values can later
 * support Directory and Search normalisation.
 *
 * Each entry: { id, label }
 *   - id: canonical slug used for search/filter matching
 *   - label: display text
 *
 * Selecting a standard option stores { id, label } on the profile.
 * Custom entries (not in this list) are stored with id = null.
 *
 * This list can be expanded over time. Adding an entry here makes it
 * immediately available as an autocomplete suggestion in both the
 * Professional and Business service editors.
 */
export const STANDARD_SERVICES = [
  { id: 'personal-training', label: 'Personal Training' },
  { id: 'group-fitness', label: 'Group Fitness Classes' },
  { id: 'yoga', label: 'Yoga Instruction' },
  { id: 'pilates', label: 'Pilates' },
  { id: 'strength-conditioning', label: 'Strength & Conditioning' },
  { id: 'nutrition-coaching', label: 'Nutrition Coaching' },
  { id: 'sports-massage', label: 'Sports Massage' },
  { id: 'physiotherapy', label: 'Physiotherapy' },
  { id: 'life-coaching', label: 'Life Coaching' },
  { id: 'martial-arts', label: 'Martial Arts' },
  { id: 'boxing', label: 'Boxing' },
  { id: 'crossfit', label: 'CrossFit' },
  { id: 'dance-classes', label: 'Dance Classes' },
  { id: 'spin-classes', label: 'Spin Classes' },
  { id: 'swimming-lessons', label: 'Swimming Lessons' },
  { id: 'running-coaching', label: 'Running Coaching' },
  { id: 'cycling-coaching', label: 'Cycling Coaching' },
  { id: 'weight-loss-programs', label: 'Weight Loss Programs' },
  { id: 'rehabilitation', label: 'Rehabilitation' },
  { id: 'mental-health-counselling', label: 'Mental Health Counselling' },
  { id: 'meditation', label: 'Meditation' },
  { id: 'mindfulness', label: 'Mindfulness' },
  { id: 'breathwork', label: 'Breathwork' },
  { id: 'sports-therapy', label: 'Sports Therapy' },
  { id: 'remedial-massage', label: 'Remedial Massage' },
  { id: 'acupuncture', label: 'Acupuncture' },
  { id: 'osteopathy', label: 'Osteopathy' },
  { id: 'chiropractic', label: 'Chiropractic' },
  { id: 'dietitian-services', label: 'Dietitian Services' },
  { id: 'meal-planning', label: 'Meal Planning' },
];