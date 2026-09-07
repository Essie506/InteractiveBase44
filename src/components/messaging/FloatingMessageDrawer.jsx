// FloatingMessageDrawer — persistent messaging access across the platform.
// ───────────────────────────────────────────────────────────
// Spec 13 Messaging V2: messaging remains available while the user
// continues using the platform. This component provides:
//   - Floating action button (closed state)
//   - Right-side slide-over panel with conversation list
//   - Inline conversation view with composer
//   - Minimised chat bar (restorable)
//
// The same conversation backend (lib/messaging) is used as the full
// Messages page and ConversationPage — no duplicate conversation state.
// Switching between drawer / full page / conversation page does not
// create another conversation or lose history.
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import {
  getConversations, getMessages, sendMessage, markConversationAsRead,
  resolveParticipantDisplay,
} from '@/lib/messaging';
import { MessageSquare, X, Minus, ArrowLeft, Send, Loader2, Maximize2 } from 'lucide-react';

export default function FloatingMessageDrawer() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [otherParticipant, setOtherParticipant] = useState(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [displayCache, setDisplayCache] = useState({});
  const messagesEndRef = useRef(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      const convs = await getConversations(user.id);
      setConversations(convs);
      const ids = new Set();
      for (const conv of convs) {
        for (const pid of conv.participant_ids || []) {
          if (pid !== user.id && !displayCache[pid]) ids.add(pid);
        }
      }
      if (ids.size > 0) {
        const resolved = {};
        for (const id of [...ids]) {
          try { resolved[id] = await resolveParticipantDisplay(id); } catch { /* ignore */ }
        }
        setDisplayCache(prev => ({ ...prev, ...resolved }));
      }
    } catch (err) {
      console.error('[FloatingMessageDrawer] Failed to load conversations:', err);
    }
  }, [user]);

  useEffect(() => {
    if (open && user) loadConversations();
  }, [open, user]);

  useEffect(() => {
    if (!activeConv || !user) return;
    (async () => {
      setLoading(true);
      try {
        const msgs = await getMessages(activeConv.id);
        setMessages(msgs);
        const otherId = (activeConv.participant_ids || []).find(id => id !== user.id);
        if (otherId) {
          const display = await resolveParticipantDisplay(otherId);
          setOtherParticipant(display);
          if (activeConv.request_status !== 'pending') {
            await markConversationAsRead(activeConv.id, user.id).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[FloatingMessageDrawer] Failed to load messages:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeConv, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!body.trim() || sending || !activeConv || !user) return;
    setSending(true);
    try {
      const msg = await sendMessage({
        conversation_id: activeConv.id,
        sender_id: user.id,
        sender_context: user.active_context || 'personal',
        body: body.trim(),
        source_id: `drawer:${Date.now()}`,
      });
      setMessages(prev => [...prev, msg]);
      setBody('');
    } catch (err) {
      console.error('[FloatingMessageDrawer] Failed to send:', err);
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  // Minimised chat bar
  if (open && minimized) {
    return (
      <div className="fixed bottom-20 md:bottom-4 right-4 z-40">
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm font-medium max-w-[120px] truncate">
            {activeConv ? (otherParticipant?.display_name || 'Chat') : 'Messages'}
          </span>
        </button>
      </div>
    );
  }

  // Floating action button (closed state)
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 md:bottom-4 right-4 z-40 w-12 h-12 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-colors flex items-center justify-center"
        title="Open messages"
      >
        <MessageSquare className="w-5 h-5" />
      </button>
    );
  }

  // Open panel — right-side slide-over
  return (
    <div className="fixed bottom-0 md:bottom-4 right-0 md:right-4 z-[60] w-full md:w-96 h-[75vh] md:h-[600px] md:max-h-[80vh] bg-white rounded-none md:rounded-2xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 bg-white shrink-0">
        {activeConv ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button onClick={() => { setActiveConv(null); setMessages([]); }} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors shrink-0">
              <ArrowLeft className="w-4 h-4 text-stone-600" />
            </button>
            <Link to={`/messages/${activeConv.id}`} className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity" title="Open full view">
              <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-medium overflow-hidden shrink-0">
                {otherParticipant?.avatar_url ? <img src={otherParticipant.avatar_url} alt="" className="w-full h-full object-cover" /> : otherParticipant?.display_name?.[0]?.toUpperCase()}
              </div>
              <span className="text-sm font-medium text-stone-800 truncate">{otherParticipant?.display_name || 'Unknown'}</span>
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-800">Messages</h3>
            <Link to="/messages" className="p-1 hover:bg-stone-100 rounded-lg transition-colors" title="Open full messages page">
              <Maximize2 className="w-3.5 h-3.5 text-stone-500" />
            </Link>
          </div>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setMinimized(true)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors" title="Minimize">
            <Minus className="w-4 h-4 text-stone-500" />
          </button>
          <button onClick={() => { setOpen(false); setActiveConv(null); setMessages([]); }} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors" title="Close">
            <X className="w-4 h-4 text-stone-500" />
          </button>
        </div>
      </div>

      {/* Content */}
      {activeConv ? (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-stone-50 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-stone-300 animate-spin" />
              </div>
            ) : (
              messages.map(msg => {
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
                      <div className={`text-[10px] mt-0.5 ${isOwn ? 'text-indigo-200' : 'text-stone-400'}`}>
                        {new Date(msg.created_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          {/* Composer */}
          {activeConv.request_status !== 'pending' && (
            <div className="border-t border-stone-200 bg-white p-3 shrink-0">
              <div className="flex items-end gap-2">
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
                  disabled={!body.trim() || sending}
                  className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Conversation list */
        <div className="flex-1 overflow-y-auto min-h-0">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <MessageSquare className="w-8 h-8 text-stone-300 mb-2" />
              <p className="text-sm text-stone-400">No conversations yet</p>
              <Link to="/messages" className="mt-2 text-xs text-indigo-600 font-medium hover:text-indigo-700">Start a conversation</Link>
            </div>
          ) : (
            conversations
              .filter(c => c.status === 'active' && c.request_status !== 'pending')
              .map(conv => {
                const otherId = (conv.participant_ids || []).find(id => id !== user.id);
                const other = displayCache[otherId] || { display_name: 'Unknown' };
                return (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConv(conv)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-stone-50 transition-colors border-b border-stone-100 text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-sm font-medium overflow-hidden shrink-0">
                      {other.avatar_url ? <img src={other.avatar_url} alt="" className="w-full h-full object-cover" /> : other.display_name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-stone-800 truncate">{other.display_name}</span>
                        {conv.last_message_at && (
                          <span className="text-xs text-stone-400 shrink-0 ml-2">
                            {new Date(conv.last_message_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-500 truncate">{conv.last_message_preview || 'No messages yet'}</p>
                    </div>
                  </button>
                );
              })
          )}
        </div>
      )}
    </div>
  );
}