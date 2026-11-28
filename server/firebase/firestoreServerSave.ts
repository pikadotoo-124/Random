/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import firebaseAppletConfig from '../../firebase-applet-config.json';
import { ClothingSystem } from '../../src/game/systems/ClothingSystem';
import { normalizeFenceRotation } from '../../src/game/systems/FenceTopology';
import { getAuthoritativeFootprint } from '../../src/game/systems/LandOwnershipSystem';
import {
  BuildingType,
  EquippedClothingState,
  FacingDirection,
  FarmPlotOwnersMap,
  InventorySlot,
  PlacedBuilding,
  PlayerStats,
  PlayerWorldChanges,
} from '../../src/game/types';
import { normalizeInventorySlots, normalizeOwnedClothingList, normalizeStorageSlots } from '../economy/inventoryAuthority';
import {
  getGoogleAccessToken,
  resolveServiceAccountCredentials,
  ServiceAccountCredentials,
} from './serviceAccountAuth';

const VALID_BUILDING_TYPES = new Set<BuildingType>([
  'house_small',
  'house_medium',
  'house_large',
  'fence_wood',
  'campfire',
  'storage_box',
  'lantern',
  'decor_bench',
  'decor_flower_pot',
  'decor_flowerbed',
  'decor_flower_stand',
]);

const VALID_TOOLS = new Set<string>([
  'axe_basic',
  'pickaxe_basic',
  'scythe_basic',
  'rod_basic',
]);

export const MAX_PLAYER_SAVE_BYTES = 512 * 1024;

export interface AuthoritativeEconomySnapshot {
  gold: number;
  inventorySlots: InventorySlot[];
  ownedClothing: string[];
}

export interface SanitizedPlayerSavePayload {
  saveId?: string;
  clientTimestamp?: number;
  positionX: number;
  positionY: number;
  currentZone: string;
  gender: 'male' | 'female';
  playerName: string;
  equipment: {
    currentTool: string | null;
    facingDirection: FacingDirection;
    equippedClothing: EquippedClothingState;
  };
  playerStats: PlayerStats;
  placedBuildings: PlacedBuilding[];
  storageBoxes: Array<{
    id: string;
    tileX: number;
    tileY: number;
    storage: InventorySlot[];
  }>;
  playerWorldChanges: PlayerWorldChanges;
  strippedClientEconomyFields: string[];
}

export interface FirestorePlayerSaveDocs {
  playerState: {
    positionX: number;
    positionY: number;
    currentZone: string;
    gold: number;
    inventory: { item: string; quantity: number }[];
    equipment: {
      currentTool: string | null;
      facingDirection: FacingDirection;
      ownedClothing: string[];
      equippedClothing: EquippedClothingState;
    };
    playerStats: PlayerStats;
    lastSavedAt: string;
  };
  worldState: {
    placedBuildings: PlacedBuilding[];
    storageBoxes: Array<{
      id: string;
      tileX: number;
      tileY: number;
      storage: { item: string; quantity: number }[];
    }>;
    playerWorldChanges: PlayerWorldChanges;
    lastSavedAt: string;
  };
}

export interface FirestoreSaveWriterResult {
  ok: boolean;
  lastSavedAt: string;
  statusCode?: number;
  code?: string;
  error?: string;
}

export type FirestoreSaveCommitFn = (params: {
  uid: string;
  docs: FirestorePlayerSaveDocs;
  projectId: string;
  databaseId: string;
}) => Promise<FirestoreSaveWriterResult>;

/**
 * Builds origin-restricted CORS headers for authenticated save endpoints
 * (never uses wildcard `Access-Control-Allow-Origin: *` on authenticated routes).
 */
export function buildAuthenticatedSaveCorsHeaders(
  requestOrigin?: string | null,
  requestUrlOrigin?: string | null
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
  };

  if (!requestOrigin) {
    return headers;
  }

  let parsedOrigin: URL | null = null;
  try {
    parsedOrigin = new URL(requestOrigin);
  } catch {
    return headers;
  }

  const host = parsedOrigin.hostname.toLowerCase();
  const isSameOrigin = Boolean(requestUrlOrigin && requestOrigin === requestUrlOrigin);
  const isLocalDev =
    parsedOrigin.protocol === 'http:' &&
    (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0');
  const isTrustedHttpsOrigin =
    parsedOrigin.protocol === 'https:' &&
    (host.endsWith('.run.app') ||
      host.endsWith('.aistudio.google.com') ||
      host.endsWith('.workers.dev') ||
      host.endsWith('.pages.dev') ||
      host.endsWith('.web.app') ||
      host.endsWith('.firebaseapp.com') ||
      host === 'localhost');

  if (isSameOrigin || isLocalDev || isTrustedHttpsOrigin) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
    headers['Vary'] = 'Origin';
  }

  return headers;
}

