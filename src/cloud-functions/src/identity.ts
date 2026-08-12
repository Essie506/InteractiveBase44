// resolveIdentity — Trusted identity bootstrap
// ───────────────────────────────────────────────────────────
// Verifies Firebase Auth via Firebase infrastructure (request.auth).
// Resolves (or creates) the Interactive Identity mapping.
//
// Resolution order:
//   1. Existing mapping by auth_uid → return (idempotent)
//   2. Require email verification for email-based matching
//   3. Existing mapping by email → account linking
//   4. Migrated Firestore user by email → preserve existing Interactive Identity ID
//   5. No match → generate new Interactive Identity ID

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { randomUUID } from 'crypto';
import { db, allowedOrigins } from './shared';

export const resolveIdentity = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const authUid: string = request.auth.uid;
    const token = request.auth.token;
    const email: string | undefined = token.email;
    const emailVerified: boolean = token.email_verified === true;
    const provider: string | undefined = token.firebase?.sign_in_provider;
    const providers: string[] = provider ? [provider] : [];

    if (!email) {
      throw new HttpsError('invalid-argument', 'Email is required for identity resolution');
    }

    const canonicalEmail: string = email.toLowerCase().trim();

    // Step 1: Check identityMappings/{authUid} (idempotent)
    const mappingRef = db.collection('identityMappings').doc(authUid);
    const mappingDoc = await mappingRef.get();

    if (mappingDoc.exists) {
      const data = mappingDoc.data()!;
      return {
        identityId: data.identity_id,
        isNew: false,
        isExisting: true,
        isLinked: false,
        email,
        emailVerified,
      };
    }

    // Step 2: Require email verification for email-based matching
    if (!emailVerified) {
      throw new HttpsError('permission-denied', 'EMAIL_NOT_VERIFIED');
    }

    // Step 3: Check identityMappings by email (account linking)
    const mappingsByEmail = await db
      .collection('identityMappings')
      .where('email', '==', canonicalEmail)
      .get();

    let identityId: string;
    let isNew = false;
    let isLinked = false;

    if (!mappingsByEmail.empty) {
      const identityIds = new Set<string>();
      mappingsByEmail.forEach((doc) => {
        identityIds.add(doc.data().identity_id);
      });
      if (identityIds.size > 1) {
        throw new HttpsError(
          'already-exists',
          'AMBIGUOUS_EMAIL_MAPPING: multiple identities found for this email'
        );
      }
      identityId = mappingsByEmail.docs[0].data().identity_id;
      isLinked = true;
    } else {
      // Step 4: Look up migrated Firestore user by email
      const usersByEmail = await db
        .collection('users')
        .where('email', '==', canonicalEmail)
        .get();

      if (usersByEmail.size > 1) {
        throw new HttpsError(
          'already-exists',
          'AMBIGUOUS_EMAIL: multiple users found with this email'
        );
      }

      if (usersByEmail.size === 1) {
        identityId = usersByEmail.docs[0].id;
        isNew = false;
      } else {
        // Step 5: New user
        identityId = 'int_' + randomUUID();
        isNew = true;
      }
    }

    // Step 6: Create mapping (and user record for new identities)
    const batch = db.batch();

    batch.set(mappingRef, {
      auth_uid: authUid,
      identity_id: identityId,
      email: canonicalEmail,
      email_verified: emailVerified,
      is_new_identity: isNew,
      linked_providers: providers,
      auth_provider: 'firebase',
    });

    if (isNew) {
      batch.set(db.collection('users').doc(identityId), {
        email,
        role: 'user',
        onboarding_status: 'not_started',
        active_context: 'personal',
        professional_activated: false,
        terms_accepted: false,
      });
    }

    await batch.commit();

    return {
      identityId,
      isNew,
      isExisting: !isNew,
      isLinked,
      email,
      emailVerified,
    };
  }
);