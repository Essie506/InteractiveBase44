import { base44 } from '@/api/base44Client';
import { settingsRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';

// Interactive Onboarding Service — M3: routes to Firebase when configured.

// --- Onboarding State ---

export async function getOnboardingState(identityId) {
  if (useFirebase) return settingsRepository.getOnboardingState(identityId);
  const states = await base44.entities.OnboardingState.filter({ identity_id: identityId });
  return states.length > 0 ? states[0] : null;
}

export async function createOnboardingState(data) {
  if (useFirebase) return settingsRepository.createOnboardingState(data);
  return base44.entities.OnboardingState.create(data);
}

export async function updateOnboardingState(stateId, data) {
  if (useFirebase) return settingsRepository.updateOnboardingState(stateId, data);
  return base44.entities.OnboardingState.update(stateId, data);
}

// --- Personal Profile / User Setting / Professional / Business creation ---
// These delegate to the respective services/entities. For Firebase mode,
// they use the Firebase repositories directly.

import { profileRepository, businessRepository } from '@/data/firebase';

export async function createPersonalProfile(data) {
  if (useFirebase) return profileRepository.createPersonalProfile(data);
  return base44.entities.PersonalProfile.create(data);
}

export async function createUserSetting(data) {
  if (useFirebase) return settingsRepository.createUserSettings(data);
  return base44.entities.UserSetting.create(data);
}

export async function createProfessionalProfile(data) {
  if (useFirebase) return profileRepository.createProfessionalProfile(data);
  return base44.entities.ProfessionalProfile.create(data);
}

export async function createBusiness(data) {
  if (useFirebase) return businessRepository.createBusiness(data);
  return base44.entities.Business.create(data);
}

export async function createBusinessProfile(data) {
  if (useFirebase) return businessRepository.createBusinessProfile(data);
  return base44.entities.BusinessProfile.create(data);
}

export async function createMembership(data) {
  if (useFirebase) return businessRepository.createMembership(data.business_id, data.identity_id, data);
  return base44.entities.BusinessMembership.create(data);
}