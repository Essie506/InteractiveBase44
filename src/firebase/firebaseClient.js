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
import { base44 } from '@/api/base44Client';

// ── Environment-based config (local dev) ────────────────────
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
let app = null;
let firebaseAuth = null;
let db = null;
let isConfigured = isEnvConfigured;

if (isEnvConfigured) {
  // Local dev: env vars available → initialise synchronously
  app = initializeApp(envConfig);
  firebaseAuth = getAuth(app);
  db = getFirestore(app);
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
 */
export async function initFirebase() {
  if (isConfigured) return;

  try {
    const response = await base44.functions.invoke('GetFirebaseConfig', {});
    const config = response.data;

    if (config.apiKey && config.projectId) {
      app = initializeApp(config);
      firebaseAuth = getAuth(app);
      db = getFirestore(app);
      isConfigured = true;
    }
  } catch (err) {
    console.warn('[Firebase] Failed to fetch config from backend:', err?.message || err);
  }
}

export { app, firebaseAuth, db, isConfigured };
export default app;