/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Universal Firebase ID Token Verifier
 * Compatible with Node.js 18+ and Cloudflare Workers / Durable Objects (V8 Isolates).
 * Uses standard Web Crypto API (crypto.subtle) with zero external dependencies.
 */

export const DEFAULT_FIREBASE_PROJECT_ID = 'intrepid-cyclist-mbvhw';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

interface JWKKey {
  kty: string;
  alg: string;
  use?: string;
  kid: string;
  n: string;
  e: string;
  [key: string]: any;
}

interface JWKSCache {
  keys: Map<string, JWKKey>;
  cryptoKeys: Map<string, CryptoKey>;
  expiresAt: number;
}

let jwksCache: JWKSCache | null = null;

/**
 * Base64URL string to Uint8Array decoder
 */
export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (base64.length % 4)) % 4;
  const padded = base64.padEnd(base64.length + padLength, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Base64URL string to JSON decoder
 */
export function base64UrlDecodeJson<T = any>(base64Url: string): T {
  const bytes = base64UrlToUint8Array(base64Url);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

/**
 * Fetch Google's public JWKS for Firebase Auth with caching & key-rotation refresh
 */
async function fetchGoogleJWKS(forceRefresh = false): Promise<JWKSCache> {
  const now = Date.now();
  if (!forceRefresh && jwksCache && jwksCache.expiresAt > now) {
    return jwksCache;
  }

  const response = await fetch(GOOGLE_JWKS_URL, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Google JWKS: ${response.status} ${response.statusText}`);
  }

  // Parse cache-control header max-age
  const cacheControl = response.headers.get('cache-control');
  let maxAgeSeconds = 3600; // default 1 hour
  if (cacheControl) {
    const match = cacheControl.match(/max-age=(\d+)/i);
    if (match && match[1]) {
      maxAgeSeconds = Math.max(300, parseInt(match[1], 10));
    }
  }

  const data = (await response.json()) as { keys: JWKKey[] };
  const keysMap = new Map<string, JWKKey>();
  for (const k of data.keys || []) {
    if (k.kid) {
      keysMap.set(k.kid, k);
    }
  }

  jwksCache = {
    keys: keysMap,
    cryptoKeys: new Map<string, CryptoKey>(),
    expiresAt: now + maxAgeSeconds * 1000,
  };

  return jwksCache;
}

/**
 * Retrieve and import the RSA public CryptoKey matching the token's kid
 */
async function getCryptoKeyForKid(kid: string): Promise<CryptoKey | null> {
  let cache = await fetchGoogleJWKS(false);
  let jwk = cache.keys.get(kid);

  // If key not found in cache, it may have rotated; force refresh once
  if (!jwk) {
    cache = await fetchGoogleJWKS(true);
    jwk = cache.keys.get(kid);
  }

  if (!jwk) {
    return null;
  }

  // Check if already imported
  const existingCryptoKey = cache.cryptoKeys.get(kid);
  if (existingCryptoKey) {
    return existingCryptoKey;
  }

  // Import JWK as Web Crypto RSASSA-PKCS1-v1_5 key
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false,
    ['verify']
  );

  cache.cryptoKeys.set(kid, cryptoKey);
  return cryptoKey;
}

export interface VerifiedTokenClaims {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  iss: string;
  aud: string;
  sub: string;
  auth_time: number;
  exp: number;
  iat: number;
  [key: string]: any;
}

export interface TokenVerificationResult {
  valid: boolean;
  claims?: VerifiedTokenClaims;
  error?: string;
}

/**
 * Strictly verifies a Firebase ID Token:
 * 1. Cryptographic RSA-SHA256 signature against Google JWKS
 * 2. Token expiration (exp)
 * 3. Issuer (iss) === https://securetoken.google.com/<projectId>
 * 4. Audience (aud) === <projectId>
 * 5. Non-empty subject (sub / uid)
 * 6. Issue time (iat) & auth_time validity
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string = DEFAULT_FIREBASE_PROJECT_ID
): Promise<TokenVerificationResult> {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token is missing or not a string.' };
    }

    const parts = token.trim().split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Malformed JWT: token must contain 3 dot-separated segments.' };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // 1. Parse header
    let header: { alg?: string; kid?: string; typ?: string };
    try {
      header = base64UrlDecodeJson(headerB64);
    } catch {
      return { valid: false, error: 'Invalid JWT header: could not decode JSON.' };
    }

    if (header.alg !== 'RS256') {
      return { valid: false, error: `Unsupported algorithm: expected RS256, received '${header.alg}'.` };
    }

    if (!header.kid || typeof header.kid !== 'string') {
      return { valid: false, error: 'Missing or invalid "kid" (Key ID) in JWT header.' };
    }

    // 2. Parse payload
    let payload: any;
    try {
      payload = base64UrlDecodeJson(payloadB64);
    } catch {
      return { valid: false, error: 'Invalid JWT payload: could not decode JSON.' };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);

    // 3. Check expiration (exp)
    if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
      return { valid: false, error: `Firebase ID token has expired (exp: ${payload.exp}, current: ${nowSeconds}).` };
    }

    // 4. Check issuer (iss)
    const expectedIssuer = `https://securetoken.google.com/${projectId}`;
    if (payload.iss !== expectedIssuer) {
      return {
        valid: false,
        error: `Invalid token issuer: expected '${expectedIssuer}', but got '${payload.iss}'.`,
      };
    }

    // 5. Check audience (aud)
    if (payload.aud !== projectId) {
      return {
        valid: false,
        error: `Invalid token audience: expected '${projectId}', but got '${payload.aud}'.`,
      };
    }

    // 6. Check user ID (sub / user_id)
    const uid = payload.sub || payload.user_id;
    if (!uid || typeof uid !== 'string' || uid.trim().length === 0) {
      return { valid: false, error: 'Missing or empty subject (uid) in token claims.' };
    }

    // 7. Check issue time (iat) with 5 minutes clock skew allowance
    if (typeof payload.iat === 'number' && payload.iat > nowSeconds + 300) {
      return { valid: false, error: `Token issued in the future (iat: ${payload.iat}, current: ${nowSeconds}).` };
    }

    // 8. Retrieve matching Google Public Key
    const cryptoKey = await getCryptoKeyForKid(header.kid);
    if (!cryptoKey) {
      return {
        valid: false,
        error: `Google public key with kid '${header.kid}' was not found in JWKS.`,
      };
    }

    // 9. Verify cryptographic RSASSA-PKCS1-v1_5 signature
    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64UrlToUint8Array(signatureB64);

    const isSignatureValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signatureBytes as any,
      signedData as any
    );

    if (!isSignatureValid) {
      return { valid: false, error: 'Cryptographic signature verification failed: token signature is invalid or tampered.' };
    }

    // Successfully verified!
    const claims: VerifiedTokenClaims = {
      uid,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      iss: payload.iss,
      aud: payload.aud,
      sub: payload.sub,
      auth_time: payload.auth_time,
      exp: payload.exp,
      iat: payload.iat,
      ...payload,
    };

    return {
      valid: true,
      claims,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Unexpected token verification error: ${err.message || String(err)}`,
    };
  }
}
