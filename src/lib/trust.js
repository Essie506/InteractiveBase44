import { base44 } from '@/api/base44Client';

// Trust & Reputation — authoritative evidence-based trust layer
// Trust owns verification lifecycle, trust evaluation, public indicators.
// Authentication owns identity/credentials — no second identity system here.

// Submit verification with evidence (Media IDs)
export async function submitVerification(targetType, targetId, submittedById, evidenceMediaIds, notes) {
  // Create verification request
  const request = await base44.entities.VerificationRequest.create({
    target_type: targetType,
    target_id: targetId,
    verification_type: targetType,
    status: 'pending_review',
    decision: 'pending',
    public_state: 'pending',
    submitted_by_id: submittedById,
    evidence_media_ids: evidenceMediaIds || [],
    notes,
    submitted_at: new Date().toISOString(),
  });

  // Update target verification state
  await updateTargetVerificationState(targetType, targetId, 'pending_review');

  // Create or update trust record
  await ensureTrustRecord(targetType, targetId, 'pending');

  return request;
}

// Approve verification (admin/reviewer action)
export async function approveVerification(requestId, reviewedById, explanation) {
  const request = await base44.entities.VerificationRequest.get(requestId);

  await base44.entities.VerificationRequest.update(requestId, {
    status: 'verified',
    decision: 'approved',
    public_state: 'verified',
    reviewed_by_id: reviewedById,
    reviewed_at: new Date().toISOString(),
    trust_explanation: explanation || 'Verified by Interactive',
  });

  await updateTargetVerificationState(request.target_type, request.target_id, 'verified');

  await updateTrustRecord(request.target_type, request.target_id, {
    trust_level: 'verified',
    verified_at: new Date().toISOString(),
    public_indicators: ['verified', 'new'],
    trust_explanation: explanation || 'Verified by Interactive',
    last_evaluated_at: new Date().toISOString(),
    lifecycle_state: 'active',
  });

  return request;
}

// Reject verification
export async function rejectVerification(requestId, reviewedById, reason) {
  const request = await base44.entities.VerificationRequest.get(requestId);

  await base44.entities.VerificationRequest.update(requestId, {
    status: 'failed',
    decision: 'rejected',
    public_state: 'rejected',
    reviewed_by_id: reviewedById,
    reviewed_at: new Date().toISOString(),
    trust_explanation: reason || 'Verification could not be confirmed',
  });

  await updateTargetVerificationState(request.target_type, request.target_id, 'failed');

  await updateTrustRecord(request.target_type, request.target_id, {
    trust_level: 'failed',
    public_indicators: [],
    trust_explanation: reason || 'Verification could not be confirmed',
    last_evaluated_at: new Date().toISOString(),
  });

  return request;
}

async function updateTargetVerificationState(targetType, targetId, state) {
  if (targetType === 'professional') {
    const profiles = await base44.entities.ProfessionalProfile.filter({ identity_id: targetId });
    if (profiles.length > 0) {
      await base44.entities.ProfessionalProfile.update(profiles[0].id, { verification_state: state });
    }
  } else if (targetType === 'business') {
    await base44.entities.Business.update(targetId, { verification_state: state });
  }
}

async function ensureTrustRecord(targetType, targetId, trustLevel) {
  const records = await base44.entities.TrustRecord.filter({
    target_type: targetType, target_id: targetId, lifecycle_state: 'active',
  });
  if (records.length > 0) {
    return base44.entities.TrustRecord.update(records[0].id, {
      trust_level: trustLevel,
      last_evaluated_at: new Date().toISOString(),
    });
  }
  return base44.entities.TrustRecord.create({
    target_type: targetType,
    target_id: targetId,
    trust_level: trustLevel,
    public_indicators: [],
    lifecycle_state: 'active',
    last_evaluated_at: new Date().toISOString(),
  });
}

async function updateTrustRecord(targetType, targetId, updates) {
  const records = await base44.entities.TrustRecord.filter({
    target_type: targetType, target_id: targetId, lifecycle_state: 'active',
  });
  if (records.length > 0) {
    return base44.entities.TrustRecord.update(records[0].id, updates);
  }
  return base44.entities.TrustRecord.create({
    target_type: targetType,
    target_id: targetId,
    ...updates,
    lifecycle_state: 'active',
  });
}

export async function getTrustRecord(targetType, targetId) {
  const records = await base44.entities.TrustRecord.filter({
    target_type: targetType, target_id: targetId, lifecycle_state: 'active',
  });
  return records.length > 0 ? records[0] : null;
}

export async function getPublicIndicators(targetType, targetId) {
  const record = await getTrustRecord(targetType, targetId);
  if (!record) return [];
  return record.public_indicators || [];
}

export async function getPendingVerifications() {
  return base44.entities.VerificationRequest.filter({ decision: 'pending' }, '-submitted_at', 50);
}

export async function getVerificationRequest(targetType, targetId) {
  const requests = await base44.entities.VerificationRequest.filter({
    target_type: targetType, target_id: targetId,
  }, '-submitted_at', 1);
  return requests.length > 0 ? requests[0] : null;
}