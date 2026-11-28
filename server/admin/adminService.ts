/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActiveAnnouncement, PlayerPresenceState } from '../../src/game/multiplayer/types';
import { VerifiedTokenClaims } from '../auth/tokenVerifier';

export const PROJECT_OWNER_EMAIL = 'pikadotoo124@gmail.com';
export const MAX_KNOWN_PLAYERS = 250;
export const MAX_RECENT_ERRORS = 20;

export interface BannedUserRecord {
  uid: string;
  playerName?: string;
  reason: string;
  bannedAt: string;
  bannedBy: string;
}

export interface KnownPlayerRecord {
  uid: string;
  playerName: string;
  gender: 'male' | 'female';
  lastSeenAt: number;
  isOwner?: boolean;
}

export interface ServerErrorEntry {
  timestamp: string;
  source: string;
  message: string;
}

export interface AdminPlayerSummary {
  uid: string;
  playerName: string;
  gender: 'male' | 'female';
  online: boolean;
  isOwner: boolean;
  banned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  lastSeenAt: number;
  positionX?: number;
  positionY?: number;
}

export interface AdminOverviewResponse {
  ok: true;
  owner: {
    uid: string;
    email: string;
  };
  serverStatus: {
    health: 'healthy' | 'degraded';
    runtime: 'express-local' | 'cloudflare-do';
    roomName: string;
    connectionStatus: 'online';
    onlineCount: number;
    maxPlayers: number;
    startedAt: string;
    uptimeMs: number;
    recentErrorCount: number;
    recentErrors: ServerErrorEntry[];
  };
  players: AdminPlayerSummary[];
  bannedCount: number;
  activeAnnouncement: ActiveAnnouncement | null;
  officialResetEpoch: string | null;
  officialResetExecutedAt: string | null;
  buildingCount: number;
}

export interface SessionCheckResponse {
  ok: true;
  uid: string;
  banned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  announcement: ActiveAnnouncement | null;
  isOwner: boolean;
}

/**
 * Strictly verify that Firebase ID Token claims belong to the single Official Project Owner.
 * Never trusts client-provided roles, localStorage flags, or unverified emails.
 */
export function isVerifiedOwnerClaims(claims?: VerifiedTokenClaims | null): boolean {
  if (!claims || typeof claims.uid !== 'string' || claims.uid.trim().length === 0) {
    return false;
  }
  const email = typeof claims.email === 'string' ? claims.email.toLowerCase().trim() : '';
  return email === PROJECT_OWNER_EMAIL && claims.email_verified === true;
}

export function validateTargetUid(raw: unknown): { ok: true; uid: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Target player UID must be a non-empty string.' };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 128) {
    return { ok: false, error: 'Target player UID must be between 1 and 128 characters.' };
  }
  if (/[\s\r\n\t]/.test(trimmed)) {
    return { ok: false, error: 'Target player UID contains invalid whitespace characters.' };
  }
  return { ok: true, uid: trimmed };
}

export function sanitizeAdminReason(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 160);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function sanitizeOptionalName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 32);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function validateAnnouncementMessage(
  raw: unknown
): { ok: true; message: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Announcement message must be a string.' };
  }
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) {
    return { ok: false, error: 'Announcement message cannot be empty.' };
  }
  if (normalized.length > 280) {
    return { ok: false, error: 'Announcement message must be 280 characters or fewer.' };
  }
  return { ok: true, message: normalized };
}

export function recordServerError(
  errorLog: ServerErrorEntry[],
  source: string,
  rawMessage: unknown
): void {
  const safeMsg = String(rawMessage || 'Unknown server error')
    .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED]')
    .slice(0, 240);
  errorLog.push({
    timestamp: new Date().toISOString(),
    source: source.slice(0, 48),
    message: safeMsg,
  });
  if (errorLog.length > MAX_RECENT_ERRORS) {
    errorLog.splice(0, errorLog.length - MAX_RECENT_ERRORS);
  }
}

