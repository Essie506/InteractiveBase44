// Promotions — V2 §19 Promotions & Advertising System.
// ───────────────────────────────────────────────────────────
// Server-side campaign writer. Enforces owner authority and
// Growth Package entitlements (allowed campaign types, max active
// campaigns). Campaigns are soft-deleted (status → 'expired') to
// preserve audit history.
//
// 1. saveCampaign — create or update a campaign. Validates the
//    campaign_type against the owner's Growth Package.
// 2. updateCampaignStatus — pause/activate/complete a campaign.
//    Enforces max-active-campaigns limit on activation.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, hasBusinessRole } from './shared';
import { indexContentInline, unindexContentInline } from './searchIndex';

const COLLECTION = 'promotions';
const PACKAGES = 'growthPackages';
const SUBSCRIPTIONS_PRO = 'professionalSubscriptions';
const SUBSCRIPTIONS_BIZ = 'businessSubscriptions';

const VALID_CAMPAIGN_TYPES = [
  'service_boost', 'event_boost', 'workout_boost',
  'post_boost', 'profile_boost', 'business_boost',
];

const VALID_STATUSES = [
  'draft', 'pending_review', 'active', 'paused',
  'completed', 'rejected', 'expired',
];

/**
 * Resolve the caller's Growth Package by looking up their subscription
 * tier + family, then the matching GrowthPackage document.
 */
async function resolveGrowthPackage(identityId: string, businessId: string | null): Promise<any> {
  const collection = businessId ? SUBSCRIPTIONS_BIZ : SUBSCRIPTIONS_PRO;
  const ownerField = businessId ? 'business_id' : 'identity_id';
  const ownerId = businessId || identityId;

  const subSnap = await db.collection(collection)
    .where(ownerField, '==', ownerId)
    .where('status', 'in', ['selected', 'active', 'past_due'])
    .limit(1)
    .get();
  if (subSnap.empty) return null;

  const tier = subSnap.docs[0].data().plan_tier;
  if (!tier || tier === 'basic') return null;

  const family = businessId ? 'business' : 'professional';
  const pkgSnap = await db.collection(PACKAGES)
    .where('tier', '==', tier)
    .where('family', '==', family)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (pkgSnap.empty) return null;
  const pkgDoc = pkgSnap.docs[0];
  return { ...pkgDoc.data(), id: pkgDoc.id };
}

/**
 * Count the owner's currently active campaigns.
 */
async function countActiveCampaigns(ownerId: string, ownerType: string): Promise<number> {
  const snap = await db.collection(COLLECTION)
    .where('owner_id', '==', ownerId)
    .where('owner_type', '==', ownerType)
    .where('status', '==', 'active')
    .get();
  return snap.size;
}

// ── saveCampaign ─────────────────────────────────────────────
export const saveCampaign = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const identityId = await getIdentityId(request.auth.uid);

    const {
      id, name, campaign_type, headline, description,
      budget_pence, start_date, end_date,
      target_content_references, owner_type, business_id,
    } = request.data || {};

    if (!name || !name.trim()) throw new HttpsError('invalid-argument', 'Campaign name is required');
    if (!VALID_CAMPAIGN_TYPES.includes(campaign_type)) {
      throw new HttpsError('invalid-argument', `Invalid campaign type: ${campaign_type}`);
    }

    const effectiveOwnerType = owner_type || 'identity';
    let effectiveOwnerId = identityId;

    if (effectiveOwnerType === 'business') {
      if (!business_id) throw new HttpsError('invalid-argument', 'business_id is required for business campaigns');
      const isAdmin = await hasBusinessRole(business_id, identityId, ['owner', 'admin']);
      if (!isAdmin) throw new HttpsError('permission-denied', 'Business admin required');
      effectiveOwnerId = business_id;
    }

    // ── Entitlement check: Growth Package must allow this campaign type ──
    const pkg = await resolveGrowthPackage(identityId, effectiveOwnerType === 'business' ? business_id : null);
    if (!pkg) {
      throw new HttpsError('failed-precondition', 'No Growth Package entitlement. Upgrade to create campaigns.');
    }
    const allowedTypes = pkg.campaign_types || [];
    if (!allowedTypes.includes(campaign_type)) {
      throw new HttpsError('failed-precondition', `Your plan does not allow campaign type: ${campaign_type}`);
    }

    // ── Max active campaigns check (only on create, or when activating) ──
    if (!id) {
      const activeCount = await countActiveCampaigns(effectiveOwnerId, effectiveOwnerType);
      if (activeCount >= (pkg.max_active_campaigns || 1)) {
        throw new HttpsError('failed-precondition', 'Maximum active campaigns reached for your plan');
      }
    }

    const now = new Date().toISOString();
    const payload: any = {
      name: name.trim().slice(0, 200),
      owner_id: effectiveOwnerId,
      owner_type: effectiveOwnerType,
      business_id: effectiveOwnerType === 'business' ? business_id : null,
      growth_package_id: pkg.id || null,
      campaign_type,
      headline: headline || null,
      description: description || null,
      budget_pence: Math.max(0, Math.round(Number(budget_pence) || 0)),
      spent_pence: 0,
      currency: 'GBP',
      start_date: start_date || null,
      end_date: end_date || null,
      target_content_references: Array.isArray(target_content_references) ? target_content_references : [],
      status: 'draft',
      impressions: 0,
      clicks: 0,
      conversions: 0,
      _updated_date: now,
    };

    let ref;
    if (id) {
      // Update — verify ownership
      ref = db.collection(COLLECTION).doc(id);
      const doc = await ref.get();
      if (!doc.exists) throw new HttpsError('not-found', 'Campaign not found');
      const existing = doc.data()!;
      if (existing.owner_id !== effectiveOwnerId || existing.owner_type !== effectiveOwnerType) {
        throw new HttpsError('permission-denied', 'You can only edit your own campaigns');
      }
      // Don't overwrite spent/metrics on edit
      delete payload.spent_pence;
      delete payload.impressions;
      delete payload.clicks;
      delete payload.conversions;
      delete payload.status;
      await ref.update(payload);
    } else {
      ref = db.collection(COLLECTION).doc();
      payload._created_date = now;
      await ref.set(payload);
    }

    // ── Cross-system search indexing (V2 §15.5) ──
    // Index the campaign so it appears in cross-system search. Promotions
    // are indexed with contentType 'promotion' and system 'promotion'.
    try {
      await indexContentInline(ref.id, 'promotion', {
        contentType: 'promotion',
        title: payload.name,
        description: payload.headline || payload.description || '',
        tags: [payload.campaign_type],
        ownerId: payload.owner_id,
        visibility: 'public',
      });
    } catch (err) {
      console.error('search index failed for promotion', ref.id, err);
    }

    return { id: ref.id, status: id ? 'updated' : 'created' };
  },
);

// ── updateCampaignStatus ─────────────────────────────────────
export const updateCampaignStatus = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const identityId = await getIdentityId(request.auth.uid);
    const { id, status } = request.data || {};

    if (!id) throw new HttpsError('invalid-argument', 'Campaign id is required');
    if (!VALID_STATUSES.includes(status)) {
      throw new HttpsError('invalid-argument', `Invalid status: ${status}`);
    }

    const ref = db.collection(COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new HttpsError('not-found', 'Campaign not found');
    const campaign = doc.data()!;

    // Authority check
    if (campaign.owner_type === 'business') {
      const isAdmin = await hasBusinessRole(campaign.owner_id, identityId, ['owner', 'admin']);
      if (!isAdmin) throw new HttpsError('permission-denied', 'Business admin required');
    } else {
      if (campaign.owner_id !== identityId) {
        throw new HttpsError('permission-denied', 'You can only update your own campaigns');
      }
    }

    // Enforce max-active limit when activating
    if (status === 'active' && campaign.status !== 'active') {
      const pkg = await resolveGrowthPackage(identityId, campaign.owner_type === 'business' ? campaign.owner_id : null);
      const maxActive = pkg?.max_active_campaigns || 1;
      const activeCount = await countActiveCampaigns(campaign.owner_id, campaign.owner_type);
      // Subtract 1 because this campaign is currently counted if it was 'paused'
      const effectiveCount = campaign.status === 'paused' ? activeCount - 1 : activeCount;
      if (effectiveCount >= maxActive) {
        throw new HttpsError('failed-precondition', 'Maximum active campaigns reached for your plan');
      }
    }

    await ref.update({
      status,
      _updated_date: new Date().toISOString(),
    });

    // ── Search index sync (V2 §15.5) ──
    // Active campaigns remain indexed; non-active campaigns are unindexed
    // so they don't appear in search results when paused/completed/expired.
    if (status !== 'active') {
      try {
        await unindexContentInline('promotion', id);
      } catch (err) {
        console.error('search unindex failed for promotion', id, err);
      }
    } else {
      try {
        await indexContentInline(id, 'promotion', {
          contentType: 'promotion',
          title: campaign.name,
          description: campaign.headline || campaign.description || '',
          tags: [campaign.campaign_type],
          ownerId: campaign.owner_id,
          visibility: 'public',
        });
      } catch (err) {
        console.error('search reindex failed for promotion', id, err);
      }
    }

    return { id, status };
  },
);