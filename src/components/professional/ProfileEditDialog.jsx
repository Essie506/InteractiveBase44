import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/** Generic single-field text editor dialog (display name, headline, about). */
export default function ProfileEditDialog({ open, onClose, field, label, value, multiline, onSave }) {
  const [val, setVal] = useState(value || '');

  useEffect(() => {
    if (open) setVal(value || '');
  }, [open, value]);

  const handleSave = () => {
    onSave(field, multiline ? val : val.trim());
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        {multiline ? (
          <Textarea value={val} onChange={(e) => setVal(e.target.value)} rows={5} autoFocus />
        ) : (
          <Input value={val} onChange={(e) => setVal(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}