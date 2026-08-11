import { base44 } from '@/api/base44Client';
import { messagingRepository, blockRepository, profileRepository, settingsRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';
import { createNotification } from '@/lib/notifications';

// Messaging System — M3: routes to Firebase when configured.
// Conversation CREATION is server-only (security rules: allow create: if false).
// In Firebase mode, createOrGetConversation calls the CreateConversation
// backend function which enforces block-state and message-request rules.
// Messages can be created by clients when the conversation is accepted.

function directConversationKey(identityA, identityB) {
  return 'direct:' + [identityA, identityB].sort().join(':');
}

export async function isBlocked(identityA, identityB) {
  if (useFirebase) {
    const aBlocksB = await blockRepository.blockExists(identityA, identityB);
    const bBlocksA = await blockRepository.blockExists(identityB, identityA);
    return aBlocksB || bBlocksA;
  }
  const blocks = await base44.entities.BlockRecord.filter({
    $or: [
      { blocker_id: identityA, blocked_id: identityB, status: 'active' },
      { blocker_id: identityB, blocked_id: identityA, status: 'active' },
    ],
  });
  return blocks.length > 0;
}

export async function blockUser(blockerId, blockedId, context = 'personal', businessId = null, reason = null) {
  if (useFirebase) {
    const existing = await blockRepository.getBlock(blockerId, blockedId);
    if (existing && existing.status === 'active') return existing;
    return blockRepository.createBlock({
      blocker_id: blockerId,
      blocked_id: blockedId,
      blocker_context: context,
      blocker_business_id: businessId,
      reason,
      status: 'active',
    });
  }
  const existing = await base44.entities.BlockRecord.filter({
    blocker_id: blockerId, blocked_id: blockedId, status: 'active',
  });
  if (existing.length > 0) return existing[0];
  return base44.entities.BlockRecord.create({
    blocker_id: blockerId, blocked_id: blockedId,
    blocker_context: context, blocker_business_id: businessId, reason, status: 'active',
  });
}

export async function unblockUser(blockerId, blockedId) {
  if (useFirebase) {
    await blockRepository.removeBlock(blockerId, blockedId);
    return;
  }
  const existing = await base44.entities.BlockRecord.filter({
    blocker_id: blockerId, blocked_id: blockedId, status: 'active',
  });
  for (const block of existing) {
    await base44.entities.BlockRecord.update(block.id, { status: 'removed' });
  }
}

async function checkMessageRequestNeeded(recipientId) {
  if (useFirebase) {
    const settings = await settingsRepository.getUserSettings(recipientId);
    if (!settings) return false;
    return !settings.allow_direct_messages;
  }
  const settings = await base44.entities.UserSetting.filter({ identity_id: recipientId });
  if (settings.length === 0) return false;
  return !settings[0].allow_direct_messages;
}

// Get or create a conversation — server-only in Firebase mode
export async function createOrGetConversation(participantIds, initiatedById, initiatedByContext, options = {}) {
  const { businessId = null, conversationType = 'direct', requestMessage = null } = options;

  if (participantIds.length < 2) {
    throw new Error('A conversation requires at least two participants');
  }

  if (useFirebase) {
    // Server-only: call the CreateConversation backend function
    const response = await base44.functions.invoke('CreateConversation', {
      participant_ids: participantIds,
      initiated_by_id: initiatedById,
      initiated_by_context: initiatedByContext,
      business_id: businessId,
      conversation_type: conversationType,
      request_message: requestMessage,
    });
    return response.data || response;
  }

  // Base44 path (existing logic)
  const otherParticipant = participantIds.find(id => id !== initiatedById);
  if (otherParticipant) {
    const blocked = await isBlocked(initiatedById, otherParticipant);
    if (blocked) throw new Error('Cannot create conversation — blocking relationship exists');
  }

  const groupKey = conversationType === 'direct'
    ? directConversationKey(participantIds[0], participantIds[1])
    : `${conversationType}:${participantIds.sort().join(':')}${businessId ? ':' + businessId : ''}`;

  const existing = await base44.entities.Conversation.filter({ group_key: groupKey, status: 'active' });
  if (existing.length > 0) {
    return { conversation: existing[0], isNew: false, requiresAcceptance: false };
  }

  let requestStatus = 'not_required';
  if (conversationType === 'direct' && otherParticipant) {
    const needsRequest = await checkMessageRequestNeeded(otherParticipant);
    if (needsRequest) requestStatus = 'pending';
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

export async function sendMessage(data) {
  const {
    conversation_id, sender_id, sender_context, sender_business_id,
    body, attachment_media_ids = [], message_type = 'text',
    source_id = null, calendar_event_id = null, system_event = null,
  } = data;

  if (useFirebase) {
    // Idempotency check
    if (source_id) {
      const messages = await messagingRepository.listMessages(conversation_id);
      const existing = messages.find(m => m.source_id === source_id);
      if (existing) return existing;
    }

    const message = await messagingRepository.createMessage(conversation_id, {
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

    // Update conversation projection
    const preview = body.length > 80 ? body.substring(0, 80) + '…' : body;
    await messagingRepository.updateConversation(conversation_id, {
      last_message_preview: preview,
      last_message_at: new Date().toISOString(),
    });

    return message;
  }

  // Base44 path
  if (source_id) {
    const existing = await base44.entities.Message.filter({ conversation_id, source_id });
    if (existing.length > 0) return existing[0];
  }

  const message = await base44.entities.Message.create({
    conversation_id, sender_id,
    sender_context: sender_context || 'personal',
    sender_business_id: sender_business_id || null,
    body, attachment_media_ids, message_type,
    status: 'sent', read_by: [sender_id],
    source_id, calendar_event_id, system_event,
  });

  const preview = body.length > 80 ? body.substring(0, 80) + '…' : body;
  await base44.entities.Conversation.update(conversation_id, {
    last_message_preview: preview,
    last_message_at: new Date().toISOString(),
  });

  return message;
}

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
    } catch { /* Notification failure does not undo the message */ }
  }
  await maybeSendAwayResponse(conversation, senderId);
}

export async function getConversations(identityId) {
  if (useFirebase) return messagingRepository.listConversationsForParticipant(identityId);
  const all = await base44.entities.Conversation.filter({ status: 'active' }, '-last_message_at', 100);
  return all.filter(c => (c.participant_ids || []).includes(identityId));
}

export async function getConversation(conversationId) {
  if (useFirebase) return messagingRepository.getConversation(conversationId);
  return base44.entities.Conversation.get(conversationId);
}

export async function updateConversation(conversationId, data) {
  if (useFirebase) return messagingRepository.updateConversation(conversationId, data);
  return base44.entities.Conversation.update(conversationId, data);
}

export async function getMessages(conversationId) {
  if (useFirebase) return messagingRepository.listMessages(conversationId);
  return base44.entities.Message.filter({ conversation_id: conversationId }, 'created_date', 200);
}

export async function markConversationAsRead(conversationId, identityId) {
  if (useFirebase) {
    const messages = await messagingRepository.listMessages(conversationId);
    const unread = messages.filter(m => !(m.read_by || []).includes(identityId));
    for (const msg of unread) {
      await messagingRepository.updateConversation(conversationId, {}); // no-op to keep pattern
      // Update each message's read_by — need a message update function
      // For now, use the conversation update as a proxy
    }
    // TODO: Add updateMessage to repository
    return;
  }
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

export async function acceptMessageRequest(conversationId, identityId) {
  let conversation;
  if (useFirebase) {
    conversation = await messagingRepository.getConversation(conversationId);
  } else {
    conversation = await base44.entities.Conversation.get(conversationId);
  }

  if (!conversation || conversation.request_status !== 'pending') return conversation;
  if (!(conversation.participant_ids || []).includes(identityId)) return conversation;

  if (useFirebase) {
    const updated = await messagingRepository.updateConversation(conversationId, {
      request_status: 'accepted',
    });
  } else {
    await base44.entities.Conversation.update(conversationId, { request_status: 'accepted' });
  }

  if (conversation.request_message) {
    await sendMessage({
      conversation_id: conversationId,
      sender_id: conversation.initiated_by_id,
      sender_context: conversation.initiated_by_context || 'personal',
      body: conversation.request_message,
      source_id: `request_msg:${conversationId}`,
    });
  }

  await sendMessage({
    conversation_id: conversationId,
    sender_id: identityId,
    body: 'Message request accepted',
    message_type: 'system',
    system_event: 'conversation_accepted',
    source_id: `accept:${conversationId}:${identityId}`,
  });

  if (useFirebase) return messagingRepository.getConversation(conversationId);
  return base44.entities.Conversation.get(conversationId);
}

export async function declineMessageRequest(conversationId, identityId) {
  let conversation;
  if (useFirebase) {
    conversation = await messagingRepository.getConversation(conversationId);
  } else {
    conversation = await base44.entities.Conversation.get(conversationId);
  }

  if (!conversation || conversation.request_status !== 'pending') return conversation;
  if (!(conversation.participant_ids || []).includes(identityId)) return conversation;

  if (useFirebase) {
    return messagingRepository.updateConversation(conversationId, {
      request_status: 'declined',
      status: 'archived',
    });
  }
  return base44.entities.Conversation.update(conversationId, {
    request_status: 'declined',
    status: 'archived',
  });
}

export async function archiveConversation(conversationId) {
  if (useFirebase) return messagingRepository.updateConversation(conversationId, { status: 'archived' });
  return base44.entities.Conversation.update(conversationId, { status: 'archived' });
}

export async function findUserByEmail(email) {
  const response = await base44.functions.invoke('FindUserByEmail', { email: email.trim() });
  return response.data || response;
}

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

export async function resolveParticipants(identityIds) {
  try {
    const response = await base44.functions.invoke('ResolveParticipants', { identity_ids: identityIds });
    const data = response.data || response;
    return data.results || {};
  } catch {
    return {};
  }
}

export async function getUnreadMessageCount(identityId) {
  const conversations = await getConversations(identityId);
  let count = 0;
  for (const conv of conversations) {
    const messages = await getMessages(conv.id);
    count += messages.filter(m => m.sender_id !== identityId && !(m.read_by || []).includes(identityId)).length;
  }
  return count;
}

export async function reportUser(reporterId, reportedId, reason, context = 'personal') {
  if (useFirebase) {
    // TrustSignals are server-only — call a backend function
    const response = await base44.functions.invoke('CreateTrustSignal', {
      source_system: 'trust_safety',
      target_type: 'professional',
      target_id: reportedId,
      signal_type: 'reported',
      signal_data: JSON.stringify({ reporter_id: reporterId, reason, context }),
      operation_id: `report:${reporterId}:${reportedId}:${Date.now()}`,
    });
    return response.data || response;
  }
  return base44.entities.TrustSignal.create({
    source_system: 'trust_safety',
    target_type: 'professional',
    target_id: reportedId,
    signal_type: 'reported',
    signal_data: JSON.stringify({ reporter_id: reporterId, reason, context }),
    operation_id: `report:${reporterId}:${reportedId}:${Date.now()}`,
  });
}

async function maybeSendAwayResponse(conversation, senderId) {
  const recipientId = (conversation.participant_ids || []).find(id => id !== senderId);
  if (!recipientId) return;

  try {
    let profile;
    if (useFirebase) {
      profile = await profileRepository.getProfessionalProfile(recipientId);
      if (!profile || profile.lifecycle_state !== 'active') return;
    } else {
      const profiles = await base44.entities.ProfessionalProfile.filter({ identity_id: recipientId, lifecycle_state: 'active' });
      if (profiles.length === 0) return;
      profile = profiles[0];
    }

    if (!profile.away_message_enabled || !profile.away_message) return;

    await sendMessage({
      conversation_id: conversation.id,
      sender_id: recipientId,
      sender_context: 'professional',
      body: `[Away Message] ${profile.away_message}`,
      message_type: 'system',
      system_event: 'away_response',
      source_id: `away:${conversation.id}:${Date.now()}`,
    });
  } catch { /* Away message failure does not affect the original message */ }
}

export async function createCalendarEventFromConversation(conversationId, eventData) {
  const { createEvent } = await import('@/lib/calendar');
  const event = await createEvent(eventData);

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