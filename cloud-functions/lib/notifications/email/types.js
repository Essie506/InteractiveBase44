"use strict";
// Provider-neutral email interface.
// ───────────────────────────────────────────────────────────
// Domain code and the delivery worker depend only on these types. The
// concrete provider (Resend, SendGrid, SMTP, …) is selected by config in
// email/index.ts. Adding/swapping a provider = adding a case + a secret;
// no domain code changes.
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailError = void 0;
/** Classified email error. `retryable` drives the delivery state machine. */
class EmailError extends Error {
    constructor(message, code, retryable) {
        super(message);
        this.name = 'EmailError';
        this.code = code;
        this.retryable = retryable;
    }
}
exports.EmailError = EmailError;
//# sourceMappingURL=types.js.map