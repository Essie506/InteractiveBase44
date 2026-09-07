// InlineConversation — renders a conversation inline (split view).
// ───────────────────────────────────────────────────────────
// Used by Messages.jsx Desktop Split View. Provides message list,
// composer with action menu, and a link to the full ConversationPage
// for advanced features (block, report, calendar event creation).
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  getConversation, getMessages, sendMessage, markConversationAsRead,
  resolveParticipantDisplay, archiveConversation,
} from '@/lib/messaging';
import { useAuth } from '@/lib/AuthContext';
import { uploadMedia } from '@/lib/media';
import {
  Send, Paperclip, Loader2, Maximize2, Archive, MoreVertical,
  CalendarPlus, X,
} from 'lucide-react';

export default function InlineConversation({ conversationId, onBack, onArchived }) {
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [otherParticipant, setOtherParticipant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user || !conversationId) return;
    setLoading(true);
    (async () => {
      try {
        const conv = await getConversation(conversationId);
        setConversation(conv);
        const otherId = (conv.participant_ids || []).find(id => id !== user.id);
        if (otherId) {
          const display = await resolveParticipantDisplay(otherId);
          setOtherParticipant(display);
        }
        const msgs = await getMessages(conversationId);
        setMessages(msgs);
        if (conv.request_status !== 'pending') {
          await markConversationAsRead(conversationId, user.id).catch(() => {});
        }
      } catch (err) {
        console.error('[InlineConversation] Load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!body.trim() || sending || !conversation) return;
    setSending(true);
    try {
      const msg = await sendMessage({
        conversation_id: conversationId,
        sender_id: user.id,
        sender_context: user.active_context || 'personal',
        sender_business_id: user.active_context === 'business' ? user.active_business_id : null,
        body: body.trim(),
        attachment_media_ids: attachments.map(a => a.id),
        source_id: `split:${Date.now()}`,
      });
      setMessages(prev => [...prev, msg]);
      setBody('');
      setAttachments([]);
    } catch (err) {
      console.error('[InlineConversation] Send failed:', err);
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
    } catch (err) {
      console.error('[InlineConversation] Upload failed:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleArchive = async () => {
    if (!conversation) return;
    await archiveConversation(conversationId);
    if (onArchived) onArchived();
    else if (onBack) onBack();
  };

  if (!conversationId) {
    return (
      <div className="hidden md:flex flex-col items-center justify-center h-full text-center p-8">
        <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mb-3">
          <Send className="w-7 h-7 text-stone-300" />
        </div>
        <h3 className="text-sm font-medium text-stone-700 mb-1">Select a conversation</h3>
        <p className="text-sm text-stone-400">Choose a conversation from the list to view messages.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <p className="text-sm text-stone-500">Conversation not found.</p>
      </div>
    );
  }

  const isPending = conversation.request_status === 'pending';
  const canSend = !isPending && conversation.status === 'active';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-200 bg-white shrink-0">
        {onBack && (
          <button onClick={onBack} className="md:hidden p-1.5 hover:bg-stone-100 rounded-lg">
            <X className="w-4 h-4 text-stone-600" />
          </button>
        )}
        <Link
          to={otherParticipant?.screen_name ? `/p/${otherParticipant.screen_name}` : '#'}
          className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
        >
          <div className="w-9 h-9 rounded-full bg-stone-200 flex items-center justify-center text-sm font-medium overflow-hidden shrink-0">
            {otherParticipant?.avatar_url ? (
              <img src={otherParticipant.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              otherParticipant?.display_name?.[0]?.toUpperCase()
            )}
          </div>
          <span className="text-sm font-medium text-stone-800 truncate">
            {otherParticipant?.display_name || 'Unknown'}
          </span>
        </Link>
        <div className="flex-1" />
        <Link
          to={`/messages/${conversationId}`}
          className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          title="Open full view"
        >
          <Maximize2 className="w-4 h-4 text-stone-500" />
        </Link>
        <button
          onClick={handleArchive}
          className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          title="Archive conversation"
        >
          <Archive className="w-4 h-4 text-stone-500" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 md:p-4 space-y-2 bg-stone-50">
        {isPending && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <p className="text-xs text-amber-700">This conversation has a pending message request. Open full view to accept or decline.</p>
            <Link to={`/messages/${conversationId}`} className="text-xs text-indigo-600 font-medium hover:underline mt-1 inline-block">
              Open full view →
            </Link>
          </div>
        )}
        {messages.map(msg => {
          const isOwn = msg.sender_id === user.id;
          if (msg.message_type === 'system') {
            return (
              <div key={msg.id} className="text-center">
                <span className="text-xs text-stone-400 bg-stone-100 px-3 py-1 rounded-full">{msg.body}</span>
              </div>
            );
          }
          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${isOwn ? 'bg-indigo-600 text-white' : 'bg-white border border-stone-200 text-stone-800'}`}>
                <div className="text-sm whitespace-pre-wrap break-words">{msg.body}</div>
                {(msg.attachment_media_ids || []).length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {msg.attachment_media_ids.map(id => (
                      <div key={id} className={`text-xs px-2 py-1 rounded flex items-center gap-1.5 ${isOwn ? 'bg-indigo-500' : 'bg-stone-100'}`}>
                        <Paperclip className="w-3 h-3" /> Attachment
                      </div>
                    ))}
                  </div>
                )}
                <div className={`text-[10px] mt-0.5 ${isOwn ? 'text-indigo-200' : 'text-stone-400'}`}>
                  {new Date(msg.created_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      {canSend && (
        <div className="border-t border-stone-200 bg-white p-3 shrink-0">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map(a => (
                <span key={a.id} className="text-xs px-2 py-1 bg-stone-100 rounded flex items-center gap-1.5">
                  <Paperclip className="w-3 h-3" /> {a.file_name}
                  <button onClick={() => setAttachments(prev => prev.filter(x => x.id !== a.id))} className="text-stone-400 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            {/* Composer action menu */}
            <div className="relative">
              <button
                onClick={() => setShowActionMenu(!showActionMenu)}
                className="p-2.5 hover:bg-stone-100 rounded-lg transition-colors"
                title="Actions"
              >
                <MoreVertical className="w-5 h-5 text-stone-500" />
              </button>
              {showActionMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowActionMenu(false)} />
                  <div className="absolute bottom-full mb-1 left-0 z-20 bg-white border border-stone-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                    <button
                      onClick={() => { setShowActionMenu(false); fileInputRef.current?.click(); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    >
                      <Paperclip className="w-3.5 h-3.5" /> Attach file
                    </button>
                    <Link
                      to={`/messages/${conversationId}`}
                      onClick={() => setShowActionMenu(false)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" /> Calendar event
                    </Link>
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleAttachment}
                className="hidden"
                disabled={uploading}
              />
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              rows={1}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-sm resize-none focus:outline-none focus:border-indigo-400"
              style={{ minHeight: '38px', maxHeight: '100px' }}
            />
            <button
              onClick={handleSend}
              disabled={!body.trim() || sending || uploading}
              className="p-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}