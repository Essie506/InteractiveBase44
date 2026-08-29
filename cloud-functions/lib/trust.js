"use strict";
// Trust operations — server-only
// ───────────────────────────────────────────────────────────
// createTrustSignal: Trust signals are system-generated only.
//   Firestore rules deny all client writes to trustSignals.
//
// decideVerification: Atomic verification approval/rejection.
//   Updates VerificationRequest, target profile/business verification_state,
//   TrustRecord, and creates a notification — all in a batch.
//   Only admins can call this. Ordinary users must never self-approve.
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideVerification = exports.createTrustSignal = void 0;
const https_1 = require("firebase-functions/v2/https");
const crypto_1 = require("crypto");
const shared_1 = require("./shared");
// ── createTrustSignal ──────────────────────────────────────
exports.createTrustSignal = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    // Any authenticated user can report (create a 'reported' signal).
    // The caller's identity is verified server-side.
    const { source_system, target_type, target_id, signal_type, signal_data, signal_weight, operation_id, } = request.data || {};
    if (!source_system || !target_type || !target_id || !signal_type) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields: source_system, target_type, target_id, signal_type');
    }
    const signalId = (0, crypto_1.randomUUID)();
    const now = new Date().toISOString();
    const signalRecord = {
        source_system,
        target_type,
        target_id,
        signal_type,
        signal_data: signal_data || null,
        signal_weight: signal_weight ?? 1,
        operation_id: operation_id || null,
        _created_date: now,
        _updated_date: now,
    };
    await shared_1.db.collection('trustSignals').doc(signalId).set(signalRecord);
    return { id: signalId, ...signalRecord };
});
// ── decideVerification ──────────────────────────────────────
exports.decideVerification = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const reviewerIdentityId = await (0, shared_1.requireAdmin)(request.auth.uid);
    const { request_id, decision, // 'approved' | 'rejected'
    explanation, } = request.data || {};
    if (!request_id || !['approved', 'rejected'].includes(decision)) {
        throw new https_1.HttpsError('invalid-argument', 'request_id and decision (approved|rejected) required');
    }
    // 1. Get the verification request
    const reqRef = shared_1.db.collection('verificationRequests').doc(request_id);
    const reqDoc = await reqRef.get();
    if (!reqDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Verification request not found');
    }
    const verRequest = reqDoc.data();
    if (verRequest.decision !== 'pending') {
        throw new https_1.HttpsError('failed-precondition', 'Verification request has already been decided');
    }
    const targetType = verRequest.target_type;
    const targetId = verRequest.target_id;
    const now = new Date().toISOString();
    const isApproved = decision === 'approved';
    const newStatus = isApproved ? 'verified' : 'failed';
    const newPublicState = isApproved ? 'verified' : 'rejected';
    const trustExplanation = explanation || (isApproved
        ? 'Verified by Interactive'
        : 'Verification could not be confirmed');
    const batch = shared_1.db.batch();
    // 2. Update VerificationRequest
    batch.update(reqRef, {
        status: newStatus,
        decision,
        public_state: newPublicState,
        reviewed_by_id: reviewerIdentityId,
        reviewed_at: now,
        trust_explanation: trustExplanation,
        _updated_date: now,
    });
    // 3. Update target verification_state (private + public projection)
    if (targetType === 'professional') {
        const profileSnap = await shared_1.db.collection('professionalProfiles')
            .where('identity_id', '==', targetId)
            .limit(1)
            .get();
        if (!profileSnap.empty) {
            batch.update(profileSnap.docs[0].ref, {
                verification_state: newStatus,
                _updated_date: now,
            });
        }
        // Sync the public projection so /p/:screenName reflects verification
        const publicSnap = await shared_1.db.collection('professionalProfilesPublic')
            .where('identity_id', '==', targetId)
            .limit(1)
            .get();
        if (!publicSnap.empty) {
            batch.update(publicSnap.docs[0].ref, {
                verification_state: newStatus,
                _updated_date: now,
            });
        }
    }
    else if (targetType === 'business') {
        batch.update(shared_1.db.collection('businesses').doc(targetId), {
            verification_state: newStatus,
            _updated_date: now,
        });
        // Sync the public projection so /b/:businessId reflects verification
        const bizPublicSnap = await shared_1.db.collection('businessProfilesPublic').doc(targetId).get();
        if (bizPublicSnap.exists) {
            batch.update(bizPublicSnap.ref, {
                verification_state: newStatus,
                _updated_date: now,
            });
        }
    }
    // 4. Update or create TrustRecord
    const trustSnap = await shared_1.db.collection('trustRecords')
        .where('target_type', '==', targetType)
        .where('target_id', '==', targetId)
        .where('lifecycle_state', '==', 'active')
        .limit(1)
        .get();
    if (!trustSnap.empty) {
        batch.update(trustSnap.docs[0].ref, {
            trust_level: newStatus,
            public_indicators: isApproved ? ['verified', 'new'] : [],
            trust_explanation: trustExplanation,
            last_evaluated_at: now,
            _updated_date: now,
        });
    }
    else {
        const trustId = (0, crypto_1.randomUUID)();
        batch.set(shared_1.db.collection('trustRecords').doc(trustId), {
            target_type: targetType,
            target_id: targetId,
            trust_level: newStatus,
            public_indicators: isApproved ? ['verified', 'new'] : [],
            trust_explanation: trustExplanation,
            last_evaluated_at: now,
            lifecycle_state: 'active',
            _created_date: now,
            _updated_date: now,
        });
    }
    // 5. Create notification
    const notificationId = (0, crypto_1.randomUUID)();
    batch.set(shared_1.db.collection('notificationRecords').doc(notificationId), {
        recipient_id: verRequest.submitted_by_id,
        source_system: 'trust',
        event_type: isApproved ? 'verification_approved' : 'verification_rejected',
        title: isApproved ? 'Verification Approved' : 'Verification Could Not Be Confirmed',
        body: isApproved
            ? `Your ${targetType} verification has been approved. You are now verified on Interactive.`
            : `Your ${targetType} verification could not be confirmed. ${explanation || ''}`,
        category: 'verification',
        priority: 'normal',
        delivery_channels: ['in_app', 'email'],
        is_read: false,
        action_url: targetType === 'business' ? `/business/${targetId}` : '/professional-profile',
        action_label: isApproved ? 'View Profile' : 'Resubmit',
        source_id: request_id,
        _created_date: now,
        _updated_date: now,
    });
    await batch.commit();
    return {
        request_id,
        decision,
        status: newStatus,
        target_type: targetType,
        target_id: targetId,
    };
});
//# sourceMappingURL=trust.js.map