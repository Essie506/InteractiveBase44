import { base44 } from '@/api/base44Client';

// Interactive Onboarding Service
// Owns OnboardingState persistence and the multi-entity orchestration performed
// at the end of onboarding. Pages call this service instead of orchestrating
// Base44 entities directly.

// --- Onboarding State ---

export async function getOnboardingState(identityId) {
  const states = await base44.entities.OnboardingState.filter({ identity_id: identityId });
  return states.length > 0 ? states[0] : null;
}

export async function createOnboardingState(data) {
  return base44.entities.OnboardingState.create(data);
}

export async function updateOnboardingState(stateId, data) {
  return base44.entities.OnboardingState.update(stateId, data);
}

// --- Personal Profile / User Setting / Professional / Business creation ---

export async function createPersonalProfile(data) {
  return base44.entities.PersonalProfile.create(data);
}

export async function createUserSetting(data) {
  return base44.entities.UserSetting.create(data);
}

export async function createProfessionalProfile(data) {
  return base44.entities.ProfessionalProfile.create(data);
}

export async function createBusiness(data) {
  return base44.entities.Business.create(data);
}

export async function createBusinessProfile(data) {
  return base44.entities.BusinessProfile.create(data);
}

export async function createMembership(data) {
  return base44.entities.BusinessMembership.create(data);
}