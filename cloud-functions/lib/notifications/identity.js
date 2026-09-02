"use strict";
// Recipient identity resolution — server-side.
// ───────────────────────────────────────────────────────────
// Resolves the authoritative delivery email for an Interactive identity
// from the users collection. The originally-entered email is the invitation
// /discovery key, NOT the permanent delivery address. Per locked decision,
// delivery email comes from the authoritative user record.
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDeliveryEmail = resolveDeliveryEmail;
const shared_1 = require("../shared");
async function resolveDeliveryEmail(identityId) {
    const snap = await shared_1.db.collection('users').doc(identityId).get();
    if (!snap.exists)
        return null;
    const data = snap.data();
    return data.email || null;
}
//# sourceMappingURL=identity.js.map