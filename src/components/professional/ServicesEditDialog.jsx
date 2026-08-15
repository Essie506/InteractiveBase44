import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

/** Add/remove services tags. */
export default function ServicesEditDialog({ open, onClose, services, onSave }) {
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (open) setItems(services || []);
  }, [open, services]);

  const add = () => {
    const s = input.trim();
    if (s && !items.includes(s)) {
      setItems([...items, s]);
      setInput('');
    }
  };

  const handleSave = () => {
    onSave(items);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit services</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder="Add a service"
          />
          <Button type="button" onClick={add} size="icon" variant="secondary">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 min-h-8">
          {items.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
              {s}
              <button type="button" onClick={() => setItems(items.filter((x) => x !== s))}>
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