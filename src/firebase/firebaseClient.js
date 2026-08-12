/**
 * Firebase Initialisation Module
 * ───────────────────────────────────────────────────────────
 * Single shared Firebase application instance for the entire app.
 *
 * Config resolution order:
 *   1. VITE_FIREBASE_* env vars (local dev with .env.local)
 *   2. GetFirebaseConfig backend function (Base44 Preview / deployed)
 *
 * In local dev, env vars are available at build time → Firebase is
 * initialised synchronously at module load.
 *
 * In Base44 Preview, env vars are not available → initFirebase()
 * fetches the config from the backend function before the app
 * renders (called from main.jsx).
 *
 * Exports are live bindings: app, firebaseAuth, db, isConfigured
 * start as null/false and are populated by initFirebase(). Importers
 * that access them at runtime (inside functions) see the updated
 * values.
 *
 * No page or component should import this directly — only the
 * repository adapters in src/data/firebase/ and the auth service.
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

// ── Environment-based config (local dev) ────────────────────
/** @type {import('firebase/app').FirebaseOptions} */
const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

const isEnvConfigured = Boolean(envConfig.apiKey && envConfig.projectId);

// ── Lazy-initialised Firebase instances ────────────────────
// JSDoc types are required so that importers (firebaseAuthService,
// repositories) see a concrete type rather than implicit any.
// The live-binding architecture is preserved: these start as null
// and are populated by initFirebase() before any auth operation runs.
/** @type {import('firebase/app').FirebaseApp | null} */
let app = null;

/** @type {import('firebase/auth').Auth | null} */
let firebaseAuth = null;

/** @type {import('firebase/firestore').Firestore | null} */
let db = null;

/** @type {boolean} */
let isConfigured = isEnvConfigured;

// ── Lazy-initialised Firebase Functions instance ──────────
// The Cloud Functions region must match the deployment region
// in cloud-functions/src/index.ts (europe-west2).
/** @type {import('firebase/functions').Functions | null} */
let functionsInstance = null;

/** @type {import('firebase/storage').FirebaseStorage | null} */
let storage = null;

/**
 * Returns the Firebase Functions instance for the deployed
 * Cloud Function region. Throws if Firebase is not configured.
 * Called lazily — the instance is created on first use, after
 * initFirebase() has completed.
 *
 * @returns {import('firebase/functions').Functions}
 */
export function getFunctionsInstance() {
  if (!isConfigured || !app) {
    throw new Error('Firebase Functions not configured — initFirebase() has not completed');
  }
  if (!functionsInstance) {
    functionsInstance = getFunctions(app, 'europe-west2');
  }
  return functionsInstance;
}

if (isEnvConfigured) {
  // Local dev: env vars available → initialise synchronously
  app = initializeApp(envConfig);
  firebaseAuth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} else {
  console.warn(
    '[Firebase] VITE_FIREBASE_* env vars not set. ' +
    'Will fetch config from backend at startup (Base44 Preview mode).'
  );
}

/**
 * Initialise Firebase from the backend function.
 * Called from main.jsx before the app renders, when env vars
 * are not available. In local dev (env vars set), this is a no-op.
 *
 * @returns {Promise<void>}
 */
export async function initFirebase() {
  if (isConfigured) return;

  try {
    const response = await fetch('/functions/GetFirebaseConfig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    /** @type {import('firebase/app').FirebaseOptions} */
    const config = await response.json();

    if (config.apiKey && config.projectId) {
      app = initializeApp(config);
      firebaseAuth = getAuth(app);
      db = getFirestore(app);
      storage = getStorage(app);
      isConfigured = true;
    }
  } catch (err) {
    console.warn('[Firebase] Failed to fetch config from backend:', err?.message || err);
  }
}

export { app, firebaseAuth, db, storage, isConfigured };