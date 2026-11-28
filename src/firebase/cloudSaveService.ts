/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './config';
import { handleFirestoreError, OperationType } from './errorHandler';
import { resolveServerHttpBaseUrl } from './officialLaunchService';
import {
  EquippedClothingState,
  PlacedBuilding,
  PlayerProfile,
  PlayerStats,
  PlayerWorldChanges,
} from '../game/types';
import { BuildingSystem } from '../game/systems/BuildingSystem';
import { ClothingSystem } from '../game/systems/ClothingSystem';
import { CURRENT_SAVE_VERSION, SavedGameState, SaveSystem } from '../game/systems/SaveSystem';

export interface UserProfileDoc {
  uid: string;
  playerName: string;
  gender: 'male' | 'female';
  createdAt: string;
  lastLoginAt: string;
  gameVersion: number;
}

export interface PlayerStateDoc {
  positionX: number;
  positionY: number;
  currentZone: string;
  gold: number;
  inventory: { item: string; quantity: number }[];
  equipment: {
    currentTool: string | null;
    facingDirection?: 'down' | 'left' | 'right' | 'up';
    ownedClothing?: string[];
    equippedClothing?: EquippedClothingState;
  };
  playerStats: PlayerStats;
  lastSavedAt: string;
}

export interface StoredChestSnapshot {
  id: string;
  tileX: number;
  tileY: number;
  storage: { item: string; quantity: number }[];
}

export interface WorldStateDoc {
  placedBuildings: PlacedBuilding[];
  storageBoxes: StoredChestSnapshot[];
  playerWorldChanges: PlayerWorldChanges | Record<string, any>;
  lastSavedAt: string;
}

export interface CloudSaveAuthoritativeEconomy {
  gold: number;
  inventorySlots: { item: string; quantity: number }[];
  ownedClothing: string[];
}

export type CloudSaveCutoverMode = 'do_primary' | 'legacy_firestore';

export interface CloudSaveWriteResult {
  ok: true;
  mode?: CloudSaveCutoverMode;
  storageKey?: string;
  saveRevision?: number;
  lastSavedAt?: string;
  deduplicated?: boolean;
  authoritativeEconomy?: CloudSaveAuthoritativeEconomy;
}

export interface CloudSaveOptions {
  saveId?: string;
  expectedRevision?: number;
  baseUrlOverride?: string;
  idTokenOverride?: string;
  fetchImpl?: typeof fetch;
}

export interface DOLoadResult {
  ok: boolean;
  mode: CloudSaveCutoverMode;
  exists: boolean;
  needsCharacterCreation?: boolean;
  fallbackToLegacy?: boolean;
  fallbackAllowed?: boolean;
  source?: 'do_primary' | 'migrated_from_firestore';
  didMigrate?: boolean;
  performedFirestoreReads?: boolean;
  economyPreservedFromDO?: boolean;
  storageKey?: string;
  saveRevision?: number;
  officialResetEpoch?: string | null;
  profile?: UserProfileDoc;
  gameState?: SavedGameState;
  authoritativeEconomy?: CloudSaveAuthoritativeEconomy;
  code?: string;
  error?: string;
  status?: number;
}

export interface DOInitResult {
  ok: true;
  mode: CloudSaveCutoverMode;
  storageKey: string;
  saveRevision: number;
  lastSavedAt: string;
  profile: UserProfileDoc;
  gameState: SavedGameState;
  authoritativeEconomy: CloudSaveAuthoritativeEconomy;
}

export class CloudSaveRequestError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly authoritativeEconomy?: CloudSaveAuthoritativeEconomy;
  public readonly retryAfterSeconds?: number;
  public readonly saveRevision?: number;
  public readonly fallbackAllowed?: boolean;

  constructor(
    message: string,
    status: number,
    code: string,
    retryable: boolean,
    authoritativeEconomy?: CloudSaveAuthoritativeEconomy,
    retryAfterSeconds?: number,
    saveRevision?: number,
    fallbackAllowed?: boolean
  ) {
    super(message);
    this.name = 'CloudSaveRequestError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.authoritativeEconomy = authoritativeEconomy;
    this.retryAfterSeconds = retryAfterSeconds;
    this.saveRevision = saveRevision;
    this.fallbackAllowed = fallbackAllowed;
  }
}