function clampCoord(val: unknown, fallback = 30): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(0, Math.min(119, Math.round(val * 100) / 100));
}

function clampStat(val: unknown, fallback: number, max = 100_000_000): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(0, Math.min(max, Math.round(val)));
}

function normalizeDirection(dir: unknown): FacingDirection {
  return dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right' ? dir : 'down';
}

export type ClientSaveValidationResult =
  | {
      ok: true;
      sanitized: SanitizedPlayerSavePayload;
    }
  | {
      ok: false;
      status: number;
      code: string;
      error: string;
    };

/**
 * Strictly validates and allowlists client payload for `POST /api/player/save`.
 * Rejects UID tampering and strips all client-supplied economy fields (`gold`, `inventory`, `ownedClothing`).
 */
export function validateAndSanitizeClientSaveBody(params: {
  rawBody: unknown;
  verifiedUid: string;
  authoritativeEconomy: AuthoritativeEconomySnapshot;
  farmPlotOwners: FarmPlotOwnersMap;
  serverPlacedBuildings?: PlacedBuilding[];
  fallbackPlayerName?: string;
}): ClientSaveValidationResult {
  const { rawBody, verifiedUid, authoritativeEconomy, farmPlotOwners, serverPlacedBuildings } = params;

  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PAYLOAD',
      error: 'Save payload must be a JSON object.',
    };
  }

  const body = rawBody as Record<string, unknown>;

  // Reject explicit UID spoofing attempts
  const claimedUid =
    typeof body.uid === 'string' && body.uid.trim()
      ? body.uid.trim()
      : typeof body.playerId === 'string' && body.playerId.trim()
      ? body.playerId.trim()
      : null;
  if (claimedUid && claimedUid !== verifiedUid) {
    return {
      ok: false,
      status: 403,
      code: 'UID_MISMATCH',
      error: 'Forbidden: Payload UID does not match authenticated player.',
    };
  }

  const strippedClientEconomyFields: string[] = [];
  if ('gold' in body) strippedClientEconomyFields.push('gold');
  if ('coins' in body) strippedClientEconomyFields.push('coins');
  if ('inventory' in body) strippedClientEconomyFields.push('inventory');
  if ('slots' in body) strippedClientEconomyFields.push('slots');
  if ('ownedClothing' in body) strippedClientEconomyFields.push('ownedClothing');
  if (
    body.equipment &&
    typeof body.equipment === 'object' &&
    'ownedClothing' in (body.equipment as Record<string, unknown>)
  ) {
    strippedClientEconomyFields.push('equipment.ownedClothing');
  }

  const saveId =
    typeof body.saveId === 'string' && body.saveId.trim().length > 0
      ? body.saveId.trim().slice(0, 80)
      : undefined;

  let clientTimestamp: number | undefined;
  if (body.clientTimestamp !== undefined) {
    if (
      typeof body.clientTimestamp !== 'number' ||
      !Number.isFinite(body.clientTimestamp) ||
      body.clientTimestamp <= 0
    ) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_TIMESTAMP',
        error: 'Invalid clientTimestamp.',
      };
    }
    clientTimestamp = Math.floor(body.clientTimestamp);
  }

  const gender: 'male' | 'female' = body.gender === 'female' ? 'female' : 'male';
  const rawName =
    typeof body.playerName === 'string' && body.playerName.trim()
      ? body.playerName.trim().slice(0, 16)
      : params.fallbackPlayerName || 'Settler';

  const positionX = clampCoord(body.positionX, 30);
  const positionY = clampCoord(body.positionY, 30);
  const currentZone =
    typeof body.currentZone === 'string' && body.currentZone.trim()
      ? body.currentZone.trim().slice(0, 128)
      : 'Central Plaza (Main City)';

  const eqRaw =
    body.equipment && typeof body.equipment === 'object' && !Array.isArray(body.equipment)
      ? (body.equipment as Record<string, unknown>)
      : {};

  const currentTool =
    eqRaw.currentTool === null
      ? null
      : typeof eqRaw.currentTool === 'string' && VALID_TOOLS.has(eqRaw.currentTool.trim())
      ? eqRaw.currentTool.trim()
      : 'axe_basic';

  const facingDirection = normalizeDirection(eqRaw.facingDirection);
  const equippedClothing = ClothingSystem.normalizeEquippedClothing(
    eqRaw.equippedClothing as EquippedClothingState | undefined,
    authoritativeEconomy.ownedClothing,
    gender
  );

  const statsRaw =
    body.playerStats && typeof body.playerStats === 'object' && !Array.isArray(body.playerStats)
      ? (body.playerStats as Record<string, unknown>)
      : {};

  const playerStats: PlayerStats = {
    health: clampStat(statsRaw.health, 100, 100),
    stamina: clampStat(statsRaw.stamina, 100, 100),
    totalGathered: clampStat(statsRaw.totalGathered, 0),
    totalCrafted: clampStat(statsRaw.totalCrafted, 0),
    totalBuilt: clampStat(statsRaw.totalBuilt, 0),
    totalSoldGold: clampStat(statsRaw.totalSoldGold, 0),
  };

  // Authoritative server chest map (if shared server holds this chest, never accept client-tampered chest contents)
  const serverStorageMap = new Map<string, InventorySlot[]>();
  if (Array.isArray(serverPlacedBuildings)) {
    for (const sb of serverPlacedBuildings) {
      if (sb && sb.type === 'storage_box' && sb.ownerId === verifiedUid) {
        serverStorageMap.set(sb.id, normalizeStorageSlots(sb.storage || []));
      }
    }
  }

  const rawBuildings = Array.isArray(body.placedBuildings) ? body.placedBuildings.slice(0, 500) : [];
  const placedBuildings: PlacedBuilding[] = [];
  for (const item of rawBuildings) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const b = item as Record<string, unknown>;
    const id = typeof b.id === 'string' ? b.id.trim().slice(0, 128) : '';
    const type = typeof b.type === 'string' ? (b.type.trim() as BuildingType) : null;
    if (!id || !type || !VALID_BUILDING_TYPES.has(type)) continue;
    if (
      typeof b.tileX !== 'number' ||
      typeof b.tileY !== 'number' ||
      !Number.isFinite(b.tileX) ||
      !Number.isFinite(b.tileY)
    ) {
      continue;
    }

    const tileX = Math.max(0, Math.min(119, Math.round(b.tileX)));
    const tileY = Math.max(0, Math.min(119, Math.round(b.tileY)));
    const fp = getAuthoritativeFootprint(type);
    const createdAt =
      typeof b.createdAt === 'number' && Number.isFinite(b.createdAt) && b.createdAt > 0
        ? Math.floor(b.createdAt)
        : Date.now();

    const serverStorage = serverStorageMap.get(id);
    const storage =
      type === 'storage_box'
        ? serverStorage ?? normalizeStorageSlots(b.storage || [])
        : [];

    placedBuildings.push({
      id,
      type,
      tileX,
      tileY,
      width: fp.width,
      height: fp.height,
      rotation:
        type === 'fence_wood'
          ? normalizeFenceRotation(typeof b.rotation === 'number' ? b.rotation : undefined)
          : 0,
      ownerId: verifiedUid,
      placedBy:
        typeof b.placedBy === 'string' && b.placedBy.trim()
          ? b.placedBy.trim().slice(0, 24)
          : rawName,
      createdAt,
      storage,
    });
  }

  const storageBoxes = placedBuildings
    .filter((b) => b.type === 'storage_box')
    .slice(0, 200)
    .map((b) => ({
      id: b.id,
      tileX: b.tileX,
      tileY: b.tileY,
      storage: (b.storage || []).map((s) => ({ item: s.item, quantity: s.quantity })),
    }));

  const wcRaw =
    body.playerWorldChanges &&
    typeof body.playerWorldChanges === 'object' &&
    !Array.isArray(body.playerWorldChanges)
      ? (body.playerWorldChanges as Record<string, unknown>)
      : {};

  const discoveredZones = Array.isArray(wcRaw.discoveredZones)
    ? Array.from(
        new Set(
          wcRaw.discoveredZones
            .filter((z): z is string => typeof z === 'string' && z.trim().length > 0)
            .map((z) => z.trim().slice(0, 128))
        )
      ).slice(0, 50)
    : ['Central Plaza (Main City)'];
  if (discoveredZones.length === 0) {
    discoveredZones.push('Central Plaza (Main City)');
  }

  const resetEpoch =
    typeof wcRaw.resetEpoch === 'string' && wcRaw.resetEpoch.trim().length > 0
      ? wcRaw.resetEpoch.trim().slice(0, 64)
      : undefined;

  // Cross-check ownedFarmPlots authoritatively against Server FarmPlotOwners ledger.
  // Never allow client to mint ownership of unowned or other players' plots.
  const serverOwnedPlots = Object.values(farmPlotOwners)
    .filter((owner) => owner && owner.ownerId === verifiedUid && typeof owner.plotId === 'string')
    .map((owner) => owner.plotId);
  const ownedFarmPlots = Array.from(new Set(serverOwnedPlots));

  const playerWorldChanges: PlayerWorldChanges = {
    tutorialCompleted: Boolean(wcRaw.tutorialCompleted),
    discoveredZones,
    ...(resetEpoch ? { resetEpoch } : {}),
    ...(ownedFarmPlots.length > 0 ? { ownedFarmPlots } : {}),
  };

  return {
    ok: true,
    sanitized: {
      saveId,
      clientTimestamp,
      positionX,
      positionY,
      currentZone,
      gender,
      playerName: rawName,
      equipment: {
        currentTool,
        facingDirection,
        equippedClothing,
      },
      playerStats,
      placedBuildings,
      storageBoxes,
      playerWorldChanges,
      strippedClientEconomyFields,
    },
  };
}

