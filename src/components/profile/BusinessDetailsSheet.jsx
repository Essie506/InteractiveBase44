import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Owner/admin-only side drawer for business account-level data:
 * category and profile visibility. Business-specific private fields
 * that are not inline on the public-facing profile layout.
 */
export default function BusinessDetailsSheet({ open, onClose, profile, onSave }) {
  const [category, setCategory] = useState('');
  const [visibility, setVisibility] = useState('public');

  useEffect(() => {
    if (open && profile) {
      setCategory(profile.category || '');
      setVisibility(profile.visibility || 'public');
    }
  }, [open, profile]);

  const handleSave = () => {
    onSave({ category, visibility });
    onClose();
  };

  const inputClass = 'w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Business details</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-10 mt-4">
          <div>
            <Label className="mb-1.5 block">Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Fitness, Physiotherapy" />
          </div>
          <div>
            <Label className="mb-1.5 block">Profile visibility</Label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className={inputClass}>
              <option value="public">Public — visible to everyone</option>
              <option value="private">Private — visible only to workspace</option>
            </select>
          </div>
          <Button onClick={handleSave} className="w-full">Save details</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}