/**
 * Development-only demo listings for Directory UI testing.
 * ───────────────────────────────────────────────────────────
 *
 * ⚠️  DEV ONLY — never imported by production discoveryService.
 *
 * This module provides local seed data that exercises every
 * Directory filter dimension and card rendering state. It is
 * gated by `import.meta.env.DEV` + a `?demo=1` URL param in
 * Directory.jsx, so it can never activate in production builds.
 *
 * The data shape matches the public projection documents
 * (professionalProfilesPublic / businessProfilesPublic) so the
 * existing filterResults logic and result cards work unchanged.
 *
 * Coverage:
 *   Professionals: 6 records across all Professional Types,
 *     Specialisms, Session Types, Services, verification states,
 *     locations (some with coordinates, some without), and
 *     cover/avatar images (some with, some without to test
 *     the gradient fallback).
 *
 *   Businesses: 5 records across multiple Business Types,
 *     Services, Facilities, Equipment, verification states,
 *     locations, and cover/logo images.
 *
 * To use: open /directory?demo=1 in dev mode.
 */

// ── Helpers ────────────────────────────────────────────────
function img(seed, w, h) {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}
function cover(seed) { return img(seed, 800, 600); }
function avatar(seed) { return img(seed, 400, 400); }
function svc(id) { return { id, label: SERVICE_LABELS[id] || id }; }
function fac(id) { return { id, label: FACILITY_LABELS[id] || id }; }
function equip(id) { return { id, label: EQUIP_LABELS[id] || id }; }
function spec(id) { return { id, label: SPEC_LABELS[id] || id }; }
function session(id) { return { id, label: SESSION_LABELS[id] || id }; }
function proType(id) { return { id, label: PRO_TYPE_LABELS[id] || id }; }

// ── Label lookups (from standard taxonomy files) ──────────
const SERVICE_LABELS = {
  'personal-training': 'Personal Training',
  'group-fitness': 'Group Fitness Classes',
  'yoga': 'Yoga Instruction',
  'pilates': 'Pilates',
  'strength-conditioning': 'Strength & Conditioning',
  'nutrition-coaching': 'Nutrition Coaching',
  'sports-massage': 'Sports Massage',
  'physiotherapy': 'Physiotherapy',
  'boxing': 'Boxing',
  'crossfit': 'CrossFit',
  'rehabilitation': 'Rehabilitation',
  'meditation': 'Meditation',
  'spin-classes': 'Spin Classes',
  'dance-classes': 'Dance Classes',
  'meal-planning': 'Meal Planning',
  'martial-arts': 'Martial Arts',
};
const FACILITY_LABELS = {
  'gym-floor': 'Gym Floor',
  'free-weights-area': 'Free Weights Area',
  'cardio-zone': 'Cardio Zone',
  'functional-training-zone': 'Functional Training Zone',
  'group-exercise-studio': 'Group Exercise Studio',
  'yoga-studio': 'Yoga Studio',
  'pilates-studio': 'Pilates Studio',
  'spin-studio': 'Spin Studio',
  'swimming-pool': 'Swimming Pool',
  'sauna': 'Sauna',
  'showers': 'Showers',
  'parking': 'Parking',
  'disabled-access': 'Disabled Access',
  'changing-rooms': 'Changing Rooms',
  'treatment-rooms': 'Treatment Rooms',
  'consultation-room': 'Consultation Room',
  'boxing-ring': 'Boxing Ring',
  'martial-arts-dojo': 'Martial Arts Dojo',
  'personal-training-studio': 'Personal Training Studio',
  '24-7-access': '24/7 Access',
};
const EQUIP_LABELS = {
  'squat-rack': 'Squat Rack',
  'bench-press': 'Bench Press',
  'cable-machine': 'Cable Machine',
  'leg-press': 'Leg Press',
  'smith-machine': 'Smith Machine',
  'treadmill': 'Treadmill',
  'bike': 'Bike',
  'cross-trainer': 'Cross Trainer',
  'stair-climber': 'Stair Climber',
  'battle-ropes': 'Battle Ropes',
  'functional-rig': 'Functional Rig',
  'prowler-sled': 'Prowler Sled',
  'air-bike': 'Air Bike',
  'trx-stations': 'TRX Stations',
  'rower': 'Rower',
  'boxing-ring': 'Boxing Ring',
  'punch-bags': 'Punch Bags',
  'foam-rollers': 'Foam Rollers',
  'massage-tools': 'Massage Tools',
  'mat-area': 'Mat Area',
  'stretch-zone': 'Stretch Zone',
};
const SPEC_LABELS = {
  'beginners': 'Beginners',
  'strength': 'Strength',
  'fat-loss': 'Fat Loss',
  'mobility': 'Mobility',
  'rehabilitation': 'Rehabilitation',
  'doctor-referrals': 'Doctor Referrals',
  'youth-nutrition-11-plus': 'Youth Nutrition (11+)',
};
const SESSION_LABELS = {
  '1-to-1': '1-to-1',
  'group': 'Group',
  'online': 'Online',
  'outdoor': 'Outdoor',
};
const PRO_TYPE_LABELS = {
  'personal-trainer': 'Personal Trainer',
  'yoga-instructor': 'Yoga Instructor',
  'physiotherapist': 'Physiotherapist',
  'pilates': 'Pilates',
  'nutrition-coach': 'Nutrition Coach',
  'class-instructor': 'Class Instructor',
};

