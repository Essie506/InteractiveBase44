// BusinessesModule — lists the user's businesses with quick switch.
import { Link } from 'react-router-dom';
import { Building2, Plus } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { getUserBusinesses } from '@/services/businessService';
import { useEffect, useState } from 'react';

export default function BusinessesModule() {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getUserBusinesses(user.id)
      .then(setBusinesses)
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="w-4 h-4 text-stone-500" />
        <h3 className="font-semibold text-stone-800 text-sm">Your Businesses</h3>
      </div>
      {loading ? (
        <div className="h-16 animate-pulse bg-stone-100 rounded" />
      ) : businesses.length === 0 ? (
        <Link to="/create-business" className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:underline">
          <Plus className="w-4 h-4" /> Create a business
        </Link>
      ) : (
        <div className="space-y-2">
          {businesses.slice(0, 3).map((biz) => (
            <Link
              key={biz.id}
              to={`/business/${biz.id}/workspace`}
              className="flex items-center gap-2 text-sm text-stone-600 hover:text-indigo-600 truncate"
            >
              <Building2 className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="truncate">{biz.name}</span>
            </Link>
          ))}
          {businesses.length > 3 && (
            <Link to="/dashboard" className="text-xs text-stone-400 hover:text-stone-600">
              +{businesses.length - 3} more
            </Link>
          )}
        </div>
      )}
    </div>
  );
}