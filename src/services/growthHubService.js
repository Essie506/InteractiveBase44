// Growth Hub Service — V2 Business Growth Hub.
// Generates context-aware Growth Opportunities that adapt to the provider's
// journey stage, account type, and subscription entitlement.
import { db } from '@/firebase/firebaseClient';
import { collection, query, where, limit, getDocs, orderBy } from 'firebase/firestore';
import { useFirebase } from '@/lib/backendConfig';
import { fromFirestoreDoc } from '@/data/firebase/mappers';
import { getGuidance } from '@/lib/guidanceAdapter';

const OPPORTUNITIES_COLLECTION = 'growthOpportunities';

/**
 * Determine the growth journey stage from profile and activity signals.
 * V2 §4.2–§4.4: Build (establishing), Grow (expanding), Scale (optimising).
 */
export function determineStage(profile, signals = {}) {
  const { bookingCount = 0, campaignCount = 0 } = signals;
  const isProfileComplete = profile?.bio && profile?.headline && (profile?.services?.length || 0) > 0;
  if (!isProfileComplete || bookingCount === 0) return 'build';
  if (bookingCount < 20 && campaignCount < 3) return 'grow';
  return 'scale';
}

/**
 * Generate growth opportunities for a provider based on their stage.
 * Presentation-layer opportunities — they guide without making decisions.
 */
export async function generateOpportunities(ownerId, ownerType, context = {}) {
  const { stage = 'build', subscriptionTier } = context;
  const opportunities = [];

  opportunities.push({
    opportunity_type: 'profile',
    stage,
    title: stage === 'build' ? 'Complete Your Profile' : stage === 'grow' ? 'Strengthen Your Profile' : 'Showcase Your Expertise',
    description: stage === 'build'
      ? 'A complete profile is the foundation of being discovered on Interactive.'
      : 'Update your profile to reflect your growing reputation and track record.',
    action_label: stage === 'build' ? 'Edit Profile' : 'Update Profile',
    action_url: ownerType === 'business' ? '/business/profile' : '/professional-profile',
    priority: stage === 'build' ? 100 : 50,
    subscription_tier_required: null,
  });

  opportunities.push({
    opportunity_type: 'customer',
    stage,
    title: stage === 'build' ? 'Get Your First Clients' : stage === 'grow' ? 'Expand Your Client Base' : 'Maximise Retention',
    description: stage === 'build'
      ? 'Make it easy for clients to find and book you.'
      : 'Reach more clients through discovery and promotion.',
    action_label: stage === 'build' ? 'Set Up Availability' : 'View Bookings',
    action_url: '/availability',
    priority: stage === 'build' ? 80 : 60,
    subscription_tier_required: null,
  });

  if (subscriptionTier && subscriptionTier !== 'basic') {
    opportunities.push({
      opportunity_type: 'promotional',
      stage,
      title: stage === 'build' ? 'Start Promoting' : stage === 'grow' ? 'Scale Promotions' : 'Run Campaign Portfolios',
      description: 'Use promotional campaigns to boost your visibility in the Directory.',
      action_label: 'Create Campaign',
      action_url: '/promotions',
      priority: 70,
      subscription_tier_required: 'plus',
    });
  } else {
    opportunities.push({
      opportunity_type: 'promotional',
      stage,
      title: 'Unlock Promotions',
      description: 'Upgrade your plan to create promotional campaigns and boost your visibility.',
      action_label: 'View Plans',
      action_url: '/plans',
      priority: 40,
      subscription_tier_required: 'plus',
    });
  }

  if (ownerType === 'business') {
    opportunities.push({
      opportunity_type: 'business',
      stage,
      title: stage === 'build' ? 'Set Up Operations' : stage === 'grow' ? 'Optimise Operations' : 'Scale Operations',
      description: 'Streamline your business operations for sustainable growth.',
      action_label: 'Business Workspace',
      action_url: '/business/workspace',
      priority: 60,
      subscription_tier_required: null,
    });
  }

  return opportunities.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/**
 * Get guidance for a specific opportunity via the GuidanceProviderAdapter.
 */
export async function getOpportunityGuidance(stage, opportunityType, context = {}) {
  return getGuidance(stage, opportunityType, context);
}

/**
 * List persisted growth opportunities for an owner.
 */
export async function listOpportunities(ownerId, ownerType) {
  if (!useFirebase) return [];
  const q = query(
    collection(db, OPPORTUNITIES_COLLECTION),
    where('owner_id', '==', ownerId),
    where('owner_type', '==', ownerType),
    where('status', '==', 'available'),
    orderBy('priority', 'desc'),
    limit(20),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}