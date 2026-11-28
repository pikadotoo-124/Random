/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import firebaseAppletConfig from '../../firebase-applet-config.json';
import { ClothingSystem } from '../../src/game/systems/ClothingSystem';
import {
  EquippedClothingState,
  FacingDirection,
  FarmPlotOwnersMap,
  InventorySlot,
  PlacedBuilding,
  PlayerStats,
} from '../../src/game/types';
import {
  createStarterInventorySlots,
  normalizeInventorySlots,
  normalizeOwnedClothingList,
} from '../economy/inventoryAuthority';
import { FarmPlotServerLedger } from '../farm/farmPlotService';

export const PLAYER_SAVE_KEY_PREFIX = 'player_save:';
export const FOUNDATION_SAVE_VERSION = 2; // Aligned 1:1 with CURRENT_SAVE_VERSION = 2

export type SaveCutoverMode = 'do_primary' | 'legacy_firestore';

/**
 * Resolves the active save system cutover mode.
 * Set `DO_SAVE_CUTOVER_MODE=legacy_firestore` in Wrangler/env for instant rollback
 * without losing DO Economy (`farmLedger`) or `player_save:${uid}` records.
 */
export function resolveSaveCutoverMode(
  env?: Record<string, unknown> | null
): SaveCutoverMode {
  const fromEnv =
    typeof env?.DO_SAVE_CUTOVER_MODE === 'string'
      ? env.DO_SAVE_CUTOVER_MODE
      : typeof process !== 'undefined' && typeof process.env?.DO_SAVE_CUTOVER_MODE === 'string'
      ? process.env.DO_SAVE_CUTOVER_MODE
      : '';
  return fromEnv.trim().toLowerCase() === 'legacy_firestore' ? 'legacy_firestore' : 'do_primary';
}

const VALID_UID_REGEX = /^[a-zA-Z0-9_\-:.]{1,128}$/;
const VALID_TOOLS = new Set<string>([
  'axe_basic',
  'pickaxe_basic',
  'scythe_basic',
  'rod_basic',
]);

export interface DOStorageAdapter {
  get<T = any>(key: string): Promise<T | undefined>;
  put<T = any>(key: string, value: T): Promise<void>;
}

export type PlayerMigrationStatus =
  | 'not_migrated'
  | 'migrated_from_firestore'
  | 'initialized_new_player'
  | 'active_do_primary';

export interface DOPlayerSaveRecord {
  schemaVersion: 2;
  uid: string;
  saveRevision: number;
  lastSavedAt: string;
  lastClientTimestamp: number;
  currentZone: string;
  player: {
    name: string;
    gender: 'male' | 'female';
    skinTone: string;
    hairColor: string;
    clothesColor: string;
    currentTool: string | null;
    facingDirection: FacingDirection;
    equippedClothing: EquippedClothingState;
  };
  position: {
    tileX: number;
    tileY: number;
    facingDirection: FacingDirection;
  };
  playerStats: PlayerStats;
  playerWorldChanges: {
    tutorialCompleted: boolean;
    discoveredZones: string[];
    resetEpoch?: string;
  };
  migration: {
    status: PlayerMigrationStatus;
    source: 'firestore_legacy_readonly' | 'new_player_default' | 'do_direct';
    migratedAt: string;
    firestoreLastSavedAt?: string;
    economyPreservedFromDO: boolean;
    legacyPersonalBuildingsCount: number;
  };
}

export interface LegacyFirestorePlayerSnapshot {
  ok: boolean;
  statusCode: number;
  code?: string;
  error?: string;
  exists: boolean;
  profile: {
    uid: string;
    playerName: string;
    gender: 'male' | 'female';
    gameVersion: number;
    createdAt?: string;
    lastLoginAt?: string;
  } | null;
  playerState: {
    positionX: number;
    positionY: number;
    currentZone: string;
    gold: number;
    inventorySlots: InventorySlot[];
    currentTool: string | null;
    facingDirection: FacingDirection;
    ownedClothing: string[];
    equippedClothing: EquippedClothingState;
    playerStats: PlayerStats;
    lastSavedAt?: string;
  } | null;
  worldState: {
    legacyPersonalBuildingsCount: number;
    tutorialCompleted: boolean;
    discoveredZones: string[];
    resetEpoch?: string;
    ownedFarmPlots?: string[];
    lastSavedAt?: string;
  } | null;
}

export interface PlayerMigrationResult {
  ok: boolean;
  statusCode: number;
  code?: string;
  error?: string;
  uid: string;
  storageKey: string;
  didMigrate: boolean;
  alreadyMigrated: boolean;
  performedFirestoreReads: boolean;
  economyPreservedFromDO: boolean;
  record?: DOPlayerSaveRecord;
}

export interface PlayerSaveMigrationStatusReport {
  uid: string;
  storageKey: string;
  hasDOPlayerSave: boolean;
  migrationStatus: PlayerMigrationStatus;
  saveRevision: number;
  schemaVersion: number;
  lastSavedAt: string | null;
  resetEpoch: string | null;
  matchesOfficialResetEpoch: boolean;
  economyVerifiedInDO: {
    gold: boolean;
    inventory: boolean;
    clothing: boolean;
  };
  ownedFarmPlotIds: string[];
  sharedBuildingsOwnedCount: number;
}

export interface DOPlayerSaveWriteInput {
  uid?: string;
  playerId?: string;
  saveId?: string;
  expectedRevision?: number;
  clientTimestamp?: number;
  currentZone?: string;
  playerName?: string;
  gender?: 'male' | 'female';
  positionX?: number;
  positionY?: number;
  facingDirection?: FacingDirection;
  currentTool?: string | null;
  equippedClothing?: EquippedClothingState;
  playerStats?: Partial<PlayerStats>;
  playerWorldChanges?: {
    tutorialCompleted?: boolean;
    discoveredZones?: string[];
    resetEpoch?: string;
  };
}

export interface DOPlayerSaveWriteResult {
  ok: boolean;
  statusCode: number;
  code?: string;
  error?: string;
  deduplicated?: boolean;
  stale?: boolean;
  storageKey: string;
  saveRevision: number;
  lastSavedAt: string;
  record?: DOPlayerSaveRecord;
}

export interface DOPlayerLoadResult {
  ok: boolean;
  statusCode: number;
  mode: SaveCutoverMode;
  exists: boolean;
  needsCharacterCreation?: boolean;
  fallbackToLegacy?: boolean;
  fallbackAllowed?: boolean;
  source?: 'do_primary' | 'migrated_from_firestore';
  didMigrate: boolean;
  performedFirestoreReads: boolean;
  economyPreservedFromDO: boolean;
  code?: string;
  error?: string;
  uid: string;
  storageKey: string;
  record?: DOPlayerSaveRecord;
}

