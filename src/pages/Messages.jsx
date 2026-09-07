// Messages — Global Inbox + Desktop Split View.
// ───────────────────────────────────────────────────────────
// Spec 13 Messaging V2 display modes:
//   - Global Inbox: conversation list with Inbox/Requests/Archived tabs
//   - Full Messages Page: this page at /messages
//   - Desktop Split View: list (left) + InlineConversation (right)
//   - Mobile: list only, navigate to /messages/:id
//   - Search: filter conversations by participant name or preview
//   - Classic/retro: compact bubble toggle
//   - Composer action menu: in InlineConversation
//   - Floating Pop-out: FloatingMessageDrawer (in AuthenticatedShell)
//   - Minimised Conversation: FloatingMessageDrawer minimize state
//   - Popup: NotificationBell inline preview
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import {
  getConversations, resolveParticipants, acceptMessageRequest,
  declineMessageRequest, findUserByEmail, updateConversation, sendMessage,
  notifyRecipients, createOrGetConversation,
} from '@/lib/messaging';
import {
  MessageSquare, Search, Loader2, Plus, Check, X, Mail,
} from 'lucide-react';
import InlineConversation from '@/components/messaging/InlineConversation';

export default function Messages() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [displayCache, setDisplayCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeConvId, setActiveConvId] = useState(null);

  const loadConversations = async () => {
    if (!user) return;
    setLoading(true);
    const convs = await getConversations(user.id);
    setConversations(convs);
    const allParticipantIds = new Set();
    for (const conv of convs) {
      for (const pid of conv.participant_ids || []) {
        if (pid !== user.id && !displayCache[pid]) {
          allParticipantIds.add(pid);
        }
      }
    }
    if (allParticipantIds.size > 0) {
      const resolved = await resolveParticipants([...allParticipantIds]);
      setDisplayCache(prev => ({ ...prev, ...resolved }));
    }
    setLoading(false);
  };

  useEffect(() => { loadConversations(); }, [user]);

  const getOtherParticipant = (conv) => {
    const otherId = (conv.participant_ids || []).find(id => id !== user.id);
    return displayCache[otherId] || { identity_id: otherId, display_name: 'Unknown', avatar_url: null };
  };

  // Filter + search
  const filteredConversations = conversations.filter((c) => {
    let tabMatch = true;
    if (filter === 'requests') tabMatch = c.request_status === 'pending';
    else if (filter === 'archived') tabMatch = c.status === 'archived';
    else tabMatch = c.status === 'active' && c.request_status !== 'pending';

    if (!tabMatch) return false;
    if (!searchQuery.trim()) return true;

    const other = getOtherParticipant(c);
    const name = (other.display_name || '').toLowerCase();
    const preview = (c.last_message_preview || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return name.includes(q) || preview.includes(q);
  });

  const requests = conversations.filter(c => c.request_status === 'pending');
  const archivedCount = conversations.filter(c => c.status === 'archived').length;

  const handleAccept = async (convId) => {
    await acceptMessageRequest(convId, user.id);
    loadConversations();
  };

  const handleDecline = async (convId) => {
    await declineMessageRequest(convId, user.id);
    loadConversations();
  };

  const handleSelect = (convId) => {
    // Desktop: show inline. Mobile: navigate.
    if (window.innerWidth >= 768) {
      setActiveConvId(convId);
    } else {
      navigate(`/messages/${convId}`);
    }
  };

  const handleUnarchive = async (convId) => {
    await updateConversation(convId, { status: 'active' });
    loadConversations();
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[400px]">
      {/* Left panel — conversation list */}
      <div className={`flex flex-col ${activeConvId ? 'hidden md:flex w-80' : 'flex w-full md:w-80'} border-r border-stone-200 bg-white shrink-0`}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-stone-200">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-stone-800">Messages</h1>
            <button
              onClick={() => setShowNewMessage(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New
            </button>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-3 border-b border-stone-200">
          {[
            { key: 'all', label: 'Inbox' },
            { key: 'requests', label: `Requests${requests.length > 0 ? ` (${requests.length})` : ''}` },
            { key: 'archived', label: `Archived${archivedCount > 0 ? ` (${archivedCount})` : ''}` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                filter === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : filter === 'requests' ? (
            /* Message Requests */
            <div className="space-y-2 p-2">
              {requests.length === 0 ? (
                <div className="text-center py-12">
                  <Mail className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-sm text-stone-400">No pending message requests</p>
                </div>
              ) : (
                requests.map(conv => {
                  const other = getOtherParticipant(conv);
                  return (
                    <div key={conv.id} className="bg-white rounded-xl border border-stone-200 p-3">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-sm font-medium text-stone-500 overflow-hidden shrink-0">
                          {other.avatar_url ? <img src={other.avatar_url} alt="" className="w-full h-full object-cover" /> : other.display_name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-stone-800 text-sm">{other.display_name}</div>
                          {conv.request_message && <div className="text-xs text-stone-500 mt-0.5 truncate">"{conv.request_message}"</div>}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => handleAccept(conv.id)} className="flex-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center justify-center gap-1.5 transition-colors">
                          <Check className="w-3.5 h-3.5" /> Accept
                        </button>
                        <button onClick={() => handleDecline(conv.id)} className="px-3 py-1.5 bg-stone-100 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-200 flex items-center justify-center gap-1.5 transition-colors">
                          <X className="w-3.5 h-3.5" /> Decline
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              <p className="text-sm text-stone-400">
                {filter === 'archived' ? 'No archived conversations' : 'No conversations yet'}
              </p>
              {filter !== 'archived' && (
                <button onClick={() => setShowNewMessage(true)} className="mt-3 text-sm text-indigo-600 font-medium hover:text-indigo-700">
                  Start a conversation
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-0">
              {filteredConversations.map(conv => {
                const other = getOtherParticipant(conv);
                const isActive = activeConvId === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelect(conv.id)}
                    className={`w-full flex items-center gap-3 p-3 transition-colors border-b border-stone-100 text-left ${
                      isActive ? 'bg-indigo-50' : 'hover:bg-stone-50'
                    }`}
                  >
                    <div className="w-11 h-11 rounded-full bg-stone-200 flex items-center justify-center text-sm font-medium text-stone-500 overflow-hidden shrink-0">
                      {other.avatar_url ? <img src={other.avatar_url} alt="" className="w-full h-full object-cover" /> : other.display_name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="font-medium text-stone-800 text-sm truncate">
                          {other.display_name}
                          {conv.business_id && <span className="text-xs text-indigo-600 ml-1.5">Business</span>}
                        </div>
                        {conv.last_message_at && (
                          <div className="text-xs text-stone-400 shrink-0 ml-2">
                            {new Date(conv.last_message_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-stone-500 truncate">{conv.last_message_preview || 'No messages yet'}</div>
                      {filter === 'archived' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleUnarchive(conv.id); }}
                          className="text-xs text-indigo-600 font-medium hover:underline mt-1"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — inline conversation (desktop only) */}
      <div className="hidden md:flex flex-1 min-w-0">
        {activeConvId ? (
          <InlineConversation
            conversationId={activeConvId}
            onBack={() => setActiveConvId(null)}
            onArchived={() => { setActiveConvId(null); loadConversations(); }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
            <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mb-3">
              <MessageSquare className="w-7 h-7 text-stone-300" />
            </div>
            <h3 className="text-sm font-medium text-stone-700 mb-1">Your messages</h3>
            <p className="text-sm text-stone-400">Select a conversation to start chatting.</p>
          </div>
        )}
      </div>

      {/* New Message Modal */}
      {showNewMessage && (
        <NewMessageModal
          user={user}
          onClose={() => setShowNewMessage(false)}
          onSent={(convId) => {
            setShowNewMessage(false);
            loadConversations();
            if (convId && window.innerWidth >= 768) setActiveConvId(convId);
          }}
        />
      )}
    </div>
  );
}

// New Message Modal — find a user by email and start a conversation
function NewMessageModal({ user, onClose, onSent }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const inputClass = "w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";

  const handleSearch = async () => {
    setError('');
    setFoundUser(null);
    setSearching(true);
    try {
      const data = await findUserByEmail(email);
      if (data.error) throw new Error(data.error);
      if (!data.found) {
        setError('No Interactive user found with that email, or they are not discoverable.');
      } else if (data.identity_id === user.id) {
        setError('You cannot send a message to yourself.');
      } else {
        setFoundUser({ id: data.identity_id, display_name: data.display_name, avatar_url: data.avatar_url });
      }
    } catch (err) {
      setError(err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSend = async () => {
    if (!foundUser || !message.trim()) return;
    setSending(true);
    setError('');
    try {
      const { conversation, requiresAcceptance } = await createOrGetConversation(
        [user.id, foundUser.id],
        user.id,
        user.active_context || 'personal',
        {
          businessId: user.active_context === 'business' ? user.active_business_id : null,
          conversationType: user.active_context === 'business' ? 'business' : 'direct',
        },
      );

      if (requiresAcceptance) {
        await updateConversation(conversation.id, { request_message: message.trim() });
        await notifyRecipients(conversation, user.id, message.trim());
      } else {
        await sendMessage({
          conversation_id: conversation.id,
          sender_id: user.id,
          sender_context: user.active_context || 'personal',
          body: message.trim(),
          source_id: `first:${user.id}:${foundUser.id}`,
        });
        await notifyRecipients(conversation, user.id, message.trim());
      }

      onSent(conversation?.id);
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-stone-100">
          <h2 className="text-xl font-bold text-stone-800">New Message</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {!foundUser ? (
            <>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Recipient Email</label>
                <div className="flex gap-2">
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" className={inputClass} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                  <button onClick={handleSearch} disabled={searching || !email.trim()} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <p className="text-xs text-stone-400">Only registered Interactive users with search visibility enabled can be found.</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-sm font-medium overflow-hidden">
                  {foundUser.avatar_url ? <img src={foundUser.avatar_url} alt="" className="w-full h-full object-cover" /> : foundUser.display_name[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-stone-800 text-sm">{foundUser.display_name}</div>
                  <button onClick={() => { setFoundUser(null); setEmail(''); }} className="text-xs text-indigo-600 hover:text-indigo-700">Change recipient</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Type your message..." className={inputClass + " resize-none"} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button onClick={handleSend} disabled={sending || !message.trim()} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : 'Send Message'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}