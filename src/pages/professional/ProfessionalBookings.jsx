import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getProfessionalProfile } from '@/services/profileService';
import { listProviderBookings, cancelBooking, completeBooking, rescheduleBooking, getBooking } from '@/services/bookingService';
import CreateBookingModal from '@/components/booking/CreateBookingModal';
import { Loader2, CalendarCheck, Plus, X, Clock, MapPin, PoundSterling, ChevronRight, CheckCircle2, XCircle, CalendarClock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const STATUS_STYLES = {
  confirmed: 'bg-emerald-50 text-emerald-700',
  scheduled: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-indigo-50 text-indigo-700',
  cancelled_by_customer: 'bg-red-50 text-red-700',
  cancelled_by_provider: 'bg-red-50 text-red-700',
  cancelled_by_platform: 'bg-red-50 text-red-700',
  draft: 'bg-amber-50 text-amber-700',
  pending_payment: 'bg-amber-50 text-amber-700',
  payment_pending: 'bg-amber-50 text-amber-700',
  no_show_customer: 'bg-red-50 text-red-700',
  no_show_provider: 'bg-red-50 text-red-700',
  reschedule_requested: 'bg-blue-50 text-blue-700',
  rescheduled: 'bg-blue-50 text-blue-700',
  requested: 'bg-amber-50 text-amber-700',
};

const STATUS_LABELS = {
  confirmed: 'Confirmed',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled_by_customer: 'Cancelled by customer',
  cancelled_by_provider: 'Cancelled by you',
  cancelled_by_platform: 'Cancelled',
  draft: 'Pending invitation',
  pending_payment: 'Pending payment',
  payment_pending: 'Payment processing',
  no_show_customer: 'No-show (customer)',
  no_show_provider: 'No-show (provider)',
  reschedule_requested: 'Reschedule requested',
  rescheduled: 'Rescheduled',
  requested: 'Requested',
};

function BookingDetail({ booking, onClose, onUpdate }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  const isProvider = booking.provider_identity_id === user?.id;
  const canCancel = ['draft', 'scheduled', 'confirmed', 'requested', 'payment_pending'].includes(booking.booking_status);
  const canComplete = ['scheduled', 'confirmed'].includes(booking.booking_status) && isProvider;
  const canReschedule = ['scheduled', 'confirmed'].includes(booking.booking_status) && !booking.event_id;

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await cancelBooking(booking.id, 'Cancelled by provider');
      toast({ title: 'Booking cancelled' });
      onUpdate();
      onClose();
    } catch (err) {
      toast({ title: 'Could not cancel', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    setActionLoading(true);
    try {
      await completeBooking(booking.id);
      toast({ title: 'Booking completed' });
      onUpdate();
      onClose();
    } catch (err) {
      toast({ title: 'Could not complete', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (!newDate || !newTime) return;
    setActionLoading(true);
    try {
      const start = new Date(`${newDate}T${newTime}:00`);
      const durationMs = new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime();
      const end = new Date(start.getTime() + durationMs);
      await rescheduleBooking(booking.id, start.toISOString(), end.toISOString(), 'Rescheduled by provider');
      toast({ title: 'Booking rescheduled' });
      onUpdate();
      onClose();
    } catch (err) {
      toast({ title: 'Could not reschedule', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const customerName = booking.guest_display_name || booking.guest_email || 'Customer';
  const priceLabel = booking.total_snapshot?.amount_pence ? `£${(booking.total_snapshot.amount_pence / 100).toFixed(2)}` : 'Free';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-800">Booking Details</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg"><X className="w-4 h-4 text-stone-500" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_STYLES[booking.booking_status] || 'bg-stone-100 text-stone-600'}`}>
              {STATUS_LABELS[booking.booking_status] || booking.booking_status}
            </span>
            <span className="text-xs text-stone-400">{booking.provider_initiated ? 'Provider-created' : 'Customer-created'}</span>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2.5">
              <CalendarClock className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-stone-700">When</div>
                <div className="text-stone-500">
                  {new Date(booking.start_time).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {' at '}
                  {new Date(booking.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {new Date(booking.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <CalendarCheck className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-stone-700">Customer</div>
                <div className="text-stone-500">{customerName}</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <PoundSterling className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-stone-700">Price</div>
                <div className="text-stone-500">{priceLabel} · {booking.payment_route}</div>
              </div>
            </div>

            {booking.location_context && (
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-stone-700">Location</div>
                  <div className="text-stone-500 capitalize">{booking.location_context}{booking.meeting_url ? ` · ${booking.meeting_url}` : ''}</div>
                </div>
              </div>
            )}

            {booking.provider_notes && (
              <div>
                <div className="font-medium text-stone-700 mb-1">Notes</div>
                <div className="text-stone-500 text-sm bg-stone-50 rounded-lg p-3">{booking.provider_notes}</div>
              </div>
            )}

            {booking.reschedule_history?.length > 0 && (
              <div>
                <div className="font-medium text-stone-700 mb-1">Reschedule history</div>
                <div className="text-stone-500 text-xs space-y-1">
                  {booking.reschedule_history.map((r, i) => (
                    <div key={i}>{new Date(r.from_start_time).toLocaleString('en-GB')} → {new Date(r.to_start_time).toLocaleString('en-GB')}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Reschedule form */}
          {showReschedule && (
            <div className="bg-stone-50 rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-medium text-stone-700">Reschedule</h3>
              <div className="flex gap-2">
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm" />
                <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="px-3 py-2 border border-stone-200 rounded-lg text-sm" />
              </div>
              <button
                onClick={handleReschedule}
                disabled={!newDate || !newTime || actionLoading}
                className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm reschedule'}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-stone-100">
            {canReschedule && !showReschedule && (
              <button
                onClick={() => setShowReschedule(true)}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-stone-100 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-200"
              >
                <CalendarClock className="w-4 h-4 inline mr-1" /> Reschedule
              </button>
            )}
            {canComplete && (
              <button
                onClick={handleComplete}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 inline mr-1" /> Complete</>}
              </button>
            )}
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 inline mr-1" /> Cancel</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfessionalBookings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [profile, setProfile] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const loadBookings = async () => {
    if (!user) return;
    try {
      const bks = await listProviderBookings(user.id);
      setBookings(bks);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadBookings();
    getProfessionalProfile(user.id).then(setProfile).catch(() => {});
  }, [user]);

  const handleCreated = () => {
    loadBookings();
    toast({ title: 'Booking invitation sent' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
      </div>
    );
  }

  const services = profile?.services || [];

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 mb-1">Bookings</h1>
          <p className="text-stone-500 text-sm">All bookings where you are the provider.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Create Booking
        </button>
      </div>

      {bookings.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
          <CalendarCheck className="w-8 h-8 text-stone-300 mx-auto mb-2" />
          <p className="text-sm text-stone-500 mb-3">No bookings yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-sm text-indigo-600 font-medium hover:text-indigo-700"
          >
            Create your first booking
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
          {bookings.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBooking(b)}
              className="flex items-center justify-between w-full p-4 text-left hover:bg-stone-50 transition-colors"
            >
              <div>
                <div className="text-sm font-medium text-stone-800">
                  {new Date(b.start_time).toLocaleDateString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </div>
                <div className="text-xs text-stone-500 mt-0.5">
                  {b.guest_display_name || b.guest_email || 'Customer'} · {b.booking_type || 'Session'} · {b.payment_route || 'arrange_directly'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_STYLES[b.booking_status] || 'bg-stone-100 text-stone-600'}`}>
                  {STATUS_LABELS[b.booking_status] || b.booking_status}
                </span>
                <ChevronRight className="w-4 h-4 text-stone-300" />
              </div>
            </button>
          ))}
        </div>
      )}

      <CreateBookingModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        services={services}
        providerIdentityId={user?.id}
        businessId={null}
        operatingContext="professional"
      />

      {selectedBooking && (
        <BookingDetail
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onUpdate={loadBookings}
        />
      )}
    </div>
  );
}