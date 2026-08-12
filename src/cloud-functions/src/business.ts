// Business invitation acceptance — server-only
// ───────────────────────────────────────────────────────────
// Atomically validates invitation, creates membership, and updates
// invitation status. Users must not self-create arbitrary memberships.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId } from './shared';

export const acceptInvitation = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const identityId = await getIdentityId(request.auth.uid);
    const { invitation_id } = request.data || {};

    if (!invitation_id) {
      throw new HttpsError('invalid-argument', 'invitation_id required');
    }

    // 1. Get the invitation
    const inviteRef = db.collection('businessInvitations').doc(invitation_id);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      throw new HttpsError('not-found', 'Invitation not found');
    }

    const invitation = inviteDoc.data()!;

    // 2. Validate invitation status
    if (invitation.status !== 'sent' && invitation.status !== 'delivered') {
      throw new HttpsError('failed-precondition', `Invitation is ${invitation.status}, not pending`);
    }

    // 3. Validate the caller's email matches the invitation email
    const callerEmail = request.auth.token.email;
    if (callerEmail && invitation.email && callerEmail.toLowerCase().trim() !== invitation.email.toLowerCase().trim()) {
      throw new HttpsError('permission-denied', 'Invitation email does not match your account');
    }

    const now = new Date().toISOString();
    const membershipId = `${invitation.business_id}_${identityId}`;

    // 4. Check for existing membership
    const existingMembership = await db.collection('businessMemberships').doc(membershipId).get();
    if (existingMembership.exists) {
      throw new HttpsError('already-exists', 'You are already a member of this business');
    }

    // 5. Atomic batch: create membership + update invitation
    const batch = db.batch();

    batch.set(db.collection('businessMemberships').doc(membershipId), {
      business_id: invitation.business_id,
      identity_id: identityId,
      role: invitation.role || 'member',
      invited_by_id: invitation.invited_by_id || null,
      lifecycle_state: 'active',
      _created_date: now,
      _updated_date: now,
    });

    batch.update(inviteRef, {
      status: 'accepted',
      identity_id: identityId,
      accepted_at: now,
      _updated_date: now,
    });

    await batch.commit();

    return {
      business_id: invitation.business_id,
      role: invitation.role || 'member',
      membership_id: membershipId,
    };
  }
);