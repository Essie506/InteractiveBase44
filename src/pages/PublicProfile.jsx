import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getPublicProfessionalProfile } from '@/services/profileService';
import { createOrGetConversation } from '@/lib/messaging';
import { MessageSquare, CalendarPlus, Pencil, Loader2, AlertCircle } from 'lucide-react';
import ProfessionalProfileView from '@/components/professional/ProfessionalProfileView';

export default function PublicProfile() {
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
    getPublicProfessionalProfile(screenName)
      .then((p) => { if (!p) setNotFound(true); else setProfile(p); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [screenName]);

  const isOwner = user && profile && user.id === profile.identity_id;

  const handleConnect = async () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/p/${screenName}`)}`);
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
        <h1 className="text-xl font-semibold text-stone-800 mb-1">Profile not found</h1>
        <p className="text-stone-500 mb-4">This professional profile isn't available.</p>
        <Link to="/directory?type=professional" className="text-indigo-600 font-medium">Browse professionals</Link>
      </div>
    );
  }

  const actions = isOwner ? (
    <Link
      to="/professional-profile"
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