// useWorkoutCreateAuthority — resolves whether the current user can
// create/manage workouts in their active context (Spec 12 §9 + Business §8).
// ───────────────────────────────────────────────────────────
// - Professional context: professional_activated
// - Business context: manage_workouts permission (owner/admin by default,
//   or staff/member with an explicit grant via the permissions array)
// - Personal context: not permitted
//
// The server-side saveWorkout cloud function enforces the same gate
// authoritatively; this hook drives UI visibility (New Workout button,
// editor gate) so users don't reach a server rejection.
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { checkPermission } from '@/lib/businessPermissions';

export function useWorkoutCreateAuthority() {
  const { user } = useAuth();
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (!user) { setCanCreate(false); setLoading(false); return; }
      if (user.active_context === 'business' && user.active_business_id) {
        try {
          const { allowed } = await checkPermission(user.active_business_id, user.id, 'manage_workouts');
          if (!cancelled) { setCanCreate(allowed); setLoading(false); }
        } catch {
          if (!cancelled) { setCanCreate(false); setLoading(false); }
        }
      } else if (user.professional_activated) {
        if (!cancelled) { setCanCreate(true); setLoading(false); }
      } else {
        if (!cancelled) { setCanCreate(false); setLoading(false); }
      }
    };
    resolve();
    return () => { cancelled = true; };
  }, [user]);

  return { canCreate, loading };
}