import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import {
  createBusiness, createBusinessProfile, saveBusinessProfile, createMembership,
  createInvitation,
} from '@/services/businessService';
import { saveProfessionalProfile } from '@/services/profileService';
import * as userService from '@/services/userService';
import { createNotification } from '@/lib/notifications';
import { Loader2, Plus, X, Check, ShieldCheck, Users, Briefcase, Building2, ArrowRight } from 'lucide-react';
import MandatoryLabel from '@/components/MandatoryLabel';
import FieldError from '@/components/FieldError';
import VerificationSubmissionForm from '@/components/verification/VerificationSubmissionForm';

// Listing creation wizard (V2 Public Interactive refinement).
// ───────────────────────────────────────────────────────────
// Stages: Your Listing → Profile → Verification → Invite Staff → Ready to Create.
//
// A listing represents either a Professional or a Business public presence.
// The wizard reuses the existing canonical Professional/Business profile
// architecture — it does NOT create a parallel "listing" identity model.
//
// Plan selection has been REMOVED from free listing creation. Creating a
// public presence must not require a paid plan, auto-create a subscription,
// or imply a Business identity needs a Business-tier payment.
//
// Unauthenticated visitors can begin building the listing before creating
// an account. Draft data persists in localStorage across the auth
// transition and is only attached to the authenticated identity at
// completion — an unauthenticated draft can never become owned by the
// wrong identity.

const DRAFT_KEY = 'interactive_listing_draft_v1';

