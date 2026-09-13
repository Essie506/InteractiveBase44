// Verification Engine — pure, side-effect-free logic.
// ───────────────────────────────────────────────────────────
// Authoritative derivation of public verification state from
// verified claims, plus source matching by jurisdiction /
// profession / claim type. Imported by the Base44 backend
// functions (SubmitVerificationClaims, DecideVerificationClaim)
// and unit-tested directly (tests/verification-engine.test.mjs).
//
// INVARIANTS enforced here (and tested):
//  - Public state is DERIVED from verified claims, never set
//    directly by a client. A client can only create pending
//    claims; only a reviewer can mark a claim verified.
//  - Email / phone verification alone does NOT create a
//    Professional verification — it is not a claim type here.
//  - Business existence alone does NOT prove business control.
//  - Expired / revoked claims no longer qualify.
//  - Private evidence (media ids, field values) never appears
//    in the derived public state.

export const VERIFICATION_TIERS = {
  UNVERIFIED: 'unverified',
  IDENTITY_VERIFIED: 'identity_verified',
  PROFESSIONAL_EVIDENCE_VERIFIED: 'professional_evidence_verified',
  PROFESSIONAL_REGISTRATION_VERIFIED: 'professional_registration_verified',
  BUSINESS_VERIFIED: 'business_verified',
  BUSINESS_PARTIAL: 'business_partial',
  EXPIRED_REVIEW_REQUIRED: 'expired_review_required',
};

export const CLAIM_TYPES = {
  IDENTITY: 'identity',
  QUALIFICATION: 'qualification',
  PROFESSIONAL_REGISTRATION: 'professional_registration',
  BUSINESS_EXISTENCE: 'business_existence',
  BUSINESS_CONTROL: 'business_control',
};

export const CLAIM_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  PARTIALLY_VERIFIED: 'partially_verified',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
};

// Subject types that map to the "professional" family of claims.
const PROFESSIONAL_CLAIMS = new Set([
  CLAIM_TYPES.IDENTITY,
  CLAIM_TYPES.QUALIFICATION,
  CLAIM_TYPES.PROFESSIONAL_REGISTRATION,
]);
const BUSINESS_CLAIMS = new Set([
  CLAIM_TYPES.BUSINESS_EXISTENCE,
  CLAIM_TYPES.BUSINESS_CONTROL,
]);

/**
 * A claim is "active" (counts toward derived public state) only if
 * it is fully verified and not past its expiry. Partially verified
 * claims do not qualify as full corroboration.
 *
 * @param {object} claim
 * @param {number} nowMs
 * @returns {boolean}
 */
export function isClaimActive(claim, nowMs = Date.now()) {
  if (!claim || claim.status !== CLAIM_STATUS.VERIFIED) return false;
  if (claim.expires_at) {
    const exp = new Date(claim.expires_at).getTime();
    if (!Number.isNaN(exp) && exp < nowMs) return false;
  }
  return true;
}

/**
 * Derive the authoritative public verification state from a
 * subject's claims. Pure function — no I/O.
 *
 * @param {Array<object>} claims - all claims for one subject.
 * @param {number} [nowMs]
 * @returns {{tier: string, public_state: string, summary: string, indicators: string[], last_reviewed: string|null, claim_counts: object}}
 */