/**
 * Combines allowlisted non-economy client fields with strictly authoritative Server Economy
 * (`gold`, `inventory`, `ownedClothing`) matching existing Firestore document schemas 100%.
 */
export function buildAuthoritativeFirestoreDocs(params: {
  sanitized: SanitizedPlayerSavePayload;
  authoritativeEconomy: AuthoritativeEconomySnapshot;
  lastSavedAtIso: string;
}): FirestorePlayerSaveDocs {
  const { sanitized, authoritativeEconomy, lastSavedAtIso } = params;

  const cleanInventory = normalizeInventorySlots(authoritativeEconomy.inventorySlots, {
    ensureStarter: true,
  }).map((s) => ({
    item: s.item,
    quantity: s.quantity,
  }));

  const cleanOwnedClothing = normalizeOwnedClothingList(authoritativeEconomy.ownedClothing);
  const cleanEquippedClothing = ClothingSystem.normalizeEquippedClothing(
    sanitized.equipment.equippedClothing,
    cleanOwnedClothing,
    sanitized.gender
  );

  return {
    playerState: {
      positionX: sanitized.positionX,
      positionY: sanitized.positionY,
      currentZone: sanitized.currentZone,
      gold: Math.max(0, Math.round(authoritativeEconomy.gold)),
      inventory: cleanInventory,
      equipment: {
        currentTool: sanitized.equipment.currentTool,
        facingDirection: sanitized.equipment.facingDirection,
        ownedClothing: cleanOwnedClothing,
        equippedClothing: cleanEquippedClothing,
      },
      playerStats: sanitized.playerStats,
      lastSavedAt: lastSavedAtIso,
    },
    worldState: {
      placedBuildings: sanitized.placedBuildings,
      storageBoxes: sanitized.storageBoxes,
      playerWorldChanges: sanitized.playerWorldChanges,
      lastSavedAt: lastSavedAtIso,
    },
  };
}

