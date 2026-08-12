// Conversation operations — server-only
// ───────────────────────────────────────────────────────────
// Firestore security rules deny client-side conversation creation
// (allow create: if false). These functions enforce:
//   - Block-state checks
//   - Message-request logic (respects recipient privacy settings)
//   - Idempotent creation (group_key deduplication)
//   - Atomic accept/decline state transitions

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { randomUUID } from 'crypto';
import { db, allowedOrigins, getIdentityId, isBlocked } from './shared';

// ── createConversation ─────────────────────────────────────

export const createConversation = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const identityId = await getIdentityId(request.auth.uid);
    const {
      participant_ids,
      initiated_by_context,
      business_id,
      conversation_type,
      request_message,
    } = request.data || {};

    if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length < 2) {
      throw new HttpsError('invalid-argument', 'A conversation requires at least two participants');
    }

    // Verify the caller is the initiator
    if (!participant_ids.includes(identityId)) {
      throw new HttpsError('permission-denied', 'Initiator must be a participant');
    }

    const otherParticipant = participant_ids.find((id: string) => id !== identityId);

    // 1. Check block state
    if (otherParticipant) {
      const blocked = await isBlocked(identityId, otherParticipant);
      if (blocked) {
        throw new HttpsError('permission-denied', 'Cannot create conversation — blocking relationship exists');
      }
    }

    // 2. Check for existing conversation (idempotent via group_key)
    const groupKey = conversation_type === 'direct'
      ? 'direct:' + [participant_ids[0], participant_ids[1]].sort().join(':')
      : `${conversation_type}:${participant_ids.sort().join(':')}${business_id ? ':' + business_id : ''}`;

    const existing = await db.collection('conversations')
      .where('group_key', '==', groupKey)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (!existing.empty) {
      const convData = existing.docs[0].data();
      return {
        conversation: { id: existing.docs[0].id, ...convData },
        isNew: false,
        requiresAcceptance: false,
      };
    }

    // 3. Check if message request is needed
    let requestStatus = 'not_required';
    if (conversation_type === 'direct' && otherParticipant) {
      const settingsSnap = await db.collection('userSettings')
        .where('identity_id', '==', otherParticipant)
        .limit(1)
        .get();
      if (!settingsSnap.empty) {
        const settings = settingsSnap.docs[0].data();
        if (settings.allow_direct_messages === false) {
          requestStatus = 'pending';
        }
      }
    }

    // 4. Create conversation
    const conversationId = randomUUID();
    const now = new Date().toISOString();

    const participantContexts = participant_ids.map((id: string) => ({
      identity_id: id,
      operating_context: id === identityId ? (initiated_by_context || 'personal') : 'personal',
      business_id: id === identityId ? (business_id || null) : null,
    }));

    const conversationData: Record<string, any> = {
      participant_ids,
      participant_contexts: participantContexts,
      conversation_type,
      business_id: business_id || null,
      initiated_by_id: identityId,
      initiated_by_context: initiated_by_context || 'personal',
      status: 'active',
      request_status: requestStatus,
      request_message: request_message || null,
      group_key: groupKey,
      last_message_preview: null,
      last_message_at: null,
      _created_date: now,
      _updated_date: now,
    };

    await db.collection('conversations').doc(conversationId).set(conversationData);

    return {
      conversation: { id: conversationId, ...conversationData },
      isNew: true,
      requiresAcceptance: requestStatus === 'pending',
    };
  }
);

// ── respondMessageRequest ──────────────────────────────────

export const respondMessageRequest = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const identityId = await getIdentityId(request.auth.uid);
    const { conversation_id, response: action } = request.data || {};

    if (!conversation_id || !['accept', 'decline'].includes(action)) {
      throw new HttpsError('invalid-argument', 'conversation_id and response (accept|decline) required');
    }

    const convRef = db.collection('conversations').doc(conversation_id);
    const convDoc = await convRef.get();

    if (!convDoc.exists) {
      throw new HttpsError('not-found', 'Conversation not found');
    }

    const conv = convDoc.data()!;

    if (conv.request_status !== 'pending') {
      throw new HttpsError('failed-precondition', 'Conversation request is not pending');
    }

    if (!conv.participant_ids?.includes(identityId)) {
      throw new HttpsError('permission-denied', 'Only a participant can respond to a message request');
    }

    const now = new Date().toISOString();

    if (action === 'accept') {
      await convRef.update({
        request_status: 'accepted',
        _updated_date: now,
      });
      return { conversation_id, request_status: 'accepted' };
    } else {
      await convRef.update({
        request_status: 'declined',
        status: 'archived',
        _updated_date: now,
      });
      return { conversation_id, request_status: 'declined', status: 'archived' };
    }
  }
);