import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  getAccessToken,
  getProjectId,
  toFirestoreFields,
  firestoreBatchWrite,
  docPath,
} from '../../shared/firebaseAdmin.ts';

// ───────────────────────────────────────────────────────────
// CreateConversation — Server-only conversation creation
// ───────────────────────────────────────────────────────────
// Firestore security rules deny client-side conversation creation
// (allow create: if false). This function enforces:
//   - Block-state checks (no conversation between blocked users)
//   - Message-request logic (respects recipient privacy settings)
//   - Idempotent creation (group_key deduplication)
//
// Reads from Base44 (data in sync during transition) and writes to
// Firestore (new authoritative store).

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const {
      participant_ids,
      initiated_by_id,
      initiated_by_context,
      business_id,
      conversation_type,
      request_message,
    } = body;

    if (!participant_ids || participant_ids.length < 2) {
      return Response.json(
        { error: 'A conversation requires at least two participants' },
        { status: 400 }
      );
    }

    // 1. Check block state
    const otherParticipant = participant_ids.find((id: string) => id !== initiated_by_id);
    if (otherParticipant) {
      const blocks = await base44.asServiceRole.entities.BlockRecord.filter({
        $or: [
          { blocker_id: initiated_by_id, blocked_id: otherParticipant, status: 'active' },
          { blocker_id: otherParticipant, blocked_id: initiated_by_id, status: 'active' },
        ],
      });
      if (blocks.length > 0) {
        return Response.json(
          { error: 'Cannot create conversation — blocking relationship exists' },
          { status: 403 }
        );
      }
    }

    // 2. Check for existing conversation (idempotent via group_key)
    const groupKey = conversation_type === 'direct'
      ? 'direct:' + [participant_ids[0], participant_ids[1]].sort().join(':')
      : `${conversation_type}:${participant_ids.sort().join(':')}${business_id ? ':' + business_id : ''}`;

    const existing = await base44.asServiceRole.entities.Conversation.filter({
      group_key: groupKey,
      status: 'active',
    });
    if (existing.length > 0) {
      return Response.json({
        conversation: existing[0],
        isNew: false,
        requiresAcceptance: false,
      });
    }

    // 3. Check if message request is needed
    let requestStatus = 'not_required';
    if (conversation_type === 'direct' && otherParticipant) {
      const settings = await base44.asServiceRole.entities.UserSetting.filter({
        identity_id: otherParticipant,
      });
      if (settings.length > 0 && !settings[0].allow_direct_messages) {
        requestStatus = 'pending';
      }
    }

    // 4. Create conversation in Firestore
    const token = await getAccessToken();
    const projectId = getProjectId();
    const conversationId = crypto.randomUUID();

    const participantContexts = participant_ids.map((id: string) => ({
      identity_id: id,
      operating_context: id === initiated_by_id ? initiated_by_context : 'personal',
      business_id: id === initiated_by_id ? business_id : null,
    }));

    const conversationData: Record<string, any> = {
      participant_ids,
      participant_contexts: participantContexts,
      conversation_type,
      business_id: business_id || null,
      initiated_by_id,
      initiated_by_context: initiated_by_context || 'personal',
      status: 'active',
      request_status: requestStatus,
      request_message: request_message || null,
      group_key: groupKey,
      last_message_preview: null,
      last_message_at: null,
      _created_date: new Date().toISOString(),
      _updated_date: new Date().toISOString(),
    };

    await firestoreBatchWrite(projectId, [{
      name: docPath(projectId, 'conversations', conversationId),
      fields: toFirestoreFields(conversationData),
    }], token);

    return Response.json({
      conversation: { id: conversationId, ...conversationData },
      isNew: true,
      requiresAcceptance: requestStatus === 'pending',
    });
  } catch (error) {
    return Response.json(
      { error: error.message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}