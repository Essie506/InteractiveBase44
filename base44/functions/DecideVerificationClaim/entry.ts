import {
  getAccessToken,
  getProjectId,
  toFirestoreFields,
  firestoreBatchWrite,
  firestoreGetDoc,
  firestoreRunQuery,
  firestorePatchDoc,
  docPath,
  resolveIdentityFromToken,
  getCallerRole,
} from '../../shared/firebaseAdmin.ts';
import {
  deriveVerificationState,
  buildPublicSummary,
  CLAIM_STATUS,
} from '../../shared/verificationEngine.js';

// ───────────────────────────────────────────────────────────
// DecideVerificationClaim — reviewer decision on a single claim
// ───────────────────────────────────────────────────────────
// Admin/reviewer only. Appends an audit entry (never silently
// overwrites), updates the claim status, then re-derives the
// subject's authoritative public verification state from ALL its
// claims and propagates it to:
//   - verificationState/{subject} (detailed derived state)
//   - profile verification_state (coarse, used by Directory)
//   - public projection verification_state (Directory)
//   - TrustRecord (coarse trust_level + indicators)
//   - a notification to the submitter
//
// The client cannot call this with a non-reviewer identity, and
// cannot set verification_state directly.

const DECISIONS = ['verified', 'rejected', 'requested_more', 'expired', 'revoked'];

const STATUS_BY_DECISION: Record<string, string> = {
  verified: CLAIM_STATUS.VERIFIED,
  rejected: CLAIM_STATUS.REJECTED,
  requested_more: CLAIM_STATUS.PENDING,
  expired: CLAIM_STATUS.EXPIRED,
  revoked: CLAIM_STATUS.REVOKED,
};

function coarseToProfileState(coarse: string): string {
  if (coarse === 'verified') return 'verified';
  if (coarse === 'pending_review') return 'pending_review';
  if (coarse === 'expired') return 'expired';
  return 'not_verified';
}

