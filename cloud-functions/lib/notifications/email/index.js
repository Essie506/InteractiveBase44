"use strict";
// Email provider factory — provider-neutral selection.
// ───────────────────────────────────────────────────────────
// The configured provider is selected by the EMAIL_PROVIDER env var (a
// Firebase Functions v2 secret/config). Domain code calls getEmailProvider()
// and never knows which concrete provider is active. Adding a provider =
// adding a case here + a secret; no domain code changes.
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailError = void 0;
exports.getEmailProvider = getEmailProvider;
const resend_1 = require("./resend");
function getEmailProvider() {
    const configured = process.env.EMAIL_PROVIDER || 'resend';
    switch (configured) {
        case 'resend':
            return new resend_1.ResendEmailProvider(process.env.RESEND_API_KEY || '');
        default:
            throw new Error(`Unknown EMAIL_PROVIDER: ${configured}`);
    }
}
var types_1 = require("./types");
Object.defineProperty(exports, "EmailError", { enumerable: true, get: function () { return types_1.EmailError; } });
//# sourceMappingURL=index.js.map