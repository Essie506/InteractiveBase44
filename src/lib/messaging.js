import { base44 } from '@/api/base44Client';
import { createNotification } from '@/lib/notifications';

// Messaging System — owns Conversations, Messages, Message Requests, message state.
// Connected systems reference Messaging through stable IDs/contracts.

// Generate a deterministic group key for a direct conversation (idempotent)
function directConversationKey(identityA, identityB) {
  return 'direct:' + [identityA, identityB].sort().join(':');
}

// Check if either party has blocked the other
export async function isBlocked(identityA, identityB) {
  const blocks = await base44.entities.BlockRecord.filter({
    $or: [
      { blocker_id: identityA, blocked_id: identityB, status: 'active' },
      { blocker_id: identityB, blocked_id: identityA, status: 'active' },
    ],
  });
  return blocks.length > 0;
}

// Block a user (prevents communication; does NOT create a public reputation indicator)
export async function blockUser(blockerId, blockedId, context = 'personal', businessId = null, reason = null) {
  // Check if already blocked
  const existing = await base44.entities.BlockRecord.filter({
    blocker_id: blockerId,
    blocked_id: blockedId,
    status: 'active',
  });
  if (existing.length > 0) return existing[0];

  return base44.entities.BlockRecord.create({
    blocker_id: blockerId,
    blocked_id: blockedId,
    blocker_context: context,
    blocker_business_id: businessId,
    reason,
    status: 'active',
  });
}

// Unblock a user
export async function unblockUser(blockerId, blockedId) {
  const existing = await base44.entities.BlockRecord.filter({
    blocker_id: blockerId,
    blocked_id: blockedId,
    status: 'active',
  });
  for (const block of existing) {
    await base44.entities.BlockRecord.update(block.id, { status: 'removed' });
  }
}

// Check if a message request is needed (recipient's privacy settings)
async function checkMessageRequestNeeded(recipientId) {
  const settings = await base44.entities.UserSetting.filter({ identity_id: recipientId });
  if (settings.length === 0) return false; // Default: allow
  return !settings[0].allow_direct_messages;
}

// Get or create a conversation between two identities (idempotent)
// Returns { conversation, isNew, requiresAcceptance }
export async function createOrGetConversation(participantIds, initiatedById, initiatedByContext, options = {}) {
  const { businessId = null, conversationType = 'direct', requestMessage = null } = options;

  if (participantIds.length < 2) {
    throw new Error('A conversation requires at least two participants');
  }

  // Check block status
  const otherParticipant = participantIds.find(id => id !== initiatedById);
  if (otherParticipant) {
    const blocked = await isBlocked(initiatedById, otherParticipant);
    if (blocked) {
      throw new Error('Cannot create conversation — blocking relationship exists');
    }
  }

  const groupKey = conversationType === 'direct'
    ? directConversationKey(participantIds[0], participantIds[1])
    : `${conversationType}:${participantIds.sort().join(':')}${businessId ? ':' + businessId : ''}`;

  // Check for existing conversation
  const existing = await base44.entities.Conversation.filter({ group_key: groupKey, status: 'active' });
  if (existing.length > 0) {
    return { conversation: existing[0], isNew: false, requiresAcceptance: false };
  }

  // Determine if a message request is needed
  let requestStatus = 'not_required';
  if (conversationType === 'direct' && otherParticipant) {
    const needsRequest = await checkMessageRequestNeeded(otherParticipant);
    if (needsRequest) {
      requestStatus = 'pending';
    }
  }

  const participantContexts = participantIds.map(id => ({
    identity_id: id,
    operating_context: id === initiatedById ? initiatedByContext : 'personal',
    business_id: id === initiatedById ? businessId : null,
  }));

  const conversation = await base44.entities.Conversation.create({
    participant_ids: participantIds,
    participant_contexts: participantContexts,
    conversation_type: conversationType,
    business_id: businessId,
    initiated_by_id: initiatedById,
    initiated_by_context: initiatedByContext,
    status: 'active',
    request_status: requestStatus,
    request_message: requestMessage,
    group_key: groupKey,
  });

  return { conversation, isNew: true, requiresAcceptance: requestStatus === 'pending' };
}

