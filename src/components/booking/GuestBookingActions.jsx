import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CalendarX, CalendarClock, Loader2, AlertCircle } from 'lucide-react';

const CANCELLABLE_STATES = ['draft', 'scheduled', 'confirmed', 'accepted', 'awaiting_customer_confirmation', 'requested'];
const RESCHEDULABLE_STATES = ['scheduled', 'confirmed'];

/**
 * @param {{
 *   booking: object,
 *   onCancel: () => void,
 *   onReschedule: () => void,
 *   actionLoading: boolean,
 *   actionType: string | null,
 * }} props
 */
export default function GuestBookingActions({ booking, onCancel, onReschedule, actionLoading, actionType }) {
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const canCancel = CANCELLABLE_STATES.includes(booking.booking_status);
  const canReschedule = RESCHEDULABLE_STATES.includes(booking.booking_status) && !booking.event_id;
  const isPast = booking.end_time && new Date(booking.end_time) < new Date();

  if (!canCancel && !canReschedule) {
    return (
      <div className="bg-stone-50 rounded-xl border border-stone-200 p-4 text-center">
        <p className="text-sm text-stone-500">
          {booking.booking_status?.startsWith('cancelled')
            ? 'This booking has been cancelled.'
            : booking.booking_status === 'completed'
            ? 'This booking has been completed.'
            : 'No actions available for this booking.'}
        </p>
      </div>
    );
  }

  if (isPast && !booking.booking_status?.startsWith('cancelled')) {
    return (
      <div className="bg-stone-50 rounded-xl border border-stone-200 p-4 text-center">
        <p className="text-sm text-stone-500">
          This booking has passed. Contact your provider if you need to discuss it.
        </p>
      </div>
    );
  }

  const handleCancelSubmit = () => {
    onCancel(cancelReason.trim() || undefined);
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-stone-800">Manage this booking</h3>

      {!showCancelForm ? (
        <div className="flex flex-wrap gap-3">
          {canReschedule && (
            <Button
              variant="outline"
              onClick={onReschedule}
              disabled={actionLoading}
            >
              <CalendarClock className="w-4 h-4 mr-2" />
              {actionType === 'reschedule' && actionLoading ? 'Rescheduling…' : 'Reschedule'}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              onClick={() => setShowCancelForm(true)}
              disabled={actionLoading}
              className="text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              <CalendarX className="w-4 h-4 mr-2" /> Cancel booking
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Tell the provider why you're cancelling…"
              className="mt-1.5"
              rows={3}
            />
          </div>
          <p className="text-xs text-stone-500">
            {booking.cancellation_policy_snapshot
              ? `${booking.cancellation_policy_snapshot.refund_percentage}% refund if cancelled at least ${booking.cancellation_policy_snapshot.deadline_hours} hours before start.`
              : 'Refund will be calculated per the cancellation policy.'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowCancelForm(false); setCancelReason(''); }}
              disabled={actionLoading}
            >
              Back
            </Button>
            <Button
              onClick={handleCancelSubmit}
              disabled={actionLoading}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {actionType === 'cancel' && actionLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cancelling…</>
              ) : (
                'Confirm cancellation'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}