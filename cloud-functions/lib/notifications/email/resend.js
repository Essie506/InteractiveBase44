"use strict";
// Resend adapter — https://resend.com
// ───────────────────────────────────────────────────────────
// Uses the Resend REST API via fetch (no SDK dependency, so compilation and
// unit tests do not require a real API key or the resend package).
//
// The API key is bound via Firebase Functions v2 secret binding (RESEND_API_KEY)
// and is never exposed to frontend code. The deterministic delivery ID is
// passed as Resend's Idempotency-Key header so retried sends resolve to the
// original message instead of duplicating.
//
// No domain system imports this file directly — it is selected by
// email/index.ts behind the EmailProvider interface.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResendEmailProvider = void 0;
const types_1 = require("./types");
class ResendEmailProvider {
    constructor(apiKey, fromAddress) {
        this.name = 'resend';
        this.apiKey = apiKey || '';
        this.fromAddress = fromAddress || process.env.EMAIL_FROM_ADDRESS || 'Interactive <no-reply@interactive.app>';
    }
    async send(req) {
        if (!this.apiKey) {
            throw new types_1.EmailError('RESEND_API_KEY not configured', 'config_missing', false);
        }
        let res;
        try {
            res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': req.idempotencyKey,
                },
                body: JSON.stringify({
                    from: this.fromAddress,
                    to: [req.to],
                    subject: req.subject,
                    html: req.html,
                    text: req.text,
                    ...(req.metadata
                        ? { tags: Object.entries(req.metadata).map(([k, v]) => ({ name: k, value: String(v) })) }
                        : {}),
                }),
            });
        }
        catch (err) {
            throw new types_1.EmailError(`Network error: ${err?.message || err}`, 'network', true);
        }
        if (res.status === 429 || res.status >= 500) {
            const errText = await res.text().catch(() => '');
            throw new types_1.EmailError(`Resend transient ${res.status}: ${errText.slice(0, 200)}`, 'transient', true);
        }
        if (res.status === 422) {
            const errText = await res.text().catch(() => '');
            throw new types_1.EmailError(`Resend invalid request: ${errText.slice(0, 200)}`, 'invalid', false);
        }
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new types_1.EmailError(`Resend error ${res.status}: ${errText.slice(0, 200)}`, 'error', false);
        }
        const data = await res.json().catch(() => ({}));
        return { messageId: data.id || '' };
    }
}
exports.ResendEmailProvider = ResendEmailProvider;
//# sourceMappingURL=resend.js.map