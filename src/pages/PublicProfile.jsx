import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { resolveProfessionalAccess } from '@/services/profileService';
import { createConnectionRequest } from '@/services/connectionService';
import { MessageSquare, CalendarPlus, Pencil, Loader2, AlertCircle, Check, UserPlus } from 'lucide-react';
import ProfessionalProfileView from '@/components/professional/ProfessionalProfileView';

// Public Professional profile page — /p/:screenName
// ───────────────────────────────────────────────────────────
// Routes through the server-side resolveProfessionalAccess resolver
// so the three visibility tiers (public / connections / private) are
// enforced server-side. The owner can view their own profile at this
// route regardless of visibility; a Connection can view a connections-
// only profile; everyone else is denied.
//
// The "Connect" action uses the Relationship System (createConnectionRequest)
// — it does NOT create a conversation. Messaging is owned separately.
export default function PublicProfile() {
  const { screenName } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [connectState, setConnectState] = useState('idle'); // idle | sending | sent | already_connected | error

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setConnectState('idle');
    resolveProfessionalAccess(screenName)
      .then((res) => {
        if (!res || !res.profile || res.access === 'not_found' || res.access === 'denied') {
          setNotFound(true);
        } else {
          setProfile(res.profile);
          setIsOwner(!!res.is_owner);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [screenName]);

  const handleConnect = async () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/p/${screenName}`)}`);
      return;
    }
    if (isOwner) return;
    setConnectState('sending');
    try {
      const result = await createConnectionRequest({ target_id: profile.identity_id });
      if (result.status === 'already_connected') {
        setConnectState('already_connected');
      } else {
        setConnectState('sent');
      }
    } catch (err) {
      setConnectState('error');
    }
  };

  const handleBook = () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/p/${screenName}`)}`);
      return;
    }
    navigate(`/book/${screenName}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-stone-50 p-6">
        <AlertCircle className="w-10 h-10 text-stone-400 mb-3" />
        <h1 className="text-xl font-semibold text-stone-800 mb-1">Profile not available</h1>
        <p className="text-stone-500 mb-4">This professional profile isn't available, or you don't have access to view it.</p>
        <Link to="/directory?type=professional" className="text-indigo-600 font-medium">Browse professionals</Link>
      </div>
    );
  }

  const connectButton = (() => {
    switch (connectState) {
      case 'sent':
        return (
          <button
            disabled
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium cursor-default"
          >
            <Check className="w-4 h-4" /> Request sent
          </button>
        );
      case 'already_connected':
        return (
          <button
            disabled
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-stone-100 border border-stone-200 text-stone-500 rounded-lg text-sm font-medium cursor-default"
          >
            <Check className="w-4 h-4" /> Connected
          </button>
        );
      case 'sending':
        return (
          <button
            disabled
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Loader2 className="w-4 h-4 animate-spin" /> Connecting...
          </button>
        );
      case 'error':
        return (
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50"
          >
            <UserPlus className="w-4 h-4" /> Try again
          </button>
        );
      default:
        return (
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50"
          >
            <UserPlus className="w-4 h-4" /> Connect
          </button>
        );
    }
  })();

  const actions = isOwner ? (
    <Link
      to="/professional-profile"
      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50 sm:pb-2"
    >
      <Pencil className="w-3.5 h-3.5" /> Edit profile
    </Link>
  ) : (
    <div className="flex gap-2 sm:pb-2">
      {connectButton}
      <button
        onClick={handleBook}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
      >
        <CalendarPlus className="w-4 h-4" /> Book
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50">
      <ProfessionalProfileView profile={profile} editable={false} actions={actions} />
    </div>
  );
}