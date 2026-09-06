import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search, AlertCircle } from 'lucide-react';

/**
 * @param {{
 *   initialEmail: string,
 *   initialBookingId: string,
 *   onSubmit: (email: string, bookingId: string) => void,
 *   loading: boolean,
 *   error: string,
 * }} props
 */
export default function GuestBookingLookupForm({ initialEmail, initialBookingId, onSubmit, loading, error }) {
  const [email, setEmail] = useState(initialEmail || '');
  const [bookingId, setBookingId] = useState(initialBookingId || '');
  const [validationError, setValidationError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError(null);

    if (!email.trim()) {
      setValidationError('Email is required');
      return;
    }
    if (!email.includes('@')) {
      setValidationError('Enter a valid email address');
      return;
    }
    if (!bookingId.trim()) {
      setValidationError('Booking reference is required');
      return;
    }

    onSubmit(email.trim(), bookingId.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="guest-email">Email address</Label>
        <Input
          id="guest-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="guest-booking-id">Booking reference</Label>
        <Input
          id="guest-booking-id"
          value={bookingId}
          onChange={(e) => setBookingId(e.target.value)}
          placeholder="e.g. abc123def456"
          className="mt-1.5 font-mono text-sm"
        />
        <p className="text-xs text-stone-400 mt-1.5">
          Your booking reference is in your booking confirmation.
        </p>
      </div>

      {validationError && (
        <p className="text-sm text-rose-600 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4" /> {validationError}
        </p>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Looking up…</>
        ) : (
          <><Search className="w-4 h-4 mr-2" /> Find my booking</>
        )}
      </Button>
    </form>
  );
}