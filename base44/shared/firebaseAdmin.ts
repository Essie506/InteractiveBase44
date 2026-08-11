// Shared Firebase Admin Helpers
// ───────────────────────────────────────────────────────────
// OAuth2 service-account token generation + Firestore REST API
// helpers. Used by the MigrateData and ValidateMigration backend
// functions to read/write Firestore with admin privileges (bypassing
// security rules) during the M3 data migration.
//
// Secrets required:
//   FIREBASE_SERVICE_ACCOUNT_JSON — full service account JSON key
//   FIREBASE_PROJECT_ID — Firebase project ID

// ── Base64url helpers ───────────────────────────────────────

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function pemToBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
    .replace(/-----END RSA PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ── OAuth2 Token Generation ────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON secret not set');

  const sa = JSON.parse(saJson);
  const projectId = process.env.FIREBASE_PROJECT_ID || sa.project_id;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const enc = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    enc.encode(signingInput)
  );

  const sigB64 = base64urlEncodeBytes(new Uint8Array(signatureBuffer));
  const jwt = `${signingInput}.${sigB64}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OAuth2 token exchange failed: ${errText}`);
  }

  const tokenData = await response.json();
  cachedToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in - 120) * 1000,
  };
  return cachedToken.token;
}

export function getProjectId(): string {
  const pid = process.env.FIREBASE_PROJECT_ID;
  if (pid) return pid;
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (saJson) {
    const sa = JSON.parse(saJson);
    return sa.project_id;
  }
  throw new Error('FIREBASE_PROJECT_ID not set');
}

// ── Firestore Field Conversion ──────────────────────────────

const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

export function toFirestoreValue(value: any): any {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === 'string') {
    if (ISO_DATETIME_PATTERN.test(value)) {
      const date = new Date(value);
      const seconds = Math.floor(date.getTime() / 1000);
      const nanos = (date.getTime() % 1000) * 1000000;
      return { timestampValue: { seconds: String(seconds), nanos } };
    }
    return { stringValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  return { stringValue: String(value) };
}

export function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      fields[key] = toFirestoreValue(value);
    }
  }
  return fields;
}

export function fromFirestoreValue(value: any): any {
  if (value.nullValue !== undefined) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return parseInt(value.integerValue, 10);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.timestampValue !== undefined) {
    if (typeof value.timestampValue === 'string') return value.timestampValue;
    if (value.timestampValue.seconds !== undefined) {
      return new Date(Number(value.timestampValue.seconds) * 1000).toISOString();
    }
    return value.timestampValue;
  }
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values || []).map(fromFirestoreValue);
  }
  if (value.mapValue !== undefined) {
    return fromFirestoreFields(value.mapValue.fields || {});
  }
  return null;
}

export function fromFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const obj: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    obj[key] = fromFirestoreValue(value);
  }
  return obj;
}

// ── Firestore REST API ─────────────────────────────────────

export function docPath(projectId: string, collection: string, docId: string): string {
  return `projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;
}

export async function firestoreBatchWrite(
  projectId: string,
  writes: Array<{ name: string; fields: Record<string, any> }>,
  token: string
): Promise<{ written: number; errors: string[] }> {
  const errors: string[] = [];
  const BATCH_SIZE = 450;

  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = writes.slice(i, i + BATCH_SIZE);
    const body = {
      writes: batch.map((w) => ({
        update: { name: w.name, fields: w.fields },
        // updateMask omitted → replaces all fields (idempotent)
      })),
    };

    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:batchWrite`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      errors.push(`Batch ${i / BATCH_SIZE}: ${errText.substring(0, 200)}`);
    }
  }

  return { written: writes.length, errors };
}

export async function firestoreListDocs(
  projectId: string,
  collection: string,
  token: string
): Promise<Array<{ id: string; data: Record<string, any> }>> {
  const results: Array<{ id: string; data: Record<string, any> }> = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`
    );
    url.searchParams.set('pageSize', '500');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firestore list failed for ${collection}: ${errText.substring(0, 200)}`);
    }

    const data = await response.json();
    if (data.documents) {
      for (const doc of data.documents) {
        const id = doc.name.split('/').pop();
        results.push({ id, data: fromFirestoreFields(doc.fields || {}) });
      }
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return results;
}

export async function firestoreCountDocs(
  projectId: string,
  collection: string,
  token: string
): Promise<number> {
  const docs = await firestoreListDocs(projectId, collection, token);
  return docs.length;
}