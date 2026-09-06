import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { guestLookupBooking, guestCancelBooking, guestRescheduleBooking } from '@/services/bookingService';
import GuestBookingLookupForm from '@/components/booking/GuestBookingLookupForm';
import GuestBookingDetails from '@/components/booking/GuestBookingDetails';
import GuestBookingActions from '@/components/booking/GuestBookingActions';
import GuestRescheduleDialog from '@/components/booking/GuestRescheduleDialog';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';

export default function GuestBookingManage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [bookingId, setBookingId] = useState(searchParams.get('booking') || '');
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionState, setActionState] = useState({ type: null, loading: false, error: null });
  const [showReschedule, setShowReschedule] = useState(false);

  // Auto-lookup if both email and booking ID are in the URL (e.g. from booking confirmation)
  useEffect(() => {
    const urlEmail = searchParams.get('email');
    const urlBooking = searchParams.get('booking');
    if (urlEmail && urlBooking) {
      handleLookup(urlEmail, urlBooking);
    }
  }, []);

  const handleLookup = async (lookupEmail, lookupBookingId) => {
    setLoading(true);
    setError(null);
    setBooking(null);
    try {
      const result = await guestLookupBooking(lookupEmail, lookupBookingId);
      setBooking(result.booking);
      setEmail(lookupEmail);
      setBookingId(lookupBookingId);
      // Persist to URL for shareable link
      setSearchParams({ email: lookupEmail, booking: lookupBookingId });
    } catch (err) {
      const msg = err?.message || 'Booking not found';
      if (msg.includes('not-found') || msg.includes('not found')) {
        setError('No booking found with that reference. Check your confirmation email for the correct booking ID.');
      } else if (msg.includes('permission-denied') || msg.includes('does not match')) {
        setError('The email address does not match this booking. Use the email you booked with.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (reason) => {
    setActionState({ type: 'cancel', loading: true, error: null });
    try {
      await guestCancelBooking(email, bookingId, reason);
      // Refresh booking to show cancelled state
      const result = await guestLookupBooking(email, bookingId);
      setBooking(result.booking);
      setActionState({ type: null, loading: false, error: null });
    } catch (err) {
      setActionState({ type: 'cancel', loading: false, error: err?.message || 'Failed to cancel booking' });
    }
  };

  const handleReschedule = async (newStartTime, newEndTime, reason) => {
    setActionState({ type: 'reschedule', loading: true, error: null });
    try {
      await guestRescheduleBooking(email, bookingId, newStartTime, newEndTime, reason);
      // Refresh booking to show new time
      const result = await guestLookupBooking(email, bookingId);
      setBooking(result.booking);
      setActionState({ type: null, loading: false, error: null });
      setShowReschedule(false);
    } catch (err) {
      setActionState({ type: 'reschedule', loading: false, error: err?.message || 'Failed to reschedule booking' });
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">I</span>
            </div>
            <span className="font-semibold text-stone-800">Manage Booking</span>
          </div>
          <Link to="/directory" className="text-sm text-stone-500 hover:text-stone-800 inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to Directory
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        {!booking && !loading && (
          <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-stone-900 mb-2">Manage your booking</h1>
            <p className="text-stone-500 text-sm mb-6">
              Enter the email you booked with and your booking reference to view, reschedule, or cancel your booking.
              Your booking reference was included in your booking confirmation.
            </p>
            <GuestBookingLookupForm
              initialEmail={email}
              initialBookingId={bookingId}
              onSubmit={handleLookup}
              loading={loading}
              error={error}
            />
          </div>
        )}

        {loading && !booking && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-stone-300 animate-spin" />
          </div>
        )}

        {booking && (
          <div className="space-y-4">
            {actionState.error && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700">{actionState.error}</p>
              </div>
            )}

            <GuestBookingDetails booking={booking} />

            <GuestBookingActions
              booking={booking}
              onCancel={handleCancel}
              onReschedule={() => setShowReschedule(true)}
              actionLoading={actionState.loading}
              actionType={actionState.type}
            />

            <div className="text-center pt-2">
              <button
                onClick={() => { setBooking(null); setSearchParams({}); }}
                className="text-sm text-stone-500 hover:text-stone-800"
              >
                Look up a different booking
              </button>
            </div>
          </div>
        )}

        {showReschedule && booking && (
          <GuestRescheduleDialog
            booking={booking}
            onConfirm={handleReschedule}
            onClose={() => { setShowReschedule(false); setActionState({ type: null, loading: false, error: null }); }}
            loading={actionState.type === 'reschedule' && actionState.loading}
          />
        )}
      </div>
    </div>
  );
}