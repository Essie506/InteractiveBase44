import { base44 } from '@/api/base44Client';
import { profileRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';
import { callSaveProfessionalProfile, callValidateScreenName, callSavePersonalProfile, callValidatePersonalScreenName } from '@/services/firebaseFunctions';

// Interactive Profile Service — M3: routes to Firebase when configured.

// --- Personal Profile ---

export async function getPersonalProfile(identityId) {
  if (useFirebase) return profileRepository.getPersonalProfile(identityId);
  const profiles = await base44.entities.PersonalProfile.filter({ identity_id: identityId });
  return profiles.length > 0 ? profiles[0] : null;
}

export async function createPersonalProfile(data) {
  if (useFirebase) return profileRepository.createPersonalProfile(data);
  return base44.entities.PersonalProfile.create(data);
}

export async function updatePersonalProfile(profileId, data) {
  if (useFirebase) return profileRepository.updatePersonalProfile(profileId, data);
  return base44.entities.PersonalProfile.update(profileId, data);
}

export async function savePersonalProfile(identityId, data) {
  if (useFirebase) {
    // Authoritative server-side save: writes the private profile,
    // enforces screen_name uniqueness, and maintains the
    // personalProfilesPublic projection (public fields only).
    return callSavePersonalProfile({ ...data, identity_id: identityId });
  }
  const existing = await getPersonalProfile(identityId);
  if (existing) {
    return base44.entities.PersonalProfile.update(existing.id, data);
  }
  return base44.entities.PersonalProfile.create({
    identity_id: identityId,
    ...data,
    lifecycle_state: data.lifecycle_state || 'active',
  });
}

// --- Professional Profile ---
// Firebase is the production source of truth for Professional Profiles.
// There is NO Base44 fallback: if Firebase is not configured, professional
// profile operations fail explicitly rather than silently writing to a
// competing Base44 store.

function requireFirebase(op) {
  if (!useFirebase) {
    throw new Error(
      `${op}: Firebase is not configured. Professional profiles require Firebase (production source of truth).`,
    );
  }
}

export async function getProfessionalProfile(identityId) {
  requireFirebase('getProfessionalProfile');
  return profileRepository.getProfessionalProfile(identityId);
}

export async function createProfessionalProfile(data) {
  requireFirebase('createProfessionalProfile');
  return profileRepository.createProfessionalProfile(data);
}

export async function updateProfessionalProfile(profileId, data) {
  requireFirebase('updateProfessionalProfile');
  return profileRepository.updateProfessionalProfile(profileId, data);
}

export async function saveProfessionalProfile(identityId, data) {
  requireFirebase('saveProfessionalProfile');
  // Authoritative server-side save: writes the private profile,
  // enforces screen_name uniqueness, and maintains the
  // professionalProfilesPublic projection (public fields only).
  return callSaveProfessionalProfile({ ...data, identity_id: identityId });
}

// Public projection read — used by the /p/:screenName route.
// Returns only public fields; readable by guests.
export async function getPublicProfessionalProfile(screenName) {
  requireFirebase('getPublicProfessionalProfile');
  return profileRepository.getPublicProfessionalProfile(screenName);
}

// Public projection read for Personal — used by the /u/:screenName route.
export async function getPublicPersonalProfile(screenName) {
  if (useFirebase) return profileRepository.getPublicPersonalProfile(screenName);
  return null;
}

// Resolve a professional's public profile by identity_id — used by
// the Business profile to display staff/professionals from membership
// references without reading the private professionalProfiles collection.
export async function getPublicProfessionalProfileByIdentity(identityId) {
  requireFirebase('getPublicProfessionalProfileByIdentity');
  return profileRepository.getPublicProfessionalProfileByIdentity(identityId);
}

// Live screen-name validation (format + server-side uniqueness).
export async function validateScreenName(screenName, currentScreenName) {
  requireFirebase('validateScreenName');
  return callValidateScreenName({ screen_name: screenName, current_screen_name: currentScreenName });
}

export async function validatePersonalScreenName(screenName, currentScreenName) {
  if (useFirebase) {
    return callValidatePersonalScreenName({ screen_name: screenName, current_screen_name: currentScreenName });
  }
  return { available: true };
}

export async function resolveProfileForContext(identityId, context) {
  if (context === 'professional') return getProfessionalProfile(identityId);
  return getPersonalProfile(identityId);
}