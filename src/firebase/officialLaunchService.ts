/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User } from 'firebase/auth';
import { CloudSaveService, UserProfileDoc } from './cloudSaveService';
import { SavedGameState } from '../game/systems/SaveSystem';

export const PROJECT_OWNER_EMAIL = 'pikadotoo124@gmail.com';

export function isProjectOwnerEmail(email?: string | null): boolean {
  return (email || '').toLowerCase().trim() === PROJECT_OWNER_EMAIL;
}

export interface LaunchStatusResponse {
  ok: boolean;
  officialResetEpoch: string | null;
  officialResetExecutedAt: string | null;
  buildingCount: number;
}

export interface SharedWorldBackupPayload {
  backupVersion: number;
  exportedAt: string;
  projectId: string;
  roomName: string;
  officialResetEpoch: string | null;
  officialResetExecutedAt: string | null;
  buildingCount: number;
  uniqueOwnerCount: number;
  ownerSummary: Array<{ ownerId: string; ownerName: string; count: number }>;
  placedBuildings: any[];
}

export function resolveServerHttpBaseUrl(): string {
  const envWsUrl = (import.meta as any).env?.VITE_WS_URL;
  if (envWsUrl && typeof envWsUrl === 'string' && envWsUrl.trim()) {
    return envWsUrl
      .trim()
      .replace(/^wss:/i, 'https:')
      .replace(/^ws:/i, 'http:')
      .replace(/\/ws\/?$/i, '');
  }
  return '';
}

export async function fetchLaunchStatus(
  baseUrlOverride?: string,
  timeoutMs = 3500
): Promise<LaunchStatusResponse | null> {
  const base = baseUrlOverride !== undefined ? baseUrlOverride : resolveServerHttpBaseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/api/launch-status`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    return {
      ok: Boolean(data.ok),
      officialResetEpoch: typeof data.officialResetEpoch === 'string' ? data.officialResetEpoch : null,
      officialResetExecutedAt:
        typeof data.officialResetExecutedAt === 'string' ? data.officialResetExecutedAt : null,
      buildingCount: typeof data.buildingCount === 'number' ? data.buildingCount : 0,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function validateSharedWorldBackupObject(parsed: any): SharedWorldBackupPayload {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Backup JSON ဖိုင်ပုံစံ မမှန်ကန်ပါ (Object structure လိုအပ်သည်)။');
  }
  if (typeof parsed.backupVersion !== 'number' || !Number.isFinite(parsed.backupVersion)) {
    throw new Error('Backup ဖိုင်တွင် backupVersion မပါဝင်ပါ။');
  }
  if (typeof parsed.exportedAt !== 'string' || parsed.exportedAt.trim().length === 0) {
    throw new Error('Backup ဖိုင်တွင် export timestamp (exportedAt) မပါဝင်ပါ။');
  }
  if (typeof parsed.roomName !== 'string' || parsed.roomName.trim().length === 0) {
    throw new Error('Backup ဖိုင်တွင် room identifier (roomName) မပါဝင်ပါ။');
  }
  if (!Array.isArray(parsed.placedBuildings)) {
    throw new Error('Backup ဖိုင်ထဲတွင် placedBuildings စာရင်း မပါဝင်ပါ။');
  }
  if (
    typeof parsed.buildingCount !== 'number' ||
    !Number.isFinite(parsed.buildingCount) ||
    parsed.buildingCount !== parsed.placedBuildings.length
  ) {
    throw new Error(
      `Backup buildingCount (${parsed.buildingCount}) နှင့် placedBuildings အရေအတွက် (${parsed.placedBuildings.length}) မကိုက်ညီပါ။`
    );
  }

  for (let i = 0; i < parsed.placedBuildings.length; i++) {
    const b = parsed.placedBuildings[i];
    if (
      !b ||
      typeof b.id !== 'string' ||
      b.id.trim().length === 0 ||
      typeof b.type !== 'string' ||
      b.type.trim().length === 0 ||
      typeof b.tileX !== 'number' ||
      typeof b.tileY !== 'number' ||
      !Number.isFinite(b.tileX) ||
      !Number.isFinite(b.tileY) ||
      b.tileX < 0 ||
      b.tileX > 119 ||
      b.tileY < 0 ||
      b.tileY > 119
    ) {
      throw new Error(`Backup ဖိုင်ရှိ Building #${i + 1} အချက်အလက် မပြည့်စုံပါ။`);
    }
  }

  return parsed as SharedWorldBackupPayload;
}

