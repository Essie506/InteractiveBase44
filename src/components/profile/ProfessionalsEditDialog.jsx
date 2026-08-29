import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Loader2, UserX } from 'lucide-react';
import { getActiveMemberships } from '@/services/businessService';
import { getPublicProfessionalProfileByIdentity } from '@/services/profileService';

/**
 * Business professionals editor — selects which business members
 * to showcase on the public Business Profile.
 *
 * Staff must represent actual Professional identities connected to the
 * Business through the existing BusinessMembership architecture.
 * Members are only eligible if they have a public Professional profile
 * (professionalProfilesPublic projection).
 *
 * Stores references [{ identity_id }] — display info is resolved
 * server-side by the saveBusinessProfile Cloud Function for the
 * public projection. No professional profile data is duplicated
 * into the private BusinessProfile.
 *
 * Props:
 *  - open, onClose, onSave
 *  - businessId
 *  - professionals: currently selected [{ identity_id }]
 */
export default function ProfessionalsEditDialog({ open, onClose, businessId, professionals, onSave }) {
  const [selected, setSelected] = useState([]);
  const [eligible, setEligible] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      setSelected((professionals || []).map((p) => p.identity_id));
      setLoading(true);
      (async () => {
        try {
          const members = await getActiveMemberships(businessId);
          // For each member, check if they have a public professional profile
          const results = await Promise.all(
            members.map(async (m) => {
              const pub = await getPublicProfessionalProfileByIdentity(m.identity_id);
              if (!pub) return null;
              return {
                identity_id: m.identity_id,
                role: m.role,
                display_name: pub.display_name,
                headline: pub.headline,
                avatar_url: pub.avatar_url,
                screen_name: pub.screen_name,
              };
            })
          );
          setEligible(results.filter(Boolean));
        } catch {
          setEligible([]);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [open, businessId, professionals]);

  const toggle = (identityId) => {
    if (selected.includes(identityId)) {
      setSelected(selected.filter((id) => id !== identityId));
    } else {
      setSelected([...selected, identityId]);
    }
  };

  const handleSave = () => {
    onSave(selected.map((identity_id) => ({ identity_id })));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Professionals</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-stone-400 animate-spin" />
          </div>
        ) : eligible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <UserX className="w-8 h-8 text-stone-300 mb-2" />
            <p className="text-sm text-stone-500">
              No eligible members found. Members need an active public Professional profile
              to be showcased here.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {eligible.map((p) => (
              <button
                key={p.identity_id}
                type="button"
                onClick={() => toggle(p.identity_id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                  selected.includes(p.identity_id)
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-stone-200 hover:bg-stone-50'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-stone-200 overflow-hidden shrink-0">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={p.display_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-stone-400">
                      {(p.display_name || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-stone-800 truncate">{p.display_name}</div>
                  {p.headline && <div className="text-sm text-stone-500 truncate">{p.headline}</div>}
                </div>
                {selected.includes(p.identity_id) && (
                  <Check className="w-5 h-5 text-indigo-600 shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}