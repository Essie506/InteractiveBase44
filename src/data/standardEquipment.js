/**
 * Standard equipment options — used by Business profiles only.
 *
 * Follows the same architectural pattern as standardServices and
 * standardFacilities: a simple reusable JS configuration list (NOT a
 * backend system) that encourages consistent naming so structured
 * values can support Directory and Search normalisation.
 *
 * Each entry: { id, label, category }
 *   - id: canonical slug used for search/filter matching
 *   - label: display text
 *   - category: high-level grouping for the Directory filter UI
 *
 * Selecting a standard option stores { id, label } on the business
 * profile (same shape as services/facilities). Custom entries (not in
 * this list) are stored with id = null.
 *
 * Equipment is conceptually separate from Facilities:
 *   Facilities = structural areas / amenities (gym floor, sauna, parking)
 *   Equipment   = specific training apparatus (bench press, treadmill, sled)
 *
 * NOTE: "Boxing ring" appears in both Facilities (structural area) and
 * Equipment (combat apparatus). This is intentional — a venue may list
 * the facility area separately from the equipment within it.
 */
export const STANDARD_EQUIPMENT = [
  // ── STRENGTH ──
  { id: 'belt-squat', label: 'Belt Squat', category: 'Strength' },
  { id: 'bench-press', label: 'Bench Press', category: 'Strength' },
  { id: 'cable-machine', label: 'Cable Machine', category: 'Strength' },
  { id: 'glute-ham-raise', label: 'Glute-Ham Raise', category: 'Strength' },
  { id: 'hack-squat', label: 'Hack Squat', category: 'Strength' },
  { id: 'hammer-strength', label: 'Hammer Strength', category: 'Strength' },
  { id: 'leg-press', label: 'Leg Press', category: 'Strength' },
  { id: 'lifting-platform', label: 'Lifting Platform', category: 'Strength' },
  { id: 'olympic-lifting-platform', label: 'Olympic Lifting Platform', category: 'Strength' },
  { id: 'plate-loaded-machines', label: 'Plate-Loaded Machines', category: 'Strength' },
  { id: 'powerlifting-platform', label: 'Powerlifting Platform', category: 'Strength' },
  { id: 'reverse-hyperextension', label: 'Reverse Hyperextension', category: 'Strength' },
  { id: 'smith-machine', label: 'Smith Machine', category: 'Strength' },
  { id: 'squat-rack', label: 'Squat Rack', category: 'Strength' },

  // ── FUNCTIONAL ──
  { id: 'air-bike', label: 'Air Bike', category: 'Functional' },
  { id: 'battle-ropes', label: 'Battle Ropes', category: 'Functional' },
  { id: 'functional-rig', label: 'Functional Rig', category: 'Functional' },
  { id: 'prowler-sled', label: 'Prowler Sled', category: 'Functional' },
  { id: 'resistance-bands', label: 'Resistance Bands', category: 'Functional' },
  { id: 'rower', label: 'Rower', category: 'Functional' },
  { id: 'sandbags', label: 'Sandbags', category: 'Functional' },
  { id: 'skierg', label: 'SkiErg', category: 'Functional' },
  { id: 'sled-push-pull', label: 'Sled Push/Pull', category: 'Functional' },
  { id: 'sled-track', label: 'Sled Track', category: 'Functional' },
  { id: 'trx-stations', label: 'TRX Stations', category: 'Functional' },

  // ── CARDIO ──
  { id: 'bike', label: 'Bike', category: 'Cardio' },
  { id: 'cross-trainer', label: 'Cross Trainer', category: 'Cardio' },
  { id: 'stair-climber', label: 'Stair Climber', category: 'Cardio' },
  { id: 'treadmill', label: 'Treadmill', category: 'Cardio' },

  // ── COMBAT ──
  { id: 'boxing-ring', label: 'Boxing Ring', category: 'Combat' },
  { id: 'mma-area', label: 'MMA Area', category: 'Combat' },
  { id: 'punch-bags', label: 'Punch Bags', category: 'Combat' },

  // ── RECOVERY ──
  { id: 'foam-rollers', label: 'Foam Rollers', category: 'Recovery' },
  { id: 'massage-tools', label: 'Massage Tools', category: 'Recovery' },
  { id: 'mat-area', label: 'Mat Area', category: 'Recovery' },
  { id: 'stretch-zone', label: 'Stretch Zone', category: 'Recovery' },
];