export class CloudSaveService {
  /**
   * Client-side rollback feature flag (`VITE_DO_SAVE_CUTOVER_ENABLED=false` reverts immediately to legacy Firestore path).
   */
  public static isDOPrimaryEnabled(envOverride?: Record<string, any>): boolean {
    const raw =
      envOverride?.VITE_DO_SAVE_CUTOVER_ENABLED ??
      (import.meta as any)?.env?.VITE_DO_SAVE_CUTOVER_ENABLED;
    if (typeof raw === 'string' && raw.trim().toLowerCase() === 'false') {
      return false;
    }
    return true;
  }

  /**
   * True when built with `vite build --mode staging` (`VITE_APP_ENV=staging`).
   * Used client-side to prevent staging sessions from writing metadata (`lastLoginAt`, `users/{uid}`)
   * into Production Firestore.
   */
  public static isStagingEnvironment(envOverride?: Record<string, any>): boolean {
    const raw =
      envOverride?.VITE_APP_ENV ??
      (import.meta as any)?.env?.VITE_APP_ENV;
    return typeof raw === 'string' && raw.trim().toLowerCase() === 'staging';
  }

  private static async resolveAuthToken(
    uid: string,
    options?: Pick<CloudSaveOptions, 'idTokenOverride'>
  ): Promise<{ idToken: string; currentUser: (typeof auth)['currentUser'] }> {
    const currentUser = auth?.currentUser ?? null;
    let idToken = options?.idTokenOverride?.trim() || '';
    if (!idToken) {
      if (!currentUser || currentUser.uid !== uid) {
        throw new CloudSaveRequestError(
          'Authentication required before accessing player cloud save.',
          401,
          'AUTH_REQUIRED',
          false,
          undefined,
          undefined,
          undefined,
          false
        );
      }
      idToken = await currentUser.getIdToken(false);
    }

    if (!idToken) {
      throw new CloudSaveRequestError(
        'Missing Firebase ID token for cloud save.',
        401,
        'AUTH_REQUIRED',
        false,
        undefined,
        undefined,
        undefined,
        false
      );
    }

    return { idToken, currentUser };
  }

  private static async parseJsonResponse(res: Response): Promise<{
    data: any;
    isNonJsonHtmlFallback: boolean;
  }> {
    const contentType = (res.headers?.get?.('content-type') || '').toLowerCase();
    let data: any = null;
    let isNonJsonHtmlFallback = false;

    if (typeof res.text === 'function') {
      const rawText = await res.text().catch(() => '');
      const trimmed = rawText.trim();
      if (trimmed.length > 0) {
        try {
          data = JSON.parse(trimmed);
        } catch {
          if (contentType.includes('text/html') || trimmed.startsWith('<')) {
            isNonJsonHtmlFallback = true;
          }
        }
      }
    } else if (typeof res.json === 'function') {
      data = await res.json().catch(() => null);
    }

    return { data, isNonJsonHtmlFallback };
  }

