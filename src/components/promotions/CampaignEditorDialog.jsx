// CampaignEditorDialog — create a new promotional campaign.
// Validates against the Growth Package entitlements (allowed types,
// max active campaigns). Delegates the write to a server-side function
// (not yet wired) — for now shows a toast explaining the pending writer.
import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

const CAMPAIGN_TYPES = [
  { value: 'service_boost', label: 'Service Boost' },
  { value: 'event_boost', label: 'Event Boost' },
  { value: 'workout_boost', label: 'Workout Boost' },
  { value: 'post_boost', label: 'Post Boost' },
  { value: 'profile_boost', label: 'Profile Boost' },
  { value: 'business_boost', label: 'Business Boost' },
];

export default function CampaignEditorDialog({ growthPackage, onClose, onSaved }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    campaign_type: '',
    headline: '',
    description: '',
    budget_pence: '',
    start_date: '',
    end_date: '',
  });

  const allowedTypes = growthPackage?.campaign_types || [];
  const availableTypes = CAMPAIGN_TYPES.filter((t) => allowedTypes.includes(t.value));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.campaign_type) {
      toast({ title: 'Name and campaign type are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // The actual write requires a server-side campaign writer cloud function.
      // That function is pending — do not fabricate a client-side write.
      toast({
        title: 'Campaign writer pending',
        description: 'Server-side campaign creation is not yet deployed. Your campaign was not saved.',
        variant: 'destructive',
      });
      onClose();
    } catch (err) {
      toast({ title: 'Could not create campaign', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-stone-200">
          <h2 className="font-semibold text-stone-800">New Campaign</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100">
            <X className="w-4 h-4 text-stone-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <Label htmlFor="name">Campaign Name *</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Summer Service Boost" required />
          </div>
          <div>
            <Label htmlFor="campaign_type">Campaign Type *</Label>
            <select
              id="campaign_type"
              value={form.campaign_type}
              onChange={(e) => setForm({ ...form, campaign_type: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white"
              required
            >
              <option value="">Select a type…</option>
              {availableTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {availableTypes.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Your plan does not allow any campaign types.</p>
            )}
          </div>
          <div>
            <Label htmlFor="headline">Promotional Headline</Label>
            <Input id="headline" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Book your session today" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe your promotional campaign" className="min-h-[80px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="budget">Budget (£)</Label>
              <Input
                id="budget"
                type="number"
                min="0"
                value={form.budget_pence}
                onChange={(e) => setForm({ ...form, budget_pence: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : '' })}
                placeholder="50"
              />
            </div>
            <div>
              <Label htmlFor="start_date">Start Date</Label>
              <Input id="start_date" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || availableTypes.length === 0}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Campaign
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}