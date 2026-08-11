import { base44 } from '@/api/base44Client';
import { getOrCreatePreferences } from '@/lib/notifications';

// Interactive Settings Service
// Owns UserSetting and NotificationPreference data operations.

// --- User Settings ---

export async function getUserSettings(identityId) {
  const settings = await base44.entities.UserSetting.filter({ identity_id: identityId });
  return settings.length > 0 ? settings[0] : null;
}

export async function createUserSettings(data) {
  return base44.entities.UserSetting.create(data);
}

export async function updateUserSettings(settingsId, data) {
  return base44.entities.UserSetting.update(settingsId, data);
}

// --- Notification Preferences ---

export { getOrCreatePreferences } from '@/lib/notifications';

export async function updateNotificationPreferences(prefsId, data) {
  return base44.entities.NotificationPreference.update(prefsId, data);
}