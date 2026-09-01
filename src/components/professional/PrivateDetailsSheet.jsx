import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { validateScreenName } from '@/services/profileService';
import { STANDARD_PROFESSIONAL_TYPES } from '@/data/standardProfessionalTypes';

/**
 * Owner-only side drawer for private/account-level professional data:
 * legal name (verification only), business/trading name, screen name,
 * profession, and profile visibility. None of these are inline on the
 * public-facing profile layout.
 */
export default function PrivateDetailsSheet({ open, onClose, profile, onSave }) {
  const [legalName, setLegalName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [screenName, setScreenName] = useState('');
  const [snStatus, setSnStatus] = useState(null);
  const [snChecking, setSnChecking] = useState(false);
  const [profession, setProfession] = useState('');
  const [professionalType, setProfessionalType] = useState(null);
  const [visibility, setVisibility] = useState('public');
  const [snError, setSnError] = useState(null);

  useEffect(() => {
    if (open && profile) {
      setLegalName(profile.legal_name || '');
      setBusinessName(profile.business_name || '');
      setScreenName(profile.screen_name || '');
      setProfession(profile.profession || profile.professional_category || '');
      setProfessionalType(profile.professional_type || null);
      setVisibility(profile.visibility || 'public');
      setSnStatus(null);
      setSnError(null);
    }
  }, [open, profile]);

  const checkSn = async (val) => {
    const t = val.toLowerCase().trim();
    if (!t) { setSnStatus(null); return; }
    setSnChecking(true);
    try {
      setSnStatus(await validateScreenName(t, profile?.screen_name || null));
    } catch {
      setSnStatus({ available: false, reason: 'Could not verify' });
    } finally {
      setSnChecking(false);
    }
  };

  const handleSave = () => {
    const sn = screenName.toLowerCase().trim();
    // An active Professional must have a screen_name (server-enforced, but
    // validated client-side first for clear UX). This is the repair path for
    // migrated profiles that arrived with screen_name = null.
    if (profile?.lifecycle_state === 'active' && !sn) {
      setSnError('A screen name is required for an active professional profile');
      return;
    }
    setSnError(null);
    onSave({
      legal_name: legalName,
      business_name: businessName,
      screen_name: sn || null,
      profession,
      professional_category: profession,
      professional_type: professionalType,
      visibility,
    });
    onClose();
  };

  const inputClass = 'w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Professional details</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-10 mt-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            Legal name is private — used for verification only. It is never shown on your public profile.
          </div>
          <div>
            <Label className="mb-1.5 block">Legal name <span className="text-xs font-normal text-stone-400">(private)</span></Label>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Your real/legal name" />
          </div>
          <div>
            <Label className="mb-1.5 block">Business / trading name <span className="text-xs font-normal text-stone-400">(optional, public)</span></Label>
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Esther Fitness Ltd" />
          </div>
          <div>
            <Label className="mb-1.5 block">Screen name <span className="text-xs font-normal text-stone-400">(public handle)</span></Label>
            <div className="flex items-center gap-2">
              <span className="text-stone-400 text-sm">@</span>
              <Input
                value={screenName}
                onChange={(e) => setScreenName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                onBlur={(e) => checkSn(e.target.value)}
                placeholder="estherfitness"
                maxLength={20}
              />
              {snChecking && <Loader2 className="w-4 h-4 text-stone-400 animate-spin shrink-0" />}
            </div>
            {snStatus && !snChecking && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${snStatus.available ? 'text-emerald-600' : 'text-red-500'}`}>
                {snStatus.available ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {snStatus.available ? 'Available' : snStatus.reason || 'Not available'}
              </p>
            )}
            <p className="text-xs text-stone-400 mt-1">3-20 chars: lowercase letters, numbers, underscores.</p>
            {snError && (
              <p className="text-xs mt-1 flex items-center gap-1 text-red-500">
                <AlertCircle className="w-3 h-3" />
                {snError}
              </p>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block">Profession</Label>
            <Input value={profession} onChange={(e) => setProfession(e.target.value)} placeholder="e.g. Personal Trainer" />
          </div>
          <div>
            <Label className="mb-1.5 block">Professional type <span className="text-xs font-normal text-stone-400">(structured)</span></Label>
            <select
              value={professionalType?.id || ''}
              onChange={(e) => {
                const opt = STANDARD_PROFESSIONAL_TYPES.find((o) => o.id === e.target.value);
                setProfessionalType(opt ? { id: opt.id, label: opt.label } : null);
              }}
              className={inputClass}
            >
              <option value="">Select a type…</option>
              {STANDARD_PROFESSIONAL_TYPES.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block">Profile visibility</Label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className={inputClass}>
              <option value="public">Public — visible to everyone</option>
              <option value="connections">Connections only</option>
              <option value="private">Private — visible only to you</option>
            </select>
          </div>
          <Button onClick={handleSave} className="w-full">Save details</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}