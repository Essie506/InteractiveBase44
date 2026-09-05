import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import {
  getConversation, getMessages, sendMessage, markConversationAsRead,
  acceptMessageRequest, declineMessageRequest, blockUser, isBlocked, reportUser,
  resolveParticipantDisplay, notifyRecipients, createCalendarEventFromConversation,
} from '@/lib/messaging';
import { uploadMedia } from '@/lib/media';
import { getLocalTimezone } from '@/lib/calendar';
import { ArrowLeft, Send, Paperclip, Loader2, Ban, CalendarPlus, Check, X, ShieldAlert, Flag } from 'lucide-react';
import MessageEventCard from '@/components/messaging/MessageEventCard';

export default function ConversationPage() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [otherParticipant, setOtherParticipant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const messagesEndRef = useRef(null);

  const activeContext = user?.active_context || 'personal';
  const activeBusinessId = user?.active_business_id;

  const loadData = async () => {
    if (!user || !conversationId) return;
    setLoading(true);
    try {
      const conv = await getConversation(conversationId);
      setConversation(conv);

      // Check block status
      const otherId = (conv.participant_ids || []).find(id => id !== user.id);
      if (otherId) {
        const bl = await isBlocked(user.id, otherId);
        setBlocked(bl);
        const display = await resolveParticipantDisplay(otherId);
        setOtherParticipant(display);
      }

      const msgs = await getMessages(conversationId);
      setMessages(msgs);

      // Mark as read if not pending
      if (conv.request_status !== 'pending' && !blocked) {
        await markConversationAsRead(conversationId, user.id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [user, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage({
        conversation_id: conversationId,
        sender_id: user.id,
        sender_context: activeContext,
        sender_business_id: activeContext === 'business' ? activeBusinessId : null,
        body: body.trim(),
        attachment_media_ids: attachments.map(a => a.id),
        source_id: `msg:${Date.now()}`,
      });
      setMessages([...messages, msg]);
      setBody('');
      setAttachments([]);
      await notifyRecipients(conversation, user.id, body.trim());
    } finally {
      setSending(false);
    }
  };

  const handleAttachment = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setUploading(true);
    try {
    for (const file of files) {
        const asset = await uploadMedia(file, user.id, 'personal', 'private');
        setAttachments(prev => [...prev, asset]);
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (mediaId) => {
    setAttachments(attachments.filter(a => a.id !== mediaId));
  };

  const handleAccept = async () => {
    await acceptMessageRequest(conversationId, user.id);
    loadData();
  };

  const handleDecline = async () => {
    await declineMessageRequest(conversationId, user.id);
    navigate('/messages');
  };

  const handleBlock = async () => {
    const otherId = (conversation.participant_ids || []).find(id => id !== user.id);
    await blockUser(user.id, otherId, activeContext, activeContext === 'business' ? activeBusinessId : null);
    setBlocked(true);
    setShowBlockConfirm(false);
  };

  const handleReport = async () => {
    const otherId = (conversation.participant_ids || []).find(id => id !== user.id);
    await reportUser(user.id, otherId, 'Inappropriate communication', activeContext);
    setShowReportConfirm(false);
  };

  const handleCreateCalendarEvent = async (eventData) => {
    await createCalendarEventFromConversation(conversationId, eventData);
    setShowCalendarModal(false);
    // Reload messages to show the system message
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="p-6 md:p-10 text-center">
        <p className="text-stone-500">Conversation not found.</p>
        <button onClick={() => navigate('/messages')} className="mt-3 text-indigo-600 font-medium">Back to Messages</button>
      </div>
    );
  }

  const isPending = conversation.request_status === 'pending';
  const canSend = !isPending && !blocked;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] md:h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-stone-200 bg-white">
        <button onClick={() => navigate('/messages')} className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-stone-600" />
        </button>
        <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-sm font-medium overflow-hidden">
          {otherParticipant?.avatar_url ? <img src={otherParticipant.avatar_url} alt="" className="w-full h-full object-cover" /> : otherParticipant?.display_name?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="font-semibold text-stone-800">{otherParticipant?.display_name || 'Unknown'}</div>
          {conversation.business_id && <div className="text-xs text-indigo-600">Business conversation</div>}
        </div>
        {canSend && (
          <>
            <button
              onClick={() => setShowCalendarModal(true)}
              className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
              title="Create calendar event"
            >
              <CalendarPlus className="w-5 h-5 text-stone-500" />
            </button>
            <button
              onClick={() => setShowReportConfirm(true)}
              className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
              title="Report user"
            >
              <Flag className="w-5 h-5 text-stone-500" />
            </button>
            <button
              onClick={() => setShowBlockConfirm(true)}
              className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
              title="Block user"
            >
              <Ban className="w-5 h-5 text-stone-500" />
            </button>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 space-y-3 bg-stone-50">
        {isPending && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <ShieldAlert className="w-5 h-5 text-amber-600 mx-auto mb-2" />
            <p className="text-sm text-amber-700 mb-3">{otherParticipant?.display_name} wants to start a conversation with you.</p>
            {conversation.request_message && <p className="text-sm text-stone-600 mb-3 italic">"{conversation.request_message}"</p>}
            <div className="flex gap-2 justify-center">
              <button onClick={handleAccept} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5 transition-colors">
                <Check className="w-4 h-4" /> Accept
              </button>
              <button onClick={handleDecline} className="px-4 py-2 bg-stone-100 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-200 flex items-center gap-1.5 transition-colors">
                <X className="w-4 h-4" /> Decline
              </button>
            </div>
          </div>
        )}

        {blocked && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <Ban className="w-5 h-5 text-red-600 mx-auto mb-2" />
            <p className="text-sm text-red-700">This conversation is blocked. You cannot send or receive messages.</p>
          </div>
        )}

        {messages.map(msg => {
          const isOwn = msg.sender_id === user.id;
          const isSystem = msg.message_type === 'system';
          if (isSystem) {
            return (
              <div key={msg.id} className="text-center">
                <span className="text-xs text-stone-400 bg-stone-100 px-3 py-1 rounded-full">{msg.body}</span>
              </div>
            );
          }
          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isOwn ? 'bg-indigo-600 text-white' : 'bg-white border border-stone-200 text-stone-800'}`}>
                <div className="text-sm whitespace-pre-wrap">{msg.body}</div>
                {msg.message_type === 'calendar_invite' && msg.calendar_event_id && (
                  <MessageEventCard message={msg} isOwn={isOwn} />
                )}
                {(msg.attachment_media_ids || []).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {msg.attachment_media_ids.map(id => (
                      <div key={id} className={`text-xs px-2 py-1 rounded flex items-center gap-1.5 ${isOwn ? 'bg-indigo-500' : 'bg-stone-100'}`}>
                        <Paperclip className="w-3 h-3" /> Attachment
                      </div>
                    ))}
                  </div>
                )}
                <div className={`text-[10px] mt-1 ${isOwn ? 'text-indigo-200' : 'text-stone-400'}`}>
                  {new Date(msg.created_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  {msg.sender_context === 'business' && ' · Business'}
                  {msg.sender_context === 'professional' && ' · Professional'}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      {canSend && (
        <div className="border-t border-stone-200 bg-white p-3 md:p-4">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map(a => (
                <span key={a.id} className="text-xs px-2 py-1 bg-stone-100 rounded flex items-center gap-1.5">
                  <Paperclip className="w-3 h-3" /> {a.file_name}
                  <button onClick={() => handleRemoveAttachment(a.id)} className="text-stone-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <label className="p-2.5 hover:bg-stone-100 rounded-lg cursor-pointer transition-colors">
              <Paperclip className="w-5 h-5 text-stone-500" />
              <input type="file" multiple onChange={handleAttachment} className="hidden" disabled={uploading} />
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              rows={1}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2.5 border border-stone-200 rounded-xl text-sm resize-none focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
              style={{ minHeight: '42px', maxHeight: '120px' }}
            />
            <button
              onClick={handleSend}
              disabled={!body.trim() || sending || uploading}
              className="p-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      )}

      {/* Block confirmation */}
      {showBlockConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowBlockConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Ban className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-stone-800">Block {otherParticipant?.display_name}?</h2>
            </div>
            <p className="text-sm text-stone-500 mb-5">They will not be able to send you messages. Blocking does not create a public reputation indicator.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowBlockConfirm(false)} className="flex-1 px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-medium transition-colors">Cancel</button>
              <button onClick={handleBlock} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors">Block</button>
            </div>
          </div>
        </div>
      )}

      {/* Report confirmation */}
      {showReportConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowReportConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <Flag className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-bold text-stone-800">Report {otherParticipant?.display_name}?</h2>
            </div>
            <p className="text-sm text-stone-500 mb-5">This will submit a report to Trust & Safety for review. Messaging owns the message; Trust & Safety owns the report and enforcement.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowReportConfirm(false)} className="flex-1 px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-medium transition-colors">Cancel</button>
              <button onClick={handleReport} className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors">Report</button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar event from conversation */}
      {showCalendarModal && (
        <CalendarEventFromConversationModal
          user={user}
          activeContext={activeContext}
          activeBusinessId={activeBusinessId}
          timezone={getLocalTimezone()}
          onClose={() => setShowCalendarModal(false)}
          onCreate={handleCreateCalendarEvent}
        />
      )}
    </div>
  );
}

// Minimal calendar event creation modal from within a conversation
function CalendarEventFromConversationModal({ user, activeContext, activeBusinessId, timezone, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const inputClass = "w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";

  const handleCreate = async () => {
    if (!title.trim() || !date) { setError('Title and date are required'); return; }
    setSaving(true);
    setError('');
    try {
      const startIso = new Date(`${date}T${startTime}`).toISOString();
      const endIso = new Date(`${date}T${endTime}`).toISOString();
      await onCreate({
        owner_id: user.id,
        owner_type: activeContext === 'business' ? 'business' : 'identity',
        operating_context: activeContext,
        title: title.trim(),
        start_time: startIso,
        end_time: endIso,
        timezone,
        created_by_id: user.id,
        business_id: activeContext === 'business' ? activeBusinessId : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-stone-100">
          <h2 className="text-lg font-bold text-stone-800">Create Calendar Event</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputClass} placeholder="Event title" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Start</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">End</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-xs text-stone-400">Calendar is authoritative for this event. A system message will be added to the conversation referencing the calendar event.</p>
        </div>
        <div className="flex gap-3 p-6 border-t border-stone-100">
          <button onClick={onClose} className="px-5 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-medium transition-colors">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />} Create Event
          </button>
        </div>
      </div>
    </div>
  );
}