// Send a message (idempotent via source_id)
export async function sendMessage(data) {
  const {
    conversation_id, sender_id, sender_context, sender_business_id,
    body, attachment_media_ids = [], message_type = 'text',
    source_id = null, calendar_event_id = null, system_event = null,
  } = data;

  // Idempotency check
  if (source_id) {
    const existing = await base44.entities.Message.filter({ conversation_id, source_id });
    if (existing.length > 0) return existing[0];
  }

  const message = await base44.entities.Message.create({
    conversation_id,
    sender_id,
    sender_context: sender_context || 'personal',
    sender_business_id: sender_business_id || null,
    body,
    attachment_media_ids,
    message_type,
    status: 'sent',
    read_by: [sender_id],
    source_id,
    calendar_event_id,
    system_event,
  });

  // Update conversation projection (rebuildable from messages)
  const preview = body.length > 80 ? body.substring(0, 80) + '…' : body;
  await base44.entities.Conversation.update(conversation_id, {
    last_message_preview: preview,
    last_message_at: new Date().toISOString(),
  });

  return message;
}

// Notify recipients of a new message (failure isolated — doesn't undo the message)
export async function notifyRecipients(conversation, senderId, messageBody) {
  const recipients = (conversation.participant_ids || []).filter(id => id !== senderId);
  for (const recipientId of recipients) {
    try {
      const isRequest = conversation.request_status === 'pending';
      await createNotification({
        recipient_id: recipientId,
        source_system: 'messaging',
        event_type: isRequest ? 'message_request_received' : 'message_received',
        title: isRequest ? 'New Message Request' : 'New Message',
        body: messageBody.length > 100 ? messageBody.substring(0, 100) + '…' : messageBody,
        category: 'messaging',
        action_url: `/messages/${conversation.id}`,
        action_label: 'Open Conversation',
        source_id: conversation.id,
      });
    } catch {
      // Notification failure does not undo the message
    }
  }
  // Check and send away message auto-response (failure isolated)
  await maybeSendAwayResponse(conversation, senderId);
}

// Get all conversations for an identity
export async function getConversations(identityId) {
  const all = await base44.entities.Conversation.filter({ status: 'active' }, '-last_message_at', 100);
  return all.filter(c => (c.participant_ids || []).includes(identityId));
}

// Get a single conversation
export async function getConversation(conversationId) {
  return base44.entities.Conversation.get(conversationId);
}

// Get messages in a conversation
export async function getMessages(conversationId) {
  return base44.entities.Message.filter({ conversation_id: conversationId }, 'created_date', 200);
}

// Mark all messages in a conversation as read by an identity
export async function markConversationAsRead(conversationId, identityId) {
  const messages = await base44.entities.Message.filter({ conversation_id: conversationId });
  const unread = messages.filter(m => !(m.read_by || []).includes(identityId));
  if (unread.length === 0) return;

  await base44.entities.Message.bulkUpdate(
    unread.map(m => ({
      id: m.id,
      read_by: [...new Set([...(m.read_by || []), identityId])],
      status: 'read',
    }))
  );
}

// Accept a message request
export async function acceptMessageRequest(conversationId, identityId) {
  const conversation = await base44.entities.Conversation.get(conversationId);
  if (!conversation || conversation.request_status !== 'pending') return conversation;
  if (!(conversation.participant_ids || []).includes(identityId)) return conversation;

  const updated = await base44.entities.Conversation.update(conversationId, {
    request_status: 'accepted',
  });

  // Add the original request message as the first message from the initiator
  if (conversation.request_message) {
    await sendMessage({
      conversation_id: conversationId,
      sender_id: conversation.initiated_by_id,
      sender_context: conversation.initiated_by_context || 'personal',
      body: conversation.request_message,
      source_id: `request_msg:${conversationId}`,
    });
  }

  // Add a system message
  await sendMessage({
    conversation_id: conversationId,
    sender_id: identityId,
    body: 'Message request accepted',
    message_type: 'system',
    system_event: 'conversation_accepted',
    source_id: `accept:${conversationId}:${identityId}`,
  });

  return updated;
}