export default function BusinessCreation() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Listing type: 'business' | 'professional'
  const [listingType, setListingType] = useState('business');

  // Shared identity fields
  const [name, setName] = useState(''); // business name OR professional display name
  const [businessType, setBusinessType] = useState('other');
  // Shared profile fields
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  // Professional-specific
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [screenName, setScreenName] = useState('');
  // Verification — optional during listing creation. The user may submit
  // evidence via the authoritative V2 Trust engine (when authenticated +
  // subject exists) or skip and complete verification later. Skipping
  // never fabricates a request and never marks the listing verified.
  const [verificationSkipped, setVerificationSkipped] = useState(false);
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  // Listing-creation consent (collected at Ready to Create).
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Staff
  const [staffEmails, setStaffEmails] = useState(['']);
  const [errors, setErrors] = useState(/** @type {Record<string, any>} */ ({}));

  const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '/dashboard';
  // Professional listings skip the Invite Staff step entirely — staff
  // linking is a Business capability. The progress indicator reflects
  // the actual journey for the selected listing type (no misleading step).
  const stepKeys = listingType === 'professional'
    ? ['listing', 'profile', 'verification', 'complete']
    : ['listing', 'profile', 'verification', 'staff', 'complete'];

  // Load any saved draft on mount (survives the auth transition). The draft
  // is only written while unauthenticated, so a stale draft cannot overwrite
  // an authenticated user's live data. Cleared on successful completion.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      setListingType(d.listingType || 'business');
      setName(d.name || ''); setBusinessType(d.businessType || 'other');
      setDescription(d.description || ''); setCategory(d.category || '');
      setLocation(d.location || ''); setContactEmail(d.contactEmail || '');
      setContactPhone(d.contactPhone || ''); setWebsite(d.website || '');
      setHeadline(d.headline || ''); setBio(d.bio || ''); setScreenName(d.screenName || '');
      setTermsAccepted(!!d.termsAccepted);
      setVerificationSkipped(!!d.verificationSkipped);
      // staffEmails are deliberately NOT restored from the draft —
      // third-party invitation emails are never persisted to localStorage.
      // Staff are invited only after authentication, at completion.
      // verificationSubmitted is runtime state re-derived from the server
      // (claims are server-authoritative); not persisted to the draft.
      if (typeof d.stepIndex === 'number' && d.stepIndex >= 0) setStepIndex(d.stepIndex);
    } catch { /* ignore malformed draft */ }
  }, []);

  // Persist draft only while unauthenticated. Once authenticated, the
  // in-memory state is the source of truth and the draft is cleared on
  // completion.
  useEffect(() => {
    if (user) return;
    // Deliberately EXCLUDED from the draft: staffEmails (third-party
    // invitation emails), and any verification evidence/identity documents
    // (none are collected in the wizard — see Verification stage). Only
    // ordinary, non-sensitive public listing/profile fields are persisted.
    const draft = {
      listingType, name, businessType, description, category, location,
      contactEmail, contactPhone, website, headline, bio, screenName,
      termsAccepted, verificationSkipped, stepIndex,
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* quota */ }
  }, [user, listingType, name, businessType, description, category, location, contactEmail, contactPhone, website, headline, bio, screenName, termsAccepted, verificationSkipped, stepIndex]);

  const addStaffField = () => setStaffEmails([...staffEmails, '']);
  const updateStaffEmail = (i, val) => setStaffEmails(staffEmails.map((e, idx) => idx === i ? val : e));
  const removeStaffField = (i) => setStaffEmails(staffEmails.filter((_, idx) => idx !== i));

  const validateStep = (step) => {
    const e = {};
    if (step === 'listing') {
      if (!name.trim()) e.name = listingType === 'business' ? 'Business name is required' : 'Display name is required';
      // Professional Category is now collected on Step 1 (Your Listing).
      if (listingType === 'professional' && !category.trim()) e.category = 'Professional category is required';
    }
    if (step === 'profile' && listingType === 'professional') {
      const sn = screenName.toLowerCase().trim();
      if (!sn) e.screenName = 'Screen name is required for your public profile';
      else if (!/^[a-z0-9_]{3,20}$/.test(sn)) e.screenName = '3-20 characters: lowercase letters, numbers, underscores';
    }
    if (step === 'complete' && !termsAccepted) e.terms = 'You must accept the terms to continue';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    const current = stepKeys[stepIndex];
    if (!validateStep(current)) return;
    setErrors({});
    if (stepIndex < stepKeys.length - 1) setStepIndex(stepIndex + 1);
    else handleComplete();
  };

  const handleComplete = async () => {
    // Ready to Create — if unauthenticated, route into the normal auth flow.
    // The draft is already persisted; after auth the user returns here and
    // completes using their authenticated identity.
    if (!user) {
      navigate(`/register?returnTo=${encodeURIComponent('/create-business')}`);
      return;
    }
    await runCreation();
  };

  const runCreation = async () => {
    setLoading(true);
    try {
      if (listingType === 'professional') {
        await createProfessionalListing();
      } else {
        await createBusinessListing();
      }
      // Clear the draft once the listing is attached to the identity.
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  };

  const createBusinessListing = async () => {
    // Verification state: 'pending_review' only if evidence was actually
    // submitted via the authoritative V2 engine; otherwise 'not_verified'.
    // Skipping NEVER fabricates a verification request and NEVER marks the
    // listing verified. Business verification evidence cannot be submitted
    // before the business exists, so a deferred business starts
    // 'not_verified' and the owner completes verification later from the
    // business workspace (/business/:id/verify).
    const verificationState = verificationSubmitted ? 'pending_review' : 'not_verified';

    // 1. Create Business
    const business = await createBusiness({
      name, owner_id: user.id, type: businessType,
      lifecycle_state: 'pending_verification',
      onboarding_status: 'active', onboarding_step: 'complete',
      verification_state: verificationState,
      website, contact_email: contactEmail, contact_phone: contactPhone,
    });

    // 2. Owner membership
    await createMembership({ business_id: business.id, identity_id: user.id, role: 'owner', lifecycle_state: 'active' });

    // 3. Business Profile (private) + public Directory projection
    const profileData = {
      name, description, category, location,
      contact_email: contactEmail, contact_phone: contactPhone, website,
      lifecycle_state: 'active', visibility: 'public',
    };
    await createBusinessProfile({ business_id: business.id, ...profileData });
    try { await saveBusinessProfile(business.id, profileData); } catch (projErr) { console.error('saveBusinessProfile projection at creation failed:', projErr); }

    // 4. Verification — no fabricated request. If evidence was submitted
    // in-wizard it is already recorded by the V2 Trust engine; otherwise
    // the owner completes verification later. Notify only when submitted.
    if (verificationSubmitted) {
      await createNotification({
        recipient_id: user.id, source_system: 'trust', event_type: 'verification_submitted',
        title: 'Verification Submitted', body: `Your business verification for ${name} has been submitted for review.`,
        category: 'verification', action_url: `/business/${business.id}/verify`, action_label: 'Complete verification', source_id: business.id,
      }).catch(() => {});
    }

    // 5. Staff invitations — invitations only (no seat activation, no authority)
    const validEmails = staffEmails.filter(e => e.trim() && e !== user.email);
    for (const email of validEmails) {
      await createInvitation({
        business_id: business.id, business_name: name, email: email.trim(),
        role: 'staff', invited_by_id: user.id, invited_by_name: user.display_name || user.email,
        status: 'sent', expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // 6. No subscription created — public presence is free.
    await userService.updateUserState({ active_business_id: business.id, active_context: 'business' });
    window.location.href = '/dashboard';
  };

  const createProfessionalListing = async () => {
    // Verification state: 'pending_review' only if evidence was actually
    // submitted via the authoritative V2 engine; otherwise 'not_verified'.
    // Skipping NEVER fabricates a request and NEVER marks the profile
    // verified. The professional can complete verification later via
    // /verify-professional.
    const verificationState = verificationSubmitted ? 'pending_review' : 'not_verified';
    const profileData = {
      identity_id: user.id, display_name: name, headline, bio,
      profession: category, professional_category: category,
      services: [], service_area: '', location,
      contact_email: contactEmail, contact_phone: contactPhone,
      screen_name: screenName.toLowerCase().trim() || null,
      visibility: 'public', onboarding_status: verificationSubmitted ? 'awaiting_verification' : 'active',
      verification_state: verificationState, lifecycle_state: 'active',
      activated_at: new Date().toISOString(),
    };
    await saveProfessionalProfile(user.id, profileData);
    // No fabricated verification request. If evidence was submitted
    // in-wizard it is already recorded by the V2 Trust engine.
    if (verificationSubmitted) {
      await createNotification({
        recipient_id: user.id, source_system: 'trust', event_type: 'verification_submitted',
        title: 'Verification Submitted', body: 'Your professional verification request has been submitted for review.',
        category: 'verification', action_url: '/verify-professional', action_label: 'Complete verification', source_id: user.id,
      }).catch(() => {});
    }
    await userService.updateUserState({
      professional_activated: true, professional_onboarding_status: 'active',
      display_name: name, active_context: 'professional',
    });
    window.location.href = '/dashboard';
  };

  const currentStep = stepKeys[stepIndex];
  const inputClass = "w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";
  const isProfessional = listingType === 'professional';

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <div className="px-6 md:px-10 py-5 bg-white border-b border-stone-200">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">I</span>
              </div>
              <span className="font-semibold text-stone-800">Create your listing</span>
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
          {/* Your Listing */}
          {currentStep === 'listing' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Your listing</h1>
              <p className="text-stone-500 mb-4">A listing represents either a Professional or a Business public presence. Choose the type that fits.</p>
              <p className="text-xs text-stone-400 mb-6 flex items-center gap-1"><span className="text-indigo-600 font-semibold">*</span> means mandatory</p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <button type="button" onClick={() => setListingType('business')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${listingType === 'business' ? 'border-indigo-500 bg-indigo-50' : 'border-stone-200 hover:border-stone-300'}`}>
                  <Building2 className={`w-5 h-5 mb-2 ${listingType === 'business' ? 'text-indigo-600' : 'text-stone-400'}`} />
                  <div className="font-semibold text-stone-800">Business</div>
                  <div className="text-xs text-stone-500 mt-0.5">Organisation, studio, gym</div>
                </button>
                <button type="button" onClick={() => setListingType('professional')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${listingType === 'professional' ? 'border-indigo-500 bg-indigo-50' : 'border-stone-200 hover:border-stone-300'}`}>
                  <Briefcase className={`w-5 h-5 mb-2 ${listingType === 'professional' ? 'text-indigo-600' : 'text-stone-400'}`} />
                  <div className="font-semibold text-stone-800">Professional</div>
                  <div className="text-xs text-stone-500 mt-0.5">Individual practice</div>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <MandatoryLabel
                    htmlFor="lc-name"
                    required
                    tooltip={isProfessional
                      ? 'The name you want people to see on your professional listing and public profile. This can be your professional or public-facing name.'
                      : 'The public name of your business or organisation. This is the name people will see on your listing and across Interactive.'}
                  >
                    {isProfessional ? 'Display Name' : 'Business Name'}
                  </MandatoryLabel>
                  <input id="lc-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder={isProfessional ? 'e.g. Esther Fitness' : 'e.g. Acme Fitness Studio'} className={inputClass} />
                  <FieldError error={errors.name} />
                </div>
                {!isProfessional && (
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
                )}
                {isProfessional && (
                  <div>
                    <MandatoryLabel htmlFor="lc-pro-category" required>Professional Category</MandatoryLabel>
                    <select id="lc-pro-category" value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
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
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => navigate(returnTo)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Cancel</button>
                <button onClick={handleNext} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {/* Profile */}
          {currentStep === 'profile' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">{isProfessional ? 'Professional Profile' : 'Business Profile'}</h1>
              <p className="text-stone-500 mb-6">Public information about your {isProfessional ? 'practice' : 'business'}.</p>
              <div className="space-y-4">
                {isProfessional ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1.5">Headline</label>
                      <input type="text" value={headline} onChange={e => setHeadline(e.target.value)} placeholder="e.g. Certified Personal Trainer" className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1.5">Bio</label>
                      <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Describe your professional background" className={inputClass + " resize-none"} />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1.5">Description</label>
                      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What does your business do?" className={inputClass + " resize-none"} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1.5">Category</label>
                      <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Fitness, Wellness, Healthcare" className={inputClass} />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Location</label>
                  <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="City, Country" className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">Contact Email</label>
                    <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">Contact Phone</label>
                    <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={inputClass} />
                  </div>
                </div>
                {!isProfessional && (
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">Website</label>
                    <input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." className={inputClass} />
                  </div>
                )}
                {isProfessional && (
                  <div>
                    <MandatoryLabel htmlFor="lc-screen-name" required>Screen Name</MandatoryLabel>
                    <div className="flex items-center gap-2">
                      <span className="text-stone-400 text-sm">@</span>
                      <input id="lc-screen-name" type="text" value={screenName} onChange={e => setScreenName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="estherfitness" maxLength={20} className={inputClass} />
                    </div>
                    <p className="text-xs text-stone-400 mt-1">3-20 characters. Your public profile: /p/{screenName || 'handle'}</p>
                    <FieldError error={errors.screenName} />
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStepIndex(stepIndex - 1)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={handleNext} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {/* Verification — reuses the existing Professional Verification
              capability (V2 Trust & Reputation claims engine via the shared
              VerificationSubmissionForm). Optional: submit evidence now
              (when authenticated + subject exists) or skip and complete
              verification later from the existing authenticated Verification
              area. Skipping never fabricates a request and never marks the
              listing verified. */}
          {currentStep === 'verification' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                </div>
                <h1 className="text-2xl font-bold text-stone-800">Verification</h1>
              </div>
              <p className="text-stone-500 mb-6">Verification is based on corroborated evidence under Trust &amp; Reputation — independent of subscription tier or advertising spend. It's optional during listing creation: submit evidence now or skip and complete it later from your account.</p>

              <VerificationSubmissionForm
                subjectType={listingType === 'business' ? 'business' : 'professional'}
                subjectId={listingType === 'business' ? null : (user?.id || null)}
                country="GB"
                profession={listingType === 'professional' ? category : ''}
                user={user}
                onSubmitted={() => setVerificationSubmitted(true)}
                disabledReason={
                  !user
                    ? 'Sign in or create an account to submit verification evidence now. You can skip this step and complete verification later from your account.'
                    : listingType === 'business'
                      ? 'Business verification is available after your business is created. Skip this step and complete verification later from your business workspace.'
                      : null
                }
              />

              <label className="flex items-start gap-3 cursor-pointer mt-5 mb-2">
                <input type="checkbox" checked={verificationSkipped} onChange={e => setVerificationSkipped(e.target.checked)} className="mt-1 w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-stone-700">Continue without verification — I'll complete it later. My listing will be unverified until then.</span>
              </label>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStepIndex(stepIndex - 1)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button
                  onClick={handleNext}
                  disabled={!verificationSkipped && !verificationSubmitted}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Continue
                </button>
              </div>
              {!verificationSkipped && !verificationSubmitted && (
                <p className="text-xs text-stone-400 mt-2 text-center">Submit evidence above or tick "Continue without verification" to proceed.</p>
              )}
            </div>
          )}

          {/* Invite Staff — Business only. Professional listings skip this
              step entirely (it is not in stepKeys), so no fake empty staff
              invitations are created to satisfy the step sequence. */}
          {currentStep === 'staff' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-indigo-600" />
                </div>
                <h1 className="text-2xl font-bold text-stone-800">Invite Staff</h1>
              </div>
              <p className="text-stone-500 mb-2">Invite team members to your business. Linking staff is free — invitations do not activate paid operational seats or grant Business control over a Professional account.</p>
              <p className="text-xs text-stone-400 mb-6">You can skip this and invite staff later.</p>
              <div className="space-y-2 mb-3">
                {staffEmails.map((email, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="email" value={email} onChange={e => updateStaffEmail(i, e.target.value)} placeholder="colleague@example.com" className={inputClass} />
                    {staffEmails.length > 1 && (
                      <button onClick={() => removeStaffField(i)} className="px-3 py-2.5 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={addStaffField} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium hover:text-indigo-700"><Plus className="w-4 h-4" /> Add another</button>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStepIndex(stepIndex - 1)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={handleNext} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {/* Ready to Create */}
          {currentStep === 'complete' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-7 h-7 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Ready to Create</h1>
              <p className="text-stone-500 mb-6">{user ? 'Your listing will be created for your account.' : 'Create an account or log in to publish your listing. Your details are saved.'}</p>
              <div className="bg-stone-50 rounded-xl p-5 text-left text-sm space-y-2 mb-6">
                <div><span className="text-stone-500">Type:</span> <span className="font-medium text-stone-800">{isProfessional ? 'Professional' : 'Business'}</span></div>
                <div><span className="text-stone-500">{isProfessional ? 'Name:' : 'Business:'}</span> <span className="font-medium text-stone-800">{name}</span></div>
                {!isProfessional && <div><span className="text-stone-500">Business type:</span> <span className="font-medium text-stone-800 capitalize">{businessType}</span></div>}
                {isProfessional && category && <div><span className="text-stone-500">Category:</span> <span className="font-medium text-stone-800">{category}</span></div>}
                {!isProfessional && <div><span className="text-stone-500">Staff invitations:</span> <span className="font-medium text-stone-800">{staffEmails.filter(e => e.trim()).length}</span></div>}
                <div><span className="text-stone-500">Verification:</span> <span className="font-medium text-stone-800">{verificationSubmitted ? 'Evidence submitted — pending review' : verificationSkipped ? 'Skipped — complete later' : 'Not submitted'}</span></div>
                <div><span className="text-stone-500">Plan:</span> <span className="font-medium text-stone-800">Free public presence — no paid plan required</span></div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer mb-2 text-left">
                <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} className="mt-1 w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-stone-700">I confirm I am authorised to create this listing and accept the terms <span className="text-indigo-600 font-semibold">*</span></span>
              </label>
              <FieldError error={errors.terms} />

              <div className="flex gap-3 mt-4">
                <button onClick={() => setStepIndex(stepIndex - 1)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                {user ? (
                  <button onClick={() => { if (validateStep('complete')) runCreation(); }} disabled={loading} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><Check className="w-4 h-4" /> Create listing</>}
                  </button>
                ) : (
                  <button onClick={() => { if (validateStep('complete')) handleComplete(); }} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2 transition-colors">
                    Sign up to create <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
              {!user && (
                <p className="text-sm text-stone-500 mt-4">Already have an account? <Link to={`/login?returnTo=${encodeURIComponent('/create-business')}`} className="text-indigo-600 font-medium hover:text-indigo-700">Log in</Link></p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}