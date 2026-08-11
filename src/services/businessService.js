import { base44 } from '@/api/base44Client';

// Interactive Business Service
// Owns Business, BusinessProfile, BusinessMembership, BusinessInvitation,
// BusinessSubscription and SubscriptionPlan data operations.
// Re-exports the permission helpers from businessPermissions for convenience.

export { getMembership, hasPermission, checkPermission, getUserBusinesses, getRolePermissions } from '@/lib/businessPermissions';

// --- Business ---

export async function getBusiness(businessId) {
  return base44.entities.Business.get(businessId);
}

export async function createBusiness(data) {
  return base44.entities.Business.create(data);
}

export async function updateBusiness(businessId, data) {
  return base44.entities.Business.update(businessId, data);
}

// --- Business Profile ---

export async function getBusinessProfile(businessId) {
  const profiles = await base44.entities.BusinessProfile.filter({ business_id: businessId });
  return profiles.length > 0 ? profiles[0] : null;
}

export async function createBusinessProfile(data) {
  return base44.entities.BusinessProfile.create(data);
}

export async function updateBusinessProfile(profileId, data) {
  return base44.entities.BusinessProfile.update(profileId, data);
}

export async function saveBusinessProfile(businessId, data) {
  const existing = await getBusinessProfile(businessId);
  if (existing) {
    return base44.entities.BusinessProfile.update(existing.id, data);
  }
  return base44.entities.BusinessProfile.create({ ...data, lifecycle_state: data.lifecycle_state || 'active' });
}

// --- Business Membership ---

export async function getMemberships(businessId) {
  return base44.entities.BusinessMembership.filter({ business_id: businessId });
}

export async function getActiveMemberships(businessId) {
  return base44.entities.BusinessMembership.filter({ business_id: businessId, lifecycle_state: 'active' });
}

export async function createMembership(data) {
  return base44.entities.BusinessMembership.create(data);
}

export async function updateMembership(membershipId, data) {
  return base44.entities.BusinessMembership.update(membershipId, data);
}

// --- Business Invitation ---

export async function getInvitationsForEmail(email) {
  return base44.entities.BusinessInvitation.filter({ email });
}

export async function getInvitationsForBusiness(businessId) {
  return base44.entities.BusinessInvitation.filter({ business_id: businessId });
}

export async function createInvitation(data) {
  return base44.entities.BusinessInvitation.create(data);
}

export async function updateInvitation(invitationId, data) {
  return base44.entities.BusinessInvitation.update(invitationId, data);
}

// --- Subscription Plans / Business Subscription ---

export async function getActivePlans() {
  return base44.entities.SubscriptionPlan.filter({ status: 'active' }, 'sort_order', 10);
}

export async function getBusinessSubscription(businessId) {
  const subs = await base44.entities.BusinessSubscription.filter({ business_id: businessId });
  return subs.length > 0 ? subs[0] : null;
}

export async function createBusinessSubscription(data) {
  return base44.entities.BusinessSubscription.create(data);
}