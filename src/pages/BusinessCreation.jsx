import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { submitVerification } from '@/lib/trust';
import { createNotification } from '@/lib/notifications';
import { Loader2, Plus, X, Check, ShieldCheck, Users } from 'lucide-react';

export default function BusinessCreation() {
  const { user, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState([]);

  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('other');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('');
  const [staffEmails, setStaffEmails] = useState(['']);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '/dashboard';
  const stepKeys = ['identity', 'profile', 'verification', 'plan', 'staff', 'complete'];

  useEffect(() => {
    base44.entities.SubscriptionPlan.filter({ status: 'active' }, 'sort_order', 10).then(setPlans);
  }, []);

  const addStaffField = () => setStaffEmails([...staffEmails, '']);
  const updateStaffEmail = (i, val) => setStaffEmails(staffEmails.map((e, idx) => idx === i ? val : e));
  const removeStaffField = (i) => setStaffEmails(staffEmails.filter((_, idx) => idx !== i));

  const handleNext = () => {
    const current = stepKeys[stepIndex];
    if (current === 'identity' && !businessName.trim()) return;
    if (current === 'verification' && !termsAccepted) return;
    if (current === 'plan' && !selectedPlan) return;

    if (stepIndex < stepKeys.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      completeCreation();
    }
  };

  const completeCreation = async () => {
    setLoading(true);
    try {
      // 1. Create Business (lifecycle: creating → pending_verification)
      const business = await base44.entities.Business.create({
        name: businessName,
        owner_id: user.id,
        type: businessType,
        lifecycle_state: 'pending_verification',
        onboarding_status: 'active',
        onboarding_step: 'complete',
        verification_state: 'pending_review',
        website,
        contact_email: contactEmail,
        contact_phone: contactPhone,
      });

      // 2. Create owner membership
      await base44.entities.BusinessMembership.create({
        business_id: business.id,
        identity_id: user.id,
        role: 'owner',
        lifecycle_state: 'active',
      });

      // 3. Create Business Profile
      await base44.entities.BusinessProfile.create({
        business_id: business.id,
        name: businessName,
        description,
        category,
        location,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        website,
        lifecycle_state: 'active',
      });

      // 4. Submit verification through Trust & Reputation
      await submitVerification('business', business.id, user.id, [], `Business verification for ${businessName}`);

      // Create notification (failure isolated — doesn't undo business creation)
      await createNotification({
        recipient_id: user.id,
        source_system: 'trust',
        event_type: 'verification_submitted',
        title: 'Verification Submitted',
        body: `Your business verification for ${businessName} has been submitted for review.`,
        category: 'verification',
        action_url: `/business/${business.id}`,
        action_label: 'View Business',
        source_id: business.id,
      });

      // 5. Create subscription (plan selection — interface to Plans & Monetisation)
      if (selectedPlan) {
        const plan = plans.find(p => p.id === selectedPlan);
        await base44.entities.BusinessSubscription.create({
          business_id: business.id,
          plan_id: selectedPlan,
          plan_name: plan?.name || '',
          status: 'selected',
          selected_at: new Date().toISOString(),
        });
      }

      // 6. Create staff invitations
      const validEmails = staffEmails.filter(e => e.trim() && e !== user.email);
      for (const email of validEmails) {
        await base44.entities.BusinessInvitation.create({
          business_id: business.id,
          business_name: businessName,
          email: email.trim(),
          role: 'staff',
          invited_by_id: user.id,
          invited_by_name: user.display_name || user.email,
          status: 'sent',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      // 7. Update User active business
      await base44.auth.updateMe({
        active_business_id: business.id,
        active_context: 'business',
      });

      window.location.href = `/business/${business.id}`;
    } finally {
      setLoading(false);
    }
  };

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
              <span className="font-semibold text-stone-800">Create Business</span>
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
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Business Identity</h1>
              <p className="text-stone-500 mb-6">Create a stable Business entity. This is an organisation, not a user account.</p>
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
                <button onClick={() => navigate(returnTo)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Cancel</button>
                <button onClick={handleNext} disabled={!businessName.trim()} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {currentStep === 'profile' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Business Profile</h1>
              <p className="text-stone-500 mb-6">Public information about your business.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Description</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What does your business do?" className={inputClass + " resize-none"} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Category</label>
                  <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Fitness, Wellness, Healthcare" className={inputClass} />
                </div>
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
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Website</label>
                  <input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." className={inputClass} />
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
                <h1 className="text-2xl font-bold text-stone-800">Business Verification</h1>
              </div>
              <p className="text-stone-500 mb-6">Business verification is managed by Trust & Reputation. A verification request will be submitted during creation. Your business can begin operating while verification is pending.</p>
              <div className="bg-stone-50 rounded-xl p-5 mb-6 text-sm text-stone-600">
                <p className="mb-2 font-medium text-stone-700">Verification states:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Not Verified → Pending Review → Verified</li>
                  <li>Some capabilities may require verified status</li>
                  <li>Verification does not block business creation</li>
                </ul>
              </div>
              <label className="flex items-start gap-3 cursor-pointer mb-6">
                <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} className="mt-1 w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-stone-700">I confirm I am authorised to create this business and accept the business terms</span>
              </label>
              <div className="flex gap-3">
                <button onClick={() => setStepIndex(stepIndex - 1)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={handleNext} disabled={!termsAccepted} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {currentStep === 'plan' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Select a Plan</h1>
              <p className="text-stone-500 mb-6">Choose a subscription plan for your business. Plans are defined by Plans & Monetisation.</p>
              {plans.length === 0 ? (
                <div className="bg-stone-50 rounded-xl p-6 text-center text-stone-500 text-sm mb-6">
                  No plans available yet. You can select a plan later.
                  <button onClick={() => setStepIndex(stepIndex + 1)} className="block mx-auto mt-3 text-indigo-600 font-medium">Skip for now</button>
                </div>
              ) : (
                <div className="space-y-3 mb-6">
                  {plans.map(plan => (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan.id)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${selectedPlan === plan.id ? 'border-indigo-500 bg-indigo-50' : 'border-stone-200 hover:border-stone-300'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-stone-800">{plan.name}</span>
                        {selectedPlan === plan.id && <Check className="w-4 h-4 text-indigo-600" />}
                      </div>
                      <p className="text-sm text-stone-500 mb-2">{plan.description}</p>
                      {plan.features && plan.features.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {plan.features.map((f, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 bg-stone-100 text-stone-600 rounded">{f}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setStepIndex(stepIndex - 1)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={handleNext} disabled={plans.length > 0 && !selectedPlan} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">Continue</button>
              </div>
            </div>
          )}

          {currentStep === 'staff' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-indigo-600" />
                </div>
                <h1 className="text-2xl font-bold text-stone-800">Invite Staff</h1>
              </div>
              <p className="text-stone-500 mb-6">Invite team members to your business. You can skip this and invite staff later.</p>
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

          {currentStep === 'complete' && (
            <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-7 h-7 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold text-stone-800 mb-2">Ready to Create</h1>
              <p className="text-stone-500 mb-6">Your business workspace will be created with the following:</p>
              <div className="bg-stone-50 rounded-xl p-5 text-left text-sm space-y-2 mb-6">
                <div><span className="text-stone-500">Business:</span> <span className="font-medium text-stone-800">{businessName}</span></div>
                <div><span className="text-stone-500">Type:</span> <span className="font-medium text-stone-800 capitalize">{businessType}</span></div>
                {selectedPlan && <div><span className="text-stone-500">Plan:</span> <span className="font-medium text-stone-800">{plans.find(p => p.id === selectedPlan)?.name}</span></div>}
                <div><span className="text-stone-500">Staff invitations:</span> <span className="font-medium text-stone-800">{staffEmails.filter(e => e.trim()).length}</span></div>
                <div><span className="text-stone-500">Verification:</span> <span className="font-medium text-stone-800">Will be submitted</span></div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStepIndex(stepIndex - 1)} className="px-5 py-3 text-stone-600 hover:bg-stone-100 rounded-xl font-medium transition-colors">Back</button>
                <button onClick={completeCreation} disabled={loading} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><Check className="w-4 h-4" /> Create Business</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}