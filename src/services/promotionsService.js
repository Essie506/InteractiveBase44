// Promotions Service — V2 §19 Promotions & Advertising System.
// Client-side operations for campaigns and Growth Packages.
import { db } from '@/firebase/firebaseClient';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { useFirebase } from '@/lib/backendConfig';
import { fromFirestoreDoc } from '@/data/firebase/mappers';

const PROMOTIONS_COLLECTION = 'promotions';
const GROWTH_PACKAGES_COLLECTION = 'growthPackages';

/**
 * List campaigns owned by an identity or business.
 * @param {string} ownerId
 * @param {string} ownerType - 'identity' | 'business'
 * @returns {Promise<Array>}
 */
export async function listCampaigns(ownerId, ownerType = 'identity') {
  if (!useFirebase) return [];
  const q = query(
    collection(db, PROMOTIONS_COLLECTION),
    where('owner_id', '==', ownerId),
    where('owner_type', '==', ownerType),
    orderBy('_updated_date', 'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

/**
 * Get a single campaign by ID.
 */
export async function getCampaign(id) {
  if (!useFirebase) return null;
  const snap = await getDoc(doc(db, PROMOTIONS_COLLECTION, id));
  if (!snap.exists()) return null;
  return fromFirestoreDoc(snap);
}

/**
 * List active campaigns for sponsored placement in Directory/Search.
 * Only active, within-date-range campaigns with remaining budget.
 * @returns {Promise<Array>}
 */
export async function listActiveCampaigns() {
  if (!useFirebase) return [];
  const q = query(
    collection(db, PROMOTIONS_COLLECTION),
    where('status', '==', 'active'),
    limit(100),
  );
  const snap = await getDocs(q);
  const now = new Date();
  return snap.docs
    .map(fromFirestoreDoc)
    .filter((c) => {
      if (c.budget_pence > 0 && c.spent_pence >= c.budget_pence) return false;
      if (c.start_date && new Date(c.start_date) > now) return false;
      if (c.end_date && new Date(c.end_date) < now) return false;
      return true;
    });
}

/**
 * Get the Growth Package for a subscription plan tier + family.
 * @param {string} tier - basic | plus | pro
 * @param {string} family - professional | business
 * @returns {Promise<Object|null>}
 */
export async function getGrowthPackageForTier(tier, family) {
  if (!useFirebase) return null;
  const q = query(
    collection(db, GROWTH_PACKAGES_COLLECTION),
    where('tier', '==', tier),
    where('family', '==', family),
    where('status', '==', 'active'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return fromFirestoreDoc(snap.docs[0]);
}

/**
 * List all active Growth Packages for a family.
 * @param {string} family - professional | business
 * @returns {Promise<Array>}
 */
export async function listGrowthPackages(family) {
  if (!useFirebase) return [];
  const q = query(
    collection(db, GROWTH_PACKAGES_COLLECTION),
    where('family', '==', family),
    where('status', '==', 'active'),
    orderBy('sort_order', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

/**
 * Check whether a campaign type is allowed by a Growth Package.
 * @param {Object} growthPackage
 * @param {string} campaignType
 * @returns {boolean}
 */
export function isCampaignTypeAllowed(growthPackage, campaignType) {
  if (!growthPackage) return false;
  if (!Array.isArray(growthPackage.campaign_types)) return false;
  return growthPackage.campaign_types.includes(campaignType);
}

/**
 * Check whether the owner can create a new campaign (max active check).
 * @param {Array} existingCampaigns - active campaigns for this owner
 * @param {Object} growthPackage
 * @returns {boolean}
 */
export function canCreateCampaign(existingCampaigns, growthPackage) {
  if (!growthPackage) return false;
  const activeCount = existingCampaigns.filter((c) => c.status === 'active').length;
  return activeCount < (growthPackage.max_active_campaigns || 1);
}