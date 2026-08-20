import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getPublicPersonalProfile } from '@/services/profileService';
import { createOrGetConversation } from '@/lib/messaging';
import { MessageSquare, Pencil, Loader2, AlertCircle } from 'lucide-react';
import PersonalProfileView from '@/components/profile/PersonalProfileView';

/**
 * Public Personal profile page — served at /u/:screenName.
 * Reads from the personalProfilesPublic projection (public fields only).
 * Unauthenticated guests can view; the Connect button requires auth.
 *
 * Mirrors the Professional PublicProfile page architecture.
 */
export default function PublicPersonalProfile() {
  const { screenName } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    getPublicPersonalProfile(screenName)
      .then((p) => { if (!p) setNotFound(true); else setProfile(p); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [screenName]);

  const isOwner = user && profile && user.id === profile.identity_id;

  const handleConnect = async () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/u/${screenName}`)}`);
      return;
    }
    if (isOwner) return;
    setConnecting(true);
    try {
      const result = await createOrGetConversation(
        [user.id, profile.identity_id],
        user.id,
        'personal',
        { conversationType: 'direct' },
      );
      navigate(`/messages/${result.conversation.id}`);
    } catch (err) {
      alert(err.message || 'Could not start conversation');
    } finally {
      setConnecting(false);
    }
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
        <h1 className="text-xl font-semibold text-stone-800 mb-1">Profile not found</h1>
        <p className="text-stone-500 mb-4">This personal profile isn't available.</p>
        <Link to="/search" className="text-indigo-600 font-medium">Browse profiles</Link>
      </div>
    );
  }

  const actions = isOwner ? (
    <Link
      to="/profile"
      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50 sm:pb-2"
    >
      <Pencil className="w-3.5 h-3.5" /> Edit profile
    </Link>
  ) : (
    <div className="flex gap-2 sm:pb-2">
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
      >
        {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
        Connect
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50">
      <PersonalProfileView profile={profile} editable={false} actions={actions} />
    </div>
  );
}