// Decline a message request
export async function declineMessageRequest(conversationId, identityId) {
  const conversation = await base44.entities.Conversation.get(conversationId);
  if (!conversation || conversation.request_status !== 'pending') return conversation;
  if (!(conversation.participant_ids || []).includes(identityId)) return conversation;

  return base44.entities.Conversation.update(conversationId, {
    request_status: 'declined',
    status: 'archived',
  });
}

// Archive a conversation
export async function archiveConversation(conversationId) {
  return base44.entities.Conversation.update(conversationId, {
    status: 'archived',
  });
}

// Resolve participant display info from authoritative sources (profiles)
// Uses backend function to bypass built-in user list restriction.
export async function resolveParticipantDisplay(identityId) {
  try {
    const response = await base44.functions.invoke('ResolveParticipants', { identity_ids: [identityId] });
    const data = response.data || response;
    if (data.results && data.results[identityId]) {
      return data.results[identityId];
    }
    return { identity_id: identityId, display_name: 'Unknown User', avatar_url: null };
  } catch {
    return { identity_id: identityId, display_name: 'Unknown User', avatar_url: null };
  }
}

// Batch resolve display info for multiple identities (more efficient)
export async function resolveParticipants(identityIds) {
  try {
    const response = await base44.functions.invoke('ResolveParticipants', { identity_ids: identityIds });
    const data = response.data || response;
    return data.results || {};
  } catch {
    return {};
  }
}

// Get unread message count for an identity across all conversations
export async function getUnreadMessageCount(identityId) {
  const conversations = await getConversations(identityId);
  let count = 0;
  for (const conv of conversations) {
    const messages = await base44.entities.Message.filter({ conversation_id: conv.id });
    count += messages.filter(m => m.sender_id !== identityId && !(m.read_by || []).includes(identityId)).length;
  }
  return count;
}

// Report a user — Trust & Safety integration boundary.
// Messaging owns the message; Trust & Safety owns the report (via TrustSignal).
// This creates a TrustSignal stub that the future Trust & Safety system will consume.
export async function reportUser(reporterId, reportedId, reason, context = 'personal') {
  return base44.entities.TrustSignal.create({
    source_system: 'trust_safety',
    target_type: 'professional',
    target_id: reportedId,
    signal_type: 'reported',
    signal_data: JSON.stringify({ reporter_id: reporterId, reason, context }),
    operation_id: `report:${reporterId}:${reportedId}:${Date.now()}`,
  });
}

// Check and send away message auto-response (scoped to professional context)
// Does not impersonate another operating context — the system message clearly identifies it as an away message.
async function maybeSendAwayResponse(conversation, senderId) {
  const recipientId = (conversation.participant_ids || []).find(id => id !== senderId);
  if (!recipientId) return;

  try {
    const profiles = await base44.entities.ProfessionalProfile.filter({ identity_id: recipientId, lifecycle_state: 'active' });
    if (profiles.length === 0) return;
    const profile = profiles[0];
    if (!profile.away_message_enabled || !profile.away_message) return;

    // Send the away message as a system message (clearly identified, not impersonating)
    await sendMessage({
      conversation_id: conversation.id,
      sender_id: recipientId,
      sender_context: 'professional',
      body: `[Away Message] ${profile.away_message}`,
      message_type: 'system',
      system_event: 'away_response',
      source_id: `away:${conversation.id}:${Date.now()}`,
    });
  } catch {
    // Away message failure does not affect the original message
  }
}

// Create a calendar event from a conversation (Calendar/Messaging integration)
// Calendar remains authoritative for the calendar record.
export async function createCalendarEventFromConversation(conversationId, eventData) {
  const { createEvent } = await import('@/lib/calendar');
  const event = await createEvent(eventData);

  // Add a system message in the conversation referencing the calendar event
  await sendMessage({
    conversation_id: conversationId,
    sender_id: eventData.created_by_id,
    sender_context: eventData.operating_context || 'personal',
    body: `Calendar event created: ${eventData.title}`,
    message_type: 'calendar_invite',
    calendar_event_id: event.id,
    source_id: `cal:${event.id}`,
  });

  return event;
}