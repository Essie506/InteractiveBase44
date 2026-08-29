import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getBusiness, getBusinessProfile, getActiveMemberships, getBusinessSubscription } from '@/services/businessService';
import { listBusinessBookings } from '@/services/bookingService';
import { ShieldCheck, Users, Briefcase, CalendarCheck, Layers, Loader2 } from 'lucide-react';
import StatCard from '@/components/workspace/StatCard';

export default function BusinessOverview() {
  const { id } = useParams();
  const [business, setBusiness] = useState(null);
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getBusiness(id),
      getBusinessProfile(id).catch(() => null),
      getActiveMemberships(id).catch(() => []),
      listBusinessBookings(id).catch(() => []),
      getBusinessSubscription(id).catch(() => null),
    ])
      .then(([biz, prof, mems, bks, sub]) => {
        setBusiness(biz);
        setProfile(prof);
        setMemberships(mems);
        setBookings(bks);
        setSubscription(sub);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
      </div>
    );
  }

  const upcomingBookings = bookings.filter(
    (b) => new Date(b.start_time) > new Date() && b.status !== 'cancelled'
  );

  const verificationLabel =
    business?.verification_state === 'verified' ? 'Verified' :
    business?.verification_state === 'pending_review' ? 'Pending' :
    business?.verification_state === 'additional_info_required' ? 'Action Required' :
    'Not Verified';

  const verificationAccent = business?.verification_state === 'verified' ? 'emerald' : 'amber';

  const servicesCount = profile?.services?.length || 0;
  const facilitiesCount = profile?.facilities?.length || 0;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-800 mb-1">{business?.name}</h1>
        <p className="text-stone-500 text-sm">Business workspace overview.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={ShieldCheck} label="Verification" value={verificationLabel} accent={verificationAccent} />
        <StatCard icon={Users} label="Staff" value={memberships.length} />
        <StatCard icon={Briefcase} label="Services & Facilities" value={servicesCount + facilitiesCount} />
        <StatCard icon={CalendarCheck} label="Upcoming Bookings" value={upcomingBookings.length} />
      </div>

      {subscription && (
        <div className="bg-white rounded-xl border border-stone-200 p-5 mb-6 flex items-center gap-3">
          <Layers className="w-5 h-5 text-indigo-600" />
          <div>
            <div className="text-sm font-medium text-stone-800">Plan: {subscription.plan_name || '—'}</div>
            <div className="text-xs text-stone-500">Status: {subscription.status || '—'}</div>
          </div>
        </div>
      )}

      <div>
        <h2 className="font-semibold text-stone-800 mb-3">Recent Bookings</h2>
        {bookings.length === 0 ? (
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-sm text-stone-500">
            No bookings yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
            {bookings.slice(0, 5).map((b) => (
              <div key={b.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="text-sm font-medium text-stone-800">
                    {new Date(b.start_time).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">{b.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}