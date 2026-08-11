/**
 * Firebase Initialisation Module
 * ───────────────────────────────────────────────────────────
 * Single shared Firebase application instance for the entire app.
 * Reads configuration from Vite environment variables.
 *
 * No page or component should import this directly — only the
 * repository adapters in src/data/firebase/ import it.
 *
 * M1 status: preparation only. Base44 remains the active backend.
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

const isConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

if (!isConfigured) {
  console.warn(
    '[Firebase] Missing VITE_FIREBASE_* env vars — Firebase adapters inactive until configured. ' +
    'See .env.example for the required variables.'
  );
}

const app = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(app);
const db = getFirestore(app);

export { app, firebaseAuth, db, isConfigured };
export default app;