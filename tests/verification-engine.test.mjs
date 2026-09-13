import {
  deriveVerificationState,
  matchSources,
  isClaimActive,
  buildPublicSummary,
  qualifiesForVerifiedOnlyFilter,
  VERIFICATION_TIERS,
  CLAIM_TYPES,
  CLAIM_STATUS,
} from '../base44/shared/verificationEngine.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('FAIL:', msg); }
}

// 1. Email / phone verification alone does NOT create Professional
//    verification — it is not a claim type. No claims → unverified.
{
  const d = deriveVerificationState([]);
  assert(d.tier === VERIFICATION_TIERS.UNVERIFIED && d.public_state === 'not_verified', 'email-only: no claims → unverified');
  assert(!qualifiesForVerifiedOnlyFilter(d), 'email-only: excluded by Verified-only filter');
}

// 2. Client cannot self-mark verified: a pending claim never derives
//    a verified public state (only a reviewer can mark a claim
//    verified, server-side).
{
  const claims = [{ subject_type: 'professional', claim_type: CLAIM_TYPES.IDENTITY, status: CLAIM_STATUS.PENDING, submitted_by_id: 'u1' }];
  const d = deriveVerificationState(claims);
  assert(d.public_state !== 'verified', 'pending claim does not derive verified');
  assert(d.public_state === 'pending_review', 'pending claim → pending_review');
}

// 3. Verified claims derive the correct public state / tier.
{
  const identity = { subject_type: 'professional', claim_type: CLAIM_TYPES.IDENTITY, status: CLAIM_STATUS.VERIFIED, verified_at: '2026-01-01T00:00:00Z' };
  assert(deriveVerificationState([identity]).tier === VERIFICATION_TIERS.IDENTITY_VERIFIED, 'identity verified → identity_verified');

  const qual = { subject_type: 'professional', claim_type: CLAIM_TYPES.QUALIFICATION, status: CLAIM_STATUS.VERIFIED, verified_at: '2026-01-01T00:00:00Z' };
  assert(deriveVerificationState([identity, qual]).tier === VERIFICATION_TIERS.PROFESSIONAL_EVIDENCE_VERIFIED, 'identity+qualification → professional_evidence_verified');

  const reg = { subject_type: 'professional', claim_type: CLAIM_TYPES.PROFESSIONAL_REGISTRATION, status: CLAIM_STATUS.VERIFIED, verified_at: '2026-01-01T00:00:00Z' };
  assert(deriveVerificationState([identity, reg]).tier === VERIFICATION_TIERS.PROFESSIONAL_REGISTRATION_VERIFIED, 'identity+registration → professional_registration_verified');

  assert(qualifiesForVerifiedOnlyFilter(deriveVerificationState([identity, reg])), 'verified professional included by Verified-only filter');
}

// 4. Unverified professional excluded by Verified-only filter.
{
  const d = deriveVerificationState([{ subject_type: 'professional', claim_type: CLAIM_TYPES.QUALIFICATION, status: CLAIM_STATUS.PENDING }]);
  assert(!qualifiesForVerifiedOnlyFilter(d), 'unverified professional excluded by Verified-only');
}

// 5. Expired / revoked claims no longer qualify.
{
  const verifiedExpired = { subject_type: 'professional', claim_type: CLAIM_TYPES.IDENTITY, status: CLAIM_STATUS.VERIFIED, verified_at: '2025-01-01T00:00:00Z', expires_at: '2025-12-01T00:00:00Z' };
  const d = deriveVerificationState([verifiedExpired], new Date('2026-01-01').getTime());
  assert(d.public_state === 'expired', 'expired claim → expired state');
  assert(!qualifiesForVerifiedOnlyFilter(d), 'expired excluded by Verified-only');

  const revoked = { subject_type: 'professional', claim_type: CLAIM_TYPES.IDENTITY, status: CLAIM_STATUS.REVOKED };
  assert(!isClaimActive(revoked), 'revoked claim not active');
  assert(deriveVerificationState([revoked]).tier === VERIFICATION_TIERS.UNVERIFIED, 'revoked only → unverified');
}

// 6. Business existence alone does NOT prove business control.
{
  const existence = { subject_type: 'business', claim_type: CLAIM_TYPES.BUSINESS_EXISTENCE, status: CLAIM_STATUS.VERIFIED, verified_at: '2026-01-01T00:00:00Z' };
  const d = deriveVerificationState([existence]);
  assert(d.tier === VERIFICATION_TIERS.BUSINESS_PARTIAL, 'existence alone → business_partial');
  assert(d.public_state !== 'verified', 'existence alone not verified');
  assert(!qualifiesForVerifiedOnlyFilter(d), 'existence alone excluded by Verified-only');

  const control = { subject_type: 'business', claim_type: CLAIM_TYPES.BUSINESS_CONTROL, status: CLAIM_STATUS.VERIFIED, verified_at: '2026-01-01T00:00:00Z' };
  const d2 = deriveVerificationState([existence, control]);
  assert(d2.tier === VERIFICATION_TIERS.BUSINESS_VERIFIED && d2.public_state === 'verified', 'existence+control → business_verified');
  assert(qualifiesForVerifiedOnlyFilter(d2), 'existence+control included by Verified-only');
}

