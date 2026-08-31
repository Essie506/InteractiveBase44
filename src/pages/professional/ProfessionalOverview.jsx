import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getProfessionalProfile } from '@/services/profileService';
import { listProviderBookings } from '@/services/bookingService';
import { getAvailabilityRules } from '@/lib/calendar';
import { ShieldCheck, Briefcase, Clock, CalendarCheck, Loader2 } from 'lucide-react';
import StatCard from '@/components/workspace/StatCard';

export default function ProfessionalOverview() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [availabilityCount, setAvailabilityCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
    getProfessionalProfile(user.id),
    listProviderBookings(user.id).catch(() => []),
    getAvailabilityRules(user.id, 'professional').catch(() => [])]
    ).
    then(([p, bks, rules]) => {
      setProfile(p);
      setBookings(bks);
      setAvailabilityCount(rules.length);
    }).
    finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
      </div>);

  }

  const upcomingBookings = bookings.filter(
    (b) => new Date(b.start_time) > new Date() && b.status !== 'cancelled'
  );

  const verificationLabel =
  profile?.verification_state === 'verified' ? 'Verified' :
  profile?.verification_state === 'pending_review' ? 'Pending' :
  profile?.verification_state === 'additional_info_required' ? 'Action Required' :
  'Not Verified';

  const verificationAccent =
  profile?.verification_state === 'verified' ? 'emerald' : 'amber';

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-6">
        
        <p className="text-stone-500 text-sm">Your professional workspace at a glance.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={ShieldCheck} label="Verification" value={verificationLabel} accent={verificationAccent} />
        <StatCard icon={Briefcase} label="Services" value={profile?.services?.length || 0} />
        <StatCard icon={Clock} label="Availability Rules" value={availabilityCount} />
        <StatCard icon={CalendarCheck} label="Upcoming Bookings" value={upcomingBookings.length} />
      </div>

      <div>
        <h2 className="font-semibold text-stone-800 mb-3">Recent Bookings</h2>
        {bookings.length === 0 ?
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-sm text-stone-500">
            No bookings yet.
          </div> :

        <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
            {bookings.slice(0, 5).map((b) =>
          <div key={b.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="text-sm font-medium text-stone-800">
                    {new Date(b.start_time).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">{b.status}</div>
                </div>
              </div>
          )}
          </div>
        }
      </div>
    </div>);

}