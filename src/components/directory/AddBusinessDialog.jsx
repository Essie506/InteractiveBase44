import { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Building2, CheckCircle2, ArrowRight, ShieldCheck } from 'lucide-react';
import MandatoryLabel from '@/components/MandatoryLabel';
import FieldError from '@/components/FieldError';

// Public "Add your business" submission dialog (Spec: Directory §7).
// ───────────────────────────────────────────────────────────
// Lets an unauthenticated visitor submit a basic Directory presence
// WITHOUT completing the full Interactive sign-up/onboarding flow first.
//
// The submission creates a DirectoryListingRequest with status="pending".
// It is NOT published to the live Directory until an admin moderates it
// (the pending queue is the moderation safeguard). On approval the
// request is promoted to a real Business + businessProfilesPublic
// projection via the existing authoritative writer (saveBusinessProfile).
//
// After submission, a conversion step explains the distinction between:
//   - basic Directory presence (pending, no account),
//   - claiming/managing the listing through a FREE Interactive account,
//   - additional capabilities through applicable paid plans.
// Claiming a basic listing does NOT require a paid subscription.
//
// SAFEGUARD GAP (reported): unauthenticated public writes to this entity
// are open by RLS (create omitted). Anti-spam safeguards — rate limiting,
// captcha, email verification — are NOT currently defined in the spec and
// must be added before production. The pending moderation queue prevents
// unreviewed submissions from reaching the public Directory.

const BUSINESS_TYPES = [
  { value: 'gym', label: 'Gym' },
  { value: 'studio', label: 'Studio' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'club', label: 'Club' },
  { value: 'charity', label: 'Charity' },
  { value: 'other', label: 'Other' },
];

const inputClass = 'w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

export default function AddBusinessDialog({ open, onOpenChange }) {
  const [form, setForm] = useState({
    business_name: '',
    business_type: 'other',
    category: '',
    description: '',
    location: '',
    contact_email: '',
    contact_phone: '',
    website: '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.business_name.trim()) e.business_name = 'Business name is required';
    if (!form.contact_email.trim()) e.contact_email = 'Contact email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) e.contact_email = 'Enter a valid email';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await base44.entities.DirectoryListingRequest.create({
        ...form,
        status: 'pending',
        submitted_at: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch (err) {
      setErrors({ submit: err?.message || 'Submission failed. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setForm({ business_name: '', business_type: 'other', category: '', description: '', location: '', contact_email: '', contact_phone: '', website: '' });
    setErrors({});
    setSubmitted(false);
  };

  const handleClose = (open) => {
    if (!open) reset();
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {!submitted ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" /> Add your business
              </DialogTitle>
              <DialogDescription>
                Submit a basic Directory presence. No account needed to submit — your listing goes live after review.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div>
                <MandatoryLabel htmlFor="ab-name" required>Business name</MandatoryLabel>
                <input id="ab-name" type="text" value={form.business_name} onChange={set('business_name')} placeholder="e.g. Acme Fitness Studio" className={inputClass} />
                <FieldError error={errors.business_name} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Business type</label>
                  <select value={form.business_type} onChange={set('business_type')} className={inputClass}>
                    {BUSINESS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Category</label>
                  <input type="text" value={form.category} onChange={set('category')} placeholder="Fitness, Wellness…" className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Description</label>
                <textarea value={form.description} onChange={set('description')} rows={2} placeholder="What does your business do?" className={inputClass + ' resize-none'} />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Location</label>
                <input type="text" value={form.location} onChange={set('location')} placeholder="City, Country" className={inputClass} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <MandatoryLabel htmlFor="ab-email" required>Contact email</MandatoryLabel>
                  <input id="ab-email" type="email" value={form.contact_email} onChange={set('contact_email')} className={inputClass} />
                  <FieldError error={errors.contact_email} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Contact phone</label>
                  <input type="tel" value={form.contact_phone} onChange={set('contact_phone')} className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Website</label>
                <input type="url" value={form.website} onChange={set('website')} placeholder="https://…" className={inputClass} />
              </div>

              {errors.submit && <FieldError error={errors.submit} />}

              <div className="flex items-center gap-2 pt-1">
                <button type="button" onClick={() => handleClose(false)} className="px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-medium transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit for review'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Submission received
              </DialogTitle>
              <DialogDescription>
                Your business listing for <span className="font-medium text-stone-800">{form.business_name}</span> has been submitted and is pending review.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3 text-sm">
              <div className="bg-stone-50 rounded-xl p-4 space-y-2">
                <p className="font-medium text-stone-800">What happens next</p>
                <p className="text-stone-600">Our team reviews your submission. Once approved, your business appears in the Directory with the details you provided — no account required for this basic presence.</p>
              </div>

              <div className="border border-indigo-100 bg-indigo-50 rounded-xl p-4 space-y-2">
                <p className="font-medium text-indigo-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Claim &amp; manage your listing
                </p>
                <p className="text-indigo-800">
                  Create a <strong>free</strong> Interactive account with <span className="font-medium">{form.contact_email}</span> to claim this listing and manage its details, services, staff and calendar. Claiming a basic listing does <strong>not</strong> require a paid subscription.
                </p>
                <Link to={`/register?returnTo=${encodeURIComponent('/create-business')}`} className="inline-flex items-center gap-1.5 mt-1 text-indigo-700 font-medium hover:text-indigo-900">
                  Create a free account to claim <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
                <p className="font-medium text-stone-800">Want more capabilities?</p>
                <p className="text-stone-600">Paid Business plans unlock additional capabilities (such as promotional campaigns and advanced tools) as defined by the Plans specification. A paid plan is not required to claim or manage a basic listing.</p>
                <Link to="/plans" className="inline-flex items-center gap-1.5 mt-1 text-indigo-600 font-medium hover:text-indigo-700">
                  Compare plans <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button type="button" onClick={() => handleClose(false)} className="px-4 py-2.5 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-900 transition-colors">Done</button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}