export function upsertKnownPlayerRecord(
  knownPlayers: Map<string, KnownPlayerRecord>,
  record: KnownPlayerRecord
): boolean {
  const prev = knownPlayers.get(record.uid);
  const changed =
    !prev ||
    prev.playerName !== record.playerName ||
    prev.gender !== record.gender ||
    Boolean(prev.isOwner) !== Boolean(record.isOwner) ||
    record.lastSeenAt - prev.lastSeenAt > 30000;

  knownPlayers.set(record.uid, {
    uid: record.uid,
    playerName: record.playerName,
    gender: record.gender,
    lastSeenAt: record.lastSeenAt,
    isOwner: Boolean(record.isOwner || prev?.isOwner),
  });

  if (knownPlayers.size > MAX_KNOWN_PLAYERS) {
    // Evict oldest inactive entries
    const entries = Array.from(knownPlayers.entries()).sort(
      (a, b) => a[1].lastSeenAt - b[1].lastSeenAt
    );
    const removeCount = knownPlayers.size - MAX_KNOWN_PLAYERS;
    for (let i = 0; i < removeCount; i++) {
      knownPlayers.delete(entries[i][0]);
    }
  }

  return changed;
}

export function buildAdminPlayersList(params: {
  onlinePlayers: Map<string, PlayerPresenceState>;
  knownPlayers: Map<string, KnownPlayerRecord>;
  bannedUsers: Map<string, BannedUserRecord>;
  ownerUid: string;
}): AdminPlayerSummary[] {
  const merged = new Map<string, AdminPlayerSummary>();

  for (const [uid, kp] of params.knownPlayers.entries()) {
    const ban = params.bannedUsers.get(uid);
    merged.set(uid, {
      uid,
      playerName: kp.playerName || 'Settler',
      gender: kp.gender === 'female' ? 'female' : 'male',
      online: false,
      isOwner: Boolean(kp.isOwner || uid === params.ownerUid),
      banned: Boolean(ban),
      banReason: ban?.reason || null,
      bannedAt: ban?.bannedAt || null,
      lastSeenAt: kp.lastSeenAt || 0,
    });
  }

  for (const [uid, ban] of params.bannedUsers.entries()) {
    if (!merged.has(uid)) {
      merged.set(uid, {
        uid,
        playerName: ban.playerName || 'Settler',
        gender: 'male',
        online: false,
        isOwner: uid === params.ownerUid,
        banned: true,
        banReason: ban.reason,
        bannedAt: ban.bannedAt,
        lastSeenAt: Date.parse(ban.bannedAt) || 0,
      });
    }
  }

  for (const [uid, online] of params.onlinePlayers.entries()) {
    const existing = merged.get(uid);
    const ban = params.bannedUsers.get(uid);
    merged.set(uid, {
      uid,
      playerName: online.playerName || existing?.playerName || 'Settler',
      gender: online.gender === 'female' ? 'female' : existing?.gender || 'male',
      online: true,
      isOwner: Boolean(existing?.isOwner || uid === params.ownerUid),
      banned: Boolean(ban),
      banReason: ban?.reason || null,
      bannedAt: ban?.bannedAt || null,
      lastSeenAt: online.lastUpdate || Date.now(),
      positionX: Math.round(online.positionX),
      positionY: Math.round(online.positionY),
    });
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    if (a.banned !== b.banned) return a.banned ? -1 : 1;
    return b.lastSeenAt - a.lastSeenAt;
  });
}

/**
 * In-memory sliding window rate limiter for Admin & Session endpoints.
 */
export class AdminRateLimiter {
  private buckets = new Map<string, number[]>();

  public check(
    key: string,
    maxRequests: number,
    windowMs = 60000
  ): { allowed: boolean; retryAfterSeconds: number; remaining: number } {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (this.buckets.get(key) || []).filter((ts) => ts > cutoff);

    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0];
      const retryAfterMs = Math.max(1000, windowMs - (now - oldest));
      this.buckets.set(key, timestamps);
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        remaining: 0,
      };
    }

    timestamps.push(now);
    this.buckets.set(key, timestamps);

    // Opportunistic cleanup to keep map bounded
    if (this.buckets.size > 500) {
      for (const [k, list] of this.buckets.entries()) {
        const active = list.filter((ts) => ts > cutoff);
        if (active.length === 0) {
          this.buckets.delete(k);
        } else {
          this.buckets.set(k, active);
        }
      }
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, maxRequests - timestamps.length),
    };
  }
}
