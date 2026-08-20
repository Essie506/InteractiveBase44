import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import LocationPicker from '@/components/LocationPicker';

/**
 * Shared location editor dialog — wraps LocationPicker for any profile type.
 * Used by Personal (context='profile') and Business (context='business').
 */
export default function LocationEditDialog({ open, onClose, ownerId, ownerType, context, initialLocationId, initialLabel, onSave }) {
  const [locationId, setLocationId] = useState('');
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (open) {
      setLocationId(initialLocationId || '');
      setLabel(initialLabel || '');
    }
  }, [open, initialLocationId, initialLabel]);

  const handleSave = () => {
    onSave({ location_id: locationId, location: label });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Location</DialogTitle>
        </DialogHeader>
        <LocationPicker
          ownerId={ownerId}
          ownerType={ownerType}
          context={context}
          initialLocationId={locationId}
          initialLabel={label}
          onLocationSaved={(id, lbl) => { setLocationId(id); setLabel(lbl); }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!locationId}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}