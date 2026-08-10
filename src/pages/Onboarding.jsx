import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Loader2, ArrowLeft, Check } from 'lucide-react';

export default function Onboarding() {
  const { user, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initing, setIniting] = useState(true);
  const [onboardingState, setOnboardingState] = useState(null);

  const [displayName, setDisplayName] = useState('');
  const [screenName, setScreenName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [profession, setProfession] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('other');
  const [profileVisibility, setProfileVisibility] = useState('public');
  const [searchVisibility, setSearchVisibility] = useState(true);
  const [allowDMs, setAllowDMs] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const urlIntent = new URLSearchParams(window.location.search).get('intent');
  const intent = user?.onboarding_intent || urlIntent || 'personal';
  const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '/dashboard';

  const stepKeys = ['terms', 'profile'];
  if (intent === 'professional') stepKeys.push('profession');
  if (intent === 'business') stepKeys.push('business');
  stepKeys.push('privacy');

  // Redirect if already completed
  useEffect(() => {
    if (user?.onboarding_status === 'completed') {
      navigate('/dashboard');
    }
  }, [user]);

  // Initialize onboarding state
  useEffect(() => {
    if (!user || onboardingState) return;
    setDisplayName(user.display_name || '');
    setTermsAccepted(user.terms_accepted || false);

    // Set onboarding intent from URL if not already set (e.g. Google sign-up)
    if (urlIntent && !user.onboarding_intent) {
      base44.auth.updateMe({ onboarding_intent: urlIntent }).then(() => checkUserAuth());
    }

    base44.entities.OnboardingState.filter({ identity_id: user.id }).then(async (existing) => {
      if (existing.length > 0) {
        setOnboardingState(existing[0]);
        const savedIdx = stepKeys.indexOf(existing[0].current_step);
        if (savedIdx > 0) setStepIndex(savedIdx);
      } else {
        const state = await base44.entities.OnboardingState.create({
          identity_id: user.id,
          intent,
          current_step: stepKeys[0],
          completed_steps: [],
          status: 'in_progress',
          return_to: returnTo,
        });
        setOnboardingState(state);
      }
      setIniting(false);
    });
  }, [user]);

  const saveProgress = async (completedStep) => {
    if (!onboardingState) return;
    const completed = [...new Set([...(onboardingState.completed_steps || []), completedStep])];
    const nextStep = stepKeys[stepIndex + 1] || 'complete';
    const updated = await base44.entities.OnboardingState.update(onboardingState.id, {
      current_step: nextStep,
      completed_steps: completed,
    });
    setOnboardingState(updated);
  };

  const handleNext = async () => {
    const currentStep = stepKeys[stepIndex];
    if (currentStep === 'terms' && !termsAccepted) return;
    if (currentStep === 'profile' && !displayName.trim()) return;
    if (currentStep === 'profession' && !profession.trim()) return;
    if (currentStep === 'business' && !businessName.trim()) return;

    await saveProgress(currentStep);

    if (stepIndex < stepKeys.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      await completeOnboarding();
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  const completeOnboarding = async () => {
    setLoading(true);
    try {
      // 1. Create PersonalProfile
      await base44.entities.PersonalProfile.create({
        identity_id: user.id,
        display_name: displayName,
        screen_name: screenName || null,
        headline: headline || null,
        bio: bio || null,
        location: location || null,
        visibility: profileVisibility,
        lifecycle_state: 'active',
      });

      // 2. Create UserSetting
      await base44.entities.UserSetting.create({
        identity_id: user.id,
        profile_visibility: profileVisibility,
        search_visibility: searchVisibility,
        allow_direct_messages: allowDMs,
      });

      // 3. Intent-specific records
      if (intent === 'professional') {
        await base44.entities.ProfessionalProfile.create({
          identity_id: user.id,
          display_name: displayName,
          profession,
          visibility: profileVisibility,
          lifecycle_state: 'active',
          activated_at: new Date().toISOString(),
        });
      }

      if (intent === 'business') {
        const business = await base44.entities.Business.create({
          name: businessName,
          owner_id: user.id,
          type: businessType,
          lifecycle_state: 'active',
        });
        await base44.entities.BusinessMembership.create({
          business_id: business.id,
          identity_id: user.id,
          role: 'owner',
          lifecycle_state: 'active',
        });
        await base44.entities.BusinessProfile.create({
          business_id: business.id,
          name: businessName,
          lifecycle_state: 'draft',
        });
        await base44.auth.updateMe({ active_business_id: business.id });
      }

      // 4. Update User identity
      const updates = {
        display_name: displayName,
        onboarding_status: 'completed',
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
      };
      if (intent === 'professional') updates.professional_activated = true;
      await base44.auth.updateMe(updates);

      // 5. Complete onboarding state
      if (onboardingState) {
        await base44.entities.OnboardingState.update(onboardingState.id, {
          status: 'completed',
          current_step: 'complete',
          completed_steps: [...stepKeys, 'complete'],
        });
      }

      // 6. Redirect
      window.location.href = returnTo;
    } finally {
      setLoading(false);
    }
  };

  if (initing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const currentStep = stepKeys[stepIndex];
  const inputClass = "w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* Header with progress */}
      <div className="px-6 md:px-10 py-5 bg-white border-b border-stone-200">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">I</span>
              </div>
              <span className="font-semibold text-stone-800">Interactive</span>
            </div>
            <span className="text-sm text-stone-500">Step {stepIndex + 1} of {stepKeys.length}</span>
          </div>
          <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${((stepIndex + 1) / stepKeys.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg">
          {/* Terms */}
          {currentStep === 'terms' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Welcome to Interactive</h1>
              <p className="text-stone-500 mb-6">Let's set up your {intent} identity. First, please review and accept the terms.</p>
              <div className="bg-stone-50 rounded-xl p-5 mb-6 text-sm text-stone-600 max-h-48 overflow-auto">
                <p className="mb-3">By creating an Interactive identity, you agree to:</p>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Use one authenticated identity across all Interactive experiences</li>
                  <li>Maintain accurate profile information</li>
                  <li>Respect the privacy and safety of other users</li>
                  <li>Comply with all applicable laws and regulations</li>
                </ul>
              </div>
              <label className="flex items-start gap-3 cursor-pointer mb-6">
                <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} className="mt-1 w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-stone-700">I have read and accept the terms and conditions</span>
              </label>
              <button onClick={handleNext} disabled={!termsAccepted} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                Continue
              </button>
            </div>
          )}

          {/* Profile */}
          {currentStep === 'profile' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Your Profile</h1>
              <p className="text-stone-500 mb-6">This is how you'll appear across Interactive.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Display Name *</label>
                  <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Screen Name</label>
                  <input type="text" value={screenName} onChange={e => setScreenName(e.target.value)} placeholder="@username" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Headline</label>
                  <input type="text" value={headline} onChange={e => setHeadline(e.target.value)} placeholder="e.g. Fitness enthusiast" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Bio</label>
                  <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Tell us about yourself" className={inputClass + " resize-none"} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Location</label>
                  <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="City, Country" className={inputClass} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={handleBack} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={handleNext} disabled={!displayName.trim()} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {/* Profession */}
          {currentStep === 'profession' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Professional Identity</h1>
              <p className="text-stone-500 mb-6">Activate your professional capability. This adds a professional profile to your existing identity.</p>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Profession *</label>
                <input type="text" value={profession} onChange={e => setProfession(e.target.value)} placeholder="e.g. Personal Trainer, Physiotherapist" className={inputClass} />
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={handleBack} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={handleNext} disabled={!profession.trim()} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {/* Business */}
          {currentStep === 'business' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Business Workspace</h1>
              <p className="text-stone-500 mb-6">Create your business organisation. This is separate from your personal identity.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Business Name *</label>
                  <input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Acme Fitness Studio" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Business Type</label>
                  <select value={businessType} onChange={e => setBusinessType(e.target.value)} className={inputClass}>
                    <option value="gym">Gym</option>
                    <option value="studio">Studio</option>
                    <option value="clinic">Clinic</option>
                    <option value="freelancer">Freelancer</option>
                    <option value="club">Club</option>
                    <option value="charity">Charity</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={handleBack} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={handleNext} disabled={!businessName.trim()} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {/* Privacy */}
          {currentStep === 'privacy' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Privacy & Settings</h1>
              <p className="text-stone-500 mb-6">Control how others see and interact with you.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Profile Visibility</label>
                  <select value={profileVisibility} onChange={e => setProfileVisibility(e.target.value)} className={inputClass}>
                    <option value="public">Public — visible to everyone</option>
                    <option value="connections">Connections — visible to your connections</option>
                    <option value="private">Private — visible only to you</option>
                  </select>
                </div>
                <label className="flex items-center justify-between py-2 cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-stone-700">Search Visibility</div>
                    <div className="text-xs text-stone-500">Allow others to find you in search</div>
                  </div>
                  <input type="checkbox" checked={searchVisibility} onChange={e => setSearchVisibility(e.target.checked)} className="w-5 h-5 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500" />
                </label>
                <label className="flex items-center justify-between py-2 cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-stone-700">Direct Messages</div>
                    <div className="text-xs text-stone-500">Allow others to message you</div>
                  </div>
                  <input type="checkbox" checked={allowDMs} onChange={e => setAllowDMs(e.target.checked)} className="w-5 h-5 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500" />
                </label>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={handleBack} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={handleNext} disabled={loading} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Completing...</> : 'Complete Setup'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}