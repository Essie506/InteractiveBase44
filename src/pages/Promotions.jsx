// Promotions Campaign Manager — V2 §19.
// Lists campaigns, shows Growth Package entitlements, and allows
// creating new campaigns (delegates to a cloud function for write).
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Plus, Loader2, TrendingUp, Crown, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { listCampaigns, listGrowthPackages, getGrowthPackageForTier, canCreateCampaign, isCampaignTypeAllowed } from '@/services/promotionsService';
import { getMySubscription } from '@/services/plansService';
import CampaignCard from '@/components/promotions/CampaignCard';
import CampaignEditorDialog from '@/components/promotions/CampaignEditorDialog';

export default function Promotions() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [growthPackage, setGrowthPackage] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const ctx = user.active_context || 'personal';
    const ownerType = ctx === 'business' ? 'business' : 'identity';
    const ownerId = ctx === 'business' ? user.active_business_id : user.id;
    try {
      const [subs, camps] = await Promise.all([
        getMySubscription().catch(() => null),
        listCampaigns(ownerId, ownerType),
      ]);
      setSubscription(subs);
      setCampaigns(camps);
      if (subs?.tier && subs?.family) {
        const pkg = await getGrowthPackageForTier(subs.tier, subs.family);
        setGrowthPackage(pkg);
      }
    } catch (err) {
      console.error('Promotions load error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const canCreate = canCreateCampaign(campaigns, growthPackage);
  const allowedTypes = growthPackage?.campaign_types || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium mb-3">
            <Megaphone className="w-3.5 h-3.5" />
            Promotions
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-800">Campaign Manager</h1>
        </div>
        {canCreate && (
          <button
            onClick={() => setEditorOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        )}
      </div>

      {/* Growth Package entitlement summary */}
      {growthPackage ? (
        <div className="bg-white rounded-xl border border-stone-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Crown className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-stone-800 text-sm">{growthPackage.name} — Your Growth Package</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-stone-400 text-xs mb-1">Active campaigns</div>
              <div className="font-medium text-stone-700">
                {campaigns.filter((c) => c.status === 'active').length} / {growthPackage.max_active_campaigns}
              </div>
            </div>
            <div>
              <div className="text-stone-400 text-xs mb-1">Monthly budget</div>
              <div className="font-medium text-stone-700">
                {growthPackage.monthly_budget_pence > 0 ? `£${(growthPackage.monthly_budget_pence / 100).toFixed(0)}` : 'Pay per campaign'}
              </div>
            </div>
            <div>
              <div className="text-stone-400 text-xs mb-1">Allowed types</div>
              <div className="font-medium text-stone-700 capitalize text-xs">
                {allowedTypes.map((t) => t.replace('_', ' ')).join(', ')}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-stone-800 text-sm">Unlock Promotions</h2>
          </div>
          <p className="text-sm text-stone-600 mb-3">
            Upgrade to a Plus or Pro plan to create promotional campaigns and boost your visibility.
          </p>
          <Link to="/plans" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline">
            View Plans <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Campaigns list */}
      <h2 className="font-semibold text-stone-800 mb-4">Your Campaigns</h2>
      {campaigns.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
          <Megaphone className="w-8 h-8 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500 mb-4">No campaigns yet.</p>
          {canCreate && (
            <button
              onClick={() => setEditorOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create your first campaign
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} onChanged={load} />
          ))}
        </div>
      )}

      {editorOpen && (
        <CampaignEditorDialog
          growthPackage={growthPackage}
          onClose={() => setEditorOpen(false)}
          onSaved={() => { setEditorOpen(false); load(); }}
        />
      )}
    </div>
  );
}