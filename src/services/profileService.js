import { base44 } from '@/api/base44Client';
import { profileRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';

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
    return profileRepository.savePersonalProfile({ ...data, identity_id: identityId });
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

export async function getProfessionalProfile(identityId) {
  if (useFirebase) return profileRepository.getProfessionalProfile(identityId);
  const profiles = await base44.entities.ProfessionalProfile.filter({ identity_id: identityId });
  return profiles.length > 0 ? profiles[0] : null;
}

export async function createProfessionalProfile(data) {
  if (useFirebase) return profileRepository.createProfessionalProfile(data);
  return base44.entities.ProfessionalProfile.create(data);
}

export async function updateProfessionalProfile(profileId, data) {
  if (useFirebase) return profileRepository.updateProfessionalProfile(profileId, data);
  return base44.entities.ProfessionalProfile.update(profileId, data);
}

export async function saveProfessionalProfile(identityId, data) {
  if (useFirebase) {
    return profileRepository.saveProfessionalProfile({ ...data, identity_id: identityId });
  }
  const existing = await getProfessionalProfile(identityId);
  if (existing) {
    return base44.entities.ProfessionalProfile.update(existing.id, data);
  }
  return base44.entities.ProfessionalProfile.create({
    identity_id: identityId,
    ...data,
  });
}

export async function resolveProfileForContext(identityId, context) {
  if (context === 'professional') return getProfessionalProfile(identityId);
  return getPersonalProfile(identityId);
}