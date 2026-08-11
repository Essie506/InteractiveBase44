// Backend Configuration Selector
// ───────────────────────────────────────────────────────────
// Determines whether the application uses Firebase or Base44
// for authentication and domain data access.
//
// When Firebase is configured (either via VITE_FIREBASE_* env vars
// or via the GetFirebaseConfig backend function), all services
// route to Firebase repositories and AuthContext uses Firebase
// Authentication.
//
// When not configured, services fall back to Base44 — this preserves
// rollback capability (M3 §28) and prevents app breakage during
// the transition window.
//
// useFirebase is a LIVE BINDING to isConfigured in firebaseClient.js.
// It starts as false in Base44 Preview and flips to true after
// initFirebase() completes (called from main.jsx before the app
// renders). All consumers that check useFirebase at runtime see the
// updated value.

import { isConfigured } from '@/firebase/firebaseClient';

// Re-export as a live binding — consumers read the current value
// at the time of their check, not at import time.
export { isConfigured as useFirebase };
export const useBase44 = !isConfigured;