// CampaignCard — renders a single promotional campaign row.
import { Megaphone, Pause, Play, Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';

const STATUS_COLORS = {
  draft: 'bg-stone-100 text-stone-600',
  pending_review: 'bg-amber-50 text-amber-700',
  active: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-stone-100 text-stone-600',
  completed: 'bg-blue-50 text-blue-700',
  rejected: 'bg-rose-50 text-rose-700',
  expired: 'bg-stone-100 text-stone-500',
};

const CAMPAIGN_TYPE_LABELS = {
  service_boost: 'Service Boost',
  event_boost: 'Event Boost',
  workout_boost: 'Workout Boost',
  post_boost: 'Post Boost',
  profile_boost: 'Profile Boost',
  business_boost: 'Business Boost',
};

export default function CampaignCard({ campaign, onChanged }) {
  const { toast } = useToast();
  const [updating, setUpdating] = useState(false);

  const handleToggleStatus = async () => {
    setUpdating(true);
    try {
      // Delegate to a cloud function — not yet wired, so show toast.
      toast({ title: 'Campaign status changes require a server-side writer.', variant: 'destructive' });
    } catch (err) {
      toast({ title: 'Could not update campaign', variant: 'destructive' });
    } finally {
      setUpdating(false);
    }
  };

  const budgetUsed = campaign.budget_pence > 0
    ? Math.round((campaign.spent_pence / campaign.budget_pence) * 100)
    : 0;

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-stone-800 truncate">{campaign.name}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded">
                {CAMPAIGN_TYPE_LABELS[campaign.campaign_type] || campaign.campaign_type}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[campaign.status] || STATUS_COLORS.draft}`}>
                {campaign.status}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {campaign.status === 'active' ? (
            <button onClick={handleToggleStatus} disabled={updating} className="p-1.5 rounded-lg hover:bg-stone-100" title="Pause">
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4 text-stone-500" />}
            </button>
          ) : campaign.status === 'paused' || campaign.status === 'draft' ? (
            <button onClick={handleToggleStatus} disabled={updating} className="p-1.5 rounded-lg hover:bg-stone-100" title="Activate">
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 text-stone-500" />}
            </button>
          ) : null}
        </div>
      </div>

      {campaign.headline && (
        <p className="text-sm text-stone-600 mb-3">{campaign.headline}</p>
      )}

      {campaign.budget_pence > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
            <span>Budget used</span>
            <span>£{(campaign.spent_pence / 100).toFixed(2)} / £{(campaign.budget_pence / 100).toFixed(2)}</span>
          </div>
          <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.min(budgetUsed, 100)}%` }} />
          </div>
        </div>
      )}

      {campaign.impressions > 0 && (
        <div className="flex items-center gap-4 text-xs text-stone-500">
          <span>{campaign.impressions} impressions</span>
          <span>{campaign.clicks} clicks</span>
          {campaign.conversions > 0 && <span>{campaign.conversions} conversions</span>}
        </div>
      )}
    </div>
  );
}