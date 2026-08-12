// Interactive — Firebase Cloud Functions
// ───────────────────────────────────────────────────────────
// Trusted identity bootstrap for Firebase Authentication.
//
// resolveIdentity (onCall):
//   Verifies Firebase Auth via Firebase infrastructure (context.auth).
//   Resolves (or creates) the Interactive Identity mapping for the
//   authenticated Firebase user.
//
//   Uses the Firebase Admin SDK to read/write Firestore — bypassing
//   Firestore Security Rules. The client never receives service-account
//   credentials; the Admin SDK is initialised server-side only.
//
// CORS:
//   Firebase Functions v2 onCall does NOT enable CORS by default.
//   The cors option below explicitly allows:
//     - http://localhost:* (local Vite dev, any port)
//     - https://*.base44.app (Base44 Preview / deployed frontends)
//   Future approved Interactive production origins should be added
//   to the regex below — do NOT switch to cors: true in production.
//
// Resolution order:
//   1. Existing mapping by auth_uid → return (idempotent)
//   2. Require email verification for email-based matching
//   3. Existing mapping by email → account linking (same identity, new provider)
//   4. Migrated Firestore user by email → preserve existing Interactive Identity ID
//   5. No match → generate new Interactive Identity ID
//
// Collision protection:
//   - Multiple Firestore users with same email → rejected (AMBIGUOUS_EMAIL)
//   - Multiple mappings with same email but different identity_ids → rejected (AMBIGUOUS_EMAIL_MAPPING)
//
// identityMappings client writes remain denied by Firestore Security Rules
// (allow write: if false). Only this Cloud Function (Admin SDK) can write.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';

initializeApp();

const db = getFirestore();

// ── CORS allowed origins ───────────────────────────────────
// Matches:
//   http://localhost           (no port)
//   http://localhost:5182     (any port — local Vite dev)
//   https://*.base44.app       (Base44 Preview / deployed frontends)
// To add a production origin, append |^https:\/\/your-domain\.com$ below.
const allowedOrigins = /^http:\/\/localhost(:\d+)?$|^https:\/\/.*\.base44\.app$/;

export const resolveIdentity = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    // ── Firebase Auth verification ───────────────────────────
    // Firebase infrastructure verifies the ID token before invoking
    // the function. context.auth is populated by Firebase — we do
    // NOT trust client-supplied identity information.
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

    // ── Step 1: Check identityMappings/{authUid} (idempotent) ──
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

    // ── Step 2: Require email verification for email-based matching ──
    if (!emailVerified) {
      throw new HttpsError('permission-denied', 'EMAIL_NOT_VERIFIED');
    }

    // ── Step 3: Check identityMappings by email (account linking) ──
    const mappingsByEmail = await db
      .collection('identityMappings')
      .where('email', '==', canonicalEmail)
      .get();

    let identityId: string;
    let isNew = false;
    let isLinked = false;

    if (!mappingsByEmail.empty) {
      // Verify all email mappings point to the same identity (no ambiguity)
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
      // Account linking: use existing identity_id with new auth_uid
      identityId = mappingsByEmail.docs[0].data().identity_id;
      isLinked = true;
    } else {
      // ── Step 4: Look up migrated Firestore user by email ──
      const usersByEmail = await db
        .collection('users')
        .where('email', '==', canonicalEmail)
        .get();

      // Collision protection: multiple users with same email
      if (usersByEmail.size > 1) {
        throw new HttpsError(
          'already-exists',
          'AMBIGUOUS_EMAIL: multiple users found with this email'
        );
      }

      if (usersByEmail.size === 1) {
        // Existing migrated user — preserve Interactive Identity ID (Firestore doc ID)
        identityId = usersByEmail.docs[0].id;
        isNew = false;
      } else {
        // ── Step 5: New user — generate new Interactive Identity ID ──
        identityId = 'int_' + randomUUID();
        isNew = true;
      }
    }

    // ── Step 6: Create mapping (and user record for new identities) ──
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

    // For genuinely new identities, create the users/{identityId}
    // document so the client can update it during onboarding. Existing
    // migrated users already have this document.
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