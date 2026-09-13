import {
  getAccessToken,
  getProjectId,
  toFirestoreFields,
  firestoreBatchWrite,
  firestoreGetDoc,
  docPath,
  resolveIdentityFromToken,
} from '../../shared/firebaseAdmin.ts';
import { matchSources, CLAIM_STATUS } from '../../shared/verificationEngine.js';

// ───────────────────────────────────────────────────────────
// SubmitVerificationClaims — authoritative verification orchestrator
// ───────────────────────────────────────────────────────────
// Creates a parent VerificationRequest plus one VerificationClaim
// per selected source. The client can ONLY create pending claims;
// it can never set a claim to verified. Only DecideVerificationClaim
// (admin/reviewer) can mark a claim verified.
//
// Stage 1: no automated API/dataset integrations are configured, so
// every claim is created in 'pending' status for manual review. When
// a real permitted integration exists, the automated check runs here
// — never in the client, and never by scraping a website URL.

export default async function (req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const {
      idToken,
      subject_type, // 'professional' | 'business'
      subject_id,
      country,
      profession,
      notes,
      claims: claimEntries, // [{ claim_type, source_id, field_values, source_reference, evidence_media_ids }]
    } = body;

    if (!idToken) return Response.json({ error: 'Missing idToken' }, { status: 400 });
    if (!subject_type || !subject_id)
      return Response.json({ error: 'Missing subject_type/subject_id' }, { status: 400 });
    if (!Array.isArray(claimEntries) || claimEntries.length === 0)
      return Response.json({ error: 'No verification sources selected' }, { status: 400 });

    const token = await getAccessToken();
    const projectId = getProjectId();

    // 1. Resolve caller identity from the verified Firebase ID token.
    let caller;
    try {
      caller = await resolveIdentityFromToken(projectId, idToken, token);
    } catch (e: any) {
      return Response.json({ error: e.message, code: 'AUTH_FAILED' }, { status: 401 });
    }
    const callerIdentityId = caller.identityId;

    // 2. Authorisation — the caller must own the subject.
    if (subject_type === 'professional') {
      if (subject_id !== callerIdentityId) {
        return Response.json(
          { error: 'Not authorised to submit verification for this professional' },
          { status: 403 }
        );
      }
    } else if (subject_type === 'business') {
      const membership = await firestoreGetDoc(
        projectId,
        'businessMemberships',
        `${subject_id}_${callerIdentityId}`,
        token
      );
      if (!membership || !['owner', 'admin'].includes(membership.data.role)) {
        return Response.json(
          { error: 'Not authorised to submit verification for this business' },
          { status: 403 }
        );
      }
    } else {
      return Response.json({ error: 'Invalid subject_type' }, { status: 400 });
    }

    // 3. Load + validate every selected source (server re-validates
    //    jurisdiction/profession/claim-type eligibility — the client
    //    filter is only for UX).
    const now = new Date().toISOString();
    const validated: Array<{
      source: any;
      claim_type: string;
      field_values: Record<string, any>;
      source_reference: string;
      evidence_media_ids: string[];
    }> = [];

    for (const entry of claimEntries) {
      const sourceDoc = await firestoreGetDoc(
        projectId,
        'verificationSources',
        entry.source_id,
        token
      );
      if (!sourceDoc || sourceDoc.data.is_active === false) {
        return Response.json(
          { error: `Verification source not available: ${entry.source_id}` },
          { status: 400 }
        );
      }
      const source = sourceDoc.data;
      if (!source.claim_types || !source.claim_types.includes(entry.claim_type)) {
        return Response.json(
          { error: `Source ${source.name} does not support claim type ${entry.claim_type}` },
          { status: 400 }
        );
      }
      const eligible = matchSources([source], {
        subjectType: subject_type,
        country,
        profession,
        claimType: entry.claim_type,
      });
      if (eligible.length === 0) {
        return Response.json(
          { error: `Source ${source.name} is not eligible for this jurisdiction/profession` },
          { status: 400 }
        );
      }
      validated.push({
        source,
        claim_type: entry.claim_type,
        field_values: entry.field_values || {},
        source_reference: entry.source_reference || '',
        evidence_media_ids: entry.evidence_media_ids || [],
      });
    }

    // 4. Parent VerificationRequest (reuses the existing entity).
    const requestId = crypto.randomUUID();
    const requestFields = toFirestoreFields({
      target_type: subject_type,
      target_id: subject_id,
      verification_type: validated.map((c) => c.claim_type).join(','),
      status: 'pending_review',
      decision: 'pending',
      public_state: 'pending',
      submitted_by_id: callerIdentityId,
      evidence_media_ids: validated.flatMap((c) => c.evidence_media_ids),
      notes: notes || '',
      submitted_at: now,
      _created_date: now,
      _updated_date: now,
    });

    const writes: Array<{ name: string; fields: Record<string, any> }> = [
      { name: docPath(projectId, 'verificationRequests', requestId), fields: requestFields },
    ];

    // 5. One VerificationClaim per selected source — all pending.
    const createdClaims: Array<{ id: string; source_name: string; claim_type: string; status: string }> = [];
    for (const vc of validated) {
      const claimId = crypto.randomUUID();
      const claimFields = toFirestoreFields({
        request_id: requestId,
        subject_type,
        subject_id,
        claim_type: vc.claim_type,
        country: country || '',
        profession: profession || '',
        source_id: vc.source.id || '',
        source_name: vc.source.name,
        source_lookup_url: vc.source.lookup_url || '',
        source_reference: vc.source_reference,
        field_values: vc.field_values,
        verification_method: vc.source.verification_method,
        status: CLAIM_STATUS.PENDING,
        submitted_by_id: callerIdentityId,
        submitted_at: now,
        evidence_media_ids: vc.evidence_media_ids,
        public_summary: 'Pending review',
        notes: notes || '',
        audit_trail: [
          { action: 'submitted', at: now, by: callerIdentityId, note: 'Verification claim submitted' },
        ],
        _created_date: now,
        _updated_date: now,
      });
      writes.push({ name: docPath(projectId, 'verificationClaims', claimId), fields: claimFields });
      createdClaims.push({
        id: claimId,
        source_name: vc.source.name,
        claim_type: vc.claim_type,
        status: CLAIM_STATUS.PENDING,
      });
    }

    // 6. Stage 1: no automated providers configured yet — claims stay
    //    pending for manual review. A real permitted API/dataset check
    //    would run here (server-side, with configured credentials).

    await firestoreBatchWrite(projectId, writes, token);

    return Response.json({ request_id: requestId, claims: createdClaims });
  } catch (error: any) {
    return Response.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}