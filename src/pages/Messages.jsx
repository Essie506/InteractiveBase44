import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getConversations, resolveParticipants, acceptMessageRequest, declineMessageRequest, findUserByEmail, updateConversation, sendMessage, notifyRecipients, createOrGetConversation } from '@/lib/messaging';
import { MessageSquare, Search, Loader2, Plus, Check, X, Mail } from 'lucide-react';

export default function Messages() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [displayCache, setDisplayCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [filter, setFilter] = useState('all');

  const loadConversations = async () => {
    if (!user) return;
    setLoading(true);
    const convs = await getConversations(user.id);
    setConversations(convs);
    // Resolve display info for all participants (batch)
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
      setDisplayCache({ ...displayCache, ...resolved });
    }
    setLoading(false);
  };

  useEffect(() => {loadConversations();}, [user]);

  const filteredConversations = conversations.filter((c) => {
    if (filter === 'requests') return c.request_status === 'pending';
    if (filter === 'archived') return c.status === 'archived';
    return c.status === 'active' && c.request_status !== 'pending';
  });

  const requests = conversations.filter((c) => c.request_status === 'pending');
  const activeConvs = filteredConversations;

  const handleAccept = async (convId) => {
    await acceptMessageRequest(convId, user.id);
    loadConversations();
  };

  const handleDecline = async (convId) => {
    await declineMessageRequest(convId, user.id);
    loadConversations();
  };

  const getOtherParticipant = (conv) => {
    const otherId = (conv.participant_ids || []).find((id) => id !== user.id);
    return displayCache[otherId] || { identity_id: otherId, display_name: 'Unknown', avatar_url: null };
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1 hidden">Messages</h1>
          <p className="text-stone-500">Your Interactive inbox</p>
        </div>
        <button
          onClick={() => setShowNewMessage(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          
          <Plus className="w-4 h-4" /> New Message
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-stone-200">
        {[
        { key: 'all', label: 'Inbox' },
        { key: 'requests', label: `Requests${requests.length > 0 ? ` (${requests.length})` : ''}` }].
        map((tab) =>
        <button
          key={tab.key}
          onClick={() => setFilter(tab.key)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
          filter === tab.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-stone-500 hover:text-stone-700'}`
          }>
          
            {tab.label}
          </button>
        )}
      </div>

      {loading ?
      <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-stone-200 border-t-indigo-600 rounded-full animate-spin" /></div> :
      filter === 'requests' ? (
      /* Message Requests */
      <div className="space-y-3">
          {requests.length === 0 ?
        <div className="text-center py-12">
              <Mail className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              <p className="text-sm text-stone-400">No pending message requests</p>
            </div> :

        requests.map((conv) => {
          const other = getOtherParticipant(conv);
          return (
            <div key={conv.id} className="bg-white rounded-xl border border-stone-200 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-sm font-medium text-stone-500 overflow-hidden">
                      {other.avatar_url ? <img src={other.avatar_url} alt="" className="w-full h-full object-cover" /> : other.display_name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-stone-800 text-sm">{other.display_name}</div>
                      {conv.request_message && <div className="text-sm text-stone-500 mt-0.5">"{conv.request_message}"</div>}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => handleAccept(conv.id)} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center justify-center gap-1.5 transition-colors">
                      <Check className="w-4 h-4" /> Accept
                    </button>
                    <button onClick={() => handleDecline(conv.id)} className="px-4 py-2 bg-stone-100 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-200 flex items-center justify-center gap-1.5 transition-colors">
                      <X className="w-4 h-4" /> Decline
                    </button>
                  </div>
                </div>);

        })
        }
        </div>) : (

      /* Active conversations */
      <div className="space-y-2">
          {activeConvs.length === 0 ?
        <div className="text-center py-12">
              <MessageSquare className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              <p className="text-sm text-stone-400">No conversations yet</p>
              <button onClick={() => setShowNewMessage(true)} className="mt-3 text-sm text-indigo-600 font-medium hover:text-indigo-700">Start a conversation</button>
            </div> :

        activeConvs.map((conv) => {
          const other = getOtherParticipant(conv);
          return (
            <Link
              key={conv.id}
              to={`/messages/${conv.id}`}
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-stone-200 hover:border-stone-300 transition-colors">
              
                  <div className="w-11 h-11 rounded-full bg-stone-200 flex items-center justify-center text-sm font-medium text-stone-500 overflow-hidden shrink-0">
                    {other.avatar_url ? <img src={other.avatar_url} alt="" className="w-full h-full object-cover" /> : other.display_name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="font-medium text-stone-800 text-sm truncate">
                        {other.display_name}
                        {conv.business_id && <span className="text-xs text-indigo-600 ml-2">Business</span>}
                      </div>
                      {conv.last_message_at &&
                  <div className="text-xs text-stone-400 shrink-0 ml-2">
                          {new Date(conv.last_message_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                  }
                    </div>
                    <div className="text-sm text-stone-500 truncate">{conv.last_message_preview || 'No messages yet'}</div>
                  </div>
                </Link>);

        })
        }
        </div>)
      }

      {showNewMessage &&
      <NewMessageModal
        user={user}
        onClose={() => setShowNewMessage(false)}
        onSent={() => {setShowNewMessage(false);loadConversations();}} />

      }
    </div>);

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
          conversationType: user.active_context === 'business' ? 'business' : 'direct'
        }
      );

      if (requiresAcceptance) {
        // Update the conversation with the request message
        await updateConversation(conversation.id, { request_message: message.trim() });
        await notifyRecipients(conversation, user.id, message.trim());
      } else {
        const msg = await sendMessage({
          conversation_id: conversation.id,
          sender_id: user.id,
          sender_context: user.active_context || 'personal',
          body: message.trim(),
          source_id: `first:${user.id}:${foundUser.id}`
        });
        await notifyRecipients(conversation, user.id, message.trim());
      }

      onSent();
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-stone-100">
          <h2 className="text-xl font-bold text-stone-800">New Message</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {!foundUser ?
          <>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Recipient Email</label>
                <div className="flex gap-2">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={inputClass} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                  <button onClick={handleSearch} disabled={searching || !email.trim()} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <p className="text-xs text-stone-400">Only registered Interactive users with search visibility enabled can be found.</p>
            </> :

          <>
              <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-sm font-medium overflow-hidden">
                  {foundUser.avatar_url ? <img src={foundUser.avatar_url} alt="" className="w-full h-full object-cover" /> : foundUser.display_name[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-stone-800 text-sm">{foundUser.display_name}</div>
                  <button onClick={() => {setFoundUser(null);setEmail('');}} className="text-xs text-indigo-600 hover:text-indigo-700">Change recipient</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Message</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Type your message..." className={inputClass + " resize-none"} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button onClick={handleSend} disabled={sending || !message.trim()} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : 'Send Message'}
              </button>
            </>
          }
        </div>
      </div>
    </div>);

}