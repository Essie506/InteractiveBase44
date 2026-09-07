import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getPublicBusinessProfile, getBusiness } from '@/services/businessService';
import { createOrGetConversation, blockUser, reportUser } from '@/lib/messaging';
import { blockRepository } from '@/data/firebase';
import { MessageSquare, CalendarPlus, Pencil, Loader2, AlertCircle } from 'lucide-react';
import BusinessProfileView from '@/components/profile/BusinessProfileView';
import ProfileMoreMenu from '@/components/profile/ProfileMoreMenu';
import { useToast } from '@/components/ui/use-toast';

/**
 * Public Business profile page — served at /b/:businessId.
 * Reads from the businessProfilesPublic projection (public fields only,
 * merged with verification_state from the businesses collection).
 * Unauthenticated guests can view; action buttons require auth.
 *
 * Actions: Connect (message), Book (via first listed professional),
 * Block/Unblock (blocks the business owner identity), Report.
 */
export default function PublicBusinessProfile() {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [ownerIdentityId, setOwnerIdentityId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setOwnerIdentityId(null);
    getPublicBusinessProfile(businessId)
      .then((p) => {
        if (!p) { setNotFound(true); return; }
        setProfile(p);
        // Fetch owner identity for block/report — owner_id is not in the
        // public projection, so we read the private business record.
        getBusiness(businessId)
          .then((b) => { if (b?.owner_id) setOwnerIdentityId(b.owner_id); })
          .catch(() => {});
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [businessId]);

  // Check block status once we have the owner identity.
  useEffect(() => {
    if (!user || !ownerIdentityId) { setIsBlocked(false); return; }
    blockRepository.blockExists(user.id, ownerIdentityId)
      .then(setIsBlocked)
      .catch(() => setIsBlocked(false));
  }, [user, ownerIdentityId]);

  const handleConnect = async () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/b/${businessId}`)}`);
      return;
    }
    setConnecting(true);
    try {
      const business = await getBusiness(businessId);
      const result = await createOrGetConversation(
        [user.id, business.owner_id],
        user.id,
        'personal',
        { businessId: businessId, conversationType: 'business' },
      );
      navigate(`/messages/${result.conversation.id}`);
    } catch (err) {
      toast({ title: err.message || 'Could not start conversation', variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  const handleBook = () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/b/${businessId}`)}`);
      return;
    }
    // Book via the first listed professional with a screen_name —
    // connects to the existing BookingPage journey (/book/:screenName).
    const firstPro = (profile.professionals || []).find((p) => p.screen_name);
    if (firstPro) {
      navigate(`/book/${firstPro.screen_name}`);
    }
  };

  const handleBlock = async () => {
    if (!user || !ownerIdentityId) return;
    try {
      await blockUser(user.id, ownerIdentityId, user.active_context || 'personal');
      setIsBlocked(true);
      toast({ title: 'User blocked' });
    } catch {
      toast({ title: 'Could not block', variant: 'destructive' });
    }
  };

  const handleUnblock = async () => {
    if (!user || !ownerIdentityId) return;
    try {
      await blockRepository.removeBlock(user.id, ownerIdentityId);
      setIsBlocked(false);
      toast({ title: 'User unblocked' });
    } catch {
      toast({ title: 'Could not unblock', variant: 'destructive' });
    }
  };

  const handleReport = async () => {
    if (!user || !ownerIdentityId) return;
    try {
      await reportUser(user.id, ownerIdentityId, 'Inappropriate business profile', user.active_context || 'personal');
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
        <h1 className="text-xl font-semibold text-stone-800 mb-1">Business not found</h1>
        <p className="text-stone-500 mb-4">This business profile isn't available.</p>
        <Link to="/directory?type=business" className="text-indigo-600 font-medium">Browse businesses</Link>
      </div>
    );
  }

  const syntheticBusiness = {
    verification_state: profile.verification_state,
    type: profile.business_type,
  };

  const isOwner = user && ownerIdentityId && user.id === ownerIdentityId;
  const hasBookableProfessional = (profile.professionals || []).some((p) => p.screen_name);

  const actions = isOwner ? (
    <Link
      to={`/business/${businessId}/profile`}
      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50 sm:pb-2"
    >
      <Pencil className="w-3.5 h-3.5" /> Edit profile
    </Link>
  ) : (
    <div className="flex flex-wrap items-center gap-2 sm:pb-2">
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
      >
        {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
        Connect
      </button>
      {hasBookableProfessional && (
        <button
          onClick={handleBook}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          <CalendarPlus className="w-4 h-4" /> Book
        </button>
      )}
      {ownerIdentityId && (
        <ProfileMoreMenu
          displayName={profile.name || 'this business'}
          isBlocked={isBlocked}
          onBlock={handleBlock}
          onUnblock={handleUnblock}
          onReport={handleReport}
        />
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50">
      <BusinessProfileView profile={profile} business={syntheticBusiness} editable={false} actions={actions} />
    </div>
  );
}