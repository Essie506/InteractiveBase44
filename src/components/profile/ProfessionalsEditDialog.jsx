import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X, Trash2 } from 'lucide-react';

/**
 * Business professionals list editor — add/remove professionals with
 * denormalized public display info (name, headline, avatar URL, screen name).
 * Curated by business admins; shown on the public Business Profile.
 */
export default function ProfessionalsEditDialog({ open, onClose, professionals, onSave }) {
  const [list, setList] = useState([]);

  useEffect(() => {
    if (open) setList(professionals || []);
  }, [open, professionals]);

  const add = () => {
    setList([...list, { display_name: '', headline: '', avatar_url: '', screen_name: '' }]);
  };

  const update = (i, field, val) => {
    setList(list.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)));
  };

  const remove = (i) => {
    setList(list.filter((_, idx) => idx !== i));
  };

  const handleSave = () => {
    onSave(list.filter((p) => p.display_name?.trim()));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Professionals</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {list.map((p, i) => (
            <div key={i} className="border border-stone-200 rounded-lg p-3 space-y-2 relative">
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-2 right-2 text-stone-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div>
                <Label className="mb-1 block text-xs">Name</Label>
                <Input value={p.display_name} onChange={(e) => update(i, 'display_name', e.target.value)} placeholder="Professional name" />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Headline</Label>
                <Input value={p.headline} onChange={(e) => update(i, 'headline', e.target.value)} placeholder="e.g. Personal Trainer" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="mb-1 block text-xs">Avatar URL</Label>
                  <Input value={p.avatar_url} onChange={(e) => update(i, 'avatar_url', e.target.value)} placeholder="https://…" />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Screen name</Label>
                  <Input value={p.screen_name} onChange={(e) => update(i, 'screen_name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="handle" />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={add}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-stone-300 rounded-lg text-sm text-stone-500 hover:bg-stone-50 hover:text-stone-700"
          >
            <Plus className="w-4 h-4" /> Add professional
          </button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}