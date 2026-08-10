import { base44 } from '@/api/base44Client';

// Role-based default permissions per Business System spec section 8
export const ROLE_PERMISSIONS = {
  owner: [
    'manage_staff', 'manage_services', 'manage_bookings', 'manage_settings',
    'manage_payments', 'view_analytics', 'manage_permissions', 'transfer_ownership',
    'manage_verification', 'manage_subscription', 'manage_profile', 'invite_staff',
    'view_business',
  ],
  admin: [
    'manage_staff', 'manage_services', 'manage_bookings', 'manage_settings',
    'view_analytics', 'manage_profile', 'invite_staff', 'view_business',
  ],
  staff: ['view_bookings', 'manage_own_bookings', 'view_business'],
  member: ['view_business'],
};

export function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member;
}

export function hasPermission(membership, requiredPermission) {
  if (!membership) return false;
  const rolePerms = getRolePermissions(membership.role);
  const extraPerms = membership.permissions || [];
  return [...rolePerms, ...extraPerms].includes(requiredPermission);
}

// Load the active membership for a business + identity
export async function getMembership(businessId, identityId) {
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

// Load all businesses the identity is a member of (scoped — only loads the user's businesses)
export async function getUserBusinesses(identityId) {
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