import { secrets } from 'base44:runtime';

// ───────────────────────────────────────────────────────────
// GetFirebaseConfig — Returns the public Firebase web config
// ───────────────────────────────────────────────────────────
// Returns the non-sensitive Firebase web SDK configuration
// (apiKey, projectId, authDomain, storageBucket) so the frontend
// can initialise Firebase in environments where VITE_FIREBASE_*
// build-time env vars are not available (e.g. Base44 Preview).
//
// The Firebase web config is public by design — it is included
// in the client-side bundle and visible to anyone. Security is
// enforced by Firestore rules and Firebase Auth, not by config
// secrecy.
//
// No auth required: this is called before the user is authenticated.

export default async function(req: Request): Promise<Response> {
  try {
    const apiKey = secrets.get('FIREBASE_WEB_API_KEY');
    const projectId = secrets.get('FIREBASE_PROJECT_ID');

    if (!apiKey || !projectId) {
      return Response.json(
        { error: 'Firebase web config not set in backend secrets' },
        { status: 500 }
      );
    }

    return Response.json({
      apiKey,
      projectId,
      authDomain: `${projectId}.firebaseapp.com`,
      storageBucket: `${projectId}.appspot.com`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}