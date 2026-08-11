import { base44 } from '@/api/base44Client';
import { trustRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';

// Trust & Reputation — M3: routes to Firebase when configured.
// Note: Verification approval/rejection and TrustSignal creation are
// server-only operations. TrustSignals use a backend function.
// Verification approval can be done by reviewers via client (security
// rules allow reviewer update), but atomic approval should use a
// backend function in production.

export async function submitVerification(targetType, targetId, submittedById, evidenceMediaIds, notes) {
  const requestData = {
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
  };

  let request;
  if (useFirebase) {
    request = await trustRepository.createVerificationRequest(requestData);
  } else {
    request = await base44.entities.VerificationRequest.create(requestData);
  }

  await updateTargetVerificationState(targetType, targetId, 'pending_review');
  await ensureTrustRecord(targetType, targetId, 'pending');

  return request;
}

export async function approveVerification(requestId, reviewedById, explanation) {
  let request;
  if (useFirebase) {
    request = await trustRepository.getVerificationRequest(requestId);
    await trustRepository.updateVerificationRequest(requestId, {
      status: 'verified',
      decision: 'approved',
      public_state: 'verified',
      reviewed_by_id: reviewedById,
      reviewed_at: new Date().toISOString(),
      trust_explanation: explanation || 'Verified by Interactive',
    });
  } else {
    request = await base44.entities.VerificationRequest.get(requestId);
    await base44.entities.VerificationRequest.update(requestId, {
      status: 'verified',
      decision: 'approved',
      public_state: 'verified',
      reviewed_by_id: reviewedById,
      reviewed_at: new Date().toISOString(),
      trust_explanation: explanation || 'Verified by Interactive',
    });
  }

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

export async function rejectVerification(requestId, reviewedById, reason) {
  let request;
  if (useFirebase) {
    request = await trustRepository.getVerificationRequest(requestId);
    await trustRepository.updateVerificationRequest(requestId, {
      status: 'failed',
      decision: 'rejected',
      public_state: 'rejected',
      reviewed_by_id: reviewedById,
      reviewed_at: new Date().toISOString(),
      trust_explanation: reason || 'Verification could not be confirmed',
    });
  } else {
    request = await base44.entities.VerificationRequest.get(requestId);
    await base44.entities.VerificationRequest.update(requestId, {
      status: 'failed',
      decision: 'rejected',
      public_state: 'rejected',
      reviewed_by_id: reviewedById,
      reviewed_at: new Date().toISOString(),
      trust_explanation: reason || 'Verification could not be confirmed',
    });
  }

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
    if (useFirebase) {
      const { profileRepository } = await import('@/data/firebase');
      const profiles = await profileRepository.getProfessionalProfile(targetId);
      // getProfessionalProfile takes identityId, but targetId for professional is the identity_id
      if (profiles) {
        await profileRepository.updateProfessionalProfile(profiles.id, { verification_state: state });
      }
    } else {
      const profiles = await base44.entities.ProfessionalProfile.filter({ identity_id: targetId });
      if (profiles.length > 0) {
        await base44.entities.ProfessionalProfile.update(profiles[0].id, { verification_state: state });
      }
    }
  } else if (targetType === 'business') {
    if (useFirebase) {
      const { businessRepository } = await import('@/data/firebase');
      await businessRepository.updateBusiness(targetId, { verification_state: state });
    } else {
      await base44.entities.Business.update(targetId, { verification_state: state });
    }
  }
}

async function ensureTrustRecord(targetType, targetId, trustLevel) {
  if (useFirebase) {
    const record = await trustRepository.getTrustRecord(targetId);
    if (record) {
      return trustRepository.updateTrustRecord(record.id, {
        trust_level: trustLevel,
        last_evaluated_at: new Date().toISOString(),
      });
    }
    return trustRepository.createTrustRecord({
      target_type: targetType,
      target_id: targetId,
      trust_level: trustLevel,
      public_indicators: [],
      lifecycle_state: 'active',
      last_evaluated_at: new Date().toISOString(),
    });
  }
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
  if (useFirebase) {
    const record = await trustRepository.getTrustRecord(targetId);
    if (record) {
      return trustRepository.updateTrustRecord(record.id, updates);
    }
    return trustRepository.createTrustRecord({
      target_type: targetType,
      target_id: targetId,
      ...updates,
      lifecycle_state: 'active',
    });
  }
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
  if (useFirebase) return trustRepository.getTrustRecord(targetId);
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
  if (useFirebase) return trustRepository.listPendingVerificationRequests();
  return base44.entities.VerificationRequest.filter({ decision: 'pending' }, '-submitted_at', 50);
}

export async function getVerificationRequest(targetType, targetId) {
  if (useFirebase) {
    const requests = await trustRepository.listVerificationRequestsForTarget(targetId);
    return requests.length > 0 ? requests[0] : null;
  }
  const requests = await base44.entities.VerificationRequest.filter({
    target_type: targetType, target_id: targetId,
  }, '-submitted_at', 1);
  return requests.length > 0 ? requests[0] : null;
}