import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getPublicBusinessProfile, getBusiness } from '@/services/businessService';
import { createOrGetConversation } from '@/lib/messaging';
import { MessageSquare, Loader2, AlertCircle } from 'lucide-react';
import BusinessProfileView from '@/components/profile/BusinessProfileView';

/**
 * Public Business profile page — served at /b/:businessId.
 * Reads from the businessProfilesPublic projection (public fields only,
 * merged with verification_state from the businesses collection).
 * Unauthenticated guests can view; the Connect button requires auth.
 *
 * Mirrors the Professional PublicProfile page architecture. Businesses
 * have no screen_name field, so the route uses business_id as the key.
 */
export default function PublicBusinessProfile() {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    getPublicBusinessProfile(businessId)
      .then((p) => { if (!p) setNotFound(true); else setProfile(p); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [businessId]);

  const handleConnect = async () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/b/${businessId}`)}`);
      return;
    }
    setConnecting(true);
    try {
      // Read the business record (authenticated read) to get owner_id
      // for conversation creation. owner_id is not in the public projection.
      const business = await getBusiness(businessId);
      const result = await createOrGetConversation(
        [user.id, business.owner_id],
        user.id,
        'personal',
        { businessId: businessId, conversationType: 'business' },
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
        <h1 className="text-xl font-semibold text-stone-800 mb-1">Business not found</h1>
        <p className="text-stone-500 mb-4">This business profile isn't available.</p>
        <Link to="/directory?type=business" className="text-indigo-600 font-medium">Browse businesses</Link>
      </div>
    );
  }

  // The public projection carries verification_state + business_type
  // so the view can render them without reading the private businesses collection.
  const syntheticBusiness = {
    verification_state: profile.verification_state,
    type: profile.business_type,
  };

  const actions = (
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
      <BusinessProfileView profile={profile} business={syntheticBusiness} editable={false} actions={actions} />
    </div>
  );
}