// Recipient identity resolution — server-side.
// ───────────────────────────────────────────────────────────
// Resolves the authoritative delivery email for an Interactive identity
// from the users collection. The originally-entered email is the invitation
// /discovery key, NOT the permanent delivery address. Per locked decision,
// delivery email comes from the authoritative user record.

import { db } from '../shared';

export async function resolveDeliveryEmail(identityId: string): Promise<string | null> {
  const snap = await db.collection('users').doc(identityId).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return data.email || null;
}