export type FirestoreRestValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreRestValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreRestValue> } };

export function toFirestoreValue(val: unknown): FirestoreRestValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      return { integerValue: '0' };
    }
    if (Number.isInteger(val) && val >= -9007199254740991 && val <= 9007199254740991) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    const values = val.map((item) => toFirestoreValue(item));
    return values.length > 0 ? { arrayValue: { values } } : { arrayValue: {} };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreRestValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return Object.keys(fields).length > 0 ? { mapValue: { fields } } : { mapValue: {} };
  }
  return { stringValue: String(val) };
}

export function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreRestValue> {
  const fields: Record<string, FirestoreRestValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      fields[key] = toFirestoreValue(value);
    }
  }
  return fields;
}

/**
 * Atomically writes BOTH `users/{uid}/gameData/playerState` and `users/{uid}/gameData/worldState`
 * using Firestore REST `documents:commit` authenticated by Google Service Account OAuth2 Bearer token.
 * Safe for both Cloudflare Workers and Express/Node.js.
 */
export async function commitPlayerAndWorldStateToFirestore(params: {
  uid: string;
  docs: FirestorePlayerSaveDocs;
  env?: Record<string, string | undefined>;
  credentials?: ServiceAccountCredentials | null;
  userIdToken?: string;
  fetchImpl?: typeof fetch;
}): Promise<FirestoreSaveWriterResult> {
  const creds =
    params.credentials !== undefined
      ? params.credentials
      : resolveServiceAccountCredentials(params.env);
  const fallbackIdToken = typeof params.userIdToken === 'string' ? params.userIdToken.trim() : '';

  if (!creds && !fallbackIdToken) {
    return {
      ok: false,
      lastSavedAt: params.docs.playerState.lastSavedAt,
      statusCode: 424,
      code: 'SERVER_CREDENTIALS_MISSING',
      error:
        'Server Firebase Service Account credentials are not configured (FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY).',
    };
  }

  const envProjectId =
    params.env?.FIREBASE_PROJECT_ID ||
    (typeof process !== 'undefined' ? process.env?.FIREBASE_PROJECT_ID : undefined);
  const envDatabaseId =
    params.env?.FIREBASE_DATABASE_ID ||
    (typeof process !== 'undefined' ? process.env?.FIREBASE_DATABASE_ID : undefined);

  const projectId =
    creds?.projectId || envProjectId || firebaseAppletConfig.projectId || 'intrepid-cyclist-mbvhw';
  const databaseId =
    creds?.databaseId ||
    envDatabaseId ||
    firebaseAppletConfig.firestoreDatabaseId ||
    '(default)';
  const fetchFn = params.fetchImpl || fetch;

  let accessToken: string;
  if (creds) {
    try {
      accessToken = await getGoogleAccessToken(creds, { fetchImpl: fetchFn });
    } catch (err: any) {
      return {
        ok: false,
        lastSavedAt: params.docs.playerState.lastSavedAt,
        statusCode: 424,
        code: 'OAUTH_TOKEN_FAILED',
        error: err?.message || 'Failed to obtain Service Account OAuth2 access token.',
      };
    }
  } else {
    accessToken = fallbackIdToken;
  }

  const docPrefix = `projects/${projectId}/databases/${databaseId}/documents/users/${params.uid}/gameData`;
  const commitUrl =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/${encodeURIComponent(databaseId)}/documents:commit`;

  const commitPayload = {
    writes: [
      {
        update: {
          name: `${docPrefix}/playerState`,
          fields: toFirestoreFields(params.docs.playerState as unknown as Record<string, unknown>),
        },
        updateMask: {
          fieldPaths: [
            'positionX',
            'positionY',
            'currentZone',
            'gold',
            'inventory',
            'equipment',
            'playerStats',
            'lastSavedAt',
          ],
        },
      },
      {
        update: {
          name: `${docPrefix}/worldState`,
          fields: toFirestoreFields(params.docs.worldState as unknown as Record<string, unknown>),
        },
        updateMask: {
          fieldPaths: ['placedBuildings', 'storageBoxes', 'playerWorldChanges', 'lastSavedAt'],
        },
      },
    ],
  };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 7000) : null;

  try {
    const res = await fetchFn(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commitPayload),
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as {
        error?: { message?: string; status?: string };
      } | null;
      const errMsg =
        errBody?.error?.message || `Firestore commit failed with status ${res.status}`;
      const mappedStatus =
        res.status === 401 || res.status === 403 || res.status === 400 ? res.status : 424;
      return {
        ok: false,
        lastSavedAt: params.docs.playerState.lastSavedAt,
        statusCode: mappedStatus,
        code: 'FIRESTORE_COMMIT_FAILED',
        error: errMsg,
      };
    }

    return {
      ok: true,
      lastSavedAt: params.docs.playerState.lastSavedAt,
    };
  } catch (err: any) {
    return {
      ok: false,
      lastSavedAt: params.docs.playerState.lastSavedAt,
      statusCode: 500,
      code: 'FIRESTORE_NETWORK_ERROR',
      error: err?.message || String(err),
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
