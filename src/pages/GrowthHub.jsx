// Growth Hub Page — V2 Business Growth Hub.
// Presents context-aware growth opportunities and guidance for the
// active operating context (professional or business).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, User, Users, Megaphone, Building2, ArrowRight, Loader2, Lightbulb } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { getProfessionalProfile } from '@/services/profileService';
import { generateOpportunities, getOpportunityGuidance, determineStage } from '@/services/growthHubService';
import { getMySubscription } from '@/services/plansService';

const TYPE_ICONS = {
  profile: User,
  customer: Users,
  promotional: Megaphone,
  business: Building2,
};

const STAGE_LABELS = {
  build: 'Build',
  grow: 'Grow',
  scale: 'Scale',
};

export default function GrowthHub() {
  const { user } = useAuth();
  const [opportunities, setOpportunities] = useState([]);
  const [guidance, setGuidance] = useState(null);
  const [stage, setStage] = useState('build');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const ctx = user.active_context || 'personal';
    const ownerType = ctx === 'business' ? 'business' : 'identity';
    const ownerId = ctx === 'business' ? user.active_business_id : user.id;

    (async () => {
      try {
        const [profile, sub] = await Promise.all([
          getProfessionalProfile(user.id),
          getMySubscription().catch(() => null),
        ]);
        const determinedStage = determineStage(profile, {});
        setStage(determinedStage);
        const tier = sub?.tier || (profile?.subscription_tier) || 'basic';
        const ops = await generateOpportunities(ownerId, ownerType, {
          stage: determinedStage,
          profile,
          subscriptionTier: tier,
        });
        setOpportunities(ops);

        // Load guidance for the first (highest-priority) opportunity
        if (ops.length > 0) {
          const g = await getOpportunityGuidance(determinedStage, ops[0].opportunity_type, {
            displayName: profile?.display_name,
          });
          setGuidance(g);
        }
      } catch (err) {
        console.error('Growth Hub load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

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
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium mb-3">
          <TrendingUp className="w-3.5 h-3.5" />
          Growth Hub
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Grow Your Presence</h1>
        <p className="text-stone-500">
          You're in the <span className="font-medium text-indigo-600">{STAGE_LABELS[stage]}</span> stage of your growth journey.
        </p>
      </div>

      {/* Guidance panel */}
      {guidance && (
        <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl border border-indigo-200 p-6 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-stone-800">{guidance.title}</h2>
          </div>
          <p className="text-sm text-stone-600 mb-4">{guidance.body}</p>
          {guidance.tips?.length > 0 && (
            <ul className="space-y-2">
              {guidance.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-stone-600">
                  <span className="text-indigo-500 mt-0.5">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Opportunities grid */}
      <h2 className="font-semibold text-stone-800 mb-4">Your Opportunities</h2>
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {opportunities.map((opp, i) => {
          const Icon = TYPE_ICONS[opp.opportunity_type] || TrendingUp;
          const tierLocked = opp.subscription_tier_required && opp.subscription_tier_required !== 'basic';
          return (
            <div key={i} className="bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 transition-colors">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-stone-800">{opp.title}</h3>
                  {tierLocked && (
                    <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded font-medium">
                      {opp.subscription_tier_required} plan
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-stone-500 mb-4">{opp.description}</p>
              <Link
                to={opp.action_url}
                className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
              >
                {opp.action_label} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          );
        })}
      </div>

      {/* Journey stages explainer */}
      <div className="bg-slate-900 rounded-xl p-6 text-white">
        <h2 className="font-semibold mb-4">The Growth Journey</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {['build', 'grow', 'scale'].map((s) => (
            <div key={s} className={`p-4 rounded-lg ${stage === s ? 'bg-indigo-600' : 'bg-slate-800'}`}>
              <div className="font-medium mb-1 capitalize">{STAGE_LABELS[s]}</div>
              <p className="text-xs text-slate-400">
                {s === 'build' && 'Establish your presence and get your first clients.'}
                {s === 'grow' && 'Expand your reach and acquire more clients.'}
                {s === 'scale' && 'Optimise operations and maximise retention.'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}