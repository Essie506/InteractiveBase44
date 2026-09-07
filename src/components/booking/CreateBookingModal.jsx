// CreateBookingModal — provider-initiated booking creation
// ───────────────────────────────────────────────────────────
// Uses the same interaction pattern as the Calendar EventModal:
// a drawer-style modal with service selection, customer/guest input,
// date/time picking from availability rules, price/payment config,
// location, notes, and cancellation policy.
//
// Calls createProviderBooking → the booking is created in 'draft' state
// with the specified customer. The customer receives a booking invitation
// notification. Free bookings can be confirmed by the customer via
// confirmFreeBooking; paid bookings require the customer to pay via
// createPaymentIntent.
import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Loader2, Calendar, Clock, User, Briefcase, MapPin, PoundSterling, FileText, Shield } from 'lucide-react';
import { getAvailabilityForDate, getLocalTimezone } from '@/lib/calendar';
import { createProviderBooking } from '@/services/bookingService';
import { callFindUserByEmail } from '@/services/firebaseFunctions';
import { useToast } from '@/components/ui/use-toast';

const PAYMENT_ROUTES = [
  { value: 'free', label: 'Free', needsStripe: false },
  { value: 'arrange_directly', label: 'Arrange directly', needsStripe: false },
  { value: 'pay_later', label: 'Pay later', needsStripe: false },
  { value: 'pay_through_interactive', label: 'Pay through Interactive', needsStripe: true },
  { value: 'full_payment', label: 'Full payment (Stripe)', needsStripe: true },
  { value: 'deposit', label: 'Deposit (Stripe)', needsStripe: true },
  { value: 'external_payment', label: 'External payment', needsStripe: false },
];

const LOCATION_TYPES = [
  { value: 'physical', label: 'In person' },
  { value: 'online', label: 'Online' },
  { value: 'hybrid', label: 'Hybrid' },
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

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onCreated: (booking: any) => void,
 *   services: array,
 *   providerIdentityId: string,
 *   businessId?: string | null,
 *   operatingContext: string,
 * }} props
 */
