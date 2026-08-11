import { base44 } from '@/api/base44Client';
import { settingsRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';

// Interactive Settings Service — M3: routes to Firebase when configured.

// --- User Settings ---

export async function getUserSettings(identityId) {
  if (useFirebase) return settingsRepository.getUserSettings(identityId);
  const settings = await base44.entities.UserSetting.filter({ identity_id: identityId });
  return settings.length > 0 ? settings[0] : null;
}

export async function createUserSettings(data) {
  if (useFirebase) return settingsRepository.createUserSettings(data);
  return base44.entities.UserSetting.create(data);
}

export async function updateUserSettings(settingsId, data) {
  if (useFirebase) return settingsRepository.updateUserSettings(settingsId, data);
  return base44.entities.UserSetting.update(settingsId, data);
}

// --- Notification Preferences ---

export { getOrCreatePreferences } from '@/lib/notifications';

export async function updateNotificationPreferences(prefsId, data) {
  if (useFirebase) return settingsRepository.updateNotificationPreferences(prefsId, data);
  return base44.entities.NotificationPreference.update(prefsId, data);
}