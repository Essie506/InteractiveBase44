import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getPublicProfessionalProfile } from '@/services/profileService';
import { createOrGetConversation } from '@/lib/messaging';
import { ShieldCheck, MapPin, MessageSquare, CalendarPlus, Pencil, Loader2, AlertCircle } from 'lucide-react';

function mediaStyle(pos) {
  const p = { x: 0.5, y: 0.5, zoom: 1, ...pos };
  return {
    objectFit: 'cover',
    transform: `scale(${p.zoom})`,
    transformOrigin: `${p.x * 100}% ${p.y * 100}%`,
  };
}

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
      .then((p) => {
        if (!p) setNotFound(true);
        else setProfile(p);
      })
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
        <Link to="/search" className="text-indigo-600 font-medium">Browse professionals</Link>
      </div>
    );
  }

  const avatarPos = {
    x: profile.avatar_position_x,
    y: profile.avatar_position_y,
    zoom: profile.avatar_zoom,
  };
  const coverPos = {
    x: profile.cover_position_x,
    y: profile.cover_position_y,
    zoom: profile.cover_zoom,
  };

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Cover */}
      <div className="relative">
        <div className="w-full h-48 sm:h-64 md:h-80 bg-stone-200 overflow-hidden">
          {profile.cover_url ? (
            <img
              src={profile.cover_url}
              alt=""
              className="w-full h-full"
              style={mediaStyle(coverPos)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-indigo-700" />
          )}
        </div>

        {/* Owner edit control */}
        {isOwner && (
          <div className="absolute top-4 right-4">
            <Link
              to="/professional-profile"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur text-stone-800 rounded-lg text-sm font-medium hover:bg-white shadow-sm"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit profile
            </Link>
          </div>
        )}
      </div>

      {/* Avatar + identity */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="-mt-16 sm:-mt-20 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full ring-4 ring-stone-50 bg-stone-200 overflow-hidden shrink-0">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className="w-full h-full"
                style={mediaStyle(avatarPos)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-semibold text-stone-400">
                {(profile.display_name || '?')[0].toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 sm:pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">
                {profile.display_name}
              </h1>
              {profile.verification_state === 'verified' && (
                <ShieldCheck className="w-6 h-6 text-indigo-600" />
              )}
            </div>
            {profile.screen_name && (
              <p className="text-stone-500">@{profile.screen_name}</p>
            )}
            {profile.headline && (
              <p className="text-stone-700 mt-1">{profile.headline}</p>
            )}
            {(profile.location || profile.service_area) && (
              <p className="flex items-center gap-1.5 text-sm text-stone-500 mt-1">
                <MapPin className="w-4 h-4" />
                {profile.service_area ? `${profile.service_area}` : profile.location}
              </p>
            )}
          </div>

          {/* Actions */}
          {!isOwner && (
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
          )}
        </div>

        {/* About */}
        {profile.bio && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-2">About</h2>
            <p className="text-stone-800 whitespace-pre-line leading-relaxed">{profile.bio}</p>
          </section>
        )}

        {/* Services */}
        {profile.services?.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">Services</h2>
            <div className="flex flex-wrap gap-2">
              {profile.services.map((s) => (
                <span key={s} className="px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-700">
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Location / availability summary */}
        {(profile.location || profile.service_area || profile.profession) && (
          <section className="mt-8 grid sm:grid-cols-2 gap-4">
            {profile.profession && (
              <div className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1">Profession</div>
                <div className="text-stone-800">{profile.profession}</div>
              </div>
            )}
            {profile.location && (
              <div className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1">Location</div>
                <div className="text-stone-800">{profile.location}</div>
              </div>
            )}
            {profile.service_area && (
              <div className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1">Service area</div>
                <div className="text-stone-800">{profile.service_area}</div>
              </div>
            )}
            <div className="bg-white rounded-xl border border-stone-200 p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1">Availability</div>
                <div className="text-stone-800">Book a session</div>
              </div>
              {!isOwner && (
                <button onClick={handleBook} className="text-indigo-600 text-sm font-medium hover:text-indigo-700">
                  View →
                </button>
              )}
            </div>
          </section>
        )}

        <div className="h-12" />
      </div>
    </div>
  );
}