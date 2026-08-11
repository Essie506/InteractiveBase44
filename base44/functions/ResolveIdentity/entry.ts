import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import {
  getAccessToken,
  getProjectId,
  toFirestoreFields,
  firestoreBatchWrite,
  docPath,
} from '../../shared/firebaseAdmin.ts';

// ───────────────────────────────────────────────────────────
// ResolveIdentity — Trusted server-side identity resolution
// ───────────────────────────────────────────────────────────
// Verifies a Firebase ID token and resolves (or creates) the
// Interactive Identity mapping for the authenticated Firebase user.
//
// Authentication: Firebase ID token (verified via identitytoolkit REST API).
// Does NOT require a Base44 user session — the Firebase token is the auth proof.
// Uses base44.asServiceRole for all entity operations (service-level credentials).
//
// Resolution order:
//   1. Existing mapping by auth_uid → return (idempotent)
//   2. Require email verification for email-based matching
//   3. Existing mapping by email → account linking (same identity, new provider)
//   4. Base44 User by email → preserve Base44 User ID as Interactive Identity ID
//   5. No match → generate new Interactive Identity ID
//
// Collision protection:
//   - Multiple Base44 users with same email → rejected
//   - Multiple mappings with same email but different identity_ids → rejected
//   - Identity already mapped to a different auth_uid via email → handled by email check

async function verifyFirebaseToken(idToken: string, apiKey: string) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
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
    providers: (fbUser.providerUserInfo || []).map((p: any) => p.providerId)
  };
}

function generateIdentityId(): string {
  return 'int_' + crypto.randomUUID();
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
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
      return Response.json({
        error: verifyError.message,
        code: 'INVALID_TOKEN'
      }, { status: 401 });
    }
    const canonicalEmail = fbUser.email.toLowerCase().trim();

    // Step 2: Check for existing mapping by auth_uid (idempotent)
    const existingByUid = await base44.asServiceRole.entities.IdentityMapping.filter({
      auth_uid: fbUser.uid
    });

    if (existingByUid.length > 0) {
      const mapping = existingByUid[0];
      return Response.json({
        identityId: mapping.identity_id,
        isNew: false,
        isExisting: true,
        isLinked: false,
        email: fbUser.email,
        emailVerified: fbUser.emailVerified
      });
    }

    // Step 3: Require email verification for email-based matching
    if (!fbUser.emailVerified) {
      return Response.json({
        error: 'Email verification required for identity resolution',
        code: 'EMAIL_NOT_VERIFIED'
      }, { status: 403 });
    }

    // Step 4: Check for existing mapping by email (account linking)
    const existingByEmail = await base44.asServiceRole.entities.IdentityMapping.filter({
      email: canonicalEmail
    });

    let identityId: string;
    let isNew = false;
    let isLinked = false;

    if (existingByEmail.length > 0) {
      // Verify all email mappings point to the same identity (no ambiguity)
      const identityIds = new Set(existingByEmail.map((m: any) => m.identity_id));
      if (identityIds.size > 1) {
        return Response.json({
          error: 'Ambiguous email mapping: multiple identities found for this email',
          code: 'AMBIGUOUS_EMAIL_MAPPING'
        }, { status: 409 });
      }
      // Account linking: use existing identity_id with new auth_uid
      identityId = existingByEmail[0].identity_id;
      isLinked = true;
    } else {
      // Step 5: Look up Base44 User by email
      const base44Users = await base44.asServiceRole.entities.User.filter({
        email: canonicalEmail
      });

      // Collision protection: multiple Base44 users with same email
      if (base44Users.length > 1) {
        return Response.json({
          error: 'Ambiguous email match: multiple Base44 users found with this email',
          code: 'AMBIGUOUS_EMAIL'
        }, { status: 409 });
      }

      if (base44Users.length === 1) {
        // Existing user — preserve Base44 User ID as Interactive Identity ID
        identityId = base44Users[0].id;
        isNew = false;
      } else {
        // New user — generate new Interactive Identity ID
        identityId = generateIdentityId();
        isNew = true;
      }
    }

    // Step 6: Create mapping in Base44 (for Base44-side queries)
    await base44.asServiceRole.entities.IdentityMapping.create({
      auth_uid: fbUser.uid,
      identity_id: identityId,
      email: canonicalEmail,
      email_verified: fbUser.emailVerified,
      is_new_identity: isNew,
      linked_providers: fbUser.providers
    });

    // Step 7: Write mapping to Firestore identityMappings/{authUid}
    // The Firestore security rules check exists(identityMappings/{uid})
    // to authorise client reads of users/{identityId}. Without this
    // Firestore-side document, isOwner() fails and the client cannot
    // load the user's application state — existing users are treated
    // as new and routed to onboarding.
    const token = await getAccessToken();
    const projectId = getProjectId();

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
    // users already have this document from the M3 migration.
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
      emailVerified: fbUser.emailVerified
    });
  } catch (error) {
    return Response.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}