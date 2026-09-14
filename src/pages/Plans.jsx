// Plans & Subscription — V2 Public Interactive refinement.
// ───────────────────────────────────────────────────────────
// Separates IDENTITY / PUBLIC PRESENCE (free) from SUBSCRIPTION CAPABILITY
// (paid). Being present on Interactive is free; paid plans unlock
// operational, management and growth tools.
//
// The six-plan taxonomy is shown as a single capability ladder — there are
// no longer user-facing "Professional" vs "Business" subscription families.
// A Professional identity may subscribe to any tier; a Business identity may
// remain on the free tier. The underlying tier+family fields remain as
// internal backwards-compat and are not shown to users.

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Check, Loader2, Crown, Sparkles, TrendingUp, CreditCard, ArrowRight, User as UserIcon, Briefcase, Building2, Compass, Newspaper, Users } from 'lucide-react';
import {
  listPlans, getMySubscription, startSubscriptionCheckout, openCustomerPortal,
  formatPlanPrice, isFreePlan, isHigherTier, getPlanDisplayName,
} from '@/services/plansService';
import { useToast } from '@/components/ui/use-toast';

const TIER_ICON = {
  basic: Sparkles,
  plus: TrendingUp,
  pro: Crown,
};

export default function Plans() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribingPlanId, setSubscribingPlanId] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const activeContext = user?.active_context || 'personal';
  const activeBusinessId = user?.active_business_id || null;
  const isBusinessContext = activeContext === 'business' && activeBusinessId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Show all six plans as one capability ladder — no family filter.
      const [planList, sub] = await Promise.all([
        listPlans(),
        getMySubscription(isBusinessContext ? activeBusinessId : null).catch(() => null),
      ]);
      // Sort by price ascending (Basic → Enterprise).
      planList.sort((a, b) => (a.price_pence || 0) - (b.price_pence || 0));
      setPlans(planList);
      setSubscription(sub);
    } catch (err) {
      console.error('Failed to load plans:', err);
      toast({ title: 'Could not load plans', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [isBusinessContext, activeBusinessId, toast]);

  useEffect(() => { load(); }, [load]);

  const handleSubscribe = async (plan) => {
    if (isFreePlan(plan)) return;
    setSubscribingPlanId(plan.id);
    try {
      const origin = window.location.origin;
      const url = await startSubscriptionCheckout(plan.id, isBusinessContext ? activeBusinessId : null, origin);
      if (url) window.location.href = url;
    } catch (err) {
      console.error('Checkout failed:', err);
      toast({
        title: 'Could not start checkout',
        description: err?.message || 'Please try again or contact support.',
        variant: 'destructive',
      });
    } finally {
      setSubscribingPlanId(null);
    }
  };

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const origin = window.location.origin;
      const url = await openCustomerPortal(isBusinessContext ? activeBusinessId : null, origin);
      if (url) window.location.href = url;
    } catch (err) {
      console.error('Portal failed:', err);
      toast({
        title: 'Could not open billing portal',
        description: err?.message || 'Please try again or contact support.',
        variant: 'destructive',
      });
    } finally {
      setPortalLoading(false);
    }
  };

  // Current plan detection: by plan_id when a subscription exists, else the
  // single free tier (Basic, £0) represents free public presence.
  const currentPlanId = subscription?.plan_id || null;
  const currentPlan = plans.find(p => p.id === currentPlanId) || null;
  const currentPrice = currentPlan?.price_pence ?? 0;
  const hasPaidSubscription = subscription && subscription.status === 'active' && currentPlan && !isFreePlan(currentPlan);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 font-heading">Plans &amp; Subscription</h1>
        <p className="mt-1 text-sm text-stone-500">Your public presence is free. Upgrade for tools to operate, manage and grow.</p>
      </div>

      {/* Free-presence banner */}
      <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
        <p className="text-sm text-emerald-900 font-medium mb-1">Your public presence on Interactive is free.</p>
        <p className="text-sm text-emerald-800">
          Create and maintain your Directory listing, public profile and participate in the Interactive community at no cost.
          Upgrade when you want additional tools to operate, manage, promote and grow through Interactive.
        </p>
      </div>

      {/* Identity / public presences */}
      <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-800 mb-3">Your identity &amp; public presences (free)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2 text-stone-600"><UserIcon className="w-4 h-4 text-stone-400" /> Personal profile</div>
          <div className="flex items-center gap-2 text-stone-600"><Briefcase className="w-4 h-4 text-stone-400" /> Professional profile</div>
          <div className="flex items-center gap-2 text-stone-600"><Building2 className="w-4 h-4 text-stone-400" /> Business listing</div>
          <div className="flex items-center gap-2 text-stone-600"><Compass className="w-4 h-4 text-stone-400" /> Directory presence</div>
          <div className="flex items-center gap-2 text-stone-600"><Newspaper className="w-4 h-4 text-stone-400" /> Feed participation</div>
          <div className="flex items-center gap-2 text-stone-600"><Users className="w-4 h-4 text-stone-400" /> Public team relationships</div>
        </div>
      </div>

      {/* Current subscription summary */}
      {hasPaidSubscription && (
        <div className="mb-8 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-indigo-900">
                Current plan: {getPlanDisplayName(currentPlan)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{currentPlan.tier}</span>
            </div>
            {subscription.current_period_end && (
              <p className="text-xs text-indigo-600 mt-0.5">
                Renews {new Date(subscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900 disabled:opacity-50"
          >
            {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Manage billing
          </button>
        </div>
      )}

      {/* Plan cards — single capability ladder */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {plans.map((plan) => {
          const Icon = TIER_ICON[plan.tier] || Sparkles;
          const free = isFreePlan(plan);
          const isCurrent = plan.id === currentPlanId || (!currentPlanId && free);
          const isUpgrade = !free && isHigherTier(currentPrice, plan.price_pence);
          const subscribing = subscribingPlanId === plan.id;
          const displayName = getPlanDisplayName(plan);

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border bg-white p-6 flex flex-col ${
                plan.tier === 'plus' && plan.family === 'professional' ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-stone-200'
              }`}
            >
              {plan.tier === 'plus' && plan.family === 'professional' && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full bg-indigo-600 text-white">
                  Most popular
                </span>
              )}

              <div className="flex items-center gap-2 mb-3">
                <Icon className="w-5 h-5 text-stone-500" />
                <h3 className="text-lg font-semibold text-stone-900">{displayName}</h3>
              </div>

              <div className="mb-1">
                <span className="text-3xl font-bold text-stone-900">{formatPlanPrice(plan.price_pence, plan.currency)}</span>
                {!free && <span className="text-sm text-stone-500">/{plan.billing_interval || 'monthly'}</span>}
              </div>

              {plan.description && <p className="text-sm text-stone-600 mb-4 mt-2">{plan.description}</p>}

              <ul className="space-y-2 mb-6 flex-1">
                {(plan.features || []).map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-stone-700">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <button
                  disabled
                  className="w-full py-2.5 rounded-lg text-sm font-medium bg-stone-100 text-stone-500 cursor-default"
                >
                  {free ? 'Included by default' : 'Current plan'}
                </button>
              ) : free ? (
                <button
                  disabled
                  className="w-full py-2.5 rounded-lg text-sm font-medium border border-stone-200 text-stone-400 cursor-default"
                >
                  Included by default
                </button>
              ) : (
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={subscribing}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                    isUpgrade
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'border border-stone-300 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {subscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{isUpgrade ? 'Upgrade' : 'Subscribe'} <ArrowRight className="w-4 h-4" /></>}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Need more */}
      <div className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-5">
        <h2 className="text-sm font-semibold text-stone-800 mb-1">Need more?</h2>
        <p className="text-sm text-stone-600">
          Higher tiers add operational, management and growth capabilities — promotional campaigns, advanced tools, team infrastructure and reporting.
          A Professional identity may subscribe to any tier; a Business identity may remain on the free tier. Upgrade is always a separate, deliberate action.
        </p>
      </div>

      {/* Downgrade note */}
      <p className="mt-6 text-xs text-stone-400 text-center max-w-2xl mx-auto">
        Cancel anytime. When a paid subscription ends, your account returns to the free tier — your profile, listing, bookings and data are preserved.
      </p>
    </div>
  );
}