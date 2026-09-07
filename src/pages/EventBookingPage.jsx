// EventBookingPage — book attendance at a public Calendar Event
// ───────────────────────────────────────────────────────────
// Converges on the same Booking System as profile booking and
// provider-initiated booking. The booking draft carries event_id
// so the server resolves the authoritative event price, capacity,
// and lifecycle state. Free events confirm immediately; paid events
// proceed through Stripe Elements.
//
// Route: /book/event/:eventId
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/firebase/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';
import { useFirebase } from '@/lib/backendConfig';
import { createBookingDraft, confirmFreeBooking } from '@/services/bookingService';
import { callGetStripeConfig } from '@/services/firebaseFunctions';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import BookingPaymentForm from '@/components/booking/BookingPaymentForm';
import { ArrowLeft, Calendar, Clock, MapPin, Users, Loader2, Check, AlertCircle, User } from 'lucide-react';

const EVENTS_PUBLIC = 'calendarEventsPublic';

export default function EventBookingPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [paymentStep, setPaymentStep] = useState(null);
  const [error, setError] = useState('');
  const [stripePromise, setStripePromise] = useState(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  const isGuest = !user;

  useEffect(() => {
    if (!useFirebase || !eventId) { setLoading(false); return; }
    getDoc(doc(db, EVENTS_PUBLIC, eventId))
      .then(snap => {
        if (!snap.exists()) { setNotFound(true); return; }
        const data = snap.data();
        if (data.visibility !== 'public' || ['cancelled', 'historical', 'removed', 'superseded'].includes(data.lifecycle_state)) {
          setNotFound(true); return;
        }
        setEvent({ id: snap.id, ...data });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [eventId]);

  // Load Stripe for paid events
  useEffect(() => {
    if (event && !event.is_free && !stripePromise) {
      callGetStripeConfig({})
        .then(config => setStripePromise(loadStripe(config.publishable_key)))
        .catch(() => {});
    }
  }, [event, stripePromise]);

  const handleBook = async () => {
    if (isGuest && !guestEmail.trim()) {
      setError('Please enter your email to complete the booking.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const draftData = {
        provider_identity_id: event.host?.identity_id || event.owner_id,
        service_id: 'event',
        booking_type: 'event',
        start_time: event.start_time,
        end_time: event.end_time,
        timezone: event.timezone || 'UTC',
        base_price_pence: event.is_free ? 0 : (event.price_pence || 0),
        currency: 'GBP',
        payment_route: event.is_free ? 'free' : 'pay_through_interactive',
        cancellation_policy: { deadline_hours: 24, refund_percentage: 100 },
        location_context: event.location_type || 'physical',
        event_id: event.id,
        attendee_quantity: 1,
      };

      if (isGuest) {
        draftData.guest = {
          email: guestEmail.trim(),
          display_name: guestName.trim() || undefined,
          phone: guestPhone.trim() || undefined,
        };
      }

      const draft = await createBookingDraft(draftData);

      if (draft.payment_requirement === 'required' && stripePromise) {
        setPaymentStep({ bookingId: draft.booking_id });
        setSubmitting(false);
      } else {
        await confirmFreeBooking(draft.booking_id, isGuest ? guestEmail.trim() : undefined);
        setConfirmed(true);
      }
    } catch (err) {
      setError(err.message || 'Could not book this event');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSuccess = () => { setConfirmed(true); setPaymentStep(null); };
  const handlePaymentError = (msg) => { setError(msg); setPaymentStep(null); };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-stone-50 p-6">
        <AlertCircle className="w-10 h-10 text-stone-400 mb-3" />
        <h1 className="text-xl font-semibold text-stone-800 mb-1">Event not available</h1>
        <Link to="/directory" className="text-indigo-600 font-medium">Browse events</Link>
      </div>
    );
  }

  const isFree = event.is_free;
  const priceLabel = isFree ? 'Free' : `£${(event.price_pence / 100).toFixed(2)}`;
  const hasSpaces = event.availability_state === 'available' ||
    (typeof event.spaces_remaining === 'number' && event.spaces_remaining > 0);

  return (
    <div className="min-h-screen bg-stone-50 p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <Link to={`/e/${eventId}`} className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to event
        </Link>

        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Book your spot</h1>
        <p className="text-stone-500 mb-6">{event.title}</p>

        {confirmed ? (
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold text-stone-800 mb-1">
              {isFree ? 'Spot reserved!' : 'Booking confirmed!'}
            </h2>
            <p className="text-stone-500 mb-4">
              {isFree ? 'Your spot has been reserved. ' : 'Your payment has been processed. '}
              {isGuest && `A confirmation will be sent to ${guestEmail}.`}
            </p>
            {isGuest ? (
              <Link
                to={`/booking/manage?email=${encodeURIComponent(guestEmail)}&booking=${paymentStep?.bookingId || ''}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                Manage my booking
              </Link>
            ) : (
              <Link to="/calendar" className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                View Calendar
              </Link>
            )}
          </div>
        ) : paymentStep ? (
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="text-lg font-semibold text-stone-800 mb-1">Payment</h2>
            <p className="text-sm text-stone-500 mb-4">{event.title} · {priceLabel}</p>
            {stripePromise ? (
              <Elements stripe={stripePromise}>
                <BookingPaymentForm
                  bookingId={paymentStep.bookingId}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </Elements>
            ) : (
              <p className="text-sm text-red-500">Could not load payment system.</p>
            )}
            <button onClick={() => { setPaymentStep(null); setError(''); }} className="mt-3 text-sm text-stone-500 hover:text-stone-700">Cancel</button>
          </div>
        ) : (
          <>
            {/* Event summary */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2.5">
                  <Calendar className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-stone-700">Date & Time</div>
                    <div className="text-stone-500">
                      {new Date(event.start_time).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                      {' at '}
                      {new Date(event.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-stone-700">Location</div>
                    <div className="text-stone-500">{event.location_label || (event.location_type === 'online' ? 'Online' : 'TBA')}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Users className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-stone-700">Capacity</div>
                    <div className="text-stone-500">
                      {hasSpaces ? `${event.spaces_remaining} of ${event.capacity} spaces remaining` : 'Fully booked'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-stone-100">
                <div className="text-2xl font-bold text-stone-800">{priceLabel}</div>
              </div>
            </div>

            {/* Guest checkout form */}
            {isGuest && (
              <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
                <h2 className="font-semibold text-stone-800 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-600" /> Your details
                </h2>
                <p className="text-sm text-stone-500 mb-3">No account needed — just provide your contact info.</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Email <span className="text-red-500">*</span></label>
                    <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="you@example.com" className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Name</label>
                    <input type="text" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Your name" className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Phone</label>
                    <input type="tel" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} placeholder="Optional" className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            <button
              onClick={handleBook}
              disabled={!hasSpaces || submitting || (isGuest && !guestEmail.trim())}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? 'Processing...' : isFree ? 'Reserve Spot' : 'Book & Pay'}
            </button>
            {!hasSpaces && <p className="text-xs text-red-500 mt-2 text-center">This event is fully booked.</p>}
          </>
        )}
      </div>
    </div>
  );
}