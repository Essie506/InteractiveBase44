// Calendar Category + Colour (§11 personal category, §22 event-category filter).
// ───────────────────────────────────────────────────────────
// Personal Events can include a personal category, and the Calendar can
// present a colour per category. Filters can filter by event category.
//
// Tailwind purges classes not found as literal substrings, so every colour
// mapping below is a LITERAL class string keyed by a palette key. The
// CalendarEvent stores `color` as a palette key (e.g. 'indigo'), not an
// arbitrary hex, so the mapped classes always survive the purge.
//
// Resolution order for the colour key:
//   1. source-unavailable → always 'amber' (privacy-safe safety state wins)
//   2. user-set event.color (palette key)
//   3. category default colour
//   4. source-based default (booking → emerald, recurring → purple, else indigo)

export const EVENT_CATEGORIES = [
  { value: '', label: 'No category' },
  { value: 'general', label: 'General' },
  { value: 'work', label: 'Work' },
  { value: 'health', label: 'Health' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'social', label: 'Social' },
  { value: 'family', label: 'Family' },
  { value: 'travel', label: 'Travel' },
  { value: 'finance', label: 'Finance' },
  { value: 'important', label: 'Important' },
  { value: 'birthday', label: 'Birthday' },
];

const CATEGORY_COLOR = {
  general: 'indigo',
  work: 'blue',
  health: 'rose',
  fitness: 'emerald',
  social: 'amber',
  family: 'orange',
  travel: 'cyan',
  finance: 'violet',
  important: 'red',
  birthday: 'pink',
  '': 'indigo',
};

export const COLOR_PALETTE = [
  'indigo', 'blue', 'emerald', 'amber', 'rose', 'violet',
  'cyan', 'orange', 'red', 'pink', 'purple', 'teal',
];

// Literal Tailwind class maps (purge-safe).
const CHIP_CLASSES = {
  indigo: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
  blue: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  emerald: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
  amber: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
  rose: 'bg-rose-100 text-rose-700 hover:bg-rose-200',
  violet: 'bg-violet-100 text-violet-700 hover:bg-violet-200',
  cyan: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200',
  orange: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
  red: 'bg-red-100 text-red-700 hover:bg-red-200',
  pink: 'bg-pink-100 text-pink-700 hover:bg-pink-200',
  purple: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
  teal: 'bg-teal-100 text-teal-700 hover:bg-teal-200',
};

const BAR_CLASSES = {
  indigo: 'bg-indigo-400',
  blue: 'bg-blue-400',
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  rose: 'bg-rose-400',
  violet: 'bg-violet-400',
  cyan: 'bg-cyan-400',
  orange: 'bg-orange-400',
  red: 'bg-red-400',
  pink: 'bg-pink-400',
  purple: 'bg-purple-400',
  teal: 'bg-teal-400',
};

const CARD_CLASSES = {
  indigo: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100',
  blue: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
  emerald: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100',
  amber: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
  rose: 'bg-rose-50 border-rose-200 hover:bg-rose-100',
  violet: 'bg-violet-50 border-violet-200 hover:bg-violet-100',
  cyan: 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100',
  orange: 'bg-orange-50 border-orange-200 hover:bg-orange-100',
  red: 'bg-red-50 border-red-200 hover:bg-red-100',
  pink: 'bg-pink-50 border-pink-200 hover:bg-pink-100',
  purple: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
  teal: 'bg-teal-50 border-teal-200 hover:bg-teal-100',
};

const DOT_CLASSES = {
  indigo: 'bg-indigo-500',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  cyan: 'bg-cyan-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  pink: 'bg-pink-500',
  purple: 'bg-purple-500',
  teal: 'bg-teal-500',
};

function isPaletteKey(k) {
  return typeof k === 'string' && COLOR_PALETTE.includes(k);
}

/**
 * Resolve the colour palette key for an event/occurrence.
 * Pass `occ` for recurring context (used for the source default).
 */
export function getEventColorKey(event, occ) {
  if (!event) return 'indigo';
  // Source-unavailable is a privacy-safe safety state — always amber.
  if (event.source_detail_redacted === true || event.lifecycle_state === 'removed') return 'amber';
  if (event.color && isPaletteKey(event.color)) return event.color;
  if (event.category && CATEGORY_COLOR[event.category]) return CATEGORY_COLOR[event.category];
  // Source-based default
  if (event.source_system === 'booking') return 'emerald';
  if (occ && occ.isRecurring) return 'purple';
  return 'indigo';
}

export function getEventChipClasses(event, occ) {
  return CHIP_CLASSES[getEventColorKey(event, occ)] || CHIP_CLASSES.indigo;
}

export function getEventBarClasses(event, occ) {
  return BAR_CLASSES[getEventColorKey(event, occ)] || BAR_CLASSES.indigo;
}

export function getEventCardClasses(event, occ) {
  return CARD_CLASSES[getEventColorKey(event, occ)] || CARD_CLASSES.indigo;
}

export function getEventDotClasses(event, occ) {
  return DOT_CLASSES[getEventColorKey(event, occ)] || DOT_CLASSES.indigo;
}

export function getCategoryLabel(category) {
  const found = EVENT_CATEGORIES.find((c) => c.value === category);
  return found && found.label ? found.label : '';
}