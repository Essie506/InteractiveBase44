import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getPublicPersonalProfile } from '@/services/profileService';
import { createOrGetConversation, blockUser, reportUser } from '@/lib/messaging';
import { blockRepository } from '@/data/firebase';
import { MessageSquare, Pencil, Loader2, AlertCircle } from 'lucide-react';
import PersonalProfileView from '@/components/profile/PersonalProfileView';
import ProfileMoreMenu from '@/components/profile/ProfileMoreMenu';
import { useToast } from '@/components/ui/use-toast';

/**
 * Public Personal profile page — served at /u/:screenName.
 * Reads from the personalProfilesPublic projection (public fields only).
 * Unauthenticated guests can view; action buttons require auth.
 *
 * Actions: Connect (message), Block/Unblock, Report.
 * Personal profiles are not bookable — no Book button.
 */
export default function PublicPersonalProfile() {
  const { screenName } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    getPublicPersonalProfile(screenName)
      .then((p) => { if (!p) setNotFound(true); else setProfile(p); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [screenName]);

  const isOwner = user && profile && user.id === profile.identity_id;

  // Check block status for non-owner viewers.
  useEffect(() => {
    if (!user || !profile || isOwner) { setIsBlocked(false); return; }
    blockRepository.blockExists(user.id, profile.identity_id)
      .then(setIsBlocked)
      .catch(() => setIsBlocked(false));
  }, [user, profile, isOwner]);

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
      toast({ title: err.message || 'Could not start conversation', variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  const handleBlock = async () => {
    if (!user || !profile) return;
    try {
      await blockUser(user.id, profile.identity_id, user.active_context || 'personal');
      setIsBlocked(true);
      toast({ title: 'User blocked' });
    } catch {
      toast({ title: 'Could not block', variant: 'destructive' });
    }
  };

  const handleUnblock = async () => {
    if (!user || !profile) return;
    try {
      await blockRepository.removeBlock(user.id, profile.identity_id);
      setIsBlocked(false);
      toast({ title: 'User unblocked' });
    } catch {
      toast({ title: 'Could not unblock', variant: 'destructive' });
    }
  };

  const handleReport = async () => {
    if (!user || !profile) return;
    try {
      await reportUser(user.id, profile.identity_id, 'Inappropriate profile content', user.active_context || 'personal');
      toast({ title: 'Report submitted' });
    } catch {
      toast({ title: 'Could not report', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-stone-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-stone-50 p-6">
        <AlertCircle className="w-10 h-10 text-stone-400 mb-3" />
        <h1 className="text-xl font-semibold text-stone-800 mb-1">Profile not found</h1>
        <p className="text-stone-500 mb-4">This personal profile isn't available.</p>
        <Link to="/directory" className="text-indigo-600 font-medium">Browse profiles</Link>
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
    <div className="flex flex-wrap items-center gap-2 sm:pb-2">
      <button
        onClick={handleConnect}
        disabled={connecting || isBlocked}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
        Connect
      </button>
      <ProfileMoreMenu
        displayName={profile.display_name || 'this user'}
        isBlocked={isBlocked}
        onBlock={handleBlock}
        onUnblock={handleUnblock}
        onReport={handleReport}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50">
      <PersonalProfileView profile={profile} editable={false} actions={actions} />
    </div>
  );
}