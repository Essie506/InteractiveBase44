import { base44 } from '@/api/base44Client';
import { businessRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';

// Interactive Business Service — M3: routes to Firebase when configured.

export { getMembership, hasPermission, checkPermission, getUserBusinesses, getRolePermissions, isOwner } from '@/lib/businessPermissions';

// --- Business ---

export async function getBusiness(businessId) {
  if (useFirebase) return businessRepository.getBusiness(businessId);
  return base44.entities.Business.get(businessId);
}

export async function createBusiness(data) {
  if (useFirebase) return businessRepository.createBusiness(data);
  return base44.entities.Business.create(data);
}

export async function updateBusiness(businessId, data) {
  if (useFirebase) return businessRepository.updateBusiness(businessId, data);
  return base44.entities.Business.update(businessId, data);
}

// --- Business Profile ---

export async function getBusinessProfile(businessId) {
  if (useFirebase) return businessRepository.getBusinessProfile(businessId);
  const profiles = await base44.entities.BusinessProfile.filter({ business_id: businessId });
  return profiles.length > 0 ? profiles[0] : null;
}

export async function createBusinessProfile(data) {
  if (useFirebase) return businessRepository.createBusinessProfile(data);
  return base44.entities.BusinessProfile.create(data);
}

export async function updateBusinessProfile(profileId, data) {
  if (useFirebase) return businessRepository.updateBusinessProfile(profileId, data);
  return base44.entities.BusinessProfile.update(profileId, data);
}

export async function saveBusinessProfile(businessId, data) {
  if (useFirebase) {
    return businessRepository.saveBusinessProfile({ ...data, business_id: businessId });
  }
  const existing = await getBusinessProfile(businessId);
  if (existing) {
    return base44.entities.BusinessProfile.update(existing.id, data);
  }
  return base44.entities.BusinessProfile.create({ ...data, lifecycle_state: data.lifecycle_state || 'active' });
}

// --- Business Membership ---

export async function getMemberships(businessId) {
  if (useFirebase) return businessRepository.getMembershipsForBusiness(businessId);
  return base44.entities.BusinessMembership.filter({ business_id: businessId });
}

export async function getActiveMemberships(businessId) {
  if (useFirebase) return businessRepository.getActiveMembershipsForBusiness(businessId);
  return base44.entities.BusinessMembership.filter({ business_id: businessId, lifecycle_state: 'active' });
}

export async function createMembership(data) {
  if (useFirebase) return businessRepository.createMembership(data.business_id, data.identity_id, data);
  return base44.entities.BusinessMembership.create(data);
}

export async function updateMembership(membershipId, data) {
  if (useFirebase) {
    // membershipId is the deterministic doc ID: {businessId}_{identityId}
    // Use the repository's updateMembership with extracted IDs
    const membership = await businessRepository.getMembership(
      data.business_id || membershipId.split('_')[0],
      data.identity_id || membershipId.split('_').slice(1).join('_')
    );
    if (membership) {
      return businessRepository.updateMembership(membership.business_id, membership.identity_id, data);
    }
    // Fallback: use the doc ID directly
    return businessRepository.updateMembership(membershipId.split('_')[0], membershipId.split('_').slice(1).join('_'), data);
  }
  return base44.entities.BusinessMembership.update(membershipId, data);
}

// --- Business Invitation ---

export async function getInvitationsForEmail(email) {
  if (useFirebase) return businessRepository.getInvitationsForEmail(email);
  return base44.entities.BusinessInvitation.filter({ email });
}

export async function getInvitationsForBusiness(businessId) {
  if (useFirebase) return businessRepository.getInvitationsForBusiness(businessId);
  return base44.entities.BusinessInvitation.filter({ business_id: businessId });
}

export async function createInvitation(data) {
  if (useFirebase) return businessRepository.createInvitation(data);
  return base44.entities.BusinessInvitation.create(data);
}

export async function updateInvitation(invitationId, data) {
  if (useFirebase) return businessRepository.updateInvitation(invitationId, data);
  return base44.entities.BusinessInvitation.update(invitationId, data);
}

// --- Subscription Plans / Business Subscription ---

export async function getActivePlans() {
  if (useFirebase) return businessRepository.getActivePlans();
  return base44.entities.SubscriptionPlan.filter({ status: 'active' }, 'sort_order', 10);
}

export async function getBusinessSubscription(businessId) {
  if (useFirebase) return businessRepository.getBusinessSubscription(businessId);
  const subs = await base44.entities.BusinessSubscription.filter({ business_id: businessId });
  return subs.length > 0 ? subs[0] : null;
}

export async function createBusinessSubscription(data) {
  if (useFirebase) return businessRepository.createBusinessSubscription(data);
  return base44.entities.BusinessSubscription.create(data);
}