import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

/**
 * Shared add/remove tag list editor (services, interests, etc.).
 * Used by Personal, Professional, and Business profiles.
 */
export default function TagListEditDialog({ open, onClose, title = 'Edit list', items, placeholder = 'Add an item', onSave }) {
  const [list, setList] = useState([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (open) setList(items || []);
  }, [open, items]);

  const add = () => {
    const s = input.trim();
    if (s && !list.includes(s)) {
      setList([...list, s]);
      setInput('');
    }
  };

  const handleSave = () => {
    onSave(list);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder={placeholder}
          />
          <Button type="button" onClick={add} size="icon" variant="secondary">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 min-h-8">
          {list.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
              {s}
              <button type="button" onClick={() => setList(list.filter((x) => x !== s))}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}