import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import LocationPicker from '@/components/LocationPicker';

/** Edit contact details + primary location + service area. */
export default function ContactLocationEditDialog({ open, onClose, ownerId, profile, onSave }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');
  const [locationId, setLocationId] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [serviceAreaId, setServiceAreaId] = useState('');

  useEffect(() => {
    if (open && profile) {
      setEmail(profile.contact_email || '');
      setPhone(profile.contact_phone || '');
      setWebsite(profile.website || '');
      setLocation(profile.location || '');
      setLocationId(profile.location_id || '');
      setServiceArea(profile.service_area || '');
      setServiceAreaId(profile.service_area_location_id || '');
    }
  }, [open, profile]);

  const handleSave = () => {
    onSave({
      contact_email: email,
      contact_phone: phone,
      website,
      location,
      location_id: locationId,
      service_area: serviceArea,
      service_area_location_id: serviceAreaId,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Contact & Location</DialogTitle>
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
            <Label className="mb-1.5 block">Primary location</Label>
            <LocationPicker
              ownerId={ownerId}
              ownerType="professional"
              context="professional_service"
              initialLocationId={locationId}
              initialLabel={location}
              onLocationSaved={(id, label) => { setLocationId(id); setLocation(label); }}
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Service area</Label>
            <Input value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} placeholder="e.g. Central London, Online" className="mb-3" />
            <LocationPicker
              ownerId={ownerId}
              ownerType="professional"
              context="service_area"
              initialLocationId={serviceAreaId}
              initialLabel={serviceArea}
              onLocationSaved={(id, label) => { setServiceAreaId(id); setServiceArea(label); }}
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