// Plans & Subscription — plan selection / upgrade page (Plans & Monetisation §17).
// ───────────────────────────────────────────────────────────
// Displays available subscription plans (Professional / Business families),
// feature comparisons, and subscribe/upgrade CTAs. Shows the current
// subscription status and a manage-billing entry point (Stripe Customer Portal).
//
// Tier 1 (essential) is the permanent free plan — every professional/business
// has it by default. Higher tiers are paid recurring subscriptions via Stripe.
// When a paid subscription lapses, the account downgrades to Tier 1 free.

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Check, Loader2, Crown, Sparkles, TrendingUp, CreditCard, ArrowRight } from 'lucide-react';
import {
  listPlans, getMySubscription, startSubscriptionCheckout, openCustomerPortal,
  formatPlanPrice, isFreePlan, isHigherTier,
} from '@/services/plansService';
import { useToast } from '@/components/ui/use-toast';

const TIER_META = {
  basic: { label: 'Tier 1', icon: Sparkles, accent: 'text-stone-600', ring: 'ring-stone-200' },
  plus: { label: 'Tier 2', icon: TrendingUp, accent: 'text-indigo-600', ring: 'ring-indigo-300' },
  pro: { label: 'Tier 3', icon: Crown, accent: 'text-violet-600', ring: 'ring-violet-300' },
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
      const planFamily = isBusinessContext ? 'business' : 'professional';
      const [planList, sub] = await Promise.all([
        listPlans(planFamily),
        getMySubscription(isBusinessContext ? activeBusinessId : null).catch(() => null),
      ]);
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

  const currentTier = subscription?.plan_tier || 'basic';
  const contextLabel = isBusinessContext ? 'Business' : activeContext === 'professional' ? 'Professional' : 'Account';

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
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 font-heading">Plans &amp; Subscription</h1>
        <p className="mt-1 text-sm text-stone-500">
          {isBusinessContext
            ? 'Choose the plan that fits your organisation. Upgrade as your business grows.'
            : 'Professional Basic is free forever. Upgrade for growth tools, advanced analytics, and more.'}
        </p>
      </div>

      {/* Current subscription summary */}
      {subscription && subscription.status === 'active' && (
        <div className="mb-8 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-indigo-900">
                Current plan: {subscription.plan_name || currentTier}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 capitalize">{currentTier}</span>
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

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {plans.map((plan) => {
          const meta = TIER_META[plan.tier] || TIER_META.essential;
          const Icon = meta.icon;
          const free = isFreePlan(plan);
          const isCurrent = plan.tier === currentTier && (subscription?.status === 'active' || free);
          const isUpgrade = isHigherTier(currentTier, plan.tier) && !free;
          const subscribing = subscribingPlanId === plan.id;

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border bg-white p-6 flex flex-col ${
                plan.tier === 'plus' ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-stone-200'
              }`}
            >
              {plan.tier === 'plus' && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full bg-indigo-600 text-white">
                  Most popular
                </span>
              )}

              <div className="flex items-center gap-2 mb-3">
                <Icon className={`w-5 h-5 ${meta.accent}`} />
                <h3 className="text-lg font-semibold text-stone-900">{plan.name}</h3>
              </div>

              <div className="mb-1">
                <span className="text-3xl font-bold text-stone-900">{formatPlanPrice(plan.price_pence, plan.currency)}</span>
                {!free && <span className="text-sm text-stone-500">/{plan.billing_interval || 'monthly'}</span>}
              </div>
              <span className={`text-xs ${meta.accent} font-medium mb-4`}>{meta.label}</span>

              {plan.description && <p className="text-sm text-stone-600 mb-4">{plan.description}</p>}

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
                  Current plan
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

      {/* Downgrade note */}
      <p className="mt-8 text-xs text-stone-400 text-center max-w-2xl mx-auto">
        {`Cancel anytime. ${isBusinessContext ? 'When a paid subscription ends, your business returns to Business Basic.' : 'When a paid subscription ends, your account returns to Professional Basic (Free) — your profile, bookings, and data are preserved.'}`}
      </p>
    </div>
  );
}