export default function CreateBookingModal({ open, onClose, onCreated, services, providerIdentityId, businessId, operatingContext }) {
  const { toast } = useToast();
  const [step, setStep] = useState(1); // 1=service+customer, 2=date+time, 3=details
  const [selectedService, setSelectedService] = useState(null);
  const [customerMode, setCustomerMode] = useState('guest'); // 'guest' | 'identity'
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [customerResolved, setCustomerResolved] = useState(null);
  const [selectedDate, setSelectedDate] = useState(nextDays(1)[0]);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isFree, setIsFree] = useState(true);
  const [pricePence, setPricePence] = useState(0);
  const [paymentRoute, setPaymentRoute] = useState('free');
  const [locationType, setLocationType] = useState('physical');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [cancellationHours, setCancellationHours] = useState(24);
  const [cancellationRefund, setCancellationRefund] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedService(null);
      setCustomerMode('guest');
      setGuestEmail('');
      setGuestName('');
      setGuestPhone('');
      setCustomerId('');
      setCustomerResolved(null);
      setSelectedDate(nextDays(1)[0]);
      setSlots([]);
      setSelectedSlot(null);
      setIsFree(true);
      setPricePence(0);
      setPaymentRoute('free');
      setLocationType('physical');
      setMeetingUrl('');
      setLocationLabel('');
      setNotes('');
      setCancellationHours(24);
      setCancellationRefund(100);
      setError('');
    }
  }, [open]);

  // Filter bookable services
  const bookableServices = useMemo(() => {
    return (services || []).filter(s => s.is_active && s.duration_minutes);
  }, [services]);

  // Auto-fill from selected service
  useEffect(() => {
    if (selectedService) {
      setIsFree(selectedService.is_free ?? true);
      setPricePence(selectedService.price_pence || 0);
      setPaymentRoute(selectedService.payment_route || (selectedService.is_free ? 'free' : 'arrange_directly'));
      setLocationType(selectedService.location_type || 'physical');
    }
  }, [selectedService]);

  // Load availability slots when date or service changes.
  // For business bookings the availability owner is the business ID;
  // for professional bookings it is the provider identity ID.
  const availabilityOwner = businessId || providerIdentityId;
  useEffect(() => {
    if (!open || !selectedService || !availabilityOwner) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    getAvailabilityForDate(availabilityOwner, operatingContext, selectedDate)
      .then(rules => setSlots(generateSlots(rules, selectedService.duration_minutes)))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [open, selectedService, selectedDate, availabilityOwner, operatingContext]);

  // Customer email lookup
  const handleCustomerLookup = async () => {
    if (!customerId.trim()) return;
    setCustomerLookupLoading(true);
    setCustomerResolved(null);
    try {
      const result = await callFindUserByEmail({ email: customerId.trim() });
      if (result?.identity_id) {
        setCustomerResolved({ identity_id: result.identity_id, display_name: result.display_name || result.email });
      } else {
        setError('No Interactive user found with that email. Use guest mode instead.');
      }
    } catch {
      setError('Could not look up user. Try guest mode instead.');
    } finally {
      setCustomerLookupLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedService || !selectedSlot) return;
    if (customerMode === 'guest' && !guestEmail.trim()) {
      setError('Guest email is required');
      return;
    }
    if (customerMode === 'identity' && !customerResolved?.identity_id) {
      setError('Please look up and resolve the customer first');
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
        service_id: selectedService.id || selectedService.label || 'general',
        booking_type: selectedService.booking_type || 'session',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        timezone: getLocalTimezone(),
        base_price_pence: isFree ? 0 : pricePence,
        currency: 'GBP',
        payment_route: isFree ? 'free' : paymentRoute,
        cancellation_policy: { deadline_hours: cancellationHours, refund_percentage: cancellationRefund },
        location_context: locationType,
        meeting_url: locationType !== 'physical' ? meetingUrl : undefined,
        notes: notes.trim() || undefined,
        business_id: businessId || undefined,
      };

      if (customerMode === 'identity' && customerResolved) {
        draftData.customer_identity_id = customerResolved.identity_id;
      } else {
        draftData.guest = {
          email: guestEmail.trim(),
          display_name: guestName.trim() || undefined,
          phone: guestPhone.trim() || undefined,
        };
      }

      const result = await createProviderBooking(draftData);
      toast({ title: 'Booking created', description: 'The customer will receive an invitation.' });
      onCreated(result);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not create booking');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const canProceedStep1 = selectedService && (
    (customerMode === 'guest' && guestEmail.trim()) ||
    (customerMode === 'identity' && customerResolved?.identity_id)
  );
  const canConfirm = selectedService && selectedSlot && canProceedStep1;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-stone-800">Create Booking</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg">
            <X className="w-4 h-4 text-stone-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2 py-1 rounded-full ${step >= 1 ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-500'}`}>1. Service & Customer</span>
            <span className={`px-2 py-1 rounded-full ${step >= 2 ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-500'}`}>2. Date & Time</span>
            <span className={`px-2 py-1 rounded-full ${step >= 3 ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-500'}`}>3. Details</span>
          </div>

          {/* Step 1: Service & Customer */}
          {step === 1 && (
            <>
              {/* Service selection */}
              <div>
                <label className="text-sm font-medium text-stone-700 mb-2 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-indigo-600" /> Service
                </label>
                {bookableServices.length === 0 ? (
                  <p className="text-sm text-stone-400 p-3 bg-stone-50 rounded-lg">No bookable services configured. Add services with duration in the Services page first.</p>
                ) : (
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
                            <span className="font-medium text-stone-800 text-sm">{s.label}</span>
                            <div className="flex items-center gap-2 text-xs text-stone-500">
                              <span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" /> {s.duration_minutes}m</span>
                              {s.is_free ? <span className="text-emerald-600 font-medium">Free</span> : <span className="font-medium">£{(s.price_pence / 100).toFixed(2)}</span>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Customer selection */}
              {selectedService && (
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-2 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-indigo-600" /> Customer
                  </label>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => { setCustomerMode('guest'); setCustomerResolved(null); }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${customerMode === 'guest' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-600'}`}
                    >
                      Guest (email)
                    </button>
                    <button
                      onClick={() => setCustomerMode('identity')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${customerMode === 'identity' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-600'}`}
                    >
                      Interactive user
                    </button>
                  </div>

                  {customerMode === 'guest' ? (
                    <div className="space-y-3">
                      <div>
                        <input
                          type="email"
                          value={guestEmail}
                          onChange={e => setGuestEmail(e.target.value)}
                          placeholder="customer@email.com"
                          className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                        />
                      </div>
                      <input
                        type="text"
                        value={guestName}
                        onChange={e => setGuestName(e.target.value)}
                        placeholder="Name (optional)"
                        className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                      />
                      <input
                        type="tel"
                        value={guestPhone}
                        onChange={e => setGuestPhone(e.target.value)}
                        placeholder="Phone (optional)"
                        className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={customerId}
                          onChange={e => setCustomerId(e.target.value)}
                          placeholder="user@email.com"
                          className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                        />
                        <button
                          onClick={handleCustomerLookup}
                          disabled={!customerId.trim() || customerLookupLoading}
                          className="px-3 py-2 bg-stone-100 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-200 disabled:opacity-50"
                        >
                          {customerLookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Find'}
                        </button>
                      </div>
                      {customerResolved && (
                        <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                          ✓ {customerResolved.display_name}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-red-500">{error}</p>}

              {canProceedStep1 && (
                <button
                  onClick={() => { setError(''); setStep(2); }}
                  className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 text-sm"
                >
                  Continue to date & time
                </button>
              )}
            </>
          )}

          {/* Step 2: Date & Time */}
          {step === 2 && (
            <>
              <div>
                <label className="text-sm font-medium text-stone-700 mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Date
                </label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {nextDays(14).map(d => {
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

              <div>
                <label className="text-sm font-medium text-stone-700 mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" /> Available times ({selectedService?.duration_minutes || 60} min slots)
                </label>
                {loadingSlots ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-indigo-600 animate-spin" /></div>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-stone-400 p-3 bg-stone-50 rounded-lg">No availability on this day. Try another date.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {slots.map(s => {
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

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 bg-stone-100 text-stone-700 rounded-lg font-medium hover:bg-stone-200 text-sm">Back</button>
                {selectedSlot && (
                  <button onClick={() => { setError(''); setStep(3); }} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 text-sm">
                    Continue to details
                  </button>
                )}
              </div>
            </>
          )}

          {/* Step 3: Details */}
          {step === 3 && (
            <>
              {/* Price & Payment */}
              <div>
                <label className="text-sm font-medium text-stone-700 mb-2 flex items-center gap-1.5">
                  <PoundSterling className="w-3.5 h-3.5 text-indigo-600" /> Price & Payment
                </label>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isFree} onChange={e => { setIsFree(e.target.checked); if (e.target.checked) setPaymentRoute('free'); }} className="rounded" />
                    Free booking
                  </label>
                  {!isFree && (
                    <>
                      <div>
                        <label className="block text-xs text-stone-500 mb-1">Price (£)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={(pricePence / 100).toFixed(2)}
                          onChange={e => setPricePence(Math.round(parseFloat(e.target.value || 0) * 100))}
                          className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-stone-500 mb-1">Payment route</label>
                        <select
                          value={paymentRoute}
                          onChange={e => setPaymentRoute(e.target.value)}
                          className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 bg-white"
                        >
                          {PAYMENT_ROUTES.filter(r => r.value !== 'free').map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-sm font-medium text-stone-700 mb-2 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" /> Location
                </label>
                <select
                  value={locationType}
                  onChange={e => setLocationType(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 bg-white mb-2"
                >
                  {LOCATION_TYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                {locationType !== 'physical' && (
                  <input
                    type="url"
                    value={meetingUrl}
                    onChange={e => setMeetingUrl(e.target.value)}
                    placeholder="Meeting URL (e.g. https://zoom.us/...)"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 mb-2"
                  />
                )}
                {locationType !== 'online' && (
                  <input
                    type="text"
                    value={locationLabel}
                    onChange={e => setLocationLabel(e.target.value)}
                    placeholder="Venue name or address"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                  />
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-stone-700 mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" /> Notes for customer
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any details the customer should know..."
                  rows={3}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 resize-none"
                />
              </div>

              {/* Cancellation policy */}
              <div>
                <label className="text-sm font-medium text-stone-700 mb-2 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-indigo-600" /> Cancellation policy
                </label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-stone-500 mb-1">Deadline (hours before)</label>
                    <input
                      type="number"
                      value={cancellationHours}
                      onChange={e => setCancellationHours(parseInt(e.target.value || 24))}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-stone-500 mb-1">Refund (%)</label>
                    <input
                      type="number"
                      value={cancellationRefund}
                      onChange={e => setCancellationRefund(parseInt(e.target.value || 100))}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-stone-50 rounded-lg p-3 text-sm text-stone-600 space-y-1">
                <div><strong>Service:</strong> {selectedService?.label}</div>
                <div><strong>When:</strong> {selectedDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at {selectedSlot?.start_time}</div>
                <div><strong>Customer:</strong> {customerMode === 'guest' ? guestEmail : customerResolved?.display_name}</div>
                <div><strong>Price:</strong> {isFree ? 'Free' : `£${(pricePence / 100).toFixed(2)}`}</div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex gap-2">
                <button onClick={() => setStep(2)} disabled={submitting} className="flex-1 py-2.5 bg-stone-100 text-stone-700 rounded-lg font-medium hover:bg-stone-200 text-sm">Back</button>
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm || submitting}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Creating...' : 'Create & Send Invitation'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}