// GrowthHubTeaserModule — teaser for the Growth Hub, shown to
// professional/business contexts. Links to the full Growth Hub page.
import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';

export default function GrowthHubTeaserModule() {
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl border border-indigo-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-indigo-600" />
        <h3 className="font-semibold text-stone-800 text-sm">Growth Hub</h3>
      </div>
      <p className="text-sm text-stone-600 mb-3">
        Discover opportunities to grow your presence and reach more clients.
      </p>
      <Link to="/growth-hub" className="text-sm font-medium text-indigo-600 hover:underline">
        Explore growth opportunities →
      </Link>
    </div>
  );
}