// ── Demo Professionals (6) ──────────────────────────────────
export const DEV_DEMO_PROFESSIONALS = [
  {
    identity_id: 'demo-pro-1',
    profile_id: 'demo-pro-1',
    display_name: 'James Carter',
    screen_name: 'jamescarter_pt',
    avatar_url: avatar('james-avatar'),
    cover_url: cover('james-cover'),
    headline: 'Helping you build strength that lasts',
    bio: 'Certified personal trainer with 8 years of experience in strength and conditioning.',
    professional_type: proType('personal-trainer'),
    specialisms: [spec('strength'), spec('fat-loss')],
    session_types: [session('1-to-1'), session('outdoor')],
    services: [svc('personal-training'), svc('strength-conditioning')],
    service_area: 'Central London',
    location: 'London, UK',
    location_geo: { latitude: 51.5074, longitude: -0.1278 },
    verification_state: 'verified',
    visibility: 'public',
    lifecycle_state: 'active',
    _updated_date: new Date('2026-08-20').toISOString(),
  },
  {
    identity_id: 'demo-pro-2',
    profile_id: 'demo-pro-2',
    display_name: 'Sarah Mitchell',
    screen_name: 'sarah_yoga',
    avatar_url: avatar('sarah-avatar'),
    cover_url: cover('sarah-cover'),
    headline: 'Yoga for every body and every mind',
    bio: 'Vinyasa and Hatha yoga instructor specialising in beginners and mobility.',
    professional_type: proType('yoga-instructor'),
    specialisms: [spec('beginners'), spec('mobility')],
    session_types: [session('group'), session('online')],
    services: [svc('yoga'), svc('meditation')],
    service_area: 'Manchester',
    location: 'Manchester, UK',
    location_geo: { latitude: 53.4808, longitude: -2.2426 },
    verification_state: 'verified',
    visibility: 'public',
    lifecycle_state: 'active',
    _updated_date: new Date('2026-08-18').toISOString(),
  },
  {
    identity_id: 'demo-pro-3',
    profile_id: 'demo-pro-3',
    display_name: 'Dr. Michael Chen',
    screen_name: 'drchen_physio',
    avatar_url: avatar('chen-avatar'),
    cover_url: cover('chen-cover'),
    headline: 'Evidence-based physiotherapy and rehabilitation',
    bio: 'HCPC-registered physiotherapist treating sports injuries and chronic pain.',
    professional_type: proType('physiotherapist'),
    specialisms: [spec('rehabilitation'), spec('doctor-referrals')],
    session_types: [session('1-to-1')],
    services: [svc('physiotherapy'), svc('rehabilitation')],
    service_area: 'Birmingham',
    location: 'Birmingham, UK',
    location_geo: { latitude: 52.4862, longitude: -1.8904 },
    verification_state: 'pending_review',
    visibility: 'public',
    lifecycle_state: 'active',
    _updated_date: new Date('2026-08-15').toISOString(),
  },
  {
    identity_id: 'demo-pro-4',
    profile_id: 'demo-pro-4',
    display_name: 'Emma Thompson',
    screen_name: 'emma_pilates',
    avatar_url: avatar('emma-avatar'),
    // No cover_url — tests gradient fallback with first letter
    headline: 'Clinical Pilates for recovery and performance',
    bio: 'APPI-certified Pilates instructor working with post-rehab clients.',
    professional_type: proType('pilates'),
    specialisms: [spec('mobility'), spec('beginners'), spec('rehabilitation')],
    session_types: [session('group'), session('1-to-1')],
    services: [svc('pilates'), svc('rehabilitation')],
    service_area: 'Leeds',
    location: 'Leeds, UK',
    // No location_geo — tests distance filter exclusion
    verification_state: 'not_verified',
    visibility: 'public',
    lifecycle_state: 'active',
    _updated_date: new Date('2026-08-10').toISOString(),
  },
  {
    identity_id: 'demo-pro-5',
    profile_id: 'demo-pro-5',
    display_name: 'Lisa Anderson',
    screen_name: 'lisa_nutrition',
    avatar_url: avatar('lisa-avatar'),
    cover_url: cover('lisa-cover'),
    headline: 'Sustainable nutrition for real life',
    bio: 'Registered nutrition coach helping busy professionals eat well.',
    professional_type: proType('nutrition-coach'),
    specialisms: [spec('fat-loss'), spec('youth-nutrition-11-plus')],
    session_types: [session('online'), session('1-to-1')],
    services: [svc('nutrition-coaching'), svc('meal-planning')],
    service_area: 'North London',
    location: 'London, UK',
    location_geo: { latitude: 51.5287, longitude: -0.0816 },
    verification_state: 'verified',
    visibility: 'public',
    lifecycle_state: 'active',
    _updated_date: new Date('2026-08-22').toISOString(),
  },
  {
    identity_id: 'demo-pro-6',
    profile_id: 'demo-pro-6',
    display_name: 'Tom Bradley',
    screen_name: 'tom_classes',
    // No avatar_url or cover_url — tests full gradient fallback
    headline: 'High-energy group fitness and spin',
    bio: 'Les Mills-certified group fitness instructor teaching spin and HIIT.',
    professional_type: proType('class-instructor'),
    specialisms: [spec('fat-loss'), spec('beginners')],
    session_types: [session('group')],
    services: [svc('group-fitness'), svc('spin-classes')],
    service_area: 'Bristol',
    location: 'Bristol, UK',
    location_geo: { latitude: 51.4545, longitude: -2.5879 },
    verification_state: 'not_verified',
    visibility: 'public',
    lifecycle_state: 'active',
    _updated_date: new Date('2026-08-05').toISOString(),
  },
];

