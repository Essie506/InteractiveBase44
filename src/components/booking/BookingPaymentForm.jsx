import { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Loader2, Lock } from 'lucide-react';
import { processBookingPayment } from '@/services/paymentService';

/**
 * Stripe payment form for paid bookings.
 * Wraps the Stripe CardElement and calls processBookingPayment
 * on submit. The booking is NOT confirmed here — the Stripe webhook
 * is the source of truth for payment success.
 *
 * @param {{ bookingId: string, onSuccess: () => void, onError: (msg: string) => void }} props
 */
export default function BookingPaymentForm({ bookingId, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');
    try {
      const cardElement = elements.getElement(CardElement);
      const result = await processBookingPayment(bookingId, {
        payment_method: { card: cardElement },
      });
      if (result.error) {
        setError(result.error);
        onError(result.error);
      } else if (result.requires_action) {
        setError('3D Secure authentication required. Please complete it in your banking app.');
        onError('3D Secure required');
      } else {
        onSuccess();
      }
    } catch (err) {
      setError(err.message || 'Payment failed');
      onError(err.message || 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-stone-400" /> Payment details
        </label>
        <div className="p-3 border border-stone-200 rounded-lg">
          <CardElement
            options={{
              style: {
                base: { fontSize: '14px', color: '#444', '::placeholder': { color: '#aaa' } },
                invalid: { color: '#dc2626' },
              },
            }}
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {submitting ? 'Processing...' : 'Pay & Confirm'}
      </button>
      <p className="text-xs text-stone-400 text-center">Payment is secured by Stripe. Your card details are never stored.</p>
    </form>
  );
}