/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PROJECT_OWNER_EMAIL } from '../admin/adminService';

export type AppEnvironment = 'production' | 'staging';

export interface StagingAccessResult {
  allowed: boolean;
  isStaging: boolean;
  statusCode: number;
  code?:
    | 'STAGING_OWNER_BLOCKED'
    | 'STAGING_TEST_ACCOUNT_REQUIRED'
    | 'STAGING_ACCOUNT_NOT_ALLOWED';
  error?: string;
}

/**
 * Resolves runtime environment (`staging` vs `production`).
 * Defaults strictly to `production` when unset so live production behavior is never altered.
 */
export function resolveAppEnvironment(
  env?: Record<string, unknown> | null
): AppEnvironment {
  const raw =
    typeof env?.APP_ENV === 'string'
      ? env.APP_ENV
      : typeof process !== 'undefined' && typeof process.env?.APP_ENV === 'string'
      ? process.env.APP_ENV
      : '';
  return raw.trim().toLowerCase() === 'staging' ? 'staging' : 'production';
}

export function parseAllowlistCsv(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const cleaned = part.trim();
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out;
}

/**
 * Enforces strict Test Account Isolation when `APP_ENV === 'staging'`.
 * - In `production`: always allows verified Firebase users (zero impact on Owner/friends).
 * - In `staging`:
 *   1. Hard-blocks Production Owner (`pikadotoo124@gmail.com`) at all times.
 *   2. Fail-closed if neither `STAGING_ALLOWED_TEST_UIDS` nor `STAGING_ALLOWED_TEST_EMAILS` is configured.
 *   3. Permits ONLY UIDs in `STAGING_ALLOWED_TEST_UIDS` or verified emails (`email_verified === true`)
 *      in `STAGING_ALLOWED_TEST_EMAILS`.
 */
export function checkStagingAccess(params: {
  env?: Record<string, unknown> | null;
  uid: string | null | undefined;
  email?: string | null;
  emailVerified?: boolean;
}): StagingAccessResult {
  const appEnv = resolveAppEnvironment(params.env);
  if (appEnv !== 'staging') {
    return {
      allowed: true,
      isStaging: false,
      statusCode: 200,
    };
  }

  const uid = typeof params.uid === 'string' ? params.uid.trim() : '';
  const normalizedEmail =
    typeof params.email === 'string' ? params.email.toLowerCase().trim() : '';

  if (normalizedEmail === PROJECT_OWNER_EMAIL) {
    return {
      allowed: false,
      isStaging: true,
      statusCode: 403,
      code: 'STAGING_OWNER_BLOCKED',
      error:
        'Staging environment blocks the Production Owner account to protect live player data. Sign in with an isolated Test Gmail account.',
    };
  }

  const rawAllowedUids =
    typeof params.env?.STAGING_ALLOWED_TEST_UIDS === 'string'
      ? params.env.STAGING_ALLOWED_TEST_UIDS
      : typeof process !== 'undefined' && typeof process.env?.STAGING_ALLOWED_TEST_UIDS === 'string'
      ? process.env.STAGING_ALLOWED_TEST_UIDS
      : '';

  const rawAllowedEmails =
    typeof params.env?.STAGING_ALLOWED_TEST_EMAILS === 'string'
      ? params.env.STAGING_ALLOWED_TEST_EMAILS
      : typeof process !== 'undefined' && typeof process.env?.STAGING_ALLOWED_TEST_EMAILS === 'string'
      ? process.env.STAGING_ALLOWED_TEST_EMAILS
      : '';

  const allowedUids = new Set(parseAllowlistCsv(rawAllowedUids));
  const allowedEmails = new Set(
    parseAllowlistCsv(rawAllowedEmails).map((e) => e.toLowerCase())
  );

  // Never allow Owner email even if someone accidentally put it into STAGING_ALLOWED_TEST_EMAILS
  allowedEmails.delete(PROJECT_OWNER_EMAIL);

  if (allowedUids.size === 0 && allowedEmails.size === 0) {
    return {
      allowed: false,
      isStaging: true,
      statusCode: 403,
      code: 'STAGING_TEST_ACCOUNT_REQUIRED',
      error:
        'Staging test account allowlist is empty. Configure STAGING_ALLOWED_TEST_UIDS or STAGING_ALLOWED_TEST_EMAILS before testing.',
    };
  }

  if (uid && allowedUids.has(uid)) {
    return {
      allowed: true,
      isStaging: true,
      statusCode: 200,
    };
  }

  if (params.emailVerified === true && normalizedEmail && allowedEmails.has(normalizedEmail)) {
    return {
      allowed: true,
      isStaging: true,
      statusCode: 200,
    };
  }

  return {
    allowed: false,
    isStaging: true,
    statusCode: 403,
    code: 'STAGING_ACCOUNT_NOT_ALLOWED',
    error:
      'Access denied in Staging: only approved Test Accounts are permitted so live player data stays isolated.',
  };
}