export function validateAuthenticatedUidAccess(params: {
  authenticatedUid: string | null | undefined;
  targetUid?: string | null;
}): { ok: true; uid: string } | { ok: false; statusCode: number; code: string; error: string } {
  const authUid = typeof params.authenticatedUid === 'string' ? params.authenticatedUid.trim() : '';
  if (!authUid || !VALID_UID_REGEX.test(authUid)) {
    return {
      ok: false,
      statusCode: 401,
      code: 'AUTH_REQUIRED',
      error: 'Valid authenticated Firebase UID is required.',
    };
  }

  const target = typeof params.targetUid === 'string' ? params.targetUid.trim() : '';
  if (target && target !== authUid) {
    return {
      ok: false,
      statusCode: 403,
      code: 'UID_MISMATCH',
      error: 'Forbidden: Cannot access or mutate another player save record.',
    };
  }

  return { ok: true, uid: authUid };
}

export function getPlayerSaveStorageKey(uid: string): string {
  const clean = typeof uid === 'string' ? uid.trim() : '';
  if (!clean || !VALID_UID_REGEX.test(clean)) {
    throw new Error('Invalid player UID for player_save storage key.');
  }
  return `${PLAYER_SAVE_KEY_PREFIX}${clean}`;
}

export function doesPlayerSaveMatchResetEpoch(
  record: Pick<DOPlayerSaveRecord, 'playerWorldChanges'> | null | undefined,
  officialResetEpoch: string | null | undefined
): boolean {
  if (!officialResetEpoch) return true;
  if (!record) return false;
  return (record.playerWorldChanges?.resetEpoch || null) === officialResetEpoch;
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

function getDefaultStats(): PlayerStats {
  return {
    health: 100,
    stamina: 100,
    totalGathered: 0,
    totalCrafted: 0,
    totalBuilt: 0,
    totalSoldGold: 0,
  };
}

function normalizeStats(raw: unknown): PlayerStats {
  const base = getDefaultStats();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  return {
    health: clampStat(r.health, base.health, 100),
    stamina: clampStat(r.stamina, base.stamina, 100),
    totalGathered: clampStat(r.totalGathered, 0),
    totalCrafted: clampStat(r.totalCrafted, 0),
    totalBuilt: clampStat(r.totalBuilt, 0),
    totalSoldGold: clampStat(r.totalSoldGold, 0),
  };
}

function normalizeDiscoveredZones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ['Central Plaza (Main City)'];
  const clean = Array.from(
    new Set(
      raw
        .filter((z): z is string => typeof z === 'string' && z.trim().length > 0)
        .map((z) => z.trim().slice(0, 128))
    )
  ).slice(0, 50);
  return clean.length > 0 ? clean : ['Central Plaza (Main City)'];
}

export function parseFirestoreValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, any>;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('integerValue' in v) {
    const n = Number(v.integerValue);
    return Number.isFinite(n) ? n : 0;
  }
  if ('doubleValue' in v) {
    const n = Number(v.doubleValue);
    return Number.isFinite(n) ? n : 0;
  }
  if ('stringValue' in v) return typeof v.stringValue === 'string' ? v.stringValue : '';
  if ('timestampValue' in v) return typeof v.timestampValue === 'string' ? v.timestampValue : '';
  if ('arrayValue' in v) {
    const values = v.arrayValue?.values;
    if (!Array.isArray(values)) return [];
    return values.map((entry: unknown) => parseFirestoreValue(entry));
  }
  if ('mapValue' in v) {
    const fields = v.mapValue?.fields;
    if (!fields || typeof fields !== 'object') return {};
    return parseFirestoreDocumentFields(fields);
  }
  return undefined;
}

export function parseFirestoreDocumentFields(
  fields: Record<string, unknown> | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fields || typeof fields !== 'object') return out;
  for (const [k, rawVal] of Object.entries(fields)) {
    const decoded = parseFirestoreValue(rawVal);
    if (decoded !== undefined) {
      out[k] = decoded;
    }
  }
  return out;
}

/**
 * Strictly READ-ONLY Firestore REST reader (`GET` only, authenticated with the player's own
 * verified Firebase ID token). Never executes `POST`, `PATCH`, `PUT`, or `DELETE`.
 */