export async function fetchSharedWorldBackup(
  idToken: string,
  baseUrlOverride?: string
): Promise<SharedWorldBackupPayload> {
  const base = baseUrlOverride !== undefined ? baseUrlOverride : resolveServerHttpBaseUrl();
  const res = await fetch(`${base}/api/admin/backup-world`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Shared world backup failed (${res.status})`);
  }
  return validateSharedWorldBackupObject(data);
}

export function triggerJsonFileDownload(filename: string, payload: unknown): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadSharedWorldBackup(
  idToken: string,
  baseUrlOverride?: string
): Promise<SharedWorldBackupPayload> {
  const backup = await fetchSharedWorldBackup(idToken, baseUrlOverride);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  triggerJsonFileDownload(`random-city-shared-world-backup-${stamp}.json`, backup);
  return backup;
}

export async function downloadPersonalSaveBackup(
  user: User,
  localFallbackState?: SavedGameState | null
): Promise<{ exportedAt: string; hasCloudProfile: boolean; hasCloudSave: boolean }> {
  const profile: UserProfileDoc | null = await CloudSaveService.loadUserProfile(user.uid);
  const cloudState: SavedGameState | null = profile
    ? await CloudSaveService.loadGameState(user.uid, profile)
    : null;

  const exportedAt = new Date().toISOString();
  const payload = {
    backupVersion: 1,
    scope: 'personal_firestore_account_backup',
    exportedAt,
    uid: user.uid,
    email: user.email || null,
    profile,
    gameState: cloudState || localFallbackState || null,
  };

  if (!payload.profile && !payload.gameState) {
    throw new Error('Owner ၏ Profile နှင့် Save Data များ မတွေ့ရှိပါ။');
  }

  const stamp = exportedAt.replace(/[:.]/g, '-').slice(0, 19);
  triggerJsonFileDownload(`random-city-owner-save-backup-${stamp}.json`, payload);
  return {
    exportedAt,
    hasCloudProfile: Boolean(profile),
    hasCloudSave: Boolean(cloudState),
  };
}

export function parseAndValidateSharedWorldBackup(jsonText: string): {
  placedBuildings: any[];
  buildingCount: number;
  exportedAt: string;
  roomName: string;
  backupVersion: number;
} {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('JSON ဖိုင်ပုံစံ မှားယွင်းနေပါသည်။');
  }

  const validated = validateSharedWorldBackupObject(parsed);
  return {
    placedBuildings: validated.placedBuildings,
    buildingCount: validated.buildingCount,
    exportedAt: validated.exportedAt,
    roomName: validated.roomName,
    backupVersion: validated.backupVersion,
  };
}

export async function restoreSharedWorldBackup(
  idToken: string,
  placedBuildings: any[],
  baseUrlOverride?: string
): Promise<{ ok: boolean; restoredCount: number }> {
  const base = baseUrlOverride !== undefined ? baseUrlOverride : resolveServerHttpBaseUrl();
  const res = await fetch(`${base}/api/admin/restore-world`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ placedBuildings }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Restore failed (${res.status})`);
  }
  return {
    ok: Boolean(data.ok),
    restoredCount: typeof data.restoredCount === 'number' ? data.restoredCount : placedBuildings.length,
  };
}

export async function triggerOneTimeOfficialReset(
  idToken: string,
  params: { confirmText: string; backupVerified: boolean; forceNewEpoch?: boolean },
  baseUrlOverride?: string
): Promise<{
  ok: boolean;
  alreadyReset: boolean;
  epoch: string;
  executedAt: string | null;
  clearedBuildingsCount: number;
}> {
  const base = baseUrlOverride !== undefined ? baseUrlOverride : resolveServerHttpBaseUrl();
  const res = await fetch(`${base}/api/admin/official-reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Official reset failed (${res.status})`);
  }

  return {
    ok: Boolean(data.ok),
    alreadyReset: Boolean(data.alreadyReset),
    epoch: data.epoch,
    executedAt: typeof data.executedAt === 'string' ? data.executedAt : null,
    clearedBuildingsCount:
      typeof data.clearedBuildingsCount === 'number' ? data.clearedBuildingsCount : 0,
  };
}