  /**
   * Staged Phase 1: Load player save from Durable Object (`GET /api/player/load`),
   * triggering Read-Only legacy Firestore migration on first login if needed.
   */
  public static async loadGameStateFromDO(
    uid: string,
    options?: Pick<CloudSaveOptions, 'baseUrlOverride' | 'idTokenOverride' | 'fetchImpl'>
  ): Promise<DOLoadResult> {
    const fetchFn = options?.fetchImpl || fetch;
    const base =
      options?.baseUrlOverride !== undefined
        ? options.baseUrlOverride
        : resolveServerHttpBaseUrl();

    const { idToken, currentUser } = await this.resolveAuthToken(uid, options);

    const getLoad = async (token: string): Promise<Response> => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
      try {
        return await fetchFn(`${base}/api/player/load`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
          ...(controller ? { signal: controller.signal } : {}),
        });
      } catch (networkErr: any) {
        throw new CloudSaveRequestError(
          networkErr?.message || 'Network error while loading player save from DO.',
          0,
          'NETWORK_ERROR',
          true,
          undefined,
          undefined,
          undefined,
          true
        );
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    let res = await getLoad(idToken);
    if (res.status === 401 && !options?.idTokenOverride && currentUser && currentUser.uid === uid) {
      const refreshed = await currentUser.getIdToken(true).catch(() => '');
      if (refreshed) {
        res = await getLoad(refreshed);
      }
    }

    const { data, isNonJsonHtmlFallback } = await this.parseJsonResponse(res);

    if (isNonJsonHtmlFallback) {
      return {
        ok: false,
        mode: 'do_primary',
        exists: false,
        fallbackAllowed: true,
        code: 'BACKEND_ROUTE_UNAVAILABLE',
        error: `DO load API returned HTML instead of JSON (${res.status}).`,
        status: res.status,
      };
    }

    if (!res.ok || !data?.ok) {
      const code = data?.code || `HTTP_${res.status}`;
      const authRejected = res.status === 401 || res.status === 403 || code === 'UID_MISMATCH';
      const fallbackAllowed = authRejected ? false : data?.fallbackAllowed !== false;
      return {
        ok: false,
        mode: data?.mode === 'legacy_firestore' ? 'legacy_firestore' : 'do_primary',
        exists: false,
        fallbackAllowed,
        code,
        error: data?.error || `DO player load failed (${res.status}).`,
        status: res.status,
      };
    }

    if (data.fallbackToLegacy) {
      return {
        ok: true,
        mode: 'legacy_firestore',
        exists: false,
        fallbackToLegacy: true,
        fallbackAllowed: true,
        officialResetEpoch:
          typeof data.officialResetEpoch === 'string' ? data.officialResetEpoch : null,
        status: res.status,
      };
    }

    if (data.needsCharacterCreation || !data.exists || !data.gameState || !data.profile) {
      return {
        ok: true,
        mode: data.mode === 'legacy_firestore' ? 'legacy_firestore' : 'do_primary',
        exists: false,
        needsCharacterCreation: Boolean(data.needsCharacterCreation),
        performedFirestoreReads: Boolean(data.performedFirestoreReads),
        officialResetEpoch:
          typeof data.officialResetEpoch === 'string' ? data.officialResetEpoch : null,
        status: res.status,
      };
    }

    const profile: UserProfileDoc = {
      uid: String(data.profile.uid || uid),
      playerName: String(data.profile.playerName || 'Settler'),
      gender: data.profile.gender === 'female' ? 'female' : 'male',
      createdAt: String(data.profile.createdAt || new Date().toISOString()),
      lastLoginAt: String(data.profile.lastLoginAt || new Date().toISOString()),
      gameVersion:
        typeof data.profile.gameVersion === 'number'
          ? data.profile.gameVersion
          : CURRENT_SAVE_VERSION,
    };

    const normalizedState = SaveSystem.migrateGameState(
      data.gameState as Partial<SavedGameState>,
      profile.playerName,
      profile.gender
    );

    return {
      ok: true,
      mode: data.mode === 'legacy_firestore' ? 'legacy_firestore' : 'do_primary',
      exists: true,
      source: data.source === 'migrated_from_firestore' ? 'migrated_from_firestore' : 'do_primary',
      didMigrate: Boolean(data.didMigrate),
      performedFirestoreReads: Boolean(data.performedFirestoreReads),
      economyPreservedFromDO: Boolean(data.economyPreservedFromDO),
      storageKey: typeof data.storageKey === 'string' ? data.storageKey : undefined,
      saveRevision: typeof data.saveRevision === 'number' ? data.saveRevision : 1,
      officialResetEpoch:
        typeof data.officialResetEpoch === 'string' ? data.officialResetEpoch : null,
      profile,
      gameState: normalizedState,
      authoritativeEconomy: data.authoritativeEconomy,
      status: res.status,
    };
  }

