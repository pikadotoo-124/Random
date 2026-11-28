/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActiveAnnouncement } from '../game/multiplayer/types';
import { resolveServerHttpBaseUrl } from './officialLaunchService';

export interface SessionCheckResult {
  ok: boolean;
  uid: string;
  banned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  announcement: ActiveAnnouncement | null;
  isOwner: boolean;
}

export interface AdminPlayerItem {
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

export interface AdminServerErrorItem {
  timestamp: string;
  source: string;
  message: string;
}

export interface AdminOverviewData {
  ok: boolean;
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
    recentErrors: AdminServerErrorItem[];
  };
  players: AdminPlayerItem[];
  bannedCount: number;
  activeAnnouncement: ActiveAnnouncement | null;
  officialResetEpoch: string | null;
  officialResetExecutedAt: string | null;
  buildingCount: number;
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  if (data && typeof data.error === 'string' && data.error.trim()) {
    return data.error;
  }
  if (res.status === 401) return 'အကောင့် Token သက်တမ်းကုန်နေပါသည်။ ပြန်လည်စစ်ဆေးပါ။';
  if (res.status === 403) return 'Project Owner အကောင့်ဖြင့်သာ ဤလုပ်ဆောင်ချက်ကို အသုံးပြုနိုင်ပါသည်။';
  if (res.status === 429) return 'တောင်းဆိုမှု များပြားနေပါသည်။ ခဏစောင့်ပြီး ထပ်မံကြိုးစားပါ။';
  return `${fallback} (${res.status})`;
}

export async function fetchSessionCheck(
  idToken: string,
  baseUrlOverride?: string,
  timeoutMs = 3500
): Promise<SessionCheckResult | null> {
  const base = baseUrlOverride !== undefined ? baseUrlOverride : resolveServerHttpBaseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/api/session/check`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    return {
      ok: Boolean(data.ok),
      uid: typeof data.uid === 'string' ? data.uid : '',
      banned: Boolean(data.banned),
      banReason: typeof data.banReason === 'string' ? data.banReason : null,
      bannedAt: typeof data.bannedAt === 'string' ? data.bannedAt : null,
      announcement: data.announcement && typeof data.announcement === 'object' ? data.announcement : null,
      isOwner: Boolean(data.isOwner),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAdminOverview(
  idToken: string,
  baseUrlOverride?: string
): Promise<AdminOverviewData> {
  const base = baseUrlOverride !== undefined ? baseUrlOverride : resolveServerHttpBaseUrl();
  const res = await fetch(`${base}/api/admin/overview`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Admin overview fetch failed'));
  }
  return (await res.json()) as AdminOverviewData;
}

export async function kickPlayerByUid(
  idToken: string,
  uid: string,
  reason?: string,
  baseUrlOverride?: string
): Promise<{ ok: boolean; kicked: boolean; onlineCount: number }> {
  const base = baseUrlOverride !== undefined ? baseUrlOverride : resolveServerHttpBaseUrl();
  const res = await fetch(`${base}/api/admin/kick`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ uid, reason }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Kick player failed'));
  }
  return res.json();
}

export async function banPlayerByUid(
  idToken: string,
  uid: string,
  reason?: string,
  playerName?: string,
  baseUrlOverride?: string
): Promise<{ ok: boolean; disconnectedOnline: boolean; onlineCount: number }> {
  const base = baseUrlOverride !== undefined ? baseUrlOverride : resolveServerHttpBaseUrl();
  const res = await fetch(`${base}/api/admin/ban`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ uid, reason, playerName }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Ban player failed'));
  }
  return res.json();
}

export async function unbanPlayerByUid(
  idToken: string,
  uid: string,
  baseUrlOverride?: string
): Promise<{ ok: boolean; unbanned: boolean }> {
  const base = baseUrlOverride !== undefined ? baseUrlOverride : resolveServerHttpBaseUrl();
  const res = await fetch(`${base}/api/admin/unban`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ uid }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Unban player failed'));
  }
  return res.json();
}

export async function publishGameAnnouncement(
  idToken: string,
  message: string,
  baseUrlOverride?: string
): Promise<{ ok: boolean; announcement: ActiveAnnouncement }> {
  const base = baseUrlOverride !== undefined ? baseUrlOverride : resolveServerHttpBaseUrl();
  const res = await fetch(`${base}/api/admin/announcement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Announcement broadcast failed'));
  }
  return res.json();
}

export async function clearGameAnnouncement(
  idToken: string,
  baseUrlOverride?: string
): Promise<{ ok: boolean; announcement: null }> {
  const base = baseUrlOverride !== undefined ? baseUrlOverride : resolveServerHttpBaseUrl();
  const res = await fetch(`${base}/api/admin/announcement/clear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Clear announcement failed'));
  }
  return res.json();
}
