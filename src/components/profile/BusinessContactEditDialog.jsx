import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import LocationPicker from '@/components/LocationPicker';
import { Plus, X } from 'lucide-react';

/**
 * Business contact + location + operating hours editor.
 * Used by business admins to edit the public contact section.
 */
export default function BusinessContactEditDialog({ open, onClose, ownerId, profile, onSave }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [hours, setHours] = useState('');
  const [location, setLocation] = useState('');
  const [locationId, setLocationId] = useState('');

  useEffect(() => {
    if (open && profile) {
      setEmail(profile.contact_email || '');
      setPhone(profile.contact_phone || '');
      setWebsite(profile.website || '');
      setHours(profile.operating_hours || '');
      setLocation(profile.location || '');
      setLocationId(profile.location_id || '');
    }
  }, [open, profile]);

  const handleSave = () => {
    onSave({
      contact_email: email,
      contact_phone: phone,
      website,
      operating_hours: hours,
      location,
      location_id: locationId,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Location & Contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Contact email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">Contact phone</Label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Website</Label>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <Label className="mb-1.5 block">Operating hours</Label>
            <Input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. Mon-Fri 6am-10pm, Sat 8am-6pm" />
          </div>
          <div>
            <Label className="mb-1.5 block">Business location</Label>
            <LocationPicker
              ownerId={ownerId}
              ownerType="business"
              context="business"
              initialLocationId={locationId}
              initialLabel={location}
              onLocationSaved={(id, label) => { setLocationId(id); setLocation(label); }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}