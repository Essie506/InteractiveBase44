// Hold expiry sweep (V2 §36) — scheduled Cloud Function.
// ───────────────────────────────────────────────────────────
// Releases expired slot holds deterministically so abandoned holds free
// time, not only on lazy access. Calendar determines whether time remains
// held; the sweep transitions active holds whose expires_at has passed to
// 'expired'. Runs every 5 minutes.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './shared';

export const sweepExpiredHolds = onSchedule(
  { region: 'europe-west2', schedule: 'every 5 minutes' },
  async () => {
    const now = new Date().toISOString();
    const snap = await db.collection('slotHolds')
      .where('status', '==', 'active')
      .where('expires_at', '<=', now)
      .get();
    let count = 0;
    for (const doc of snap.docs) {
      await doc.ref.update({ status: 'expired', _updated_date: now });
      count++;
    }
    if (count) console.log(`sweepExpiredHolds released ${count} expired holds`);
  },
);