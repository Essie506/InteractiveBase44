import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  getBooking,
  confirmFreeBooking,
  cancelBooking,
} from '@/services/bookingService';

import { getCurrentIdentityId } from '@/lib/currentIdentity';

export default function BookingDetail() {
  const { bookingId } = useParams();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const identityId = getCurrentIdentityId();

  const loadBooking = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await getBooking(bookingId);

      if (!result) {
        setError('Booking not found.');
        return;
      }

      const isCustomer =
        result.customer_identity_id === identityId;

      const isProvider =
        result.provider_identity_id === identityId;

      const isBusiness =
        result.business_id &&
        result.business_id === identityId;

      if (!isCustomer && !isProvider && !isBusiness) {
        setError('You do not have permission to view this booking.');
        return;
      }

      setBooking(result);
    } catch (err) {
      console.error('Failed to load booking', err);

      if (err?.code === 'permission-denied') {
        setError('You do not have permission to view this booking.');
      } else {
        setError(err?.message || 'Could not load this booking.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bookingId && identityId) {
      loadBooking();
    } else {
      setLoading(false);
      setError('Unable to resolve your Interactive identity.');
    }
  }, [bookingId, identityId]);

  const handleAccept = async () => {
    setActionLoading('accept');
    setError('');
    setMessage('');

    try {
      await confirmFreeBooking(bookingId);
      setMessage('Booking accepted.');
      await loadBooking();
    } catch (err) {
      console.error('Could not accept booking', err);

      if (
        err?.code === 'functions/failed-precondition' ||
        err?.message?.toLowerCase().includes('payment')
      ) {
        setError(
          'This booking requires payment before it can be confirmed.'
        );
      } else {
        setError(err?.message || 'Could not accept this booking.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async () => {
    setActionLoading('decline');
    setError('');
    setMessage('');

    try {
      await cancelBooking(bookingId, 'Declined by customer');
      setMessage('Booking declined.');
      await loadBooking();
    } catch (err) {
      console.error('Could not decline booking', err);
      setError(err?.message || 'Could not decline this booking.');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="max-w-2xl mx-auto p-6 md:p-10">
        <div className="bg-white border border-stone-200 rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-stone-800 mb-2">
            Booking
          </h1>

          <p className="text-stone-600 mb-6">{error}</p>

          <Link
            to="/notifications"
            className="text-indigo-600 font-medium hover:underline"
          >
            Back to notifications
          </Link>
        </div>
      </div>
    );
  }

  if (!booking) return null;

  const isCustomer =
    booking.customer_identity_id === identityId;

  const startDate = booking.start_time
    ? new Date(booking.start_time)
    : null;

  const endDate = booking.end_time
    ? new Date(booking.end_time)
    : null;

  const serviceName =
    booking.service_name ||
    booking.service_title ||
    booking.title ||
    'Booking';

  const customerName =
    booking.customer_name ||
    booking.guest_name ||
    'Customer';

  const providerName =
    booking.provider_name ||
    booking.business_name ||
    'Provider';

  const status =
    booking.booking_status ||
    booking.status ||
    'draft';

  const isPending =
    status === 'draft' ||
    status === 'pending' ||
    status === 'invited';


const pricePence =
  booking.price_snapshot?.base_price_pence ??
  booking.total_snapshot?.amount_pence ??
  null;

const currency =
  booking.price_snapshot?.currency ??
  booking.total_snapshot?.currency ??
  'GBP';

const formattedPrice =
  pricePence === null
    ? null
    : new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency,
      }).format(Number(pricePence) / 100);




  return (
    <div className="max-w-2xl mx-auto p-6 md:p-10">
      <div className="mb-6">
        <Link
          to="/notifications"
          className="text-sm text-indigo-600 font-medium hover:underline"
        >
          ← Back to notifications
        </Link>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
        <div className="p-6 md:p-8 border-b border-stone-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-indigo-600 mb-1">
                Booking
              </p>

              <h1 className="text-2xl md:text-3xl font-bold text-stone-800">
                {serviceName}
              </h1>
            </div>

            <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-700 text-sm font-medium capitalize">
              {status.replaceAll('_', ' ')}
            </span>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-400 mb-1">
              Provider
            </p>
            <p className="font-medium text-stone-800">{providerName}</p>
          </div>

          {!isCustomer && (
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400 mb-1">
                Customer
              </p>
              <p className="font-medium text-stone-800">{customerName}</p>
            </div>
          )}

          {startDate && (
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400 mb-1">
                Date & time
              </p>

              <p className="font-medium text-stone-800">
                {startDate.toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>

              <p className="text-stone-600">
                {startDate.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {endDate &&
                  ` – ${endDate.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`}
              </p>
            </div>
          )}

          {booking.location_display && (
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400 mb-1">
                Location
              </p>
              <p className="text-stone-800">
                {booking.location_display}
              </p>
            </div>
          )}

          {formattedPrice !== null && (
  <div>
    <p className="text-xs uppercase tracking-wide text-stone-400 mb-1">
      Price
    </p>

    <p className="font-medium text-stone-800">
      {Number(pricePence) === 0 ? 'Free' : formattedPrice}
    </p>
  </div>
)}

          {booking.notes && (
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400 mb-1">
                Notes
              </p>
              <p className="text-stone-700 whitespace-pre-wrap">
                {booking.notes}
              </p>
            </div>
          )}

          {message && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800">
              {message}
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700">
              {error}
            </div>
          )}
        </div>

        {isCustomer && isPending && (
          <div className="p-6 md:p-8 border-t border-stone-100 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleAccept}
              disabled={actionLoading !== null}
              className="flex-1 px-5 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {actionLoading === 'accept'
                ? 'Accepting…'
                : 'Accept booking'}
            </button>

            <button
              type="button"
              onClick={handleDecline}
              disabled={actionLoading !== null}
              className="flex-1 px-5 py-3 rounded-xl border border-red-200 text-red-600 font-semibold hover:bg-red-50 disabled:opacity-50"
            >
              {actionLoading === 'decline'
                ? 'Declining…'
                : 'Decline'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}