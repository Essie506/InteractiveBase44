import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Owner-only side drawer for personal account-level data:
 * screen name and profile visibility. None of these are inline
 * on the public-facing profile layout.
 */
export default function PersonalDetailsSheet({ open, onClose, profile, onSave }) {
  const [screenName, setScreenName] = useState('');
  const [visibility, setVisibility] = useState('public');

  useEffect(() => {
    if (open && profile) {
      setScreenName(profile.screen_name || '');
      setVisibility(profile.visibility || 'public');
    }
  }, [open, profile]);

  const handleSave = () => {
    onSave({
      screen_name: screenName.toLowerCase().trim() || null,
      visibility,
    });
    onClose();
  };

  const inputClass = 'w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Personal details</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-10 mt-4">
          <div>
            <Label className="mb-1.5 block">Screen name <span className="text-xs font-normal text-stone-400">(public handle)</span></Label>
            <div className="flex items-center gap-2">
              <span className="text-stone-400 text-sm">@</span>
              <Input
                value={screenName}
                onChange={(e) => setScreenName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="username"
                maxLength={20}
              />
            </div>
            <p className="text-xs text-stone-400 mt-1">3-20 chars: lowercase letters, numbers, underscores.</p>
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