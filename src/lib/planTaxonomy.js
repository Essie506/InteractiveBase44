// Pure plan taxonomy helpers — no Firebase imports, unit-testable.
// ───────────────────────────────────────────────────────────
// V2 unified capability taxonomy. The underlying tier (basic/plus/pro)
// and family (professional/business) remain as internal backwards-compat
// fields on stored plan records; the user-facing name is the unified
// taxonomy below. This is a display mapping only — it does NOT mutate
// stored plan records (no Firestore data migration required).

const PLAN_DISPLAY_NAMES = {
  'basic-professional': 'Basic',
  'plus-professional': 'Plus',
  'pro-professional': 'Pro',
  'basic-business': 'Enhance',
  'plus-business': 'Expand',
  'pro-business': 'Enterprise',
};

export function getPlanDisplayName(plan) {
  if (!plan) return '';
  return PLAN_DISPLAY_NAMES[`${plan.tier}-${plan.family}`] || plan.name || '';
}

export function formatPlanPrice(pricePence, currency = 'GBP') {
  if (!pricePence || pricePence === 0) return 'Free';
  const symbol = currency === 'GBP' ? '£' : '';
  return `${symbol}${(pricePence / 100).toFixed(2)}`;
}

export function isFreePlan(plan) {
  return !plan?.price_pence || plan.price_pence === 0;
}

// Price-based ordering across the 6-plan taxonomy. Higher price = higher
// capability tier. Replaces the old 3-tier enum comparison so all six
// plans order correctly: Basic < Plus < Pro < Enhance < Expand < Enterprise.
export function isHigherTier(currentPrice, candidatePrice) {
  return (candidatePrice ?? 0) > (currentPrice ?? 0);
}