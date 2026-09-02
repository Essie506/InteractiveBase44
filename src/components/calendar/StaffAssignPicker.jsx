import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { businessRepository, userRepository } from '@/data/firebase';

// StaffAssignPicker — selects Business staff (by their stable Interactive
// identity IDs) to assign a Business-owned event to. Options come ONLY from
// actual active memberships of the active Business — no separate staff
// directory is created. Assignment grants view/participation only; edit
// authority comes from the manage_calendar permission, NOT from assignment.
export default function StaffAssignPicker({ businessId, selected, onChange }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!businessId) { setLoading(false); return; }
      try {
        const list = await businessRepository.getActiveMembershipsForBusiness(businessId);
        const enriched = await Promise.all(list.map(async (m) => {
          let label = m.identity_id.slice(0, 10) + '…';
          try {
            const u = await userRepository.getUser(m.identity_id);
            if (u?.full_name) label = u.full_name;
            else if (u?.email) label = u.email;
          } catch { /* keep fallback label */ }
          return { ...m, label };
        }));
        if (alive) setMembers(enriched);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [businessId]);

  const toggle = (identityId) => {
    const next = selected.includes(identityId)
      ? selected.filter((id) => id !== identityId)
      : [...selected, identityId];
    onChange(next);
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-xs text-stone-400"><Loader2 className="w-3 h-3 animate-spin" /> Loading staff…</div>;
  }
  if (members.length === 0) {
    return <p className="text-xs text-stone-400">No active staff to assign.</p>;
  }

  return (
    <div className="space-y-1.5 max-h-40 overflow-y-auto border border-stone-200 rounded-lg p-2">
      {members.map((m) => (
        <label key={m.identity_id} className="flex items-center gap-2.5 cursor-pointer text-sm text-stone-700">
          <input
            type="checkbox"
            checked={selected.includes(m.identity_id)}
            onChange={() => toggle(m.identity_id)}
            className="w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="truncate">{m.label}</span>
          <span className="ml-auto text-xs text-stone-400">{m.role}</span>
        </label>
      ))}
    </div>
  );
}