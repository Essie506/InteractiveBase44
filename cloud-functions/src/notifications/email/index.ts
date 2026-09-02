// Email provider factory — provider-neutral selection.
// ───────────────────────────────────────────────────────────
// The configured provider is selected by the EMAIL_PROVIDER env var (a
// Firebase Functions v2 secret/config). Domain code calls getEmailProvider()
// and never knows which concrete provider is active. Adding a provider =
// adding a case here + a secret; no domain code changes.

import { EmailProvider } from './types';
import { ResendEmailProvider } from './resend';

export function getEmailProvider(): EmailProvider {
  const configured = process.env.EMAIL_PROVIDER || 'resend';
  switch (configured) {
    case 'resend':
      return new ResendEmailProvider(process.env.RESEND_API_KEY || '');
    default:
      throw new Error(`Unknown EMAIL_PROVIDER: ${configured}`);
  }
}

export { EmailProvider, EmailSendRequest, EmailSendResult, EmailError } from './types';