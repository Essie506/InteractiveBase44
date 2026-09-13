// Client-side verification source filtering for the verification UI.
// ───────────────────────────────────────────────────────────
// The authoritative deriveVerificationState + matchSources live
// server-side (base44/shared/verificationEngine.js) and are unit
// tested. This small mirror is for UI rendering only; the backend
// re-validates every submission server-side.

export const CLAIM_TYPE_LABELS = {
  identity: 'Identity',
  qualification: 'Qualification',
  professional_registration: 'Professional registration',
  business_existence: 'Business existence',
  business_control: 'Business control',
};

const PROFESSIONAL_CLAIMS = new Set([
  'identity',
  'qualification',
  'professional_registration',
]);
const BUSINESS_CLAIMS = new Set(['business_existence', 'business_control']);

export function matchSources(sources, filter = {}) {
  const { subjectType, country, profession, claimType } = filter;
  return (sources || []).filter((s) => {
    if (!s || s.is_active === false) return false;
    const claimTypes = s.claim_types || [];
    if (claimType && !claimTypes.includes(claimType)) return false;
    if (country && s.country && s.country !== '*' && s.country !== country) return false;
    const professions = s.professions || [];
    if (profession && !professions.includes('*') && !professions.includes(profession)) return false;
    if (subjectType) {
      const supportsBusiness = claimTypes.some((c) => BUSINESS_CLAIMS.has(c));
      const supportsProfessional = claimTypes.some((c) => PROFESSIONAL_CLAIMS.has(c));
      if (subjectType === 'business' && !supportsBusiness) return false;
      if (subjectType === 'professional' && !supportsProfessional) return false;
    }
    return true;
  });
}

export function claimTypesForSubject(subjectType) {
  if (subjectType === 'business') return ['business_existence', 'business_control'];
  return ['identity', 'qualification', 'professional_registration'];
}