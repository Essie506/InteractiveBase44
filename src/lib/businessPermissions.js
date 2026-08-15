import { base44 } from '@/api/base44Client';
import { businessRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';

// Role-based default permissions per Business System spec section 8
export const ROLE_PERMISSIONS = {
  owner: [
    'view_business', 'manage_profile', 'manage_business_profile', 'manage_staff',
    'manage_permissions', 'invite_staff',
    'view_bookings', 'manage_bookings',
    'view_calendar', 'manage_calendar',
    'view_financials', 'manage_financials',
    'view_inbox', 'manage_inbox',
    'manage_promotions', 'manage_verification', 'manage_subscription',
    'transfer_ownership', 'view_analytics', 'manage_settings',
    'manage_services', 'manage_payments',
  ],
  admin: [
    'view_business', 'manage_profile', 'manage_business_profile', 'manage_staff',
    'invite_staff',
    'view_bookings', 'manage_bookings',
    'view_calendar', 'manage_calendar',
    'view_financials',
    'view_inbox', 'manage_inbox',
    'manage_promotions', 'view_analytics', 'manage_services',
  ],
  staff: ['view_business', 'view_bookings', 'manage_own_bookings', 'view_calendar'],
  member: ['view_business'],
};

export function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member;
}

// True ownership is determined by role, not by permission grants.
// Even an admin with manage_permissions cannot gain protected owner
// capabilities via the permissions array — those require role === 'owner'.
export function isOwner(membership) {
  return membership?.role === 'owner';
}

// Protected actions that only the owner role can perform.
// These cannot be granted via the permissions array override.
export const PROTECTED_OWNER_ACTIONS = [
  'transfer_ownership',
];

export function canPerformProtectedAction(membership, action) {
  if (!isOwner(membership)) return false;
  return PROTECTED_OWNER_ACTIONS.includes(action);
}

export function hasPermission(membership, requiredPermission) {
  if (!membership) return false;
  const rolePerms = getRolePermissions(membership.role);
  const extraPerms = membership.permissions || [];
  return [...rolePerms, ...extraPerms].includes(requiredPermission);
}

// Load the active membership for a business + identity
export async function getMembership(businessId, identityId) {
  if (useFirebase) return businessRepository.getMembership(businessId, identityId);
  const memberships = await base44.entities.BusinessMembership.filter({
    business_id: businessId,
    identity_id: identityId,
    lifecycle_state: 'active',
  });
  return memberships.length > 0 ? memberships[0] : null;
}

// Validate: Authenticated Identity + Business Relationship + Active Business + Required Permission
export async function checkPermission(businessId, identityId, requiredPermission) {
  const membership = await getMembership(businessId, identityId);
  if (!membership) return { allowed: false, membership: null };
  return { allowed: hasPermission(membership, requiredPermission), membership };
}

// Load all businesses the identity is a member of
export async function getUserBusinesses(identityId) {
  if (useFirebase) {
    const memberships = await businessRepository.getMembershipsForIdentity(identityId);
    const activeMemberships = memberships.filter(m => m.lifecycle_state === 'active');
    if (activeMemberships.length === 0) return [];
    const results = await Promise.allSettled(
      activeMemberships.map(m => businessRepository.getBusiness(m.business_id))
    );
    return results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => ({
        ...r.value,
        _membership: activeMemberships.find(m => m.business_id === r.value.id),
      }));
  }
  const memberships = await base44.entities.BusinessMembership.filter({
    identity_id: identityId,
    lifecycle_state: 'active',
  });
  if (memberships.length === 0) return [];
  const results = await Promise.allSettled(
    memberships.map(m => base44.entities.Business.get(m.business_id))
  );
  return results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => ({
      ...r.value,
      _membership: memberships.find(m => m.business_id === r.value.id),
    }));
}