export async function fetchLegacyFirestorePlayerSaveReadOnly(params: {
  uid: string;
  idToken: string;
  projectId?: string;
  databaseId?: string;
  fetchImpl?: typeof fetch;
}): Promise<LegacyFirestorePlayerSnapshot> {
  const authCheck = validateAuthenticatedUidAccess({ authenticatedUid: params.uid });
  const idToken = typeof params.idToken === 'string' ? params.idToken.trim() : '';
  if (!authCheck.ok || !idToken) {
    return {
      ok: false,
      statusCode: 401,
      code: 'AUTH_REQUIRED',
      error: 'Valid UID and Firebase ID token are required for read-only Firestore migration.',
      exists: false,
      profile: null,
      playerState: null,
      worldState: null,
    };
  }

  const uid = authCheck.uid;
  const projectId =
    params.projectId?.trim() || firebaseAppletConfig.projectId || 'intrepid-cyclist-mbvhw';
  const databaseId =
    params.databaseId?.trim() || firebaseAppletConfig.firestoreDatabaseId || '(default)';
  const fetchFn = params.fetchImpl || fetch;

  const baseDocUrl =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/${encodeURIComponent(databaseId)}/documents/users/${encodeURIComponent(uid)}`;

  const readGetDoc = async (
    url: string
  ): Promise<
    | { ok: true; exists: boolean; data: Record<string, unknown> | null }
    | { ok: false; statusCode: number; error: string }
  > => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 4500) : null;
    try {
      const res = await fetchFn(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        ...(controller ? { signal: controller.signal } : {}),
      });

      if (res.status === 404) {
        return { ok: true, exists: false, data: null };
      }

      if (!res.ok) {
        return {
          ok: false,
          statusCode: res.status,
          error: `Firestore GET failed with status ${res.status}`,
        };
      }

      const json = (await res.json().catch(() => null)) as {
        fields?: Record<string, unknown>;
      } | null;
      return {
        ok: true,
        exists: true,
        data: parseFirestoreDocumentFields(json?.fields),
      };
    } catch (err: any) {
      return {
        ok: false,
        statusCode: 502,
        error: err?.message || 'Firestore read network error.',
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };

  const [profileRes, playerRes, worldRes] = await Promise.all([
    readGetDoc(baseDocUrl),
    readGetDoc(`${baseDocUrl}/gameData/playerState`),
    readGetDoc(`${baseDocUrl}/gameData/worldState`),
  ]);

  for (const r of [profileRes, playerRes, worldRes]) {
    if (!r.ok) {
      return {
        ok: false,
        statusCode: r.statusCode,
        code: r.statusCode === 401 || r.statusCode === 403 ? 'FIRESTORE_UNAUTHORIZED' : 'FIRESTORE_READ_ERROR',
        error: r.error,
        exists: false,
        profile: null,
        playerState: null,
        worldState: null,
      };
    }
  }

  const pDoc = profileRes.ok && profileRes.exists ? profileRes.data : null;
  const psDoc = playerRes.ok && playerRes.exists ? playerRes.data : null;
  const wsDoc = worldRes.ok && worldRes.exists ? worldRes.data : null;

  if (pDoc && typeof pDoc.uid === 'string' && pDoc.uid.trim() && pDoc.uid.trim() !== uid) {
    return {
      ok: false,
      statusCode: 403,
      code: 'UID_MISMATCH',
      error: 'Legacy Firestore profile UID does not match authenticated UID.',
      exists: false,
      profile: null,
      playerState: null,
      worldState: null,
    };
  }

  const gender: 'male' | 'female' = pDoc?.gender === 'female' ? 'female' : 'male';
  const playerName =
    typeof pDoc?.playerName === 'string' && pDoc.playerName.trim()
      ? pDoc.playerName.trim().slice(0, 16)
      : 'Settler';

  const profile = pDoc
    ? {
        uid,
        playerName,
        gender,
        gameVersion:
          typeof pDoc.gameVersion === 'number' && Number.isFinite(pDoc.gameVersion)
            ? Math.floor(pDoc.gameVersion)
            : 1,
        createdAt: typeof pDoc.createdAt === 'string' ? pDoc.createdAt : undefined,
        lastLoginAt: typeof pDoc.lastLoginAt === 'string' ? pDoc.lastLoginAt : undefined,
      }
    : null;

  let playerState: LegacyFirestorePlayerSnapshot['playerState'] = null;
  if (psDoc) {
    const eqRaw =
      psDoc.equipment && typeof psDoc.equipment === 'object' && !Array.isArray(psDoc.equipment)
        ? (psDoc.equipment as Record<string, unknown>)
        : {};
    const rawInvSlots = Array.isArray(psDoc.inventory)
      ? psDoc.inventory
      : psDoc.inventory &&
        typeof psDoc.inventory === 'object' &&
        Array.isArray((psDoc.inventory as Record<string, unknown>).slots)
      ? ((psDoc.inventory as Record<string, unknown>).slots as unknown[])
      : [];
    const ownedClothing = normalizeOwnedClothingList(eqRaw.ownedClothing);
    const equippedClothing = ClothingSystem.normalizeEquippedClothing(
      eqRaw.equippedClothing as EquippedClothingState | undefined,
      ownedClothing,
      gender
    );
    const topGold = typeof psDoc.gold === 'number' && Number.isFinite(psDoc.gold) ? psDoc.gold : null;
    const nestedGold =
      psDoc.inventory &&
      typeof psDoc.inventory === 'object' &&
      typeof (psDoc.inventory as Record<string, unknown>).coins === 'number'
        ? ((psDoc.inventory as Record<string, unknown>).coins as number)
        : null;
    const rawGold = topGold ?? nestedGold ?? 25;

    playerState = {
      positionX: clampCoord(psDoc.positionX, 30),
      positionY: clampCoord(psDoc.positionY, 30),
      currentZone:
        typeof psDoc.currentZone === 'string' && psDoc.currentZone.trim()
          ? psDoc.currentZone.trim().slice(0, 128)
          : 'Central Plaza (Main City)',
      gold: Math.max(0, Math.min(1_000_000, Math.round(rawGold))),
      inventorySlots: normalizeInventorySlots(rawInvSlots, { ensureStarter: true }),
      currentTool:
        eqRaw.currentTool === null
          ? null
          : typeof eqRaw.currentTool === 'string' && VALID_TOOLS.has(eqRaw.currentTool.trim())
          ? eqRaw.currentTool.trim()
          : 'axe_basic',
      facingDirection: normalizeDirection(eqRaw.facingDirection),
      ownedClothing,
      equippedClothing,
      playerStats: normalizeStats(psDoc.playerStats),
      lastSavedAt: typeof psDoc.lastSavedAt === 'string' ? psDoc.lastSavedAt : undefined,
    };
  }

  let worldState: LegacyFirestorePlayerSnapshot['worldState'] = null;
  if (wsDoc) {
    const wcRaw =
      wsDoc.playerWorldChanges &&
      typeof wsDoc.playerWorldChanges === 'object' &&
      !Array.isArray(wsDoc.playerWorldChanges)
        ? (wsDoc.playerWorldChanges as Record<string, unknown>)
        : {};
    const resetEpoch =
      typeof wcRaw.resetEpoch === 'string' && wcRaw.resetEpoch.trim().length > 0
        ? wcRaw.resetEpoch.trim().slice(0, 64)
        : undefined;
    const ownedFarmPlots = Array.isArray(wcRaw.ownedFarmPlots)
      ? Array.from(
          new Set(
            wcRaw.ownedFarmPlots.filter(
              (id): id is string => typeof id === 'string' && id.trim().length > 0
            )
          )
        )
      : undefined;

    worldState = {
      legacyPersonalBuildingsCount: Array.isArray(wsDoc.placedBuildings)
        ? wsDoc.placedBuildings.length
        : 0,
      tutorialCompleted: Boolean(wcRaw.tutorialCompleted),
      discoveredZones: normalizeDiscoveredZones(wcRaw.discoveredZones),
      ...(resetEpoch ? { resetEpoch } : {}),
      ...(ownedFarmPlots && ownedFarmPlots.length > 0 ? { ownedFarmPlots } : {}),
      lastSavedAt: typeof wsDoc.lastSavedAt === 'string' ? wsDoc.lastSavedAt : undefined,
    };
  }

  return {
    ok: true,
    statusCode: 200,
    exists: Boolean(profile || playerState || worldState),
    profile,
    playerState,
    worldState,
  };
}

export function buildDOPlayerSaveFromLegacy(params: {
  uid: string;
  legacy: LegacyFirestorePlayerSnapshot;
  authoritativeOwnedClothing: string[];
  economyPreservedFromDO: boolean;
  initialSaveRevision?: number;
  fallbackName?: string;
  fallbackGender?: 'male' | 'female';
  nowIso?: string;
}): DOPlayerSaveRecord {
  const { uid, legacy, authoritativeOwnedClothing, economyPreservedFromDO } = params;
  const nowIso = params.nowIso || new Date().toISOString();
  const gender: 'male' | 'female' =
    legacy.profile?.gender || (params.fallbackGender === 'female' ? 'female' : 'male');
  const playerName =
    legacy.profile?.playerName ||
    (typeof params.fallbackName === 'string' && params.fallbackName.trim()
      ? params.fallbackName.trim().slice(0, 16)
      : 'Settler');

  const ps = legacy.playerState;
  const ws = legacy.worldState;
  const facingDirection = ps?.facingDirection || 'down';
  const normalizedEquipped = ClothingSystem.normalizeEquippedClothing(
    ps?.equippedClothing,
    authoritativeOwnedClothing,
    gender
  );

  const firestoreLastSavedAt =
    ps?.lastSavedAt || ws?.lastSavedAt || legacy.profile?.lastLoginAt || undefined;
  const parsedTs = firestoreLastSavedAt ? Date.parse(firestoreLastSavedAt) : NaN;
  const lastClientTimestamp =
    Number.isFinite(parsedTs) && parsedTs > 0 ? Math.floor(parsedTs) : Date.now();

  const hasLegacyDocs = Boolean(legacy.exists && (ps || ws || legacy.profile));

  return {
    schemaVersion: FOUNDATION_SAVE_VERSION,
    uid,
    saveRevision:
      typeof params.initialSaveRevision === 'number' && params.initialSaveRevision >= 0
        ? Math.floor(params.initialSaveRevision)
        : 1,
    lastSavedAt: nowIso,
    lastClientTimestamp,
    currentZone: ps?.currentZone || 'Central Plaza (Main City)',
    player: {
      name: playerName,
      gender,
      skinTone: gender === 'female' ? '#f59e0b' : '#d97706',
      hairColor: gender === 'female' ? '#78350f' : '#292524',
      clothesColor: gender === 'female' ? '#10b981' : '#3b82f6',
      currentTool: ps ? ps.currentTool : 'axe_basic',
      facingDirection,
      equippedClothing: normalizedEquipped,
    },
    position: {
      tileX: ps ? ps.positionX : 30,
      tileY: ps ? ps.positionY : 30,
      facingDirection,
    },
    playerStats: ps?.playerStats || getDefaultStats(),
    playerWorldChanges: {
      tutorialCompleted: Boolean(ws?.tutorialCompleted),
      discoveredZones: ws?.discoveredZones || ['Central Plaza (Main City)'],
      ...(ws?.resetEpoch ? { resetEpoch: ws.resetEpoch } : {}),
    },
    migration: {
      status: hasLegacyDocs ? 'migrated_from_firestore' : 'initialized_new_player',
      source: hasLegacyDocs ? 'firestore_legacy_readonly' : 'new_player_default',
      migratedAt: nowIso,
      ...(firestoreLastSavedAt ? { firestoreLastSavedAt } : {}),
      economyPreservedFromDO,
      legacyPersonalBuildingsCount: ws?.legacyPersonalBuildingsCount ?? 0,
    },
  };
}

/**
 * Coordinates Zero-Loss Player Save Foundation (`player_save:${uid}`) inside Cloudflare DO.
 * Strictly obeys:
 * - Never overwrites verified DO Economy (`playerGoldBalances`, `playerInventories`, `playerOwnedClothing`)
 * - Never overwrites `placedBuildings` or `farmPlotOwners`
 * - Never re-imports from Firestore if `player_save:${uid}` already exists
 * - Performs strictly Read-Only (`GET`) reads against Firestore during migration
 */
export class PlayerSaveFoundationService {
  private migrationTailByUid = new Map<string, Promise<unknown>>();
  private saveTailByUid = new Map<string, Promise<unknown>>();
  private processedSaveIds = new Map<string, DOPlayerSaveWriteResult>();

  private rememberSaveId(uid: string, saveId: string, res: DOPlayerSaveWriteResult): void {
    const key = `${uid}:${saveId}`;
    this.processedSaveIds.set(key, res);
    if (this.processedSaveIds.size > 500) {
      const oldest = this.processedSaveIds.keys().next().value;
      if (oldest) this.processedSaveIds.delete(oldest);
    }
  }

  public async getPlayerSave(
    storage: DOStorageAdapter,
    uid: string
  ): Promise<DOPlayerSaveRecord | null> {
    const key = getPlayerSaveStorageKey(uid);
    const record = await storage.get<DOPlayerSaveRecord | undefined>(key);
    if (!record || typeof record !== 'object' || record.uid !== uid.trim()) {
      return null;
    }
    return record;
  }

  public async getMigrationStatus(params: {
    storage: DOStorageAdapter;
    uid: string;
    farmLedger: FarmPlotServerLedger;
    placedBuildings?: ReadonlyArray<PlacedBuilding>;
    officialResetEpoch?: string | null;
  }): Promise<PlayerSaveMigrationStatusReport> {
    const cleanUid = params.uid.trim();
    const storageKey = getPlayerSaveStorageKey(cleanUid);
    const existing = await this.getPlayerSave(params.storage, cleanUid);
    const farmOwners: FarmPlotOwnersMap = params.farmLedger.serializeOwners();
    const ownedFarmPlotIds = Object.values(farmOwners)
      .filter((o) => o && o.ownerId === cleanUid)
      .map((o) => o.plotId);
    const sharedBuildingsOwnedCount = Array.isArray(params.placedBuildings)
      ? params.placedBuildings.filter((b) => b && b.ownerId === cleanUid).length
      : 0;

    return {
      uid: cleanUid,
      storageKey,
      hasDOPlayerSave: Boolean(existing),
      migrationStatus: existing?.migration?.status || 'not_migrated',
      saveRevision: existing?.saveRevision ?? params.farmLedger.getSaveRevision(cleanUid),
      schemaVersion: existing?.schemaVersion ?? FOUNDATION_SAVE_VERSION,
      lastSavedAt: existing?.lastSavedAt || null,
      resetEpoch: existing?.playerWorldChanges?.resetEpoch || null,
      matchesOfficialResetEpoch: doesPlayerSaveMatchResetEpoch(
        existing,
        params.officialResetEpoch
      ),
      economyVerifiedInDO: {
        gold: params.farmLedger.isGoldVerified(cleanUid),
        inventory: params.farmLedger.isInventoryVerified(cleanUid),
        clothing: params.farmLedger.isClothingVerified(cleanUid),
      },
      ownedFarmPlotIds,
      sharedBuildingsOwnedCount,
    };
  }

  public async migratePlayerFromFirestoreReadOnly(params: {
    storage: DOStorageAdapter;
    farmLedger: FarmPlotServerLedger;
    authenticatedUid: string | null | undefined;
    targetUid?: string | null;
    idToken: string | null | undefined;
    projectId?: string;
    databaseId?: string;
    fallbackName?: string;
    fallbackGender?: 'male' | 'female';
    fetchImpl?: typeof fetch;
    persistEconomy?: () => Promise<void>;
    prefetchedLegacy?: LegacyFirestorePlayerSnapshot;
  }): Promise<PlayerMigrationResult> {
    const access = validateAuthenticatedUidAccess({
      authenticatedUid: params.authenticatedUid,
      targetUid: params.targetUid,
    });
    if (!access.ok) {
      return {
        ok: false,
        statusCode: access.statusCode,
        code: access.code,
        error: access.error,
        uid: typeof params.targetUid === 'string' ? params.targetUid : '',
        storageKey: '',
        didMigrate: false,
        alreadyMigrated: false,
        performedFirestoreReads: false,
        economyPreservedFromDO: false,
      };
    }

    const idToken = typeof params.idToken === 'string' ? params.idToken.trim() : '';
    if (!idToken) {
      return {
        ok: false,
        statusCode: 401,
        code: 'AUTH_REQUIRED',
        error: 'Firebase ID token is required for authenticated player migration.',
        uid: access.uid,
        storageKey: getPlayerSaveStorageKey(access.uid),
        didMigrate: false,
        alreadyMigrated: false,
        performedFirestoreReads: false,
        economyPreservedFromDO: false,
      };
    }

    const uid = access.uid;
    const storageKey = getPlayerSaveStorageKey(uid);
    const prevTail = this.migrationTailByUid.get(uid) || Promise.resolve();

    const task = prevTail
      .catch(() => undefined)
      .then(async (): Promise<PlayerMigrationResult> => {
        // 1. Duplicate Migration Prevention: NEVER re-import Firestore if player_save:${uid} exists
        const existing = await this.getPlayerSave(params.storage, uid);
        if (existing) {
          return {
            ok: true,
            statusCode: 200,
            uid,
            storageKey,
            didMigrate: false,
            alreadyMigrated: true,
            performedFirestoreReads: false,
            economyPreservedFromDO: params.farmLedger.isEconomyFullyVerified(uid),
            record: existing,
          };
        }

        // 2. Snapshot pre-existing verified DO Economy status BEFORE touching Firestore
        const hadVerifiedGoldBefore = params.farmLedger.isGoldVerified(uid);
        const hadVerifiedInvBefore = params.farmLedger.isInventoryVerified(uid);
        const hadVerifiedClothBefore = params.farmLedger.isClothingVerified(uid);
        const economyPreservedFromDO =
          hadVerifiedGoldBefore || hadVerifiedInvBefore || hadVerifiedClothBefore;

        // 3. Strictly Read-Only (`GET`) fetch from Firestore (reuse prefetched snapshot if provided)
        const legacy =
          params.prefetchedLegacy ??
          (await fetchLegacyFirestorePlayerSaveReadOnly({
            uid,
            idToken,
            projectId: params.projectId,
            databaseId: params.databaseId,
            fetchImpl: params.fetchImpl,
          }));

        if (!legacy.ok) {
          return {
            ok: false,
            statusCode: legacy.statusCode,
            code: legacy.code,
            error: legacy.error,
            uid,
            storageKey,
            didMigrate: false,
            alreadyMigrated: false,
            performedFirestoreReads: true,
            economyPreservedFromDO,
          };
        }

        // 4. Zero-Loss Economy Seed: ONLY seed dimensions NOT already verified in DO
        const seedGold = legacy.playerState?.gold ?? 25;
        const seedInv = legacy.playerState?.inventorySlots ?? createStarterInventorySlots();
        const seedCloth = legacy.playerState?.ownedClothing ?? [];

        const seeded = params.farmLedger.seedAuthoritativeEconomy(
          uid,
          {
            gold: seedGold,
            inventorySlots: seedInv,
            ownedClothing: seedCloth,
          },
          true
        );

        if (
          (seeded.seededGold || seeded.seededInventory || seeded.seededClothing) &&
          params.persistEconomy
        ) {
          await params.persistEconomy();
        }

        const authoritativeClothing = params.farmLedger.getPlayerOwnedClothing(uid);
        const initialRevision = Math.max(1, params.farmLedger.getSaveRevision(uid) || 1);

        const record = buildDOPlayerSaveFromLegacy({
          uid,
          legacy,
          authoritativeOwnedClothing: authoritativeClothing,
          economyPreservedFromDO,
          initialSaveRevision: initialRevision,
          fallbackName: params.fallbackName,
          fallbackGender: params.fallbackGender,
        });

        await params.storage.put(storageKey, record);

        return {
          ok: true,
          statusCode: 200,
          uid,
          storageKey,
          didMigrate: true,
          alreadyMigrated: false,
          performedFirestoreReads: true,
          economyPreservedFromDO,
          record,
        };
      });

    this.migrationTailByUid.set(uid, task);
    try {
      return await task;
    } finally {
      if (this.migrationTailByUid.get(uid) === task) {
        this.migrationTailByUid.delete(uid);
      }
    }
  }

  public async savePlayerRecordToDO(params: {
    storage: DOStorageAdapter;
    farmLedger: FarmPlotServerLedger;
    authenticatedUid: string | null | undefined;
    input: DOPlayerSaveWriteInput;
  }): Promise<DOPlayerSaveWriteResult> {
    const claimedTarget = params.input?.uid || params.input?.playerId;
    const access = validateAuthenticatedUidAccess({
      authenticatedUid: params.authenticatedUid,
      targetUid: claimedTarget,
    });
    if (!access.ok) {
      return {
        ok: false,
        statusCode: access.statusCode,
        code: access.code,
        error: access.error,
        storageKey: '',
        saveRevision: 0,
        lastSavedAt: new Date().toISOString(),
      };
    }

    const uid = access.uid;
    const storageKey = getPlayerSaveStorageKey(uid);
    const prevTail = this.saveTailByUid.get(uid) || Promise.resolve();

    const task = prevTail
      .catch(() => undefined)
      .then(async (): Promise<DOPlayerSaveWriteResult> => {
        const cleanSaveId =
          typeof params.input.saveId === 'string' && params.input.saveId.trim().length > 0
            ? params.input.saveId.trim().slice(0, 80)
            : undefined;
        if (cleanSaveId) {
          const cached = this.processedSaveIds.get(`${uid}:${cleanSaveId}`);
          if (cached) {
            return {
              ...cached,
              deduplicated: true,
            };
          }
        }

        const existing = await this.getPlayerSave(params.storage, uid);
        const currentRevision = existing?.saveRevision ?? 0;

        if (
          params.input.expectedRevision !== undefined &&
          params.input.expectedRevision !== currentRevision
        ) {
          return {
            ok: false,
            statusCode: 409,
            code: 'SAVE_REVISION_CONFLICT',
            error: `Save revision conflict: expected ${params.input.expectedRevision}, current ${currentRevision}.`,
            storageKey,
            saveRevision: currentRevision,
            lastSavedAt: existing?.lastSavedAt || new Date().toISOString(),
            record: existing || undefined,
          };
        }

        const clientTs =
          typeof params.input.clientTimestamp === 'number' &&
          Number.isFinite(params.input.clientTimestamp) &&
          params.input.clientTimestamp > 0
            ? Math.floor(params.input.clientTimestamp)
            : Date.now();

        if (existing && params.input.clientTimestamp !== undefined && clientTs < existing.lastClientTimestamp) {
          return {
            ok: false,
            statusCode: 409,
            code: 'STALE_SAVE',
            stale: true,
            error: 'Newer player save already committed in Durable Object.',
            storageKey,
            saveRevision: currentRevision,
            lastSavedAt: existing.lastSavedAt,
            record: existing,
          };
        }

        const gender: 'male' | 'female' =
          params.input.gender === 'female'
            ? 'female'
            : params.input.gender === 'male'
            ? 'male'
            : existing?.player.gender || 'male';
        const name =
          typeof params.input.playerName === 'string' && params.input.playerName.trim()
            ? params.input.playerName.trim().slice(0, 16)
            : existing?.player.name || 'Settler';
        const facingDirection = normalizeDirection(
          params.input.facingDirection ?? existing?.position.facingDirection
        );
        const currentTool =
          params.input.currentTool === null
            ? null
            : typeof params.input.currentTool === 'string' &&
              VALID_TOOLS.has(params.input.currentTool.trim())
            ? params.input.currentTool.trim()
            : existing?.player.currentTool ?? 'axe_basic';

        const ownedClothing = params.farmLedger.getPlayerOwnedClothing(uid);
        const equippedClothing = ClothingSystem.normalizeEquippedClothing(
          params.input.equippedClothing ?? existing?.player.equippedClothing,
          ownedClothing,
          gender
        );

        const nextRevision = currentRevision + 1;
        const nowIso = new Date().toISOString();
        const mergedZones = params.input.playerWorldChanges?.discoveredZones
          ? normalizeDiscoveredZones(params.input.playerWorldChanges.discoveredZones)
          : existing?.playerWorldChanges.discoveredZones || ['Central Plaza (Main City)'];
        const rawEpoch =
          params.input.playerWorldChanges?.resetEpoch ?? existing?.playerWorldChanges.resetEpoch;
        const cleanEpoch =
          typeof rawEpoch === 'string' && rawEpoch.trim().length > 0
            ? rawEpoch.trim().slice(0, 64)
            : undefined;

        const nextRecord: DOPlayerSaveRecord = {
          schemaVersion: FOUNDATION_SAVE_VERSION,
          uid,
          saveRevision: nextRevision,
          lastSavedAt: nowIso,
          lastClientTimestamp: Math.max(clientTs, existing?.lastClientTimestamp ?? 0),
          currentZone:
            typeof params.input.currentZone === 'string' && params.input.currentZone.trim()
              ? params.input.currentZone.trim().slice(0, 128)
              : existing?.currentZone || 'Central Plaza (Main City)',
          player: {
            name,
            gender,
            skinTone: gender === 'female' ? '#f59e0b' : '#d97706',
            hairColor: gender === 'female' ? '#78350f' : '#292524',
            clothesColor: gender === 'female' ? '#10b981' : '#3b82f6',
            currentTool,
            facingDirection,
            equippedClothing,
          },
          position: {
            tileX: clampCoord(params.input.positionX, existing?.position.tileX ?? 30),
            tileY: clampCoord(params.input.positionY, existing?.position.tileY ?? 30),
            facingDirection,
          },
          playerStats: normalizeStats({
            ...(existing?.playerStats || {}),
            ...(params.input.playerStats || {}),
          }),
          playerWorldChanges: {
            tutorialCompleted:
              params.input.playerWorldChanges?.tutorialCompleted !== undefined
                ? Boolean(params.input.playerWorldChanges.tutorialCompleted)
                : Boolean(existing?.playerWorldChanges.tutorialCompleted),
            discoveredZones: mergedZones,
            ...(cleanEpoch ? { resetEpoch: cleanEpoch } : {}),
          },
          migration: existing?.migration
            ? {
                ...existing.migration,
                status: 'active_do_primary',
              }
            : {
                status: 'active_do_primary',
                source: 'do_direct',
                migratedAt: nowIso,
                economyPreservedFromDO: params.farmLedger.isEconomyFullyVerified(uid),
                legacyPersonalBuildingsCount: 0,
              },
        };

        try {
          await params.storage.put(storageKey, nextRecord);
        } catch (storageErr: any) {
          return {
            ok: false,
            statusCode: 500,
            code: 'DO_SAVE_FAILED',
            error: storageErr?.message || 'Durable Object storage write failed; previous save preserved.',
            storageKey,
            saveRevision: currentRevision,
            lastSavedAt: existing?.lastSavedAt || nowIso,
            record: existing || undefined,
          };
        }

        const okRes: DOPlayerSaveWriteResult = {
          ok: true,
          statusCode: 200,
          storageKey,
          saveRevision: nextRevision,
          lastSavedAt: nowIso,
          record: nextRecord,
        };
        if (cleanSaveId) {
          this.rememberSaveId(uid, cleanSaveId, okRes);
        }
        return okRes;
      });

    this.saveTailByUid.set(uid, task);
    try {
      return await task;
    } finally {
      if (this.saveTailByUid.get(uid) === task) {
        this.saveTailByUid.delete(uid);
      }
    }
  }

  /**
   * Staged Phase 1 — DO Load & On-Demand Read-Only Legacy Migration.
   * Never deletes or modifies Firestore legacy docs; never overwrites existing DO economy.
   */
  public async loadOrMigratePlayerSave(params: {
    storage: DOStorageAdapter;
    farmLedger: FarmPlotServerLedger;
    authenticatedUid: string | null | undefined;
    targetUid?: string | null;
    idToken: string | null | undefined;
    mode?: SaveCutoverMode;
    projectId?: string;
    databaseId?: string;
    fallbackName?: string;
    fallbackGender?: 'male' | 'female';
    fetchImpl?: typeof fetch;
    persistEconomy?: () => Promise<void>;
  }): Promise<DOPlayerLoadResult> {
    const mode: SaveCutoverMode = params.mode || 'do_primary';
    const access = validateAuthenticatedUidAccess({
      authenticatedUid: params.authenticatedUid,
      targetUid: params.targetUid,
    });
    if (!access.ok) {
      return {
        ok: false,
        statusCode: access.statusCode,
        mode,
        exists: false,
        didMigrate: false,
        performedFirestoreReads: false,
        economyPreservedFromDO: false,
        fallbackAllowed: false,
        code: access.code,
        error: access.error,
        uid: typeof params.targetUid === 'string' ? params.targetUid : '',
        storageKey: '',
      };
    }

    const uid = access.uid;
    const storageKey = getPlayerSaveStorageKey(uid);
    const idToken = typeof params.idToken === 'string' ? params.idToken.trim() : '';

    if (mode === 'legacy_firestore') {
      return {
        ok: true,
        statusCode: 200,
        mode,
        exists: false,
        fallbackToLegacy: true,
        fallbackAllowed: true,
        didMigrate: false,
        performedFirestoreReads: false,
        economyPreservedFromDO: params.farmLedger.isEconomyFullyVerified(uid),
        uid,
        storageKey,
      };
    }

    if (!idToken) {
      return {
        ok: false,
        statusCode: 401,
        mode,
        exists: false,
        didMigrate: false,
        performedFirestoreReads: false,
        economyPreservedFromDO: false,
        fallbackAllowed: false,
        code: 'AUTH_REQUIRED',
        error: 'Firebase ID token is required.',
        uid,
        storageKey,
      };
    }

    const prevTail = this.migrationTailByUid.get(uid) || Promise.resolve();
    const task = prevTail
      .catch(() => undefined)
      .then(async (): Promise<DOPlayerLoadResult> => {
        const existing = await this.getPlayerSave(params.storage, uid);
        if (existing) {
          return {
            ok: true,
            statusCode: 200,
            mode,
            exists: true,
            source: 'do_primary',
            didMigrate: false,
            performedFirestoreReads: false,
            economyPreservedFromDO: params.farmLedger.isEconomyFullyVerified(uid),
            uid,
            storageKey,
            record: existing,
          };
        }

        const economyPreservedFromDO =
          params.farmLedger.isGoldVerified(uid) ||
          params.farmLedger.isInventoryVerified(uid) ||
          params.farmLedger.isClothingVerified(uid);

        const legacy = await fetchLegacyFirestorePlayerSaveReadOnly({
          uid,
          idToken,
          projectId: params.projectId,
          databaseId: params.databaseId,
          fetchImpl: params.fetchImpl,
        });

        if (!legacy.ok) {
          const authRejected =
            legacy.statusCode === 401 || legacy.statusCode === 403 || legacy.code === 'UID_MISMATCH';
          return {
            ok: false,
            statusCode: authRejected ? legacy.statusCode : 503,
            mode,
            exists: false,
            fallbackAllowed: !authRejected,
            didMigrate: false,
            performedFirestoreReads: true,
            economyPreservedFromDO,
            code: authRejected ? legacy.code || 'FIRESTORE_UNAUTHORIZED' : 'MIGRATION_FAILED',
            error: legacy.error || 'Legacy Firestore read failed; legacy data preserved.',
            uid,
            storageKey,
          };
        }

        if (!legacy.exists) {
          return {
            ok: true,
            statusCode: 200,
            mode,
            exists: false,
            needsCharacterCreation: true,
            didMigrate: false,
            performedFirestoreReads: true,
            economyPreservedFromDO,
            uid,
            storageKey,
          };
        }

        // Seed only unverified economy dimensions; NEVER overwrite verified DO values
        const seedGold = legacy.playerState?.gold ?? 25;
        const seedInv = legacy.playerState?.inventorySlots ?? createStarterInventorySlots();
        const seedCloth = legacy.playerState?.ownedClothing ?? [];

        const seeded = params.farmLedger.seedAuthoritativeEconomy(
          uid,
          { gold: seedGold, inventorySlots: seedInv, ownedClothing: seedCloth },
          true
        );
        if (
          (seeded.seededGold || seeded.seededInventory || seeded.seededClothing) &&
          params.persistEconomy
        ) {
          try {
            await params.persistEconomy();
          } catch {
            return {
              ok: false,
              statusCode: 503,
              mode,
              exists: false,
              fallbackAllowed: true,
              didMigrate: false,
              performedFirestoreReads: true,
              economyPreservedFromDO,
              code: 'MIGRATION_PERSIST_FAILED',
              error: 'Failed to persist migrated DO economy; legacy data preserved.',
              uid,
              storageKey,
            };
          }
        }

        const authoritativeClothing = params.farmLedger.getPlayerOwnedClothing(uid);
        const initialRevision = Math.max(1, params.farmLedger.getSaveRevision(uid) || 1);
        const record = buildDOPlayerSaveFromLegacy({
          uid,
          legacy,
          authoritativeOwnedClothing: authoritativeClothing,
          economyPreservedFromDO,
          initialSaveRevision: initialRevision,
          fallbackName: params.fallbackName,
          fallbackGender: params.fallbackGender,
        });

        try {
          await params.storage.put(storageKey, record);
        } catch (err: any) {
          return {
            ok: false,
            statusCode: 503,
            mode,
            exists: false,
            fallbackAllowed: true,
            didMigrate: false,
            performedFirestoreReads: true,
            economyPreservedFromDO,
            code: 'MIGRATION_PERSIST_FAILED',
            error: err?.message || 'Failed to persist migrated DO player save.',
            uid,
            storageKey,
          };
        }

        return {
          ok: true,
          statusCode: 200,
          mode,
          exists: true,
          source: 'migrated_from_firestore',
          didMigrate: true,
          performedFirestoreReads: true,
          economyPreservedFromDO,
          uid,
          storageKey,
          record,
        };
      });

    this.migrationTailByUid.set(uid, task);
    try {
      return await task;
    } finally {
      if (this.migrationTailByUid.get(uid) === task) {
        this.migrationTailByUid.delete(uid);
      }
    }
  }

  /**
   * Initializes a brand-new player save record inside DO (`player_save:${uid}`) after character selection.
   * Safe against overwriting existing migrated/active DO records or verified DO economy.
   */
  public async initializeNewPlayerSaveToDO(params: {
    storage: DOStorageAdapter;
    farmLedger: FarmPlotServerLedger;
    authenticatedUid: string | null | undefined;
    playerName: unknown;
    gender: unknown;
    officialResetEpoch?: string | null;
    persistEconomy?: () => Promise<void>;
  }): Promise<DOPlayerSaveWriteResult> {
    const access = validateAuthenticatedUidAccess({ authenticatedUid: params.authenticatedUid });
    if (!access.ok) {
      return {
        ok: false,
        statusCode: access.statusCode,
        code: access.code,
        error: access.error,
        storageKey: '',
        saveRevision: 0,
        lastSavedAt: new Date().toISOString(),
      };
    }

    const uid = access.uid;
    const storageKey = getPlayerSaveStorageKey(uid);
    const prevTail = this.migrationTailByUid.get(uid) || Promise.resolve();

    const task = prevTail
      .catch(() => undefined)
      .then(async (): Promise<DOPlayerSaveWriteResult> => {
        const existing = await this.getPlayerSave(params.storage, uid);
        if (existing) {
          return {
            ok: true,
            statusCode: 200,
            storageKey,
            saveRevision: existing.saveRevision,
            lastSavedAt: existing.lastSavedAt,
            record: existing,
          };
        }

        const cleanName =
          typeof params.playerName === 'string' && params.playerName.trim().length >= 3
            ? params.playerName.trim().slice(0, 16)
            : 'Settler';
        const cleanGender: 'male' | 'female' = params.gender === 'female' ? 'female' : 'male';
        const nowIso = new Date().toISOString();
        const nowMs = Date.now();

        const seeded = params.farmLedger.seedAuthoritativeEconomy(
          uid,
          {
            gold: 25,
            inventorySlots: createStarterInventorySlots(),
            ownedClothing: [],
          },
          true
        );
        if (
          (seeded.seededGold || seeded.seededInventory || seeded.seededClothing) &&
          params.persistEconomy
        ) {
          await params.persistEconomy();
        }

        const record: DOPlayerSaveRecord = {
          schemaVersion: FOUNDATION_SAVE_VERSION,
          uid,
          saveRevision: 1,
          lastSavedAt: nowIso,
          lastClientTimestamp: nowMs,
          currentZone: 'Central Plaza (Main City)',
          player: {
            name: cleanName,
            gender: cleanGender,
            skinTone: cleanGender === 'female' ? '#f59e0b' : '#d97706',
            hairColor: cleanGender === 'female' ? '#78350f' : '#292524',
            clothesColor: cleanGender === 'female' ? '#10b981' : '#3b82f6',
            currentTool: 'axe_basic',
            facingDirection: 'down',
            equippedClothing: ClothingSystem.normalizeEquippedClothing(
              undefined,
              params.farmLedger.getPlayerOwnedClothing(uid),
              cleanGender
            ),
          },
          position: {
            tileX: 30,
            tileY: 30,
            facingDirection: 'down',
          },
          playerStats: getDefaultStats(),
          playerWorldChanges: {
            tutorialCompleted: false,
            discoveredZones: ['Central Plaza (Main City)'],
            ...(params.officialResetEpoch ? { resetEpoch: params.officialResetEpoch } : {}),
          },
          migration: {
            status: 'initialized_new_player',
            source: 'new_player_default',
            migratedAt: nowIso,
            economyPreservedFromDO: false,
            legacyPersonalBuildingsCount: 0,
          },
        };

        try {
          await params.storage.put(storageKey, record);
        } catch (err: any) {
          return {
            ok: false,
            statusCode: 500,
            code: 'DO_SAVE_FAILED',
            error: err?.message || 'Failed to initialize player save in DO.',
            storageKey,
            saveRevision: 0,
            lastSavedAt: nowIso,
          };
        }

        return {
          ok: true,
          statusCode: 200,
          storageKey,
          saveRevision: 1,
          lastSavedAt: nowIso,
          record,
        };
      });

    this.migrationTailByUid.set(uid, task);
    try {
      return await task;
    } finally {
      if (this.migrationTailByUid.get(uid) === task) {
        this.migrationTailByUid.delete(uid);
      }
    }
  }
}

/**
 * Hydrates client-ready `profile` & `gameState` (`version: 2`) on the fly by combining:
 * - Individual `player_save:${uid}` (DO)
 * - Authoritative `farmLedger` Gold/Inventory/Clothing/FarmOwnership (DO)
 * - Shared world `placedBuildings` filtered for personal buildings (DO — NEVER stored inside `player_save:${uid}`)
 */
export function buildHydratedClientBundleFromDO(params: {
  record: DOPlayerSaveRecord;
  farmLedger: FarmPlotServerLedger;
  placedBuildings?: ReadonlyArray<PlacedBuilding>;
}) {
  const { record, farmLedger } = params;
  const uid = record.uid;
  const authoritativeGold = farmLedger.getPlayerGold(uid);
  const authoritativeInventory = farmLedger.getPlayerInventory(uid);
  const authoritativeOwnedClothing = farmLedger.getPlayerOwnedClothing(uid);
  const authoritativeEquipped = ClothingSystem.normalizeEquippedClothing(
    record.player.equippedClothing,
    authoritativeOwnedClothing,
    record.player.gender
  );

  const ownersMap = farmLedger.serializeOwners();
  const ownedFarmPlots = Object.values(ownersMap)
    .filter((o) => o && o.ownerId === uid)
    .map((o) => o.plotId);

  const personalBuildings: PlacedBuilding[] = Array.isArray(params.placedBuildings)
    ? params.placedBuildings
        .filter((b) => b && (b.ownerId === uid || (!b.ownerId && b.placedBy === record.player.name)))
        .map((b) => ({
          ...b,
          storage: Array.isArray(b.storage)
            ? b.storage.map((s: NonNullable<PlacedBuilding['storage']>[number]) => ({ ...s }))
            : b.storage,
        }))
    : [];

  return {
    profile: {
      uid,
      playerName: record.player.name,
      gender: record.player.gender,
      createdAt: record.migration?.migratedAt || record.lastSavedAt,
      lastLoginAt: new Date().toISOString(),
      gameVersion: FOUNDATION_SAVE_VERSION,
    },
    gameState: {
      version: FOUNDATION_SAVE_VERSION,
      lastSaved: record.lastClientTimestamp || Date.parse(record.lastSavedAt) || Date.now(),
      currentZone: record.currentZone || 'Central Plaza (Main City)',
      player: {
        ...record.player,
        coins: authoritativeGold,
        ownedClothing: authoritativeOwnedClothing,
        equippedClothing: authoritativeEquipped,
      },
      position: {
        ...record.position,
      },
      inventory: {
        slots: authoritativeInventory,
        coins: authoritativeGold,
      },
      buildings: personalBuildings,
      playerStats: { ...record.playerStats },
      playerWorldChanges: {
        tutorialCompleted: Boolean(record.playerWorldChanges?.tutorialCompleted),
        discoveredZones: [...(record.playerWorldChanges?.discoveredZones || ['Central Plaza (Main City)'])],
        ...(record.playerWorldChanges?.resetEpoch
          ? { resetEpoch: record.playerWorldChanges.resetEpoch }
          : {}),
        ...(ownedFarmPlots.length > 0 ? { ownedFarmPlots } : {}),
      },
    },
    authoritativeEconomy: {
      gold: authoritativeGold,
      inventorySlots: authoritativeInventory,
      ownedClothing: authoritativeOwnedClothing,
    },
  };
}