  /**
   * Initialize a brand-new character save directly inside DO (`POST /api/player/init`).
   */
  public static async initPlayerSaveInDO(
    uid: string,
    playerName: string,
    gender: 'male' | 'female',
    options?: Pick<CloudSaveOptions, 'baseUrlOverride' | 'idTokenOverride' | 'fetchImpl'>
  ): Promise<DOInitResult> {
    const fetchFn = options?.fetchImpl || fetch;
    const base =
      options?.baseUrlOverride !== undefined
        ? options.baseUrlOverride
        : resolveServerHttpBaseUrl();

    const { idToken, currentUser } = await this.resolveAuthToken(uid, options);

    const postInit = async (token: string): Promise<Response> => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
      try {
        return await fetchFn(`${base}/api/player/init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            uid,
            playerName: playerName.trim(),
            gender,
          }),
          cache: 'no-store',
          ...(controller ? { signal: controller.signal } : {}),
        });
      } catch (networkErr: any) {
        throw new CloudSaveRequestError(
          networkErr?.message || 'Network error while initializing DO player save.',
          0,
          'NETWORK_ERROR',
          true
        );
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    let res = await postInit(idToken);
    if (res.status === 401 && !options?.idTokenOverride && currentUser && currentUser.uid === uid) {
      const refreshed = await currentUser.getIdToken(true).catch(() => '');
      if (refreshed) {
        res = await postInit(refreshed);
      }
    }

    const { data, isNonJsonHtmlFallback } = await this.parseJsonResponse(res);
    if (!res.ok || !data?.ok || !data?.profile || !data?.gameState) {
      const code = isNonJsonHtmlFallback
        ? 'BACKEND_ROUTE_UNAVAILABLE'
        : data?.code || `HTTP_${res.status}`;
      const message = isNonJsonHtmlFallback
        ? `DO init API returned HTML instead of JSON (${res.status}).`
        : data?.error || `Failed to initialize player save in DO (${res.status}).`;
      const nonRetryable =
        isNonJsonHtmlFallback ||
        res.status === 400 ||
        res.status === 401 ||
        res.status === 403 ||
        res.status === 404;
      throw new CloudSaveRequestError(message, res.status, code, !nonRetryable);
    }

    const profile: UserProfileDoc = {
      uid: String(data.profile.uid || uid),
      playerName: String(data.profile.playerName || playerName.trim()),
      gender: data.profile.gender === 'female' ? 'female' : 'male',
      createdAt: String(data.profile.createdAt || new Date().toISOString()),
      lastLoginAt: String(data.profile.lastLoginAt || new Date().toISOString()),
      gameVersion:
        typeof data.profile.gameVersion === 'number'
          ? data.profile.gameVersion
          : CURRENT_SAVE_VERSION,
    };

    return {
      ok: true,
      mode: data.mode === 'legacy_firestore' ? 'legacy_firestore' : 'do_primary',
      storageKey: String(data.storageKey || `player_save:${uid}`),
      saveRevision: typeof data.saveRevision === 'number' ? data.saveRevision : 1,
      lastSavedAt: String(data.lastSavedAt || new Date().toISOString()),
      profile,
      gameState: SaveSystem.migrateGameState(data.gameState, profile.playerName, profile.gender),
      authoritativeEconomy: data.authoritativeEconomy,
    };
  }

  /**
   * Load existing player profile document from users/{uid}
   */
  public static async loadUserProfile(uid: string): Promise<UserProfileDoc | null> {
    const path = `users/${uid}`;
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) {
        return null;
      }
      return snap.data() as UserProfileDoc;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }

  /**
   * Create new player profile on users/{uid}
   */
  public static async createUserProfile(
    uid: string,
    playerName: string,
    gender: 'male' | 'female'
  ): Promise<UserProfileDoc> {
    const path = `users/${uid}`;
    const now = new Date().toISOString();
    const profile: UserProfileDoc = {
      uid,
      playerName: playerName.trim(),
      gender,
      createdAt: now,
      lastLoginAt: now,
      gameVersion: CURRENT_SAVE_VERSION,
    };

    try {
      await setDoc(doc(db, 'users', uid), profile);
      return profile;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }

  /**
   * Update login timestamp on users/{uid}
   */
  public static async updateLastLogin(uid: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'users', uid), {
        lastLoginAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Could not update last login timestamp:', err);
    }
  }

  /**
   * Update player name in profile
   */
  public static async updatePlayerName(uid: string, newName: string): Promise<void> {
    const path = `users/${uid}`;
    try {
      await updateDoc(doc(db, 'users', uid), {
        playerName: newName.trim(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  /**
   * Load entire game state: playerState and worldState, migrating v1 docs cleanly to v2
   */
  public static async loadGameState(uid: string, profile: UserProfileDoc): Promise<SavedGameState | null> {
    const playerStatePath = `users/${uid}/gameData/playerState`;
    const worldStatePath = `users/${uid}/gameData/worldState`;

    try {
      const [playerSnap, worldSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid, 'gameData', 'playerState')),
        getDoc(doc(db, 'users', uid, 'gameData', 'worldState')),
      ]);

      if (!playerSnap.exists() && !worldSnap.exists()) {
        return null;
      }

      const fallbackDefaults = SaveSystem.getDefaultState(profile.playerName, profile.gender);
      const playerDoc: Partial<PlayerStateDoc> = playerSnap.exists()
        ? (playerSnap.data() as PlayerStateDoc)
        : {
            positionX: fallbackDefaults.position.tileX,
            positionY: fallbackDefaults.position.tileY,
            currentZone: fallbackDefaults.currentZone,
            gold: fallbackDefaults.inventory.coins,
            inventory: fallbackDefaults.inventory.slots,
            equipment: {
              currentTool: fallbackDefaults.player.currentTool || 'axe_basic',
              facingDirection: 'down',
              ownedClothing: [],
              equippedClothing: {},
            },
            playerStats: fallbackDefaults.playerStats,
          };
      const worldDoc = worldSnap.exists() ? (worldSnap.data() as WorldStateDoc) : null;

      const ownedClothing = ClothingSystem.normalizeOwnedClothing(
        playerDoc.equipment?.ownedClothing
      );
      const equippedClothing = ClothingSystem.normalizeEquippedClothing(
        playerDoc.equipment?.equippedClothing,
        ownedClothing,
        profile.gender
      );
      const facingDirection = SaveSystem.normalizeDirection(playerDoc.equipment?.facingDirection);

      const safePosX =
        typeof playerDoc.positionX === 'number' && Number.isFinite(playerDoc.positionX)
          ? Math.max(0, Math.min(119, playerDoc.positionX))
          : 30;
      const safePosY =
        typeof playerDoc.positionY === 'number' && Number.isFinite(playerDoc.positionY)
          ? Math.max(0, Math.min(119, playerDoc.positionY))
          : 30;
      const safeGold =
        typeof playerDoc.gold === 'number' && Number.isFinite(playerDoc.gold)
          ? Math.max(0, playerDoc.gold)
          : 25;

      const playerProfile: PlayerProfile = {
        name: profile.playerName,
        gender: profile.gender,
        skinTone: profile.gender === 'male' ? '#d97706' : '#f59e0b',
        hairColor: profile.gender === 'male' ? '#292524' : '#78350f',
        clothesColor: profile.gender === 'male' ? '#3b82f6' : '#10b981',
        coins: safeGold,
        currentTool: (playerDoc.equipment?.currentTool as any) ?? 'axe_basic',
        facingDirection,
        ownedClothing,
        equippedClothing,
      };

      // Rehydrate placedBuildings and restore storageBoxes snapshot if building.storage is missing
      const chestMap = new Map<string, any[]>();
      if (Array.isArray(worldDoc?.storageBoxes)) {
        for (const box of worldDoc.storageBoxes) {
          if (box?.id && Array.isArray(box.storage)) {
            chestMap.set(box.id, box.storage);
          }
        }
      }

      const hydratedBuildings: PlacedBuilding[] = ((worldDoc?.placedBuildings as PlacedBuilding[]) || []).map((b) => {
        const fp = BuildingSystem.getFootprint(b.type);
        const restoredStorage =
          Array.isArray(b.storage) && b.storage.length > 0
            ? b.storage
            : chestMap.get(b.id) || (b.type === 'storage_box' ? [] : undefined);

        return {
          ...b,
          width: b.width || fp.width,
          height: b.height || fp.height,
          rotation: b.type === 'fence_wood' ? BuildingSystem.normalizeRotation(b.rotation) : 0,
          ownerId: b.ownerId || uid,
          storage: restoredStorage,
        };
      });

      const parsedTime = Math.max(
        Date.parse(playerDoc.lastSavedAt || '') || 0,
        Date.parse(worldDoc?.lastSavedAt || '') || 0
      );

      const rawState: Partial<SavedGameState> = {
        version: profile.gameVersion || 1,
        lastSaved: parsedTime || Date.now(),
        currentZone: playerDoc.currentZone || 'Central Plaza (Main City)',
        player: playerProfile,
        position: {
          tileX: safePosX,
          tileY: safePosY,
          facingDirection,
        },
        inventory: {
          slots: (playerDoc.inventory as any) || [],
          coins: safeGold,
        },
        buildings: hydratedBuildings,
        playerStats: {
          ...SaveSystem.getDefaultStats(),
          ...(playerDoc.playerStats || {}),
        },
        playerWorldChanges: worldDoc?.playerWorldChanges as PlayerWorldChanges,
      };

      return SaveSystem.migrateGameState(rawState, profile.playerName, profile.gender);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${playerStatePath} & ${worldStatePath}`);
    }
  }