// ── Demo Businesses (5) ────────────────────────────────────
export const DEV_DEMO_BUSINESSES = [
  {
    business_id: 'demo-biz-1',
    profile_id: 'demo-biz-1',
    name: 'Iron Works Gym',
    description: 'Premium strength training facility in the heart of London.',
    logo_url: avatar('ironworks-logo'),
    cover_url: cover('ironworks-cover'),
    location: 'London, UK',
    location_geo: { latitude: 51.5074, longitude: -0.1278 },
    category: 'Gym',
    business_type: 'gym',
    services: [svc('personal-training'), svc('group-fitness'), svc('strength-conditioning')],
    facilities: [
      fac('gym-floor'), fac('free-weights-area'), fac('cardio-zone'),
      fac('showers'), fac('parking'), fac('24-7-access'),
    ],
    equipment: [
      equip('squat-rack'), equip('bench-press'), equip('cable-machine'),
      equip('leg-press'), equip('smith-machine'), equip('treadmill'),
    ],
    professionals: [],
    verification_state: 'verified',
    visibility: 'public',
    lifecycle_state: 'active',
    _updated_date: new Date('2026-08-20').toISOString(),
  },
  {
    business_id: 'demo-biz-2',
    profile_id: 'demo-biz-2',
    name: 'Zenith Yoga Studio',
    description: 'A calm space for yoga, Pilates, and mindfulness in Manchester.',
    logo_url: avatar('zenith-logo'),
    cover_url: cover('zenith-cover'),
    location: 'Manchester, UK',
    location_geo: { latitude: 53.4808, longitude: -2.2426 },
    category: 'Studio',
    business_type: 'studio',
    services: [svc('yoga'), svc('pilates'), svc('meditation'), svc('dance-classes')],
    facilities: [
      fac('yoga-studio'), fac('pilates-studio'), fac('changing-rooms'),
      fac('disabled-access'),
    ],
    equipment: [equip('mat-area'), equip('trx-stations'), equip('stretch-zone')],
    professionals: [],
    verification_state: 'verified',
    visibility: 'public',
    lifecycle_state: 'active',
    _updated_date: new Date('2026-08-18').toISOString(),
  },
  {
    business_id: 'demo-biz-3',
    profile_id: 'demo-biz-3',
    name: 'Peak Performance Clinic',
    description: 'Multi-disciplinary sports therapy and physiotherapy clinic.',
    logo_url: avatar('peak-logo'),
    cover_url: cover('peak-cover'),
    location: 'Birmingham, UK',
    location_geo: { latitude: 52.4862, longitude: -1.8904 },
    category: 'Clinic',
    business_type: 'clinic',
    services: [svc('physiotherapy'), svc('sports-massage'), svc('rehabilitation')],
    facilities: [
      fac('treatment-rooms'), fac('consultation-room'), fac('disabled-access'),
      fac('parking'),
    ],
    equipment: [equip('massage-tools'), equip('foam-rollers')],
    professionals: [],
    verification_state: 'pending_review',
    visibility: 'public',
    lifecycle_state: 'active',
    _updated_date: new Date('2026-08-15').toISOString(),
  },
  {
    business_id: 'demo-biz-4',
    profile_id: 'demo-biz-4',
    name: 'Eastside Boxing Club',
    description: 'Community boxing and martial arts gym for all levels.',
    // No logo_url — tests gradient fallback with first letter
    cover_url: cover('boxing-cover'),
    location: 'East London, UK',
    location_geo: { latitude: 51.5099, longitude: -0.0057 },
    category: 'Club',
    business_type: 'club',
    services: [svc('boxing'), svc('martial-arts'), svc('group-fitness')],
    facilities: [
      fac('boxing-ring'), fac('martial-arts-dojo'), fac('showers'),
      fac('changing-rooms'),
    ],
    equipment: [equip('boxing-ring'), equip('punch-bags')],
    professionals: [],
    verification_state: 'not_verified',
    visibility: 'public',
    lifecycle_state: 'active',
    _updated_date: new Date('2026-08-08').toISOString(),
  },
  {
    business_id: 'demo-biz-5',
    profile_id: 'demo-biz-5',
    name: 'CrossFit North',
    description: 'Functional fitness and CrossFit training in Leeds.',
    logo_url: avatar('crossfit-logo'),
    // No cover_url — tests logo-only fallback
    location: 'Leeds, UK',
    // No location_geo — tests distance filter exclusion
    category: 'Gym',
    business_type: 'gym',
    services: [svc('crossfit'), svc('strength-conditioning'), svc('personal-training')],
    facilities: [
      fac('functional-training-zone'), fac('gym-floor'), fac('showers'),
    ],
    equipment: [
      equip('battle-ropes'), equip('functional-rig'), equip('prowler-sled'),
      equip('air-bike'), equip('rower'),
    ],
    professionals: [],
    verification_state: 'verified',
    visibility: 'public',
    lifecycle_state: 'active',
    _updated_date: new Date('2026-08-12').toISOString(),
  },
];