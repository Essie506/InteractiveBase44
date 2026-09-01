import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getProfessionalProfile, saveProfessionalProfile } from '@/services/profileService';
import * as userService from '@/services/userService';
import { submitVerification } from '@/lib/trust';
import { createNotification } from '@/lib/notifications';
import { Loader2, Plus, X, ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import MandatoryLabel from '@/components/MandatoryLabel';
import FieldError from '@/components/FieldError';
import TaxonomySelectDialog from '@/components/profile/TaxonomySelectDialog';
import { STANDARD_SERVICES } from '@/data/standardServices';

export default function ProfessionalActivation() {
  const { user, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initing, setIniting] = useState(true);
  const [profile, setProfile] = useState(null);

  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [category, setCategory] = useState('');
  const [services, setServices] = useState([]);
  const [showServicesDialog, setShowServicesDialog] = useState(false);
  const [location, setLocation] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [screenName, setScreenName] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState({});

  const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '/dashboard';

  const stepKeys = ['identity', 'services', 'location', 'verification', 'settings'];

  useEffect(() => {
    if (!user) return;
    if (user.professional_onboarding_status === 'active') {
      navigate(returnTo);
      return;
    }
    setDisplayName(user.display_name || '');
    setContactEmail(user.email || '');
    getProfessionalProfile(user.id).then(p => {
      if (p) {
        setProfile(p);
        setDisplayName(p.display_name || user.display_name || '');
        setHeadline(p.headline || '');
        setBio(p.bio || '');
        setCategory(p.professional_category || p.profession || '');
        setServices((p.services || []).map((s) => (typeof s === 'string' ? { id: null, label: s } : s)));
        setLocation(p.location || '');
        setServiceArea(p.service_area || '');
        setContactEmail(p.contact_email || user.email || '');
        setContactPhone(p.contact_phone || '');
        setVisibility(p.visibility || 'public');
        setScreenName(p.screen_name || '');
      }
      setIniting(false);
    });
  }, [user]);

  const validateStep = (step) => {
    const e = {};
    if (step === 'identity') {
      if (!displayName.trim()) e.displayName = 'Display name is required';
      if (!category.trim()) e.category = 'Professional category is required';
    }
    if (step === 'verification' && !termsAccepted) e.terms = 'You must accept the terms to continue';
    if (step === 'settings') {
      const sn = screenName.toLowerCase().trim();
      if (!sn) {
        e.screenName = 'Screen name is required to activate your professional profile';
      } else if (!/^[a-z0-9_]{3,20}$/.test(sn)) {
        e.screenName = 'Screen name must be 3-20 characters: lowercase letters, numbers, and underscores';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    const current = stepKeys[stepIndex];
    if (!validateStep(current)) return;
    setErrors({});

    if (stepIndex < stepKeys.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      completeActivation();
    }
  };

  const completeActivation = async () => {
    setLoading(true);
    try {
      const profileData = {
        identity_id: user.id,
        display_name: displayName,
        headline,
        bio,
        profession: category,
        professional_category: category,
        services,
        service_area: serviceArea,
        location,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        screen_name: screenName.toLowerCase().trim() || null,
        visibility,
        onboarding_status: 'awaiting_verification',
        // TEMPORARY DENORMALISED COMPATIBILITY STATE:
        // verification_state is owned by Trust & Reputation, but the public
        // Professional projection (professionalProfilesPublic) currently reads
        // professionalProfiles.verification_state and there is not yet a
        // confirmed Trust → Professional Profile sync path after review.
        // This direct write is retained intentionally to avoid regressing
        // verification display. TODO: remove this write once the authoritative
        // Trust → public/profile projection mechanism is established.
        verification_state: 'pending_review',
        lifecycle_state: 'active',
        activated_at: new Date().toISOString(),
      };

      let savedProfile;
      if (profile) {
        savedProfile = await saveProfessionalProfile(user.id, profileData);
      } else {
        savedProfile = await saveProfessionalProfile(user.id, profileData);
      }

      // Submit verification through Trust & Reputation (connects Phase 2 stub to real implementation)
      await submitVerification('professional', user.id, user.id, [], `Professional verification for ${category}`);

      // Create notification (failure isolated — doesn't undo activation)
      await createNotification({
        recipient_id: user.id,
        source_system: 'trust',
        event_type: 'verification_submitted',
        title: 'Verification Submitted',
        body: 'Your professional verification request has been submitted for review.',
        category: 'verification',
        action_url: '/professional-profile',
        action_label: 'View Profile',
        source_id: user.id,
      });

      // Update User identity
      await userService.updateUserState({
        professional_activated: true,
        professional_onboarding_status: 'active',
        display_name: displayName,
        active_context: 'professional',
      });

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
      <div className="px-6 md:px-10 py-5 bg-white border-b border-stone-200">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">I</span>
              </div>
              <span className="font-semibold text-stone-800">Activate Professional</span>
            </div>
            <span className="text-sm text-stone-500">Step {stepIndex + 1} of {stepKeys.length}</span>
          </div>
          <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 rounded-full transition-all duration-300" style={{ width: `${((stepIndex + 1) / stepKeys.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg">
          {currentStep === 'identity' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Professional Identity</h1>
              <p className="text-stone-500 mb-4">Expand your existing identity with professional capability.</p>
              <p className="text-xs text-stone-400 mb-6 flex items-center gap-1"><span className="text-indigo-600 font-semibold">*</span> means mandatory</p>
              <div className="space-y-4">
                <div>
                  <MandatoryLabel htmlFor="pa-display-name" required>Display Name</MandatoryLabel>
                  <input id="pa-display-name" type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className={inputClass} />
                  <FieldError error={errors.displayName} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Headline</label>
                  <input type="text" value={headline} onChange={e => setHeadline(e.target.value)} placeholder="e.g. Certified Personal Trainer" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Bio</label>
                  <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Describe your professional background" className={inputClass + " resize-none"} />
                </div>
                <div>
                  <MandatoryLabel htmlFor="pa-category" required>Professional Category</MandatoryLabel>
                  <select id="pa-category" value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
                    <option value="">Select a category</option>
                    <option value="Personal Trainer">Personal Trainer</option>
                    <option value="Coach">Coach</option>
                    <option value="Instructor">Instructor</option>
                    <option value="Therapist">Therapist</option>
                    <option value="Practitioner">Practitioner</option>
                    <option value="Creator">Creator</option>
                    <option value="Freelancer">Freelancer</option>
                    <option value="Other">Other</option>
                  </select>
                  <FieldError error={errors.category} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => navigate(returnTo)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Cancel</button>
                <button onClick={handleNext} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {currentStep === 'services' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Services & Specialisms</h1>
              <p className="text-stone-500 mb-6">What services do you offer?</p>
              <div className="flex flex-wrap gap-2 mb-6">
                {services.map((s, i) => (
                  <span key={(s.id || s.label) + i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
                    {s.label}
                    <button onClick={() => setServices(services.filter(x => x !== s))}><X className="w-3 h-3" /></button>
                  </span>
                ))}
                {services.length === 0 && <span className="text-sm text-stone-400">No services added yet</span>}
              </div>
              <button onClick={() => setShowServicesDialog(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors mb-2">
                <Plus className="w-4 h-4" /> Edit Services
              </button>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStepIndex(stepIndex - 1)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={handleNext} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {currentStep === 'location' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Location & Contact</h1>
              <p className="text-stone-500 mb-6">Where do you operate and how can clients reach you?</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Location</label>
                  <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="City, Country" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Service Area</label>
                  <input type="text" value={serviceArea} onChange={e => setServiceArea(e.target.value)} placeholder="e.g. Central London, Online" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Contact Email</label>
                  <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Contact Phone</label>
                  <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStepIndex(stepIndex - 1)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={handleNext} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {currentStep === 'verification' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                </div>
                <h1 className="text-2xl font-bold text-stone-800">Verification</h1>
              </div>
              <p className="text-stone-500 mb-6">Professional verification is managed by Trust & Reputation. Submitting a verification request starts the review process. You can continue using Interactive while verification is pending.</p>
              <div className="bg-stone-50 rounded-xl p-5 mb-6 text-sm text-stone-600">
                <p className="mb-2 font-medium text-stone-700">What happens next:</p>
                <ul className="space-y-1.5 list-disc list-inside">
                  <li>A verification request is submitted to Trust & Reputation</li>
                  <li>Your professional profile becomes active immediately</li>
                  <li>Some capabilities may require verified status</li>
                  <li>You'll be notified when verification is reviewed</li>
                </ul>
              </div>
              <label className="flex items-start gap-3 cursor-pointer mb-2">
                <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} className="mt-1 w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-stone-700">I agree to the professional terms and confirm the information provided is accurate <span className="text-indigo-600 font-semibold">*</span></span>
              </label>
              <FieldError error={errors.terms} />
              <div className="mb-6" />
              <div className="flex gap-3">
                <button onClick={() => setStepIndex(stepIndex - 1)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={handleNext} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {currentStep === 'settings' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Professional Settings</h1>
              <p className="text-stone-500 mb-6">Control your professional profile visibility.</p>
              <div className="space-y-4">
                <div>
                  <MandatoryLabel htmlFor="pa-screen-name" required>Screen Name</MandatoryLabel>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-400 text-sm">@</span>
                    <input id="pa-screen-name" type="text" value={screenName} onChange={e => setScreenName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="estherfitness" maxLength={20} className={inputClass} />
                  </div>
                  <p className="text-xs text-stone-400 mt-1">3-20 characters. Your public profile: /p/{screenName || 'handle'}</p>
                  <FieldError error={errors.screenName} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Profile Visibility</label>
                  <select value={visibility} onChange={e => setVisibility(e.target.value)} className={inputClass}>
                    <option value="public">Public — visible to everyone</option>
                    <option value="connections">Connections — visible to your connections</option>
                    <option value="private">Private — visible only to you</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStepIndex(stepIndex - 1)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={handleNext} disabled={loading} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Activating...</> : <><Check className="w-4 h-4" /> Activate Professional</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <TaxonomySelectDialog
        open={showServicesDialog}
        onClose={() => setShowServicesDialog(false)}
        title="Edit Services"
        items={services}
        standardOptions={STANDARD_SERVICES}
        placeholder="Add a service..."
        onSave={(next) => setServices(next)}
      />
    </div>
  );
}