  /**
   * Build strictly non-economy save payload for Backend-Mediated Cloud Save (`POST /api/player/save`).
   * Server ignores/rejects client economy manipulation and injects authoritative Gold, Inventory & Owned Clothing.
   */
  public static buildClientSavePayload(
    uid: string,
    state: SavedGameState,
    currentZone = 'Central Plaza (Main City)',
    saveId?: string
  ): Record<string, any> {
    const safeSavedMs =
      typeof state.lastSaved === 'number' && Number.isFinite(state.lastSaved) && state.lastSaved > 0
        ? Math.floor(state.lastSaved)
        : Date.now();

    const stats: PlayerStats = {
      ...SaveSystem.getDefaultStats(),
      ...(state.playerStats || {}),
    };

    const worldChanges: PlayerWorldChanges = {
      ...SaveSystem.getDefaultWorldChanges(),
      ...(state.playerWorldChanges || {}),
    };

    const ownedClothing = ClothingSystem.normalizeOwnedClothing(state.player.ownedClothing);
    const equippedClothing = ClothingSystem.normalizeEquippedClothing(
      state.player.equippedClothing,
      ownedClothing,
      state.player.gender
    );
    const facingDirection = SaveSystem.normalizeDirection(
      state.position?.facingDirection ?? state.player?.facingDirection
    );

    const safePosX =
      typeof state.position?.tileX === 'number' && Number.isFinite(state.position.tileX)
        ? Math.max(0, Math.min(119, Math.round(state.position.tileX * 100) / 100))
        : 30;
    const safePosY =
      typeof state.position?.tileY === 'number' && Number.isFinite(state.position.tileY)
        ? Math.max(0, Math.min(119, Math.round(state.position.tileY * 100) / 100))
        : 30;

    const serializedBuildings: PlacedBuilding[] = state.buildings.slice(0, 500).map((b) => {
      const fp = BuildingSystem.getFootprint(b.type);
      return {
        id: b.id,
        type: b.type,
        tileX: b.tileX,
        tileY: b.tileY,
        width: b.width || fp.width,
        height: b.height || fp.height,
        rotation: b.type === 'fence_wood' ? BuildingSystem.normalizeRotation(b.rotation) : 0,
        ownerId: uid,
        placedBy: b.placedBy || state.player.name,
        createdAt: b.createdAt,
        storage: b.storage ? b.storage.map((s) => ({ item: s.item, quantity: s.quantity })) : [],
      };
    });

    const storageBoxes: StoredChestSnapshot[] = serializedBuildings
      .filter((b) => b.type === 'storage_box')
      .slice(0, 200)
      .map((b) => ({
        id: b.id,
        tileX: b.tileX,
        tileY: b.tileY,
        storage: (b.storage || []).map((s) => ({ item: s.item, quantity: s.quantity })),
      }));

    return {
      ...(saveId ? { saveId } : {}),
      clientTimestamp: safeSavedMs,
      positionX: safePosX,
      positionY: safePosY,
      currentZone: (state.currentZone || currentZone).slice(0, 128),
      gender: state.player.gender === 'female' ? 'female' : 'male',
      playerName: (state.player.name || 'Settler').slice(0, 16),
      equipment: {
        currentTool: state.player.currentTool || null,
        facingDirection,
        equippedClothing,
      },
      playerStats: stats,
      placedBuildings: serializedBuildings,
      storageBoxes,
      playerWorldChanges: worldChanges,
    };
  }

