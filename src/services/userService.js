import { base44 } from '@/api/base44Client';
import { userRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';
import { getCurrentIdentityId } from '@/lib/currentIdentity';

// Interactive User / Application-State Service
// M3: routes to Firebase repositories when configured, falls back to Base44.

export async function updateUserState(data) {
  if (useFirebase) {
    const identityId = getCurrentIdentityId();
    if (!identityId) throw new Error('No identity resolved');
    return userRepository.updateUser(identityId, data);
  }
  return base44.auth.updateMe(data);
}

export async function updateUser(data) {
  if (useFirebase) {
    const identityId = getCurrentIdentityId();
    if (!identityId) throw new Error('No identity resolved');
    return userRepository.updateUser(identityId, data);
  }
  return base44.auth.updateMe(data);
}

export async function getCurrentUser() {
  if (useFirebase) {
    const identityId = getCurrentIdentityId();
    if (!identityId) return null;
    return userRepository.getUser(identityId);
  }
  return base44.auth.me();
}