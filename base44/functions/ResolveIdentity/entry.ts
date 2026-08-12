import { secrets } from 'base44:runtime';
import {
  getAccessToken,
  getProjectId,
  toFirestoreFields,
  firestoreBatchWrite,
  firestoreGetDoc,
  firestoreRunQuery,
  docPath,
} from '../../shared/firebaseAdmin.ts';

// ───────────────────────────────────────────────────────────
// ResolveIdentity — Trusted server-side identity resolution
// ───────────────────────────────────────────────────────────
// Verifies a Firebase ID token and resolves (or creates) the
// Interactive Identity mapping for the authenticated Firebase user.
//
// Base44-independent: uses only the Firebase Admin SDK (REST API)
// to read/write Firestore with service-account credentials. No
// Base44 entity operations, no Base44 client, no Base44 app ID.
//
// Authentication: Firebase ID token (verified via identitytoolkit
// REST API). The Firebase token is the sole auth proof — no Base44
// session is required.
//
// Resolution order:
//   1. Existing mapping by auth_uid → return (idempotent)
//   2. Require email verification for email-based matching
//   3. Existing mapping by email → account linking (same identity, new provider)
//   4. Migrated Firestore user by email → preserve existing Interactive Identity ID
//   5. No match → generate new Interactive Identity ID
//
// Collision protection:
//   - Multiple Firestore users with same email → rejected
//   - Multiple mappings with same email but different identity_ids → rejected

async function verifyFirebaseToken(idToken: string, apiKey: string) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || response.statusText;
    throw new Error(`Firebase token verification failed: ${message}`);
  }

  const data = await response.json();
  if (!data.users || data.users.length === 0) {
    throw new Error('Invalid Firebase token: no user found');
  }

  const fbUser = data.users[0];
  return {
    uid: fbUser.localId,
    email: fbUser.email,
    emailVerified: fbUser.emailVerified === true,
    providers: (fbUser.providerUserInfo || []).map((p: any) => p.providerId),
  };
}

function generateIdentityId(): string {
  return 'int_' + crypto.randomUUID();
}

export default async function (req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { idToken } = body;

    if (!idToken) {
      return Response.json({ error: 'Missing idToken', code: 'MISSING_TOKEN' }, { status: 400 });
    }

    const apiKey = secrets.get('FIREBASE_WEB_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'Firebase API key not configured', code: 'CONFIG_ERROR' }, { status: 500 });
    }

    // Step 1: Verify Firebase ID token
    let fbUser;
    try {
      fbUser = await verifyFirebaseToken(idToken, apiKey);
    } catch (verifyError) {
      return Response.json(
        { error: verifyError.message, code: 'INVALID_TOKEN' },
        { status: 401 }
      );
    }
    const canonicalEmail = fbUser.email.toLowerCase().trim();

    const token = await getAccessToken();
    const projectId = getProjectId();

    // Step 2: Check for existing mapping by auth_uid (idempotent)
    const existingMapping = await firestoreGetDoc(
      projectId,
      'identityMappings',
      fbUser.uid,
      token
    );

    if (existingMapping) {
      return Response.json({
        identityId: existingMapping.data.identity_id,
        isNew: false,
        isExisting: true,
        isLinked: false,
        email: fbUser.email,
        emailVerified: fbUser.emailVerified,
      });
    }

    // Step 3: Require email verification for email-based matching
    if (!fbUser.emailVerified) {
      return Response.json(
        { error: 'Email verification required for identity resolution', code: 'EMAIL_NOT_VERIFIED' },
        { status: 403 }
      );
    }

    // Step 4: Check for existing mapping by email (account linking)
    const mappingsByEmail = await firestoreRunQuery(
      projectId,
      'identityMappings',
      [{ field: 'email', op: 'EQUAL', value: canonicalEmail }],
      token
    );

    let identityId: string;
    let isNew = false;
    let isLinked = false;

    if (mappingsByEmail.length > 0) {
      // Verify all email mappings point to the same identity (no ambiguity)
      const identityIds = new Set(mappingsByEmail.map((m) => m.data.identity_id));
      if (identityIds.size > 1) {
        return Response.json(
          { error: 'Ambiguous email mapping: multiple identities found for this email', code: 'AMBIGUOUS_EMAIL_MAPPING' },
          { status: 409 }
        );
      }
      // Account linking: use existing identity_id with new auth_uid
      identityId = mappingsByEmail[0].data.identity_id;
      isLinked = true;
    } else {
      // Step 5: Look up migrated Firestore user by email
      const usersByEmail = await firestoreRunQuery(
        projectId,
        'users',
        [{ field: 'email', op: 'EQUAL', value: canonicalEmail }],
        token
      );

      // Collision protection: multiple users with same email
      if (usersByEmail.length > 1) {
        return Response.json(
          { error: 'Ambiguous email match: multiple users found with this email', code: 'AMBIGUOUS_EMAIL' },
          { status: 409 }
        );
      }

      if (usersByEmail.length === 1) {
        // Existing migrated user — preserve Interactive Identity ID (Firestore doc ID)
        identityId = usersByEmail[0].id;
        isNew = false;
      } else {
        // New user — generate new Interactive Identity ID
        identityId = generateIdentityId();
        isNew = true;
      }
    }

    // Step 6: Create mapping in Firestore identityMappings/{authUid}
    const mappingFields = toFirestoreFields({
      auth_uid: fbUser.uid,
      identity_id: identityId,
      email: canonicalEmail,
      email_verified: fbUser.emailVerified,
      is_new_identity: isNew,
      linked_providers: fbUser.providers,
      auth_provider: 'firebase',
    });

    const writes: Array<{ name: string; fields: Record<string, any> }> = [
      { name: docPath(projectId, 'identityMappings', fbUser.uid), fields: mappingFields },
    ];

    // For genuinely new identities, create the users/{identityId}
    // document so the client can update it during onboarding. Existing
    // migrated users already have this document.
    if (isNew) {
      const userFields = toFirestoreFields({
        email: fbUser.email,
        role: 'user',
        onboarding_status: 'not_started',
        active_context: 'personal',
        professional_activated: false,
        terms_accepted: false,
      });
      writes.push({ name: docPath(projectId, 'users', identityId), fields: userFields });
    }

    await firestoreBatchWrite(projectId, writes, token);

    return Response.json({
      identityId,
      isNew,
      isExisting: !isNew,
      isLinked,
      email: fbUser.email,
      emailVerified: fbUser.emailVerified,
    });
  } catch (error) {
    return Response.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}