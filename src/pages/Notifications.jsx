import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getNotifications, markAsRead, markAllAsRead } from '@/lib/notifications';
import { confirmFreeBooking, cancelBooking } from '@/services/bookingService';
import { Loader2, Check, CheckCheck, Bell, Filter, CalendarCheck, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// Notification Centre — full notification experience.
// References the same Notification Records as the bell/modal.
export default function Notifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | unread | by category
  const [processing, setProcessing] = useState(null);
  const [bookingActionLoading, setBookingActionLoading] = useState(null);

  useEffect(() => {
    if (!user) return;
    loadItems();
  }, [user]);

  const loadItems = () => {
    setLoading(true);
    getNotifications(user.id, 100).then(async recs => {
      setItems(recs);
      setLoading(false);
      // Mark presented notifications as read so the badge clears immediately
      const hasUnread = recs.some(r => !r.is_read);
      if (hasUnread) {
        try {
          await markAllAsRead(user.id);
          setItems(recs.map(r => ({ ...r, is_read: true })));
        } catch (err) {
          console.error('[Notifications] markAllAsRead failed:', err);
        }
      }
    });
  };

  const handleMarkRead = async (id) => {
    setProcessing(id);
    await markAsRead(id);
    setItems(items.map(i => i.id === id ? { ...i, is_read: true } : i));
    setProcessing(null);
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead(user.id);
    setItems(items.map(i => ({ ...i, is_read: true })));
  };

  // Booking invitation accept/decline — converges on the existing
  // confirmFreeBooking (free) or createPaymentIntent (paid, via redirect
  // to booking management) and cancelBooking (decline).
  const handleAcceptBooking = async (bookingId) => {
    setBookingActionLoading(bookingId);
    try {
      await confirmFreeBooking(bookingId);
      toast({ title: 'Booking accepted' });
      loadItems();
    } catch (err) {
      // If payment is required, redirect to the booking management page
      if (err.message?.includes('payment') || err.code === 'functions/failed-precondition') {
        toast({ title: 'Payment required', description: 'Complete payment to confirm your booking.' });
        // Navigate to booking management — the customer pays there
        window.location.href = `/bookings/${bookingId}`;
      } else {
        toast({ title: 'Could not accept', description: err.message, variant: 'destructive' });
      }
    } finally {
      setBookingActionLoading(null);
    }
  };

  const handleDeclineBooking = async (bookingId) => {
    setBookingActionLoading(bookingId);
    try {
      await cancelBooking(bookingId, 'Declined by customer');
      toast({ title: 'Booking declined' });
      loadItems();
    } catch (err) {
      toast({ title: 'Could not decline', description: err.message, variant: 'destructive' });
    } finally {
      setBookingActionLoading(null);
    }
  };

  const categories = ['all', 'unread', 'verification', 'media', 'business', 'security', 'system', 'calendar'];
  const filtered = items.filter(i => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !i.is_read;
    return i.category === filter;
  });

  const unreadCount = items.filter(i => !i.is_read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Notifications</h1>
          <p className="text-stone-500">{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-indigo-600 font-medium hover:bg-indigo-50 rounded-lg">
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {/* Category filters */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors capitalize ${filter === cat ? 'bg-indigo-600 text-white' : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'}`}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
          <Bell className="w-10 h-10 text-stone-300 mx-auto mb-3" />
          <h3 className="font-semibold text-stone-800 mb-1">No notifications</h3>
          <p className="text-sm text-stone-500">You're all caught up for this filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => (
            <div key={n.id} className={`bg-white rounded-xl border p-4 ${!n.is_read ? 'border-indigo-200 bg-indigo-50/20' : 'border-stone-200'}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-stone-800">{n.title}</span>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
                  </div>
                  {n.body && <p className="text-sm text-stone-500 mb-2">{n.body}</p>}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-400 capitalize">{n.category}</span>
                    <span className="text-xs text-stone-400">{new Date(n.created_date).toLocaleString()}</span>
                    {n.action_url && (
                      <Link to={n.action_url} onClick={() => { if (!n.is_read) handleMarkRead(n.id); }} className="text-xs text-indigo-600 font-medium hover:underline">{n.action_label || 'View'}</Link>
                    )}
                    {/* Booking invitation accept/decline actions */}
                    {n.event_type === 'booking_invitation' && n.source_id?.startsWith('booking:') && (() => {
                      const bookingId = n.source_id.replace('booking:', '');
                      return (
                        <div className="flex items-center gap-2 ml-2">
                          <button
                            onClick={() => handleAcceptBooking(bookingId)}
                            disabled={bookingActionLoading === bookingId}
                            className="text-xs px-2 py-1 bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            {bookingActionLoading === bookingId ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarCheck className="w-3 h-3" />} Accept
                          </button>
                          <button
                            onClick={() => handleDeclineBooking(bookingId)}
                            disabled={bookingActionLoading === bookingId}
                            className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded font-medium hover:bg-red-100 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" /> Decline
                          </button>
                        </div>
                      );
                    })()}
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        disabled={processing === n.id}
                        className="text-xs text-stone-500 hover:text-stone-700 inline-flex items-center gap-0.5"
                      >
                        {processing === n.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3" /> Mark read</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}