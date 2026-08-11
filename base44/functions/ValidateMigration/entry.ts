import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  getAccessToken,
  getProjectId,
  firestoreCountDocs,
  firestoreListDocs,
} from '../../shared/firebaseAdmin.ts';

// ───────────────────────────────────────────────────────────
// ValidateMigration — Migration validation and integrity checks
// ───────────────────────────────────────────────────────────
// Compares record counts between Base44 and Firestore, and
// performs referential-integrity checks across collections.
//
// Usage: POST with { check: "counts" | "integrity" | "all" }
// Default: "all"

const COLLECTION_MAP: Record<string, string> = {
  users: 'User',
  personalProfiles: 'PersonalProfile',
  professionalProfiles: 'ProfessionalProfile',
  businesses: 'Business',
  businessProfiles: 'BusinessProfile',
  businessMemberships: 'BusinessMembership',
  businessInvitations: 'BusinessInvitation',
  subscriptionPlans: 'SubscriptionPlan',
  businessSubscriptions: 'BusinessSubscription',
  onboardingStates: 'OnboardingState',
  userSettings: 'UserSetting',
  notificationPreferences: 'NotificationPreference',
  notificationRecords: 'NotificationRecord',
  mediaAssets: 'MediaAsset',
  verificationRequests: 'VerificationRequest',
  trustRecords: 'TrustRecord',
  trustSignals: 'TrustSignal',
  locations: 'Location',
  calendarEvents: 'CalendarEvent',
  availabilityRules: 'AvailabilityRule',
  externalCalendarConnections: 'ExternalCalendarConnection',
  conversations: 'Conversation',
  messages: 'Message',
  blockRecords: 'BlockRecord',
  identityMappings: 'IdentityMapping',
};

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const check = body.check || 'all';

    const token = await getAccessToken();
    const projectId = getProjectId();

    const results: any = {
      check,
      timestamp: new Date().toISOString(),
      counts: {},
      integrity: {},
      errors: [],
    };

    // ── Count Comparison ────────────────────────────────────
    if (check === 'counts' || check === 'all') {
      for (const [fsCollection, b44Entity] of Object.entries(COLLECTION_MAP)) {
        try {
          const b44Count = await base44.asServiceRole.entities[b44Entity].list(
            '-created_date',
            5000
          );
          const b44RecordCount = b44Count.length;

          let fsCount: number;
          if (fsCollection === 'messages') {
            // Messages are in a subcollection — count via conversations
            const conversations = await firestoreListDocs(projectId, 'conversations', token);
            let msgTotal = 0;
            for (const conv of conversations) {
              try {
                const msgs = await firestoreListDocs(
                  projectId,
                  `conversations/${conv.id}/messages`,
                  token
                );
                msgTotal += msgs.length;
              } catch { /* skip */ }
            }
            fsCount = msgTotal;
          } else {
            fsCount = await firestoreCountDocs(projectId, fsCollection, token);
          }

          results.counts[fsCollection] = {
            base44: b44RecordCount,
            firestore: fsCount,
            match: b44RecordCount === fsCount,
          };
        } catch (err: any) {
          results.counts[fsCollection] = {
            error: err.message.substring(0, 200),
          };
          results.errors.push(`${fsCollection}: ${err.message.substring(0, 100)}`);
        }
      }
    }

    // ── Referential Integrity Checks ────────────────────────
    if (check === 'integrity' || check === 'all') {
      // 1. Business Memberships reference valid Businesses and Identities
      try {
        const memberships = await firestoreListDocs(projectId, 'businessMemberships', token);
        const businesses = new Set(
          (await firestoreListDocs(projectId, 'businesses', token)).map(d => d.id)
        );
        const users = new Set(
          (await firestoreListDocs(projectId, 'users', token)).map(d => d.id)
        );

        const orphanMemberships = memberships.filter(
          m => !businesses.has(m.data.business_id) || !users.has(m.data.identity_id)
        );
        results.integrity.businessMemberships = {
          total: memberships.length,
          orphanReferences: orphanMemberships.length,
          valid: orphanMemberships.length === 0,
        };
      } catch (err: any) {
        results.integrity.businessMemberships = { error: err.message.substring(0, 200) };
      }

      // 2. Profiles reference valid Identities
      try {
        const personalProfiles = await firestoreListDocs(projectId, 'personalProfiles', token);
        const profProfiles = await firestoreListDocs(projectId, 'professionalProfiles', token);
        const users = new Set(
          (await firestoreListDocs(projectId, 'users', token)).map(d => d.id)
        );

        const orphanPersonal = personalProfiles.filter(p => !users.has(p.data.identity_id));
        const orphanProf = profProfiles.filter(p => !users.has(p.data.identity_id));
        results.integrity.profiles = {
          personalOrphans: orphanPersonal.length,
          professionalOrphans: orphanProf.length,
          valid: orphanPersonal.length === 0 && orphanProf.length === 0,
        };
      } catch (err: any) {
        results.integrity.profiles = { error: err.message.substring(0, 200) };
      }

      // 3. Conversation participants reference valid Identities
      try {
        const conversations = await firestoreListDocs(projectId, 'conversations', token);
        const users = new Set(
          (await firestoreListDocs(projectId, 'users', token)).map(d => d.id)
        );

        const orphanConvs = conversations.filter(
          c => !(c.data.participant_ids || []).every((id: string) => users.has(id))
        );
        results.integrity.conversations = {
          total: conversations.length,
          orphanParticipants: orphanConvs.length,
          valid: orphanConvs.length === 0,
        };
      } catch (err: any) {
        results.integrity.conversations = { error: err.message.substring(0, 200) };
      }

      // 4. Notification recipients reference valid Identities
      try {
        const notifications = await firestoreListDocs(projectId, 'notificationRecords', token);
        const users = new Set(
          (await firestoreListDocs(projectId, 'users', token)).map(d => d.id)
        );

        const orphanNotifs = notifications.filter(n => !users.has(n.data.recipient_id));
        results.integrity.notifications = {
          total: notifications.length,
          orphanRecipients: orphanNotifs.length,
          valid: orphanNotifs.length === 0,
        };
      } catch (err: any) {
        results.integrity.notifications = { error: err.message.substring(0, 200) };
      }

      // 5. Calendar events reference valid owners
      try {
        const events = await firestoreListDocs(projectId, 'calendarEvents', token);
        const users = new Set(
          (await firestoreListDocs(projectId, 'users', token)).map(d => d.id)
        );
        const businesses = new Set(
          (await firestoreListDocs(projectId, 'businesses', token)).map(d => d.id)
        );

        const orphanEvents = events.filter(e => {
          const ownerId = e.data.owner_id;
          const ownerType = e.data.owner_type;
          if (ownerType === 'business') return !businesses.has(ownerId);
          return !users.has(ownerId);
        });
        results.integrity.calendarEvents = {
          total: events.length,
          orphanOwners: orphanEvents.length,
          valid: orphanEvents.length === 0,
        };
      } catch (err: any) {
        results.integrity.calendarEvents = { error: err.message.substring(0, 200) };
      }

      // 6. Duplicate deterministic IDs
      try {
        const memberships = await firestoreListDocs(projectId, 'businessMemberships', token);
        const membershipIds = memberships.map(m => m.id);
        const duplicateMemberships = membershipIds.length - new Set(membershipIds).size;
        results.integrity.deterministicIds = {
          duplicateMemberships: duplicateMemberships,
          valid: duplicateMemberships === 0,
        };
      } catch (err: any) {
        results.integrity.deterministicIds = { error: err.message.substring(0, 200) };
      }

      // 7. Identity mapping integrity
      try {
        const mappings = await firestoreListDocs(projectId, 'identityMappings', token);
        const users = new Set(
          (await firestoreListDocs(projectId, 'users', token)).map(d => d.id)
        );

        const orphanMappings = mappings.filter(m => !users.has(m.data.identity_id));
        results.integrity.identityMappings = {
          total: mappings.length,
          orphanIdentities: orphanMappings.length,
          valid: orphanMappings.length === 0,
        };
      } catch (err: any) {
        results.integrity.identityMappings = { error: err.message.substring(0, 200) };
      }
    }

    // ── Summary ────────────────────────────────────────────
    const countMismatches = Object.entries(results.counts)
      .filter(([, v]: [string, any]) => v && !v.match && !v.error)
      .map(([k]) => k);
    const integrityFailures = Object.entries(results.integrity)
      .filter(([, v]: [string, any]) => v && !v.valid && !v.error)
      .map(([k]) => k);

    results.summary = {
      countsMatch: countMismatches.length === 0,
      countMismatches,
      integrityPassed: integrityFailures.length === 0,
      integrityFailures,
      criticalErrors: results.errors.length,
      ready: countMismatches.length === 0 && integrityFailures.length === 0,
    };

    return Response.json(results);
  } catch (error) {
    return Response.json(
      { error: error.message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}