  /**
   * Backend-Mediated Cloud Save: routes playerState & worldState persistence exclusively
   * through authenticated `POST /api/player/save` (DO Primary or Legacy Firestore rollback mode).
   */
  public static async saveGameState(
    uid: string,
    state: SavedGameState,
    currentZone = 'Central Plaza (Main City)',
    options?: CloudSaveOptions
  ): Promise<CloudSaveWriteResult> {
    const fetchFn = options?.fetchImpl || fetch;
    const base =
      options?.baseUrlOverride !== undefined
        ? options.baseUrlOverride
        : resolveServerHttpBaseUrl();

    const { idToken, currentUser } = await this.resolveAuthToken(uid, options);

    const payload = {
      ...this.buildClientSavePayload(uid, state, currentZone, options?.saveId),
      ...(typeof options?.expectedRevision === 'number' &&
      Number.isInteger(options.expectedRevision) &&
      options.expectedRevision >= 0
        ? { expectedRevision: options.expectedRevision }
        : {}),
    };

    const postSave = async (token: string): Promise<Response> => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 9000) : null;
      try {
        return await fetchFn(`${base}/api/player/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          cache: 'no-store',
          ...(controller ? { signal: controller.signal } : {}),
        });
      } catch (networkErr: any) {
        throw new CloudSaveRequestError(
          networkErr?.message || 'Network error while saving to server.',
          0,
          'NETWORK_ERROR',
          true
        );
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    let res = await postSave(idToken);
    if (res.status === 401 && !options?.idTokenOverride && currentUser && currentUser.uid === uid) {
      const refreshed = await currentUser.getIdToken(true).catch(() => '');
      if (refreshed) {
        res = await postSave(refreshed);
      }
    }

    const { data, isNonJsonHtmlFallback } = await this.parseJsonResponse(res);

    if (!res.ok || !data?.ok) {
      const code = isNonJsonHtmlFallback
        ? 'BACKEND_ROUTE_UNAVAILABLE'
        : data?.code || `HTTP_${res.status}`;
      const message = isNonJsonHtmlFallback
        ? `Cloud save API returned HTML instead of JSON (${res.status}). Ensure the backend /api/player/save endpoint is active.`
        : data?.error || `Server cloud save failed (${res.status}).`;
      const nonRetryable =
        isNonJsonHtmlFallback ||
        res.status === 400 ||
        res.status === 401 ||
        res.status === 403 ||
        res.status === 404 ||
        code === 'SERVER_CREDENTIALS_MISSING' ||
        (res.status === 409 && (code === 'STALE_SAVE' || code === 'SAVE_REVISION_CONFLICT'));
      const retryAfterRaw = res.headers?.get?.('Retry-After');
      const retryAfterParsed = retryAfterRaw ? parseInt(retryAfterRaw, 10) : NaN;
      const retryAfterSeconds =
        Number.isFinite(retryAfterParsed) && retryAfterParsed > 0 ? retryAfterParsed : undefined;
      const serverRevision =
        typeof data?.saveRevision === 'number' ? data.saveRevision : undefined;
      const fallbackAllowed =
        typeof data?.fallbackAllowed === 'boolean' ? data.fallbackAllowed : undefined;
      throw new CloudSaveRequestError(
        message,
        res.status,
        code,
        !nonRetryable,
        data?.authoritativeEconomy,
        retryAfterSeconds,
        serverRevision,
        fallbackAllowed
      );
    }

    return {
      ok: true,
      mode: data.mode === 'legacy_firestore' ? 'legacy_firestore' : 'do_primary',
      storageKey: typeof data.storageKey === 'string' ? data.storageKey : undefined,
      saveRevision: data.saveRevision,
      lastSavedAt: data.lastSavedAt,
      deduplicated: Boolean(data.deduplicated),
      authoritativeEconomy: data.authoritativeEconomy,
    };
  }
}
