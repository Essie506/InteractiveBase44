import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, Video, User, Building2, Mail, Phone, PoundSterling } from 'lucide-react';

function formatDateTime(iso, timezone) {
  try {
    const d = new Date(iso);
    const opts = { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    if (timezone) opts.timeZone = timezone;
    return d.toLocaleString('en-GB', opts);
  } catch {
    return iso;
  }
}

function formatPrice(snapshot) {
  if (!snapshot) return 'Free';
  if (snapshot.amount_pence === 0) return 'Free';
  return `£${(snapshot.amount_pence / 100).toFixed(2)} ${snapshot.currency || 'GBP'}`;
}

const STATUS_LABELS = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  cancelled_by_customer: 'Cancelled',
  cancelled_by_provider: 'Cancelled by provider',
  cancelled_by_platform: 'Cancelled',
  completed: 'Completed',
  reschedule_requested: 'Reschedule requested',
  rescheduled: 'Rescheduled',
  no_show_customer: 'No-show recorded',
  no_show_provider: 'Provider no-show',
  requested: 'Pending confirmation',
  accepted: 'Accepted',
  awaiting_customer_confirmation: 'Awaiting your confirmation',
};

const STATUS_COLORS = {
  draft: 'bg-stone-100 text-stone-700',
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  cancelled_by_customer: 'bg-rose-100 text-rose-700',
  cancelled_by_provider: 'bg-rose-100 text-rose-700',
  cancelled_by_platform: 'bg-rose-100 text-rose-700',
  completed: 'bg-stone-100 text-stone-700',
  reschedule_requested: 'bg-amber-100 text-amber-700',
  rescheduled: 'bg-amber-100 text-amber-700',
  no_show_customer: 'bg-rose-100 text-rose-700',
  no_show_provider: 'bg-rose-100 text-rose-700',
  requested: 'bg-amber-100 text-amber-700',
  accepted: 'bg-blue-100 text-blue-700',
  awaiting_customer_confirmation: 'bg-amber-100 text-amber-700',
};

export default function GuestBookingDetails({ booking }) {
  const statusLabel = STATUS_LABELS[booking.booking_status] || booking.booking_status;
  const statusColor = STATUS_COLORS[booking.booking_status] || 'bg-stone-100 text-stone-700';
  const isCancelled = booking.booking_status?.startsWith('cancelled');
  const isPast = booking.end_time && new Date(booking.end_time) < new Date();

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {/* Status banner */}
      <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
        <div>
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">Booking Reference</p>
          <p className="font-mono text-sm text-stone-700 mt-0.5">{booking.id}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Service */}
        {booking.service_label && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Calendar className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-stone-400">Service</p>
              <p className="text-sm font-medium text-stone-800">{booking.service_label}</p>
            </div>
          </div>
        )}

        {/* Date & time */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs text-stone-400">When</p>
            <p className="text-sm font-medium text-stone-800">
              {formatDateTime(booking.start_time, booking.timezone)}
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              Duration: {Math.round((new Date(booking.end_time) - new Date(booking.start_time)) / 60000)} minutes
            </p>
          </div>
        </div>

        {/* Location */}
        {booking.location_context && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-stone-400">Location</p>
              <p className="text-sm font-medium text-stone-800">{booking.location_context}</p>
            </div>
          </div>
        )}

        {/* Meeting URL (only for confirmed bookings) */}
        {booking.meeting_url && (booking.booking_status === 'confirmed' || booking.booking_status === 'scheduled') && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Video className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-stone-400">Online meeting</p>
              <a
                href={booking.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:underline break-all"
              >
                {booking.meeting_url}
              </a>
            </div>
          </div>
        )}

        {/* Provider */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
            {booking.business_name ? <Building2 className="w-4 h-4 text-indigo-600" /> : <User className="w-4 h-4 text-indigo-600" />}
          </div>
          <div>
            <p className="text-xs text-stone-400">{booking.business_name ? 'Business' : 'Professional'}</p>
            <p className="text-sm font-medium text-stone-800">
              {booking.provider_display_name || booking.business_name || 'Your provider'}
            </p>
            {booking.provider_screen_name && (
              <Link to={`/p/${booking.provider_screen_name}`} className="text-xs text-indigo-600 hover:underline">
                View profile
              </Link>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <PoundSterling className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs text-stone-400">Total</p>
            <p className="text-sm font-medium text-stone-800">{formatPrice(booking.total_snapshot)}</p>
          </div>
        </div>

        {/* Guest details */}
        <div className="pt-3 border-t border-stone-100 space-y-2">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">Your details</p>
          <div className="flex items-center gap-2 text-sm text-stone-700">
            <Mail className="w-3.5 h-3.5 text-stone-400" /> {booking.guest_email}
          </div>
          {booking.guest_display_name && (
            <div className="flex items-center gap-2 text-sm text-stone-700">
              <User className="w-3.5 h-3.5 text-stone-400" /> {booking.guest_display_name}
            </div>
          )}
          {booking.guest_phone && (
            <div className="flex items-center gap-2 text-sm text-stone-700">
              <Phone className="w-3.5 h-3.5 text-stone-400" /> {booking.guest_phone}
            </div>
          )}
        </div>

        {/* Cancellation policy */}
        {booking.cancellation_policy_snapshot && !isCancelled && !isPast && (
          <div className="pt-3 border-t border-stone-100">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-1">Cancellation policy</p>
            <p className="text-xs text-stone-500">
              {booking.cancellation_policy_snapshot.refund_percentage}% refund if cancelled at least{' '}
              {booking.cancellation_policy_snapshot.deadline_hours} hours before the start time.
            </p>
          </div>
        )}

        {/* Reschedule history */}
        {booking.reschedule_history?.length > 0 && (
          <div className="pt-3 border-t border-stone-100">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-1.5">Reschedule history</p>
            {booking.reschedule_history.map((r, i) => (
              <p key={i} className="text-xs text-stone-500">
                {new Date(r.from_start_time).toLocaleString('en-GB')} → {new Date(r.to_start_time).toLocaleString('en-GB')}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}