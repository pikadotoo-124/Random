/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import firebaseAppletConfig from '../../firebase-applet-config.json';

export interface ServiceAccountCredentials {
  projectId: string;
  databaseId: string;
  clientEmail: string;
  privateKeyPem: string;
  privateKeyId?: string;
  tokenUri: string;
}

interface CachedAccessToken {
  accessToken: string;
  expiresAtMs: number;
}

const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

const tokenCache = new Map<string, CachedAccessToken>();
const inFlightTokenRequests = new Map<string, Promise<string>>();

function readEnvValue(
  key: string,
  env?: Record<string, string | undefined>
): string | undefined {
  const fromEnv = env?.[key];
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  if (typeof process !== 'undefined' && process.env && typeof process.env[key] === 'string') {
    const val = process.env[key]!.trim();
    if (val.length > 0) return val;
  }
  return undefined;
}

function normalizePrivateKeyPem(raw: string): string {
  return raw.replace(/\\n/g, '\n').trim();
}

function isValidPrivateKeyPem(pem: string): boolean {
  return (
    pem.includes('-----BEGIN PRIVATE KEY-----') &&
    pem.includes('-----END PRIVATE KEY-----')
  );
}

/**
 * Resolves Firebase Service Account credentials from runtime environment
 * (`FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`).
 * Returns null if credentials are not configured — never fabricates or falls back to dummy keys.
 */
export function resolveServiceAccountCredentials(
  env?: Record<string, string | undefined>
): ServiceAccountCredentials | null {
  const defaultProjectId =
    readEnvValue('FIREBASE_PROJECT_ID', env) ||
    firebaseAppletConfig.projectId ||
    'intrepid-cyclist-mbvhw';
  const defaultDatabaseId =
    readEnvValue('FIREBASE_DATABASE_ID', env) ||
    firebaseAppletConfig.firestoreDatabaseId ||
    '(default)';

  const rawJson = readEnvValue('FIREBASE_SERVICE_ACCOUNT_JSON', env);
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as Record<string, unknown>;
      const clientEmail =
        typeof parsed.client_email === 'string' ? parsed.client_email.trim() : '';
      const privateKey =
        typeof parsed.private_key === 'string'
          ? normalizePrivateKeyPem(parsed.private_key)
          : '';
      if (!clientEmail || !isValidPrivateKeyPem(privateKey)) {
        return null;
      }
      const tokenUriRaw =
        typeof parsed.token_uri === 'string' && parsed.token_uri.startsWith('https://')
          ? parsed.token_uri.trim()
          : DEFAULT_TOKEN_URI;
      const projectId =
        typeof parsed.project_id === 'string' && parsed.project_id.trim()
          ? parsed.project_id.trim()
          : defaultProjectId;
      const privateKeyId =
        typeof parsed.private_key_id === 'string' && parsed.private_key_id.trim()
          ? parsed.private_key_id.trim()
          : undefined;
      return {
        projectId,
        databaseId: defaultDatabaseId,
        clientEmail,
        privateKeyPem: privateKey,
        privateKeyId,
        tokenUri: tokenUriRaw,
      };
    } catch {
      return null;
    }
  }

  const clientEmail = readEnvValue('FIREBASE_CLIENT_EMAIL', env);
  const privateKeyRaw = readEnvValue('FIREBASE_PRIVATE_KEY', env);
  if (!clientEmail || !privateKeyRaw) {
    return null;
  }

  const privateKeyPem = normalizePrivateKeyPem(privateKeyRaw);
  if (!isValidPrivateKeyPem(privateKeyPem)) {
    return null;
  }

  const tokenUriRaw = readEnvValue('FIREBASE_TOKEN_URI', env);
  const tokenUri =
    tokenUriRaw && tokenUriRaw.startsWith('https://') ? tokenUriRaw : DEFAULT_TOKEN_URI;
  const privateKeyId = readEnvValue('FIREBASE_PRIVATE_KEY_ID', env);

  return {
    projectId: defaultProjectId,
    databaseId: defaultDatabaseId,
    clientEmail,
    privateKeyPem,
    privateKeyId,
    tokenUri,
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function stringToBase64Url(input: string): string {
  return bytesToBase64Url(new TextEncoder().encode(input));
}

function pkcs8PemToBytes(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/[\r\n\s]+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Mints a signed RS256 OAuth2 JWT assertion using Web Crypto (`crypto.subtle`)
 * so the exact same code runs in both Cloudflare Workers and Node.js 18+.
 */
export async function createServiceAccountJwtAssertion(
  creds: ServiceAccountCredentials,
  nowSec = Math.floor(Date.now() / 1000)
): Promise<string> {
  const header: Record<string, string> = {
    alg: 'RS256',
    typ: 'JWT',
  };
  if (creds.privateKeyId) {
    header.kid = creds.privateKeyId;
  }

  const claims = {
    iss: creds.clientEmail,
    sub: creds.clientEmail,
    aud: creds.tokenUri,
    scope: DATASTORE_SCOPE,
    iat: nowSec,
    exp: nowSec + 3600,
  };

  const signingInput = `${stringToBase64Url(JSON.stringify(header))}.${stringToBase64Url(
    JSON.stringify(claims)
  )}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8PemToBytes(creds.privateKeyPem),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/**
 * Obtains a short-lived Google OAuth2 access token (`https://www.googleapis.com/auth/datastore`)
 * with in-memory caching and concurrent request deduplication.
 */
export async function getGoogleAccessToken(
  creds: ServiceAccountCredentials,
  options?: {
    fetchImpl?: typeof fetch;
    bypassCache?: boolean;
  }
): Promise<string> {
  const cacheKey = `${creds.projectId}|${creds.clientEmail}|${creds.tokenUri}`;
  const nowMs = Date.now();

  if (!options?.bypassCache) {
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAtMs - 60_000 > nowMs) {
      return cached.accessToken;
    }

    const existingPromise = inFlightTokenRequests.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }
  }

  const fetchFn = options?.fetchImpl || fetch;

  const task = (async () => {
    const assertion = await createServiceAccountJwtAssertion(creds);
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString();

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 5000) : null;

    try {
      const res = await fetchFn(creds.tokenUri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        ...(controller ? { signal: controller.signal } : {}),
      });

      const payload = (await res.json().catch(() => null)) as {
        access_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      } | null;

      if (!res.ok || !payload?.access_token) {
        const msg =
          payload?.error_description ||
          payload?.error ||
          `OAuth token exchange failed with status ${res.status}`;
        throw new Error(msg);
      }

      const expiresInSec =
        typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
          ? Math.max(120, Math.min(3600, payload.expires_in))
          : 3600;

      if (!options?.bypassCache) {
        tokenCache.set(cacheKey, {
          accessToken: payload.access_token,
          expiresAtMs: Date.now() + expiresInSec * 1000,
        });
      }

      return payload.access_token;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  })();

  if (!options?.bypassCache) {
    inFlightTokenRequests.set(cacheKey, task);
  }

  try {
    return await task;
  } finally {
    inFlightTokenRequests.delete(cacheKey);
  }
}

export function clearServiceAccountTokenCacheForTest(): void {
  tokenCache.clear();
  inFlightTokenRequests.clear();
}