export function deriveVerificationState(claims, nowMs = Date.now()) {
  const counts = { verified: 0, pending: 0, rejected: 0 };

  if (!Array.isArray(claims) || claims.length === 0) {
    return {
      tier: VERIFICATION_TIERS.UNVERIFIED,
      public_state: 'not_verified',
      summary: 'Not verified',
      indicators: [],
      last_reviewed: null,
      claim_counts: counts,
    };
  }

  for (const c of claims) {
    if (c.status === CLAIM_STATUS.VERIFIED) counts.verified++;
    else if (c.status === CLAIM_STATUS.PENDING || c.status === CLAIM_STATUS.PARTIALLY_VERIFIED) counts.pending++;
    else counts.rejected++; // rejected | expired | revoked
  }

  const active = claims.filter((c) => isClaimActive(c, nowMs));
  const hasType = (t) => active.some((c) => c.claim_type === t);
  const isBusiness = claims.some((c) => c.subject_type === 'business');
  const verifiedAts = active.map((c) => c.verified_at).filter(Boolean).sort();
  const lastReviewed = verifiedAts.length ? verifiedAts[verifiedAts.length - 1] : null;

  // Previously verified but nothing active now → expired / review required.
  // "Was ever verified" = currently verified, expired (expired implies
  // it was verified), OR the audit trail records a prior 'verified'
  // action (e.g. a claim that was verified then revoked). A claim
  // revoked without ever being verified does NOT count.
  const wasEverVerified = claims.some(
    (c) =>
      c.status === CLAIM_STATUS.VERIFIED ||
      c.status === CLAIM_STATUS.EXPIRED ||
      (Array.isArray(c.audit_trail) && c.audit_trail.some((a) => a.action === 'verified'))
  );
  if (active.length === 0 && wasEverVerified) {
    return {
      tier: VERIFICATION_TIERS.EXPIRED_REVIEW_REQUIRED,
      public_state: 'expired',
      summary: 'Verification expired — review required',
      indicators: [],
      last_reviewed: lastReviewed,
      claim_counts: counts,
    };
  }

  if (isBusiness) {
    const existence = hasType(CLAIM_TYPES.BUSINESS_EXISTENCE);
    const control = hasType(CLAIM_TYPES.BUSINESS_CONTROL);
    const indicators = [];
    if (existence) indicators.push('Business existence confirmed');
    if (control) indicators.push('Business control confirmed');
    if (existence && control) {
      return {
        tier: VERIFICATION_TIERS.BUSINESS_VERIFIED,
        public_state: 'verified',
        summary: 'Verified Business',
        indicators,
        last_reviewed: lastReviewed,
        claim_counts: counts,
      };
    }
    if (existence || control) {
      return {
        tier: VERIFICATION_TIERS.BUSINESS_PARTIAL,
        public_state: 'pending_review',
        summary: 'Business verification in progress',
        indicators,
        last_reviewed: lastReviewed,
        claim_counts: counts,
      };
    }
    if (counts.pending > 0) {
      return {
        tier: VERIFICATION_TIERS.UNVERIFIED,
        public_state: 'pending_review',
        summary: 'Business verification in progress',
        indicators,
        last_reviewed: lastReviewed,
        claim_counts: counts,
      };
    }
    return {
      tier: VERIFICATION_TIERS.UNVERIFIED,
      public_state: 'not_verified',
      summary: 'Not verified',
      indicators,
      last_reviewed: lastReviewed,
      claim_counts: counts,
    };
  }

  // Professional / Identity subject.
  const identity = hasType(CLAIM_TYPES.IDENTITY);
  const qualification = hasType(CLAIM_TYPES.QUALIFICATION);
  const registration = hasType(CLAIM_TYPES.PROFESSIONAL_REGISTRATION);
  const indicators = [];
  if (identity) indicators.push('Identity confirmed');
  if (qualification) indicators.push('Recognised qualification confirmed');
  if (registration) indicators.push('Professional registration confirmed');

  if (registration && identity) {
    return {
      tier: VERIFICATION_TIERS.PROFESSIONAL_REGISTRATION_VERIFIED,
      public_state: 'verified',
      summary: 'Verified Professional — registration confirmed',
      indicators,
      last_reviewed: lastReviewed,
      claim_counts: counts,
    };
  }
  if (qualification && identity) {
    return {
      tier: VERIFICATION_TIERS.PROFESSIONAL_EVIDENCE_VERIFIED,
      public_state: 'verified',
      summary: 'Verified Professional — evidence confirmed',
      indicators,
      last_reviewed: lastReviewed,
      claim_counts: counts,
    };
  }
  if (identity) {
    return {
      tier: VERIFICATION_TIERS.IDENTITY_VERIFIED,
      public_state: 'verified',
      summary: 'Identity verified',
      indicators,
      last_reviewed: lastReviewed,
      claim_counts: counts,
    };
  }
  if (active.length > 0 || counts.pending > 0) {
    return {
      tier: VERIFICATION_TIERS.UNVERIFIED,
      public_state: 'pending_review',
      summary: 'Verification in progress',
      indicators,
      last_reviewed: lastReviewed,
      claim_counts: counts,
    };
  }
  return {
    tier: VERIFICATION_TIERS.UNVERIFIED,
    public_state: 'not_verified',
    summary: 'Not verified',
    indicators,
    last_reviewed: lastReviewed,
    claim_counts: counts,
  };
}

/**
 * Select verification sources eligible for a given subject,
 * jurisdiction, profession and claim type. Used server-side to
 * validate a submission and client-side to render the picker.
 *
 * @param {Array<object>} sources
 * @param {{subjectType?: string, country?: string, profession?: string, claimType?: string}} filter
 * @returns {Array<object>}
 */
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

/**
 * Build the safe public-facing explanation string. Contains only
 * the derived summary + safe indicators — never evidence media,
 * field values, or private references.
 *
 * @param {{summary: string, indicators: string[]}} derived
 * @returns {string}
 */
export function buildPublicSummary(derived) {
  if (!derived) return 'Not verified';
  if (!derived.indicators || derived.indicators.length === 0) return derived.summary;
  return `${derived.summary} · ${derived.indicators.join(', ')}`;
}

/**
 * Returns true if the derived public_state qualifies a listing for
 * the Directory "Verified only" filter. Only a fully derived
 * 'verified' state qualifies — pending / partial / expired do not.
 *
 * @param {{public_state?: string}} derived
 * @returns {boolean}
 */
export function qualifiesForVerifiedOnlyFilter(derived) {
  return !!derived && derived.public_state === 'verified';
}