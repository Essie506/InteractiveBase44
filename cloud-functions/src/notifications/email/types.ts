// Provider-neutral email interface.
// ───────────────────────────────────────────────────────────
// Domain code and the delivery worker depend only on these types. The
// concrete provider (Resend, SendGrid, SMTP, …) is selected by config in
// email/index.ts. Adding/swapping a provider = adding a case + a secret;
// no domain code changes.

export interface EmailSendRequest {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Deterministic key (== delivery doc id) passed to the provider so
   * retried sends resolve to the original message instead of duplicating. */
  idempotencyKey: string;
  metadata?: Record<string, string>;
  fromName?: string;
}

export interface EmailSendResult {
  messageId: string;
}

export interface EmailProvider {
  readonly name: string;
  send(req: EmailSendRequest): Promise<EmailSendResult>;
}

/** Classified email error. `retryable` drives the delivery state machine. */
export class EmailError extends Error {
  code: string;
  retryable: boolean;
  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.name = 'EmailError';
    this.code = code;
    this.retryable = retryable;
  }
}