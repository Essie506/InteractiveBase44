import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { resolveProfessionalAccess } from '@/services/profileService';
import { createConnectionRequest, resolveConnectionStatus } from '@/services/connectionService';
import { CalendarPlus, Pencil, Loader2, AlertCircle } from 'lucide-react';
import ProfessionalProfileView from '@/components/professional/ProfessionalProfileView';
import ProfessionalAdvertView from '@/components/professional/ProfessionalAdvertView';
import ConnectionActions from '@/components/directory/ConnectionActions';

// Public Professional profile page — /p/:screenName
// ───────────────────────────────────────────────────────────
// Routes through the server-side resolveProfessionalAccess resolver.
// Access tiers:
//   owner      → full profile + edit controls
//   public     → full public profile
//   connection → full profile (accepted Connection)
//   restricted → discovery advert only (listed, but full profile is
//                connections-only or private and viewer is not a Connection)
//   denied     → no advert (unlisted non-public non-connection)
//   not_found  → no such profile
//
// The Connect action uses the Relationship System (createConnectionRequest)
// — it does NOT create a conversation. Ask About is a disabled placeholder
// until the typed Professional enquiry exists (Messaging pass).
export default function PublicProfile() {
  const { screenName } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [access, setAccess] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setConnectionStatus(null);
    resolveProfessionalAccess(screenName)
      .then((res) => {
        if (!res || !res.profile || res.access === 'not_found' || res.access === 'denied') {
          setAccess('denied');
          setProfile(null);
        } else {
          setProfile(res.profile);
          setAccess(res.access);
          setIsOwner(!!res.is_owner);
        }
      })
      .catch(() => setAccess('denied'))
      .finally(() => setLoading(false));
  }, [screenName]);

  // Resolve relationship status for the Connect button (signed-in viewers
  // on non-owner profiles). Uses the server-side resolver — never inferred
  // from conversations or raw queries.
  useEffect(() => {
    if (!user || !profile || isOwner) {
      setConnectionStatus(null);
      return;
    }
    resolveConnectionStatus({ target_id: profile.identity_id })
      .then((res) => setConnectionStatus(res?.status || 'none'))
      .catch(() => setConnectionStatus('none'));
  }, [user, profile, isOwner]);

  const handleConnect = async () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/p/${screenName}`)}`);
      return;
    }
    if (isOwner || !profile) return;
    setConnecting(true);
    try {
      const result = await createConnectionRequest({ target_id: profile.identity_id });
      setConnectionStatus(result.status === 'already_connected' ? 'connected' : 'pending_outgoing');
    } catch {
      setConnectionStatus('none');
    } finally {
      setConnecting(false);
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

  if (access === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-stone-50 p-6">
        <AlertCircle className="w-10 h-10 text-stone-400 mb-3" />
        <h1 className="text-xl font-semibold text-stone-800 mb-1">Profile not available</h1>
        <p className="text-stone-500 mb-4">This professional profile isn't available, or you don't have access to view it.</p>
        <Link to="/directory?type=professional" className="text-indigo-600 font-medium">Browse professionals</Link>
      </div>
    );
  }

  // Restricted tier — discovery advert only (no full profile content).
  if (access === 'restricted') {
    return (
      <ProfessionalAdvertView
        profile={profile}
        connectionStatus={connectionStatus}
        onConnect={handleConnect}
        connecting={connecting}
      />
    );
  }

  // owner / public / connection — full profile view.
  const actions = isOwner ? (
    <Link
      to="/professional-profile"
      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50 sm:pb-2"
    >
      <Pencil className="w-3.5 h-3.5" /> Edit profile
    </Link>
  ) : (
    <div className="flex flex-wrap items-center gap-2 sm:pb-2">
      <ConnectionActions
        status={connectionStatus}
        onConnect={handleConnect}
        connecting={connecting}
      />
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