// 7. Private evidence does NOT leak into the public derived state.
{
  const claims = [{
    subject_type: 'professional', claim_type: CLAIM_TYPES.IDENTITY, status: CLAIM_STATUS.VERIFIED,
    verified_at: '2026-01-01T00:00:00Z',
    evidence_media_ids: ['media_secret_1'],
    field_values: { passport_number: '123456789', dob: '1990-01-01' },
  }];
  const d = deriveVerificationState(claims);
  const summary = buildPublicSummary(d);
  const serialised = JSON.stringify(d) + summary;
  assert(!serialised.includes('media_secret_1'), 'no evidence media id in public state');
  assert(!serialised.includes('passport_number') && !serialised.includes('123456789'), 'no private field values in public state');
  assert(!serialised.includes('1990-01-01'), 'no DOB in public state');
}

// 8. Source / provider selection works by jurisdiction + profession.
{
  const sources = [
    { id: 'gb_cimspa', name: 'CIMSPA', country: 'GB', professions: ['personal_trainer'], claim_types: [CLAIM_TYPES.PROFESSIONAL_REGISTRATION], is_active: true },
    { id: 'us_ncaa', name: 'NCAA', country: 'US', professions: ['*'], claim_types: [CLAIM_TYPES.PROFESSIONAL_REGISTRATION], is_active: true },
    { id: 'gb_qual', name: 'Qual', country: 'GB', professions: ['*'], claim_types: [CLAIM_TYPES.QUALIFICATION], is_active: true },
    { id: 'inactive', name: 'Old', country: 'GB', professions: ['*'], claim_types: [CLAIM_TYPES.QUALIFICATION], is_active: false },
  ];
  const gbPt = matchSources(sources, { subjectType: 'professional', country: 'GB', profession: 'personal_trainer', claimType: CLAIM_TYPES.PROFESSIONAL_REGISTRATION });
  assert(gbPt.length === 1 && gbPt[0].id === 'gb_cimspa', 'GB personal_trainer registration → CIMSPA only');

  const usAny = matchSources(sources, { country: 'US', claimType: CLAIM_TYPES.PROFESSIONAL_REGISTRATION });
  assert(usAny.length === 1 && usAny[0].id === 'us_ncaa', 'US registration → NCAA');

  const gbPhysioReg = matchSources(sources, { subjectType: 'professional', country: 'GB', profession: 'physio', claimType: CLAIM_TYPES.PROFESSIONAL_REGISTRATION });
  assert(gbPhysioReg.length === 0, 'GB physio registration → no source (CIMSPA is personal_trainer only)');

  const gbQual = matchSources(sources, { subjectType: 'professional', country: 'GB', claimType: CLAIM_TYPES.QUALIFICATION });
  assert(gbQual.length === 1 && gbQual[0].id === 'gb_qual', 'inactive source excluded');
}

// 9. Manual fallback works when no automated provider exists.
{
  const manualSource = { id: 'gb_manual', name: 'Manual', country: 'GB', professions: ['*'], claim_types: [CLAIM_TYPES.QUALIFICATION], verification_method: 'manual_review', automated_enabled: false, is_active: true };
  const matched = matchSources([manualSource], { subjectType: 'professional', country: 'GB', claimType: CLAIM_TYPES.QUALIFICATION });
  assert(matched.length === 1, 'manual source is selectable even when automated_enabled=false');

  // A submitted manual claim starts pending and derives pending_review
  // (not verified, not rejected) — it awaits manual review.
  const pendingClaim = { subject_type: 'professional', claim_type: CLAIM_TYPES.QUALIFICATION, status: CLAIM_STATUS.PENDING };
  const d = deriveVerificationState([pendingClaim]);
  assert(d.public_state === 'pending_review', 'manual pending claim → pending_review');
  assert(!qualifiesForVerifiedOnlyFilter(d), 'manual pending claim not yet verified');
}

// 10. Qualification without identity does not reach professional_evidence_verified
//     (identity must be corroborated separately).
{
  const qualOnly = { subject_type: 'professional', claim_type: CLAIM_TYPES.QUALIFICATION, status: CLAIM_STATUS.VERIFIED, verified_at: '2026-01-01T00:00:00Z' };
  const d = deriveVerificationState([qualOnly]);
  assert(d.tier !== VERIFICATION_TIERS.PROFESSIONAL_EVIDENCE_VERIFIED, 'qualification without identity does not reach professional_evidence_verified');
  assert(d.tier === VERIFICATION_TIERS.UNVERIFIED, 'qualification without identity → unverified (pending_review since active>0)');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);