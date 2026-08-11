// Backend Configuration Selector
// ───────────────────────────────────────────────────────────
// Determines whether the application uses Firebase or Base44
// for authentication and domain data access.
//
// When VITE_FIREBASE_* environment variables are set (isConfigured
// === true), all services route to Firebase repositories and
// AuthContext uses Firebase Authentication.
//
// When not set, services fall back to Base44 — this preserves
// rollback capability (M3 §28) and prevents app breakage during
// the transition window.
//
// Cutover is activated by setting the VITE_FIREBASE_* env vars
// and running the data migration. Rollback is activated by
// unsetting them.

import { isConfigured } from '@/firebase/firebaseClient';

export const useFirebase = isConfigured;
export const useBase44 = !isConfigured;