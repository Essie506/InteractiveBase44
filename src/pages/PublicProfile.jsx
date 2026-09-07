import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { resolveProfessionalAccess } from '@/services/profileService';
import { createConnectionRequest, resolveConnectionStatus, followIdentity, unfollowIdentity, getFollowState } from '@/services/connectionService';
import { CalendarPlus, Pencil, Loader2, AlertCircle, MessageSquare, Share2, MoreVertical, Flag, Ban, UserPlus, UserCheck } from 'lucide-react';
import ProfessionalProfileView from '@/components/professional/ProfessionalProfileView';
import ProfessionalAdvertView from '@/components/professional/ProfessionalAdvertView';
import ConnectionActions from '@/components/directory/ConnectionActions';
import { createOrGetConversation, blockUser, reportUser } from '@/lib/messaging';
import { blockRepository } from '@/data/firebase';
import { useToast } from '@/components/ui/use-toast';
import ProfilePosts from '@/components/profile/ProfilePosts';

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
  const [followState, setFollowState] = useState(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const { toast } = useToast();

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
      setFollowState(null);
      setIsBlocked(false);
      return;
    }
    resolveConnectionStatus({ target_id: profile.identity_id })
      .then((res) => setConnectionStatus(res?.status || 'none'))
      .catch(() => setConnectionStatus('none'));
    getFollowState({ target_id: profile.identity_id })
      .then((res) => setFollowState(res))
      .catch(() => setFollowState(null));
    blockRepository.blockExists(user.id, profile.identity_id)
      .then((exists) => setIsBlocked(exists))
      .catch(() => setIsBlocked(false));
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

  const handleMessage = async () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/p/${screenName}`)}`);
      return;
    }
    if (!profile?.identity_id) return;
    try {
      const { conversation } = await createOrGetConversation(
        [user.id, profile.identity_id],
        user.id,
        user.active_context || 'personal',
        {},
      );
      if (conversation?.id) navigate(`/messages/${conversation.id}`);
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      toast({ title: 'Profile link copied' });
    }).catch(() => {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    });
  };

  const handleFollow = async () => {
    if (!user) { navigate(`/login?returnTo=${encodeURIComponent(`/p/${screenName}`)}`); return; }
    if (!profile) return;
    setFollowLoading(true);
    try {
      await followIdentity({ target_id: profile.identity_id });
      setFollowState((prev) => ({ ...prev, is_following: true, follower_count: (prev?.follower_count || 0) + 1 }));
    } catch (err) {
      toast({ title: 'Could not follow', description: err?.message, variant: 'destructive' });
    } finally {
      setFollowLoading(false);
    }
  };

  const handleUnfollow = async () => {
    if (!user || !profile) return;
    setFollowLoading(true);
    try {
      await unfollowIdentity({ target_id: profile.identity_id });
      setFollowState((prev) => ({ ...prev, is_following: false, follower_count: Math.max(0, (prev?.follower_count || 1) - 1) }));
    } catch (err) {
      toast({ title: 'Could not unfollow', description: err?.message, variant: 'destructive' });
    } finally {
      setFollowLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!user || !profile) return;
    try {
      await blockUser(user.id, profile.identity_id, user.active_context || 'personal');
      setIsBlocked(true);
      toast({ title: 'User blocked' });
    } catch (err) {
      toast({ title: 'Could not block', variant: 'destructive' });
    } finally {
      setShowBlockConfirm(false);
      setShowMoreMenu(false);
    }
  };

  const handleUnblock = async () => {
    if (!user || !profile) return;
    try {
      await blockRepository.removeBlock(user.id, profile.identity_id);
      setIsBlocked(false);
      toast({ title: 'User unblocked' });
    } catch (err) {
      toast({ title: 'Could not unblock', variant: 'destructive' });
    } finally {
      setShowMoreMenu(false);
    }
  };

  const handleReport = async () => {
    if (!user || !profile) return;
    try {
      await reportUser(user.id, profile.identity_id, 'Inappropriate profile content', user.active_context || 'personal');
      toast({ title: 'Report submitted' });
    } catch (err) {
      toast({ title: 'Could not report', variant: 'destructive' });
    } finally {
      setShowReportConfirm(false);
      setShowMoreMenu(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-stone-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (access === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-stone-50 p-6">
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
      {followState?.is_following ? (
        <button
          onClick={handleUnfollow}
          disabled={followLoading}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          <UserCheck className="w-4 h-4" /> Following
        </button>
      ) : (
        <button
          onClick={handleFollow}
          disabled={followLoading}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-50 disabled:opacity-50"
        >
          <UserPlus className="w-4 h-4" /> {followLoading ? '...' : 'Follow'}
        </button>
      )}
      <ConnectionActions
        status={connectionStatus}
        onConnect={handleConnect}
        connecting={connecting}
      />
      <button
        onClick={handleMessage}
        disabled={isBlocked}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <MessageSquare className="w-4 h-4" /> Message
      </button>
      <button
        onClick={handleBook}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
      >
        <CalendarPlus className="w-4 h-4" /> Book
      </button>
      <button
        onClick={handleShare}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-50"
        title="Share profile"
      >
        <Share2 className="w-4 h-4" />
      </button>
      <div className="relative">
        <button
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className="p-2.5 bg-white border border-stone-200 rounded-lg hover:bg-stone-50"
          title="More options"
        >
          <MoreVertical className="w-4 h-4 text-stone-600" />
        </button>
        {showMoreMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-stone-200 rounded-lg shadow-lg py-1 min-w-[160px]">
              <button
                onClick={() => { setShowReportConfirm(true); setShowMoreMenu(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                <Flag className="w-3.5 h-3.5" /> Report
              </button>
              {isBlocked ? (
                <button
                  onClick={handleUnblock}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                >
                  <Ban className="w-3.5 h-3.5" /> Unblock
                </button>
              ) : (
                <button
                  onClick={() => { setShowBlockConfirm(true); setShowMoreMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Ban className="w-3.5 h-3.5" /> Block
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {followState && (followState.follower_count > 0 || followState.following_count > 0) && (
        <div className="flex items-center gap-3 text-xs text-stone-500 ml-1">
          {followState.follower_count > 0 && <span><strong className="text-stone-700">{followState.follower_count}</strong> followers</span>}
          {followState.following_count > 0 && <span><strong className="text-stone-700">{followState.following_count}</strong> following</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-stone-50">
      <ProfessionalProfileView profile={profile} editable={false} actions={actions} />
      <ProfilePosts identityId={profile.identity_id} canView={(access === 'public' || access === 'connection' || isOwner) && !isBlocked} />
      <div className="h-12" />

      {/* Block confirmation */}
      {showBlockConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowBlockConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Ban className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-stone-800">Block {profile?.display_name || 'this user'}?</h2>
            </div>
            <p className="text-sm text-stone-500 mb-5">They will not be able to send you messages or see your profile.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowBlockConfirm(false)} className="flex-1 px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-medium">Cancel</button>
              <button onClick={handleBlock} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700">Block</button>
            </div>
          </div>
        </div>
      )}

      {/* Report confirmation */}
      {showReportConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowReportConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <Flag className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-bold text-stone-800">Report this profile?</h2>
            </div>
            <p className="text-sm text-stone-500 mb-5">This will submit a report to Trust & Safety for review.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowReportConfirm(false)} className="flex-1 px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-medium">Cancel</button>
              <button onClick={handleReport} className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700">Report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}