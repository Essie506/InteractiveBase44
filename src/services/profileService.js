import { base44 } from '@/api/base44Client';

// Interactive Profile Service
// Owns PersonalProfile and ProfessionalProfile data operations.
// Pages call this service instead of base44.entities.* directly.

// --- Personal Profile ---

export async function getPersonalProfile(identityId) {
  const profiles = await base44.entities.PersonalProfile.filter({ identity_id: identityId });
  return profiles.length > 0 ? profiles[0] : null;
}

export async function createPersonalProfile(data) {
  return base44.entities.PersonalProfile.create(data);
}

export async function updatePersonalProfile(profileId, data) {
  return base44.entities.PersonalProfile.update(profileId, data);
}

// Create or update the personal profile for an identity.
// Returns the resulting profile record.
export async function savePersonalProfile(identityId, data) {
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
  const profiles = await base44.entities.ProfessionalProfile.filter({ identity_id: identityId });
  return profiles.length > 0 ? profiles[0] : null;
}

export async function createProfessionalProfile(data) {
  return base44.entities.ProfessionalProfile.create(data);
}

export async function updateProfessionalProfile(profileId, data) {
  return base44.entities.ProfessionalProfile.update(profileId, data);
}

// Create or update the professional profile for an identity.
export async function saveProfessionalProfile(identityId, data) {
  const existing = await getProfessionalProfile(identityId);
  if (existing) {
    return base44.entities.ProfessionalProfile.update(existing.id, data);
  }
  return base44.entities.ProfessionalProfile.create({
    identity_id: identityId,
    ...data,
  });
}

// Resolve the applicable profile for a given operating context.
export async function resolveProfileForContext(identityId, context) {
  if (context === 'professional') return getProfessionalProfile(identityId);
  return getPersonalProfile(identityId);
}