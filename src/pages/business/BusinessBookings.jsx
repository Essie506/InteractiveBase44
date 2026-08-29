import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { listBusinessBookings } from '@/services/bookingService';
import { Loader2, CalendarCheck } from 'lucide-react';

const STATUS_STYLES = {
  confirmed: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-indigo-50 text-indigo-700',
  cancelled: 'bg-red-50 text-red-700',
  draft: 'bg-stone-100 text-stone-600',
  pending_payment: 'bg-amber-50 text-amber-700',
  no_show: 'bg-red-50 text-red-700',
};

export default function BusinessBookings() {
  const { id } = useParams();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    listBusinessBookings(id)
      .then(setBookings)
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-800 mb-1">Business Bookings</h1>
        <p className="text-stone-500 text-sm">All bookings for this business.</p>
      </div>

      {bookings.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
          <CalendarCheck className="w-8 h-8 text-stone-300 mx-auto mb-2" />
          <p className="text-sm text-stone-500">No bookings yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
          {bookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium text-stone-800">
                  {new Date(b.start_time).toLocaleDateString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </div>
                <div className="text-xs text-stone-500 mt-0.5">
                  {b.booking_type || 'Session'} · {b.payment_route || 'arrange_directly'}
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_STYLES[b.status] || 'bg-stone-100 text-stone-600'}`}>
                {b.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}