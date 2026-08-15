import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getPublicProfessionalProfile } from '@/services/profileService';
import { getAvailabilityForDate, getLocalTimezone } from '@/lib/calendar';
import { createBookingDraft, confirmFreeBooking } from '@/services/bookingService';
import { ArrowLeft, Calendar, Clock, Loader2, Check, AlertCircle } from 'lucide-react';

const DAYS = [
  { num: 1, label: 'Monday' }, { num: 2, label: 'Tuesday' }, { num: 3, label: 'Wednesday' },
  { num: 4, label: 'Thursday' }, { num: 5, label: 'Friday' }, { num: 6, label: 'Saturday' }, { num: 0, label: 'Sunday' },
];

function nextDays(count) {
  const out = [];
  const base = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
}

export default function BookingPage() {
  const { screenName } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedDate, setSelectedDate] = useState(nextDays(1)[0]);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getPublicProfessionalProfile(screenName)
      .then((p) => { if (!p) setNotFound(true); else setProfile(p); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [screenName]);

  useEffect(() => {
    if (!profile) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    getAvailabilityForDate(profile.identity_id, 'professional', selectedDate)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [profile, selectedDate]);

  const handleConfirm = async () => {
    if (!selectedSlot || !user) return;
    setSubmitting(true);
    setError('');
    try {
      const start = new Date(selectedDate);
      const [sh, sm] = selectedSlot.start_time.split(':').map(Number);
      start.setHours(sh, sm, 0, 0);
      const end = new Date(selectedDate);
      const [eh, em] = selectedSlot.end_time.split(':').map(Number);
      end.setHours(eh, em, 0, 0);

      const draft = await createBookingDraft({
        provider_identity_id: profile.identity_id,
        service_id: profile.services?.[0] || 'general',
        booking_type: 'session',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        timezone: getLocalTimezone(),
        base_price_pence: 0,
        currency: 'gbp',
        payment_route: 'arrange_directly',
        cancellation_policy: { deadline_hours: 24, refund_percentage: 100 },
      });

      await confirmFreeBooking(draft.booking_id);
      setConfirmed(true);
    } catch (err) {
      setError(err.message || 'Could not create booking');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-stone-50 p-6">
        <AlertCircle className="w-10 h-10 text-stone-400 mb-3" />
        <h1 className="text-xl font-semibold text-stone-800 mb-1">Profile not found</h1>
        <Link to="/search" className="text-indigo-600 font-medium">Browse professionals</Link>
      </div>
    );
  }

  const dates = nextDays(14);

  return (
    <div className="min-h-screen bg-stone-50 p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <Link to={`/p/${screenName}`} className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> {profile.display_name}
        </Link>

        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Book a session</h1>
        <p className="text-stone-500 mb-6">with {profile.display_name}</p>

        {confirmed ? (
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold text-stone-800 mb-1">Booking requested</h2>
            <p className="text-stone-500 mb-4">Your request has been sent. Arrange the details directly with {profile.display_name} via messages.</p>
            <Link to="/messages" className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              Go to Messages
            </Link>
          </div>
        ) : (
          <>
            {/* Date picker */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
              <h2 className="font-semibold text-stone-800 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-indigo-600" /> Choose a date</h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {dates.map((d) => {
                  const active = d.toDateString() === selectedDate.toDateString();
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => setSelectedDate(d)}
                      className={`shrink-0 w-16 py-2 rounded-lg text-center border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-stone-700 border-stone-200 hover:border-indigo-300'}`}
                    >
                      <div className="text-[10px] uppercase">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                      <div className="text-sm font-semibold">{d.getDate()}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Slots */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
              <h2 className="font-semibold text-stone-800 mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-indigo-600" /> Available times</h2>
              {loadingSlots ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-indigo-600 animate-spin" /></div>
              ) : slots.length === 0 ? (
                <p className="text-sm text-stone-400">No availability on this day. Try another date.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots.map((s) => {
                    const active = selectedSlot?.start_time === s.start_time;
                    return (
                      <button
                        key={s.start_time}
                        onClick={() => setSelectedSlot(s)}
                        className={`py-2 rounded-lg text-sm border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-stone-700 border-stone-200 hover:border-indigo-300'}`}
                      >
                        {s.start_time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            <button
              onClick={handleConfirm}
              disabled={!selectedSlot || submitting}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? 'Requesting...' : 'Request Booking'}
            </button>
            <p className="text-xs text-stone-400 mt-3 text-center">No payment required — you'll arrange details directly with {profile.display_name}.</p>
          </>
        )}
      </div>
    </div>
  );
}