export default async function (req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { idToken, claim_id, decision, note, expires_at } = body;

    if (!idToken) return Response.json({ error: 'Missing idToken' }, { status: 400 });
    if (!claim_id || !DECISIONS.includes(decision))
      return Response.json({ error: 'claim_id and a valid decision required' }, { status: 400 });

    const token = await getAccessToken();
    const projectId = getProjectId();

    // 1. Auth + reviewer/admin gate.
    let caller;
    try {
      caller = await resolveIdentityFromToken(projectId, idToken, token);
    } catch (e: any) {
      return Response.json({ error: e.message, code: 'AUTH_FAILED' }, { status: 401 });
    }
    const role = await getCallerRole(projectId, caller.identityId, token);
    if (role !== 'admin' && role !== 'reviewer') {
      return Response.json({ error: 'Admin or reviewer access required' }, { status: 403 });
    }

    // 2. Load the claim.
    const claimDoc = await firestoreGetDoc(projectId, 'verificationClaims', claim_id, token);
    if (!claimDoc) return Response.json({ error: 'Claim not found' }, { status: 404 });
    const claim = claimDoc.data;

    const now = new Date().toISOString();
    const newStatus = STATUS_BY_DECISION[decision];

    // 3. Append-only audit trail.
    const auditTrail: any[] = Array.isArray(claim.audit_trail) ? claim.audit_trail : [];
    auditTrail.push({ action: decision, at: now, by: caller.identityId, note: note || '' });

    const publicSummaryByDecision: Record<string, string> = {
      verified: 'Verified',
      rejected: 'Rejected',
      requested_more: 'More evidence required',
      expired: 'Expired',
      revoked: 'Revoked',
    };

    const claimPatch = {
      status: newStatus,
      checked_at: now,
      verified_at: decision === 'verified' ? now : claim.verified_at || null,
      reviewer_id: caller.identityId,
      review_provenance: `manual:${role}:${caller.identityId}`,
      expires_at: expires_at || claim.expires_at || null,
      audit_trail: auditTrail,
      public_summary: publicSummaryByDecision[decision],
      _updated_date: now,
    };

    // 4. Load ALL claims for the subject to derive the public state.
    const allClaims = await firestoreRunQuery(
      projectId,
      'verificationClaims',
      [
        { field: 'subject_type', op: '==', value: claim.subject_type },
        { field: 'subject_id', op: '==', value: claim.subject_id },
      ],
      token
    );
    const claimsForDerivation = allClaims.map((c) =>
      c.id === claim_id ? { ...c.data, ...claimPatch } : c.data
    );
    const derived = deriveVerificationState(claimsForDerivation, Date.now());
    const publicSummary = buildPublicSummary(derived);
    const profileState = coarseToProfileState(derived.public_state);

    // 5. Patch the claim (partial update, masked fields only).
    await firestorePatchDoc(
      projectId,
      'verificationClaims',
      claim_id,
      claimPatch,
      [
        'status', 'checked_at', 'verified_at', 'reviewer_id', 'review_provenance',
        'expires_at', 'audit_trail', 'public_summary', '_updated_date',
      ],
      token
    );

    // 6. Write the authoritative derived verificationState doc.
    const stateId = `${claim.subject_type}_${claim.subject_id}`;
    await firestoreBatchWrite(
      projectId,
      [
        {
          name: docPath(projectId, 'verificationState', stateId),
          fields: toFirestoreFields({
            subject_type: claim.subject_type,
            subject_id: claim.subject_id,
            tier: derived.tier,
            public_state: derived.public_state,
            summary: derived.summary,
            indicators: derived.indicators,
            public_summary: publicSummary,
            last_reviewed: derived.last_reviewed || now,
            claim_counts: derived.claim_counts,
            _updated_date: now,
          }),
        },
      ],
      token
    );

    // 7. Propagate coarse state to profile + public projection.
    const mask = ['verification_state', '_updated_date'];
    const patchFields = { verification_state: profileState, _updated_date: now };

    if (claim.subject_type === 'professional') {
      const profProfiles = await firestoreRunQuery(
        projectId,
        'professionalProfiles',
        [{ field: 'identity_id', op: '==', value: claim.subject_id }],
        token
      );
      for (const p of profProfiles) {
        await firestorePatchDoc(projectId, 'professionalProfiles', p.id, patchFields, mask, token);
      }
      const publicProfiles = await firestoreRunQuery(
        projectId,
        'professionalProfilesPublic',
        [{ field: 'identity_id', op: '==', value: claim.subject_id }],
        token
      );
      for (const p of publicProfiles) {
        await firestorePatchDoc(projectId, 'professionalProfilesPublic', p.id, patchFields, mask, token);
      }
    } else if (claim.subject_type === 'business') {
      await firestorePatchDoc(projectId, 'businesses', claim.subject_id, patchFields, mask, token);
      await firestorePatchDoc(
        projectId,
        'businessProfilesPublic',
        claim.subject_id,
        patchFields,
        mask,
        token
      );
    }

    // 8. Update / create TrustRecord (coarse trust_level + indicators).
    const trustTargetType = claim.subject_type; // 'professional' | 'business'
    const trustSnap = await firestoreRunQuery(
      projectId,
      'trustRecords',
      [
        { field: 'target_type', op: '==', value: trustTargetType },
        { field: 'target_id', op: '==', value: claim.subject_id },
        { field: 'lifecycle_state', op: '==', value: 'active' },
      ],
      token
    );
    const trustLevel = profileState === 'verified' ? 'verified'
      : profileState === 'pending_review' ? 'pending'
      : profileState === 'expired' ? 'failed'
      : 'unverified';
    const trustFields = {
      trust_level: trustLevel,
      public_indicators: derived.public_state === 'verified' ? ['verified', ...derived.indicators] : [],
      trust_explanation: publicSummary,
      last_evaluated_at: now,
      _updated_date: now,
    };
    if (trustSnap.length > 0) {
      await firestorePatchDoc(
        projectId,
        'trustRecords',
        trustSnap[0].id,
        trustFields,
        ['trust_level', 'public_indicators', 'trust_explanation', 'last_evaluated_at', '_updated_date'],
        token
      );
    } else {
      await firestoreBatchWrite(
        projectId,
        [
          {
            name: docPath(projectId, 'trustRecords', crypto.randomUUID()),
            fields: toFirestoreFields({
              target_type: trustTargetType,
              target_id: claim.subject_id,
              lifecycle_state: 'active',
              verified_at: profileState === 'verified' ? now : null,
              _created_date: now,
              ...trustFields,
            }),
          },
        ],
        token
      );
    }

    // 9. Notify the submitter.
    const notificationId = crypto.randomUUID();
    const isApproved = decision === 'verified';
    await firestoreBatchWrite(
      projectId,
      [
        {
          name: docPath(projectId, 'notificationRecords', notificationId),
          fields: toFirestoreFields({
            recipient_id: claim.submitted_by_id,
            source_system: 'trust',
            event_type: isApproved ? 'verification_approved' : `verification_${decision}`,
            title: isApproved ? 'Verification Approved' : 'Verification Update',
            body: isApproved
              ? 'Your verification has been approved.'
              : `Your verification claim (${claim.source_name}) was ${decision}.${note ? ' ' + note : ''}`,
            category: 'verification',
            priority: 'normal',
            delivery_channels: ['in_app'],
            is_read: false,
            action_url:
              claim.subject_type === 'business'
                ? `/business/${claim.subject_id}`
                : '/professional-profile',
            action_label: isApproved ? 'View Profile' : 'Resubmit',
            source_id: claim_id,
            _created_date: now,
            _updated_date: now,
          }),
        },
      ],
      token
    );

    return Response.json({
      claim_id,
      status: newStatus,
      derived: {
        tier: derived.tier,
        public_state: derived.public_state,
        summary: derived.summary,
        indicators: derived.indicators,
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}