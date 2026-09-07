// BookingPage — session booking with guest checkout support
// (Spec 00 §1.5 / Booking §3.9–§3.12)
//
// Authenticated users book via their Interactive identity.
// Unauthenticated visitors can complete a guest checkout by providing
// their email (and optionally name/phone) — no Interactive account is
// created. The guest_email is matched server-side against the booking
// record for authorisation (Booking §3.10–§3.11).
//
// V2: Service selection — visitors select from the professional's active
// bookable services. The selected service's duration, price, and payment
// route flow into the authoritative booking draft. Paid bookings use
// Stripe Elements; free/arrange_directly bookings use confirmFreeBooking.
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getPublicProfessionalProfile } from '@/services/profileService';
import { getAvailabilityForDate, getLocalTimezone } from '@/lib/calendar';
import { createBookingDraft, confirmFreeBooking } from '@/services/bookingService';
import { callGetStripeConfig } from '@/services/firebaseFunctions';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import BookingPaymentForm from '@/components/booking/BookingPaymentForm';
import { ArrowLeft, Calendar, Clock, Loader2, Check, AlertCircle, User, Briefcase } from 'lucide-react';

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

// Generate time slots from availability rules, spaced by service duration
function generateSlots(availabilityRules, durationMinutes) {
  const slots = [];
  const duration = durationMinutes || 60;
  for (const rule of availabilityRules) {
    const [sh, sm] = rule.start_time.split(':').map(Number);
    const [eh, em] = rule.end_time.split(':').map(Number);
    let current = sh * 60 + sm;
    const end = eh * 60 + em;
    while (current + duration <= end) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      const endMin = current + duration;
      const eh2 = Math.floor(endMin / 60);
      const em2 = endMin % 60;
      slots.push({
        start_time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        end_time: `${String(eh2).padStart(2, '0')}:${String(em2).padStart(2, '0')}`,
      });
      current += duration;
    }
  }
  return slots;
}

export default function BookingPage() {
  const { screenName } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(nextDays(1)[0]);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedBookingId, setConfirmedBookingId] = useState(null);
  const [paymentStep, setPaymentStep] = useState(null); // null | { bookingId }
  const [error, setError] = useState('');
  const [stripePromise, setStripePromise] = useState(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  const isGuest = !user;

  // Load professional profile
  useEffect(() => {
    getPublicProfessionalProfile(screenName)
      .then((p) => { if (!p) setNotFound(true); else setProfile(p); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [screenName]);

  // Filter active bookable services
  const bookableServices = useMemo(() => {
    if (!profile?.services) return [];
    return profile.services.filter(s => s.is_active && s.duration_minutes);
  }, [profile]);

  // Auto-select if only one bookable service
  useEffect(() => {
    if (bookableServices.length === 1 && !selectedService) {
      setSelectedService(bookableServices[0]);
    }
  }, [bookableServices, selectedService]);

  // Load Stripe when a paid service is selected
  useEffect(() => {
    if (selectedService?.payment_route === 'pay_through_interactive' && !stripePromise) {
      callGetStripeConfig({})
        .then((config) => setStripePromise(loadStripe(config.publishable_key)))
        .catch(() => {});
    }
  }, [selectedService, stripePromise]);

  // Load availability slots when date or service changes
  useEffect(() => {
    if (!profile || !selectedService) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    getAvailabilityForDate(profile.identity_id, 'professional', selectedDate)
      .then((rules) => setSlots(generateSlots(rules, selectedService.duration_minutes)))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [profile, selectedDate, selectedService]);

  const handleConfirm = async () => {
    if (!selectedSlot || !selectedService) return;
    if (isGuest && !guestEmail.trim()) {
      setError('Please enter your email to complete the booking.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const start = new Date(selectedDate);
      const [sh, sm] = selectedSlot.start_time.split(':').map(Number);
      start.setHours(sh, sm, 0, 0);
      const end = new Date(selectedDate);
      const [eh, em] = selectedSlot.end_time.split(':').map(Number);
      end.setHours(eh, em, 0, 0);

      const draftData = {
        provider_identity_id: profile.identity_id,
        service_id: selectedService.id || selectedService.label || 'general',
        booking_type: selectedService.booking_type || 'session',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        timezone: getLocalTimezone(),
        base_price_pence: selectedService.is_free ? 0 : (selectedService.price_pence || 0),
        currency: 'gbp',
        payment_route: selectedService.is_free ? 'free' : (selectedService.payment_route || 'arrange_directly'),
        cancellation_policy: selectedService.cancellation_policy || { deadline_hours: 24, refund_percentage: 100 },
        location_context: selectedService.location_type || 'physical',
      };

      if (isGuest) {
        draftData.guest = {
          email: guestEmail.trim(),
          display_name: guestName.trim() || undefined,
          phone: guestPhone.trim() || undefined,
        };
      }

      const draft = await createBookingDraft(draftData);

      // Check if payment is required
      if (draft.payment_requirement === 'required' && stripePromise) {
        setPaymentStep({ bookingId: draft.booking_id });
        setSubmitting(false);
      } else {
        // Free or arrange_directly — confirm immediately
        await confirmFreeBooking(draft.booking_id, isGuest ? guestEmail.trim() : undefined);
        setConfirmedBookingId(draft.booking_id);
        setConfirmed(true);
      }
    } catch (err) {
      setError(err.message || 'Could not create booking');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSuccess = () => {
    setConfirmed(true);
    setPaymentStep(null);
  };

  const handlePaymentError = (msg) => {
    setError(msg);
    setPaymentStep(null);
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
        <Link to="/directory" className="text-indigo-600 font-medium">Browse professionals</Link>
      </div>
    );
  }

  const dates = nextDays(14);
  const requiresPayment = selectedService?.payment_route === 'pay_through_interactive' && !selectedService?.is_free;

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
            <h2 className="text-xl font-semibold text-stone-800 mb-1">
              {requiresPayment ? 'Booking confirmed' : 'Booking requested'}
            </h2>
            <p className="text-stone-500 mb-4">
              {requiresPayment
                ? 'Your payment has been processed and your booking is confirmed. '
                : 'Your request has been sent. '}
              {isGuest
                ? `A confirmation will be sent to ${guestEmail}. `
                : ''}
              {selectedService && (
                <span>{selectedService.label} · {selectedService.duration_minutes} min</span>
              )}
            </p>
            {isGuest ? (
              <div className="flex flex-col items-center gap-2">
                <Link
                  to={`/booking/manage?email=${encodeURIComponent(guestEmail)}&booking=${confirmedBookingId}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  Manage my booking
                </Link>
                <Link to="/directory" className="text-sm text-stone-500 hover:text-stone-700">
                  Back to Directory
                </Link>
              </div>
            ) : (
              <Link to="/messages" className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                Go to Messages
              </Link>
            )}
          </div>
        ) : paymentStep ? (
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="text-lg font-semibold text-stone-800 mb-1">Payment</h2>
            <p className="text-sm text-stone-500 mb-4">
              {selectedService.label} · £{(selectedService.price_pence / 100).toFixed(2)}
            </p>
            {stripePromise ? (
              <Elements stripe={stripePromise}>
                <BookingPaymentForm
                  bookingId={paymentStep.bookingId}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </Elements>
            ) : (
              <p className="text-sm text-red-500">Could not load payment system. Please try again.</p>
            )}
            <button
              onClick={() => { setPaymentStep(null); setError(''); }}
              className="mt-3 text-sm text-stone-500 hover:text-stone-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            {/* Service selection */}
            {bookableServices.length > 0 && (
              <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
                <h2 className="font-semibold text-stone-800 mb-3 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-indigo-600" /> Choose a service
                </h2>
                <div className="space-y-2">
                  {bookableServices.map((s, i) => {
                    const active = selectedService?.id === s.id && selectedService?.label === s.label;
                    return (
                      <button
                        key={(s.id || s.label) + i}
                        onClick={() => setSelectedService(s)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${active ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-stone-200 hover:border-indigo-300'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-stone-800 text-sm">{s.label}</span>
                            {s.description && <p className="text-xs text-stone-500 mt-0.5">{s.description}</p>}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-stone-500 shrink-0 ml-3">
                            <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {s.duration_minutes}m</span>
                            {s.is_free ? (
                              <span className="text-emerald-600 font-medium">Free</span>
                            ) : (
                              <span className="font-medium text-stone-700">£{(s.price_pence / 100).toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {bookableServices.length === 0 && (
              <div className="bg-white rounded-xl border border-stone-200 p-6 text-center mb-4">
                <p className="text-sm text-stone-500">This professional hasn't set up any bookable services yet.</p>
              </div>
            )}

            {/* Date picker */}
            {selectedService && (
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
            )}

            {/* Slots */}
            {selectedService && (
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
            )}

            {/* Guest checkout form */}
            {isGuest && selectedService && (
              <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
                <h2 className="font-semibold text-stone-800 mb-3 flex items-center gap-2"><User className="w-4 h-4 text-indigo-600" /> Your details</h2>
                <p className="text-sm text-stone-500 mb-3">No account needed — just provide your contact info so {profile.display_name} can reach you.</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Email <span className="text-red-500">*</span></label>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            {selectedService && (
              <button
                onClick={handleConfirm}
                disabled={!selectedSlot || submitting || (isGuest && !guestEmail.trim())}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {submitting ? 'Processing...' : requiresPayment ? 'Continue to payment' : 'Request Booking'}
              </button>
            )}
            {selectedService && !requiresPayment && (
              <p className="text-xs text-stone-400 mt-3 text-center">
                {selectedService.is_free
                  ? 'No payment required — you\'ll arrange details directly with ' + profile.display_name + '.'
                  : 'Payment arranged directly with ' + profile.display_name + '.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}