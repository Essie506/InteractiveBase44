import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  getAccessToken,
  getProjectId,
  toFirestoreFields,
  firestoreBatchWrite,
  docPath,
} from '../../shared/firebaseAdmin.ts';

// ───────────────────────────────────────────────────────────
// MigrateData — Base44 → Firestore data migration
// ───────────────────────────────────────────────────────────
// Reads all records from a Base44 entity and writes them to
// Firestore using the REST API with service-account auth.
//
// Idempotent: uses batchWrite with update (create-or-replace).
// Re-running does not create duplicates.
//
// Usage: POST with { collection: "<collectionName>" }
// If no collection specified, returns the list of available collections.

// ── Collection Configuration ────────────────────────────────
// Each entry maps a Firestore collection to a Base44 entity with
// an ID strategy:
//   preserve     — use the Base44 record ID as the Firestore doc ID
//   deterministic — compute the doc ID from record fields
//   auth_uid     — use a specific field as the doc ID
//   subcollection — write to a subcollection path
//   public       — write only public fields (projection split)

interface CollectionConfig {
  entity: string;
  collection: string;
  idStrategy: 'preserve' | 'deterministic' | 'auth_uid' | 'subcollection';
  deterministicFn?: (r: any) => string;
  idField?: string;
  subcollectionPath?: (r: any) => string;
  publicFields?: string[];
  extraFields?: Record<string, any>;
}

const COLLECTION_CONFIG: Record<string, CollectionConfig> = {
  users: {
    entity: 'User',
    collection: 'users',
    idStrategy: 'preserve',
  },
  personalProfiles: {
    entity: 'PersonalProfile',
    collection: 'personalProfiles',
    idStrategy: 'preserve',
  },
  professionalProfiles: {
    entity: 'ProfessionalProfile',
    collection: 'professionalProfiles',
    idStrategy: 'preserve',
  },
  professionalProfilesPublic: {
    entity: 'ProfessionalProfile',
    collection: 'professionalProfilesPublic',
    idStrategy: 'preserve',
    publicFields: [
      'identity_id', 'display_name', 'screen_name', 'avatar_url', 'bio',
      'headline', 'profession', 'professional_category', 'services',
      'service_area', 'location', 'visibility', 'lifecycle_state',
      'verification_state',
    ],
  },
  businesses: {
    entity: 'Business',
    collection: 'businesses',
    idStrategy: 'preserve',
  },
  businessProfiles: {
    entity: 'BusinessProfile',
    collection: 'businessProfiles',
    idStrategy: 'preserve',
  },
  businessMemberships: {
    entity: 'BusinessMembership',
    collection: 'businessMemberships',
    idStrategy: 'deterministic',
    deterministicFn: (r) => `${r.business_id}_${r.identity_id}`,
  },
  businessInvitations: {
    entity: 'BusinessInvitation',
    collection: 'businessInvitations',
    idStrategy: 'preserve',
  },
  subscriptionPlans: {
    entity: 'SubscriptionPlan',
    collection: 'subscriptionPlans',
    idStrategy: 'preserve',
  },
  businessSubscriptions: {
    entity: 'BusinessSubscription',
    collection: 'businessSubscriptions',
    idStrategy: 'preserve',
  },
  onboardingStates: {
    entity: 'OnboardingState',
    collection: 'onboardingStates',
    idStrategy: 'preserve',
  },
  userSettings: {
    entity: 'UserSetting',
    collection: 'userSettings',
    idStrategy: 'preserve',
  },
  notificationPreferences: {
    entity: 'NotificationPreference',
    collection: 'notificationPreferences',
    idStrategy: 'preserve',
  },
  notificationRecords: {
    entity: 'NotificationRecord',
    collection: 'notificationRecords',
    idStrategy: 'preserve',
  },
  mediaAssets: {
    entity: 'MediaAsset',
    collection: 'mediaAssets',
    idStrategy: 'preserve',
  },
  verificationRequests: {
    entity: 'VerificationRequest',
    collection: 'verificationRequests',
    idStrategy: 'preserve',
  },
  trustRecords: {
    entity: 'TrustRecord',
    collection: 'trustRecords',
    idStrategy: 'preserve',
  },
  trustSignals: {
    entity: 'TrustSignal',
    collection: 'trustSignals',
    idStrategy: 'preserve',
  },
  locations: {
    entity: 'Location',
    collection: 'locations',
    idStrategy: 'preserve',
  },
  locationsPublic: {
    entity: 'Location',
    collection: 'locationsPublic',
    idStrategy: 'preserve',
    publicFields: [
      'owner_id', 'owner_type', 'location_context', 'public_label',
      'city', 'region', 'country', 'precision_level', 'is_online_only',
      'is_hybrid', 'visibility', 'lifecycle_state',
    ],
  },
  calendarEvents: {
    entity: 'CalendarEvent',
    collection: 'calendarEvents',
    idStrategy: 'preserve',
  },
  availabilityRules: {
    entity: 'AvailabilityRule',
    collection: 'availabilityRules',
    idStrategy: 'preserve',
  },
  externalCalendarConnections: {
    entity: 'ExternalCalendarConnection',
    collection: 'externalCalendarConnections',
    idStrategy: 'preserve',
  },
  conversations: {
    entity: 'Conversation',
    collection: 'conversations',
    idStrategy: 'preserve',
  },
  blockRecords: {
    entity: 'BlockRecord',
    collection: 'blockRecords',
    idStrategy: 'deterministic',
    deterministicFn: (r) => `${r.blocker_id}__${r.blocked_id}`,
  },
  identityMappings: {
    entity: 'IdentityMapping',
    collection: 'identityMappings',
    idStrategy: 'auth_uid',
    idField: 'auth_uid',
    extraFields: { auth_provider: 'firebase' },
  },
  // ── SpecVault (copy migration — Base44 source untouched) ──
  projects: {
    entity: 'Project',
    collection: 'projects',
    idStrategy: 'preserve',
  },
  specifications: {
    entity: 'Specification',
    collection: 'specifications',
    idStrategy: 'preserve',
  },
  specVersions: {
    entity: 'SpecVersion',
    collection: 'specVersions',
    idStrategy: 'preserve',
  },
};

// Messages are a subcollection: conversations/{convId}/messages/{msgId}
const MESSAGE_CONFIG: CollectionConfig = {
  entity: 'Message',
  collection: 'messages',
  idStrategy: 'subcollection',
  subcollectionPath: (r) => `conversations/${r.conversation_id}/messages/${r.id}`,
};

// ── Record Transformation ───────────────────────────────────

function transformRecord(
  record: any,
  config: CollectionConfig
): { name: string; fields: Record<string, any> } {
  const { id, created_date, updated_date, created_by_id, ...data } = record;

  // Determine Firestore document path
  let docName: string;
  if (config.idStrategy === 'subcollection' && config.subcollectionPath) {
    docName = `projects/${getProjectId()}/databases/(default)/documents/${config.subcollectionPath(record)}`;
  } else {
    let docId: string;
    if (config.idStrategy === 'deterministic' && config.deterministicFn) {
      docId = config.deterministicFn(record);
    } else if (config.idStrategy === 'auth_uid' && config.idField) {
      docId = record[config.idField];
    } else {
      docId = id;
    }
    docName = docPath(getProjectId(), config.collection, docId);
  }

  // Build the Firestore document data
  let firestoreData: Record<string, any> = { ...data };

  // Add extra fields (e.g., auth_provider for identityMappings)
  if (config.extraFields) {
    firestoreData = { ...firestoreData, ...config.extraFields };
  }

  // Filter to public fields if this is a public projection
  if (config.publicFields) {
    const filtered: Record<string, any> = {};
    for (const field of config.publicFields) {
      if (firestoreData[field] !== undefined) {
        filtered[field] = firestoreData[field];
      }
    }
    firestoreData = filtered;
  }

  // Convert system-managed dates to Firestore meta fields
  if (created_date) firestoreData._created_date = created_date;
  if (updated_date) firestoreData._updated_date = updated_date;
  else if (created_date) firestoreData._updated_date = created_date;
  if (created_by_id) firestoreData.created_by_id = created_by_id;

  return { name: docName, fields: toFirestoreFields(firestoreData) };
}

// ── Main Migration Function ────────────────────────────────

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { collection } = body;

    // No collection specified — return available collections
    if (!collection) {
      return Response.json({
        availableCollections: Object.keys(COLLECTION_CONFIG).concat(['messages']),
        message: 'Specify a collection to migrate. Call once per collection.',
      });
    }

    // Special case: messages (subcollection)
    if (collection === 'messages') {
      return await migrateCollection(base44, MESSAGE_CONFIG);
    }

    const config = COLLECTION_CONFIG[collection];
    if (!config) {
      return Response.json(
        { error: `Unknown collection: ${collection}`, availableCollections: Object.keys(COLLECTION_CONFIG) },
        { status: 400 }
      );
    }

    return await migrateCollection(base44, config);
  } catch (error) {
    return Response.json(
      { error: error.message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

async function migrateCollection(
  base44: any,
  config: CollectionConfig
): Promise<Response> {
  const token = await getAccessToken();
  const projectId = getProjectId();

  // Read all records from Base44 (up to 1000 per call)
  const records = await base44.asServiceRole.entities[config.entity].list(
    '-created_date',
    1000
  );

  if (!records || records.length === 0) {
    return Response.json({
      collection: config.collection,
      entity: config.entity,
      readCount: 0,
      writeCount: 0,
      message: 'No records to migrate',
    });
  }

  // Transform records to Firestore write operations
  const writes = records.map((r: any) => transformRecord(r, config));

  // Batch write to Firestore (idempotent — create-or-replace)
  const result = await firestoreBatchWrite(projectId, writes, token);

  return Response.json({
    collection: config.collection,
    entity: config.entity,
    readCount: records.length,
    writeCount: result.written,
    errors: result.errors.length > 0 ? result.errors.slice(0, 5) : [],
    idStrategy: config.idStrategy,
    publicProjection: !!config.publicFields,
  });
}