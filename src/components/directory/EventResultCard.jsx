import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, ArrowRight, ShieldCheck, Users, Video, Wifi } from 'lucide-react';
import { formatDistance } from '@/lib/geo';
import MatchBadge from './MatchBadge';

// Horizontal image-led directory card for a public Calendar Event.
// Click-through navigates to the /e/:eventId route.
//
// When isDemo is true (dev ?demo=1 mode), the card renders visually
// identically but as a non-navigating <div> with a "Demo" badge
// instead of the "View Event" link — demo listings are local seed
// data, not real Firebase events, so navigation would produce a
// misleading "Event not found" page.

function formatEventDate(startIso, timezone) {
  if (!startIso) return '';
  try {
    const d = new Date(startIso);
    return d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return '';
  }
}

function formatEventTime(startIso, endIso) {
  if (!startIso) return '';
  try {
    const s = new Date(startIso);
    const e = endIso ? new Date(endIso) : null;
    const fmt = { hour: 'numeric', minute: '2-digit' };
    const sStr = s.toLocaleTimeString('en-GB', fmt);
    if (e) {
      const eStr = e.toLocaleTimeString('en-GB', fmt);
      return `${sStr} – ${eStr}`;
    }
    return sStr;
  } catch {
    return '';
  }
}

function FormatIcon({ locationType }) {
  if (locationType === 'online') return <Video className="w-3.5 h-3.5" />;
  if (locationType === 'hybrid') return <Wifi className="w-3.5 h-3.5" />;
  return <MapPin className="w-3.5 h-3.5" />;
}

function formatLabel(locationType) {
  if (locationType === 'online') return 'Online';
  if (locationType === 'hybrid') return 'Hybrid';
  return 'In-person';
}

export default function EventResultCard({ profile: event, isDemo }) {
  const services = event.services || [];
  const visibleServices = services.slice(0, 3);
  const extraServices = services.length - visibleServices.length;
  const listingImage = event.cover_url;
  const verified = event.host?.verification_state === 'verified';
  const hostName = event.host?.display_name;
  const isFree = event.is_free;
  const priceLabel = isFree ? 'Free' : `£${(event.price_pence / 100).toFixed(2)}`;
  const hasSpaces = event.availability_state === 'available' ||
    (typeof event.spaces_remaining === 'number' && event.spaces_remaining > 0);

  const footerRight = isDemo ? (
    <span className="inline-flex items-center text-xs px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">
      Demo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 group-hover:gap-2 transition-all">
      View Event
      <ArrowRight className="w-4 h-4" />
    </span>
  );

  const cardBody = (
    <>
      {/* Image area */}
      <div className="relative sm:w-[35%] sm:max-w-[300px] h-48 sm:h-auto sm:min-h-[220px] shrink-0 bg-gradient-to-br from-indigo-100 to-stone-100">
        {listingImage ? (
          <img src={listingImage} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Calendar className="w-12 h-12 text-stone-300" />
          </div>
        )}
        {/* Price badge */}
        <span className="absolute top-3 right-3 inline-flex items-center text-xs px-2.5 py-1 bg-white/95 text-stone-800 rounded-full font-semibold shadow-sm">
          {priceLabel}
        </span>
        {verified && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-xs px-2 py-1 bg-emerald-500 text-white rounded-full font-medium shadow-sm">
            <ShieldCheck className="w-3 h-3" />
            Verified
          </span>
        )}
      </div>

      {/* Info area */}
      <div className="flex-1 p-5 flex flex-col">
        <div className="mb-1.5">
          <h3 className="text-lg font-semibold text-stone-800 truncate group-hover:text-indigo-600 transition-colors">
            {event.title}
          </h3>
          {hostName && (
            <p className="text-sm text-stone-500 truncate">by {hostName}</p>
          )}
        </div>

        {/* Date / time / format row */}
        <div className="flex items-center gap-3 text-sm text-stone-600 mb-2 flex-wrap">
          {event.start_time && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              {formatEventDate(event.start_time, event.timezone)}
            </span>
          )}
          {event.start_time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              {formatEventTime(event.start_time, event.end_time)}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <FormatIcon locationType={event.location_type} />
            {formatLabel(event.location_type)}
          </span>
        </div>

        {/* Location or distance */}
        {event.location_label && (
          <div className="flex items-center gap-1 text-sm text-stone-500 mb-2">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{event.location_label}</span>
            {event._distance != null && (
              <span className="text-xs text-indigo-600 font-medium shrink-0">· {formatDistance(event._distance)}</span>
            )}
          </div>
        )}

        {event.description && (
          <p className="text-sm text-stone-600 line-clamp-2 mb-3">{event.description}</p>
        )}

        {/* Activity tags */}
        {visibleServices.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {visibleServices.map(s => (
              <span key={s.id || s.label} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
                {s.label}
              </span>
            ))}
            {extraServices > 0 && (
              <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-500 rounded-full">
                +{extraServices}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto pt-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MatchBadge matchScore={event._matchScore} />
            {event.capacity && (
              <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                <Users className="w-3.5 h-3.5" />
                {hasSpaces ? `${event.spaces_remaining} spaces left` : 'Full'}
              </span>
            )}
          </div>
          {footerRight}
        </div>
      </div>
    </>
  );

  if (isDemo) {
    return (
      <div className="group block bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          {cardBody}
        </div>
      </div>
    );
  }

  return (
    <Link
      to={`/e/${event.event_id}`}
      className="group block bg-white rounded-xl border border-stone-200 overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all"
    >
      <div className="flex flex-col sm:flex-row">
        {cardBody}
      </div>
    </Link>
  );
}