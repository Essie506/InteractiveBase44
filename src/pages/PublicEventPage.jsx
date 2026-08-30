import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '@/firebase/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';
import { useFirebase } from '@/lib/backendConfig';
import { Calendar, Clock, MapPin, Users, ShieldCheck, ArrowLeft, Video, Wifi, Globe } from 'lucide-react';
import { formatDistance } from '@/lib/geo';
import { useAuth } from '@/lib/AuthContext';

// Public Event page — /e/:eventId
// ───────────────────────────────────────────────────────────
// Reads from the calendarEventsPublic projection (public-read,
// public-safe fields only). meeting_url is NEVER shown here —
// it is revealed only through the booking/attendance flow.
//
// Privacy: the projection carries no attendee identities or
// private booking records. Location coordinates are only present
// if the event owner consented to public geo exposure.

const EVENTS_PUBLIC = 'calendarEventsPublic';

function formatFullDate(startIso, endIso, timezone) {
  if (!startIso) return '';
  try {
    const s = new Date(startIso);
    const e = endIso ? new Date(endIso) : null;
    const dateStr = s.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const timeFmt = { hour: 'numeric', minute: '2-digit' };
    const sStr = s.toLocaleTimeString('en-GB', timeFmt);
    if (e) {
      const eStr = e.toLocaleTimeString('en-GB', timeFmt);
      return `${dateStr} · ${sStr} – ${eStr}`;
    }
    return `${dateStr} · ${sStr}`;
  } catch {
    return '';
  }
}

function FormatBadge({ locationType }) {
  const icon = locationType === 'online' ? <Video className="w-4 h-4" /> :
    locationType === 'hybrid' ? <Wifi className="w-4 h-4" /> :
    <MapPin className="w-4 h-4" />;
  const label = locationType === 'online' ? 'Online Event' :
    locationType === 'hybrid' ? 'Hybrid Event' : 'In-Person Event';
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-stone-600">
      {icon}
      {label}
    </span>
  );
}

export default function PublicEventPage() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!useFirebase || !eventId) {
      setLoading(false);
      return;
    }
    getDoc(doc(db, EVENTS_PUBLIC, eventId))
      .then(snap => {
        if (!snap.exists()) {
          setError('Event not found');
          return;
        }
        const data = snap.data();
        // Only show public, non-cancelled events
        if (data.visibility !== 'public' || data.lifecycle_state === 'cancelled') {
          setError('Event not found');
          return;
        }
        setEvent({ id: snap.id, ...data });
      })
      .catch(err => setError(err.message || 'Could not load event'))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center px-4">
        <Calendar className="w-12 h-12 text-stone-300 mb-4" />
        <h1 className="text-xl font-semibold text-stone-700 mb-2">{error}</h1>
        <Link to="/directory" className="text-sm text-indigo-600 font-medium hover:underline">
          Back to Directory
        </Link>
      </div>
    );
  }

  const isFree = event.is_free;
  const priceLabel = isFree ? 'Free' : `£${(event.price_pence / 100).toFixed(2)}`;
  const verified = event.host?.verification_state === 'verified';
  const hasSpaces = event.availability_state === 'available' ||
    (typeof event.spaces_remaining === 'number' && event.spaces_remaining > 0);
  const services = event.services || [];

  // Host link — professional → /p/:screenName, business → /b/:businessId
  const hostLink = event.host?.type === 'professional' && event.host?.screen_name
    ? `/p/${event.host.screen_name}`
    : event.host?.type === 'business' && event.host?.business_id
    ? `/b/${event.host.business_id}`
    : null;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/directory" className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900">
            <ArrowLeft className="w-4 h-4" />
            Directory
          </Link>
          {!user && (
            <Link to="/login" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              Sign In
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Cover image */}
        {event.cover_url && (
          <div className="mb-6 rounded-xl overflow-hidden h-56 sm:h-72 bg-stone-100">
            <img src={event.cover_url} alt={event.title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <FormatBadge locationType={event.location_type} />
              {verified && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full font-medium">
                  <ShieldCheck className="w-3 h-3" />
                  Verified Host
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-stone-800 mb-2">{event.title}</h1>

            {event.host && (
              <p className="text-sm text-stone-500 mb-4">
                Hosted by{' '}
                {hostLink ? (
                  <Link to={hostLink} className="text-indigo-600 font-medium hover:underline">
                    {event.host.display_name}
                  </Link>
                ) : (
                  <span className="font-medium text-stone-700">{event.host.display_name}</span>
                )}
              </p>
            )}

            {event.description && (
              <p className="text-stone-600 whitespace-pre-wrap mb-6">{event.description}</p>
            )}

            {services.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-stone-700 mb-2">Activity</h2>
                <div className="flex flex-wrap gap-2">
                  {services.map(s => (
                    <span key={s.id || s.label} className="text-sm px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full">
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar — event details + booking */}
          <aside className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-stone-200 p-5 sticky top-24">
              <div className="text-2xl font-bold text-stone-800 mb-4">{priceLabel}</div>

              <div className="space-y-3 text-sm">
                {event.start_time && (
                  <div className="flex items-start gap-2.5">
                    <Calendar className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium text-stone-700">Date & Time</div>
                      <div className="text-stone-500">
                        {formatFullDate(event.start_time, event.end_time, event.timezone)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-stone-700">Location</div>
                    <div className="text-stone-500">
                      {event.location_label || (event.location_type === 'online' ? 'Online' : 'TBA')}
                    </div>
                    {event._distance != null && (
                      <div className="text-xs text-indigo-600 font-medium mt-0.5">
                        {formatDistance(event._distance)} away
                      </div>
                    )}
                  </div>
                </div>

                {event.capacity && (
                  <div className="flex items-start gap-2.5">
                    <Users className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium text-stone-700">Capacity</div>
                      <div className="text-stone-500">
                        {hasSpaces
                          ? `${event.spaces_remaining} of ${event.capacity} spaces remaining`
                          : 'Fully booked'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Booking action */}
              <div className="mt-5 pt-5 border-t border-stone-100">
                {hasSpaces ? (
                  <Link
                    to={`/book/${event.event_id}`}
                    className="block w-full text-center px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                  >
                    {isFree ? 'Reserve Spot' : 'Book Now'}
                  </Link>
                ) : (
                  <button
                    disabled
                    className="block w-full text-center px-4 py-2.5 bg-stone-100 text-stone-400 rounded-lg text-sm font-medium cursor-not-allowed"
                  >
                    Fully Booked
                  </button>
                )}
                <p className="text-xs text-stone-400 mt-2 text-center">
                  {event.location_type === 'online'
                    ? 'Meeting link revealed after booking'
                    : 'Exact address revealed after booking'}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}