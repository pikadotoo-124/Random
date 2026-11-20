/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth } from '../../firebase/config';
import { CloudSaveService } from '../../firebase/cloudSaveService';
import { STARTER_TOOLS, isStarterTool } from '../constants';
import {
  FacingDirection,
  InventorySlot,
  PlacedBuilding,
  PlayerProfile,
  PlayerStats,
  PlayerWorldChanges,
} from '../types';
import { BuildingSystem } from './BuildingSystem';
import { ClothingSystem } from './ClothingSystem';

export const CURRENT_SAVE_VERSION = 2;

export type CloudSyncStatus = 'idle' | 'saving' | 'saved' | 'pending_offline' | 'error';

export interface CloudSyncState {
  status: CloudSyncStatus;
  lastSyncedAt?: number;
  errorMessage?: string;
}

export interface SavedGameState {
  version: number;
  lastSaved: number;
  currentZone?: string;
  player: PlayerProfile;
  position: {
    tileX: number;
    tileY: number;
    facingDirection?: FacingDirection;
  };
  inventory: { slots: InventorySlot[]; coins: number };
  buildings: PlacedBuilding[];
  playerStats?: PlayerStats;
  playerWorldChanges?: PlayerWorldChanges;
}

const STORAGE_KEY_DEFAULT = 'random_city_save_v1';
const DEBOUNCE_SAVE_MS = 450;
const MAX_AUTO_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 2500;
const RETRY_MAX_DELAY_MS = 30000;

type SyncListener = (state: CloudSyncState) => void;

type CloudWriteAdapter = (
  uid: string,
  state: SavedGameState,
  currentZone: string
) => Promise<boolean>;

interface QueuedSavePayload {
  state: SavedGameState;
  currentZone: string;
  resolvers: Array<(ok: boolean) => void>;
}

interface UidSaveQueue {
  inFlight: Promise<boolean> | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryAttempt: number;
  queued: QueuedSavePayload | null;
  lastMonotonicTs: number;
}

export class SaveSystem {
  private static uidQueues = new Map<string, UidSaveQueue>();
  private static syncListeners: Set<SyncListener> = new Set();
  private static currentSyncState: CloudSyncState = { status: 'idle' };

  // Testable hooks (default strictly to Firebase Auth & Firestore in production)
  private static cloudWriterOverride: CloudWriteAdapter | null = null;
  private static authUidCheckOverride: ((uid: string) => boolean) | null = null;
  private static onlineCheckOverride: (() => boolean) | null = null;

  public static setCloudAdaptersForTest(adapters: {
    writer?: CloudWriteAdapter | null;
    isAuthorized?: ((uid: string) => boolean) | null;
    isOnline?: (() => boolean) | null;
  } | null): void {
    if (!adapters) {
      this.cloudWriterOverride = null;
      this.authUidCheckOverride = null;
      this.onlineCheckOverride = null;
      return;
    }
    if (adapters.writer !== undefined) this.cloudWriterOverride = adapters.writer;
    if (adapters.isAuthorized !== undefined) this.authUidCheckOverride = adapters.isAuthorized;
    if (adapters.isOnline !== undefined) this.onlineCheckOverride = adapters.isOnline;
  }

  public static normalizeDirection(dir?: unknown): FacingDirection {
    if (dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right') {
      return dir;
    }
    return 'down';
  }

  private static getQueue(uid: string): UidSaveQueue {
    let q = this.uidQueues.get(uid);
    if (!q) {
      q = {
        inFlight: null,
        debounceTimer: null,
        retryTimer: null,
        retryAttempt: 0,
        queued: null,
        lastMonotonicTs: 0,
      };
      this.uidQueues.set(uid, q);
    }
    return q;
  }

  private static nextMonotonicTimestamp(uid: string, candidate?: number): number {
    const q = this.getQueue(uid);
    const base = typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0 ? candidate : Date.now();
    const next = Math.max(Date.now(), base, q.lastMonotonicTs + 1);
    q.lastMonotonicTs = next;
    return next;
  }

  public static subscribeSyncStatus(listener: SyncListener): () => void {
    this.syncListeners.add(listener);
    listener(this.currentSyncState);
    return () => {
      this.syncListeners.delete(listener);
    };
  }

  public static getSyncStatus(): CloudSyncState {
    return this.currentSyncState;
  }

  private static setSyncStatus(next: CloudSyncState): void {
    this.currentSyncState = next;
    for (const l of this.syncListeners) {
      try {
        l(next);
      } catch {
        // Ignore subscriber error
      }
    }
  }

  private static getStorageKey(uid?: string): string {
    return uid ? `random_city_save_${uid}` : STORAGE_KEY_DEFAULT;
  }

  private static getPendingSyncKey(uid?: string): string {
    return uid ? `random_city_pending_sync_${uid}` : 'random_city_pending_sync_guest';
  }

  public static getDefaultStats(): PlayerStats {
    return {
      health: 100,
      stamina: 100,
      totalGathered: 0,
      totalCrafted: 0,
      totalBuilt: 0,
      totalSoldGold: 0,
    };
  }

  public static getDefaultWorldChanges(): PlayerWorldChanges {
    return {
      tutorialCompleted: false,
      discoveredZones: ['Central Plaza (Main City)'],
    };
  }

  /**
   * Upgrade legacy v0/v1 saves cleanly to v2 without deleting or resetting player data
   */
  public static migrateGameState(
    raw: Partial<SavedGameState> | null | undefined,
    fallbackName = 'Settler',
    fallbackGender: 'male' | 'female' = 'male'
  ): SavedGameState {
    if (!raw || typeof raw !== 'object') {
      return this.getDefaultState(fallbackName, fallbackGender);
    }

    const resolvedGender: 'male' | 'female' =
      raw.player?.gender === 'female'
        ? 'female'
        : raw.player?.gender === 'male'
        ? 'male'
        : fallbackGender;

    const base = this.getDefaultState(
      raw.player?.name || fallbackName,
      resolvedGender
    );

    const coins =
      typeof raw.inventory?.coins === 'number' && Number.isFinite(raw.inventory.coins)
        ? Math.max(0, Math.round(raw.inventory.coins))
        : typeof raw.player?.coins === 'number' && Number.isFinite(raw.player.coins)
        ? Math.max(0, Math.round(raw.player.coins))
        : base.inventory.coins;

    const rawSlots: InventorySlot[] = Array.isArray(raw.inventory?.slots)
      ? raw.inventory.slots
          .filter(
            (s) =>
              s &&
              typeof s.item === 'string' &&
              typeof s.quantity === 'number' &&
              Number.isFinite(s.quantity) &&
              Math.floor(s.quantity) > 0
          )
          .map((s) => ({
            item: s.item,
            quantity: isStarterTool(s.item) ? 1 : Math.floor(s.quantity),
          }))
      : base.inventory.slots.map((s) => ({ ...s }));

    const slots: InventorySlot[] = [];
    const seenStarterTools = new Set<string>();
    for (const s of rawSlots) {
      if (isStarterTool(s.item)) {
        if (seenStarterTools.has(s.item)) continue;
        seenStarterTools.add(s.item);
      }
      slots.push(s);
    }
    for (const toolId of STARTER_TOOLS) {
      if (!seenStarterTools.has(toolId)) {
        slots.unshift({ item: toolId, quantity: 1 });
        seenStarterTools.add(toolId);
      }
    }

    const buildings: PlacedBuilding[] = Array.isArray(raw.buildings)
      ? raw.buildings
          .filter((b) => b && typeof b.id === 'string' && typeof b.type === 'string')
          .map((b) => {
            const fp = BuildingSystem.getFootprint(b.type);
            return {
              ...b,
              width: b.width || fp.width,
              height: b.height || fp.height,
              rotation: b.type === 'fence_wood' ? BuildingSystem.normalizeRotation(b.rotation) : 0,
              storage: Array.isArray(b.storage)
                ? b.storage
                    .filter((s) => s && s.item && typeof s.quantity === 'number' && Math.floor(s.quantity) > 0)
                    .map((s) => ({ item: s.item, quantity: Math.floor(s.quantity) }))
                : b.type === 'storage_box'
                ? []
                : undefined,
            };
          })
      : [];

    const stats = {
      ...this.getDefaultStats(),
      ...(raw.playerStats || {}),
    };

    const worldChangesRaw = raw.playerWorldChanges as any;
    const resetEpoch =
      typeof worldChangesRaw?.resetEpoch === 'string' && worldChangesRaw.resetEpoch.trim().length > 0
        ? worldChangesRaw.resetEpoch.trim().slice(0, 64)
        : undefined;
    const worldChanges: PlayerWorldChanges = {
      tutorialCompleted: Boolean(worldChangesRaw?.tutorialCompleted),
      discoveredZones: Array.isArray(worldChangesRaw?.discoveredZones)
        ? Array.from(new Set(worldChangesRaw.discoveredZones.filter((z: any) => typeof z === 'string')))
        : ['Central Plaza (Main City)'],
      ...(resetEpoch ? { resetEpoch } : {}),
    };

    const ownedClothing = ClothingSystem.normalizeOwnedClothing(raw.player?.ownedClothing);
    const equippedClothing = ClothingSystem.normalizeEquippedClothing(
      raw.player?.equippedClothing,
      ownedClothing,
      resolvedGender
    );
    const facingDirection = this.normalizeDirection(
      raw.position?.facingDirection ?? raw.player?.facingDirection
    );

    const safeTileX =
      typeof raw.position?.tileX === 'number' && Number.isFinite(raw.position.tileX)
        ? Math.max(0, Math.min(119, Math.round(raw.position.tileX * 100) / 100))
        : base.position.tileX;
    const safeTileY =
      typeof raw.position?.tileY === 'number' && Number.isFinite(raw.position.tileY)
        ? Math.max(0, Math.min(119, Math.round(raw.position.tileY * 100) / 100))
        : base.position.tileY;

    return {
      version: CURRENT_SAVE_VERSION,
      lastSaved: typeof raw.lastSaved === 'number' && raw.lastSaved > 0 ? raw.lastSaved : Date.now(),
      currentZone: typeof raw.currentZone === 'string' ? raw.currentZone : 'Central Plaza (Main City)',
      player: {
        ...base.player,
        ...(raw.player || {}),
        gender: resolvedGender,
        coins,
        currentTool: raw.player?.currentTool !== undefined ? raw.player.currentTool : base.player.currentTool,
        facingDirection,
        ownedClothing,
        equippedClothing,
      },
      position: {
        tileX: safeTileX,
        tileY: safeTileY,
        facingDirection,
      },
      inventory: {
        slots,
        coins,
      },
      buildings,
      playerStats: stats,
      playerWorldChanges: worldChanges,
    };
  }

  public static hasSave(uid?: string): boolean {
    if (typeof localStorage === 'undefined') return false;
    const key = this.getStorageKey(uid);
    return !!localStorage.getItem(key);
  }

  public static saveGame(state: SavedGameState, uid?: string): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const migrated = this.migrateGameState(state, state.player?.name, state.player?.gender);
      const key = this.getStorageKey(uid);
      localStorage.setItem(key, JSON.stringify(migrated));
      if (!uid) {
        localStorage.setItem(STORAGE_KEY_DEFAULT, JSON.stringify(migrated));
      }
      return true;
    } catch (e) {
      console.error('[SaveSystem Error] Failed to save game state to localStorage:', e);
      return false;
    }
  }

  public static loadGame(uid?: string): SavedGameState | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const key = this.getStorageKey(uid);
      const data = localStorage.getItem(key);
      if (!data) return null;
      const parsed = JSON.parse(data) as Partial<SavedGameState>;
      const fallbackGender = parsed?.player?.gender === 'female' ? 'female' : 'male';
      return this.migrateGameState(parsed, parsed?.player?.name, fallbackGender);
    } catch (e) {
      console.error('[SaveSystem Error] Failed to load game state from localStorage:', e);
      return null;
    }
  }

  public static clearSave(uid?: string): void {
    if (uid) {
      this.cancelPendingTimers(uid);
    }
    if (typeof localStorage === 'undefined') return;
    const key = this.getStorageKey(uid);
    localStorage.removeItem(key);
    localStorage.removeItem(this.getPendingSyncKey(uid));
    if (!uid) {
      localStorage.removeItem(STORAGE_KEY_DEFAULT);
    }
  }

  public static getPendingSync(
    uid?: string
  ): { uid: string; state: SavedGameState; currentZone: string; time: number } | null {
    if (!uid || typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.getPendingSyncKey(uid));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.uid !== uid || !parsed.state) return null;
      const fallbackGender = parsed.state?.player?.gender === 'female' ? 'female' : 'male';
      return {
        uid,
        state: this.migrateGameState(parsed.state, parsed.state?.player?.name, fallbackGender),
        currentZone: parsed.currentZone || parsed.state.currentZone || 'Central Plaza (Main City)',
        time: parsed.time || parsed.state.lastSaved || Date.now(),
      };
    } catch {
      return null;
    }
  }

  public static clearPendingSync(uid?: string): void {
    if (!uid || typeof localStorage === 'undefined') return;
    localStorage.removeItem(this.getPendingSyncKey(uid));
  }

  public static hasPendingSync(uid?: string): boolean {
    return !!this.getPendingSync(uid);
  }

  private static isCloudAuthorized(uid?: string | null): uid is string {
    if (!uid) return false;
    if (this.authUidCheckOverride) {
      return this.authUidCheckOverride(uid);
    }
    try {
      return auth.currentUser?.uid === uid;
    } catch {
      return false;
    }
  }

  private static isNetworkOnline(): boolean {
    if (this.onlineCheckOverride) {
      return this.onlineCheckOverride();
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return false;
    }
    return true;
  }

  private static cancelPendingTimers(uid: string): void {
    const q = this.uidQueues.get(uid);
    if (!q) return;
    if (q.debounceTimer) {
      clearTimeout(q.debounceTimer);
      q.debounceTimer = null;
    }
    if (q.retryTimer) {
      clearTimeout(q.retryTimer);
      q.retryTimer = null;
    }
  }

  /**
   * Release timers/queued callbacks when switching/signing out an account (does NOT delete localStorage)
   */
  public static cleanupUidSession(uid?: string): void {
    if (!uid) return;
    const q = this.uidQueues.get(uid);
    if (!q) return;
    this.cancelPendingTimers(uid);
    if (q.queued) {
      for (const r of q.queued.resolvers) r(false);
      q.queued = null;
    }
  }

  /**
   * Queue local pending state synchronously (safe for pagehide/beforeunload/offline)
   */
  public static queuePendingLocalSave(
    uid: string | null | undefined,
    state: SavedGameState,
    currentZone = 'Central Plaza (Main City)'
  ): SavedGameState {
    const ts = uid ? this.nextMonotonicTimestamp(uid, state.lastSaved) : state.lastSaved || Date.now();
    const normalized = this.migrateGameState(
      { ...state, lastSaved: ts, currentZone },
      state.player?.name,
      state.player?.gender
    );
    this.saveGame(normalized, uid || undefined);
    if (!uid || typeof localStorage === 'undefined') return normalized;
    try {
      localStorage.setItem(
        this.getPendingSyncKey(uid),
        JSON.stringify({ uid, state: normalized, currentZone, time: Date.now() })
      );
    } catch (e) {
      console.error('[SaveSystem Error] Failed to queue pending cloud sync:', e);
    }
    return normalized;
  }

  private static formatCloudError(err: any): string {
    const rawMsg = err?.message || String(err || 'Cloud save failed');
    try {
      const parsed = JSON.parse(rawMsg);
      if (parsed && typeof parsed.error === 'string') {
        return parsed.error;
      }
    } catch {
      // Plain error message
    }
    return rawMsg;
  }

  private static scheduleAutoRetry(uid: string): void {
    const q = this.getQueue(uid);
    if (q.retryTimer || q.retryAttempt >= MAX_AUTO_RETRIES) return;
    if (!this.isCloudAuthorized(uid) || !this.hasPendingSync(uid)) return;

    const delay = Math.min(
      RETRY_BASE_DELAY_MS * Math.pow(2, q.retryAttempt),
      RETRY_MAX_DELAY_MS
    );
    q.retryAttempt += 1;

    q.retryTimer = setTimeout(() => {
      q.retryTimer = null;
      if (!this.isCloudAuthorized(uid) || !this.isNetworkOnline()) return;
      this.syncPendingCloudChanges(uid);
    }, delay);
  }

  /**
   * Strictly serialized single-writer queue loop per UID.
   * Ensures older snapshots can NEVER overwrite newer ones in Firestore.
   */
  private static drainQueue(uid: string): Promise<boolean> {
    const q = this.getQueue(uid);
    if (q.inFlight) {
      return q.inFlight;
    }

    let finishedSync = false;
    const run = async (): Promise<boolean> => {
      let lastOutcome = true;

      try {
        while (q.queued) {
          const batch = q.queued;
          q.queued = null;

          if (!this.isCloudAuthorized(uid)) {
            this.setSyncStatus({
              status: 'pending_offline',
              lastSyncedAt: this.currentSyncState.lastSyncedAt,
              errorMessage: 'Auth session inactive; queued locally.',
            });
            for (const resolve of batch.resolvers) resolve(false);
            lastOutcome = false;
            continue;
          }

          if (!this.isNetworkOnline()) {
            this.setSyncStatus({
              status: 'pending_offline',
              lastSyncedAt: this.currentSyncState.lastSyncedAt,
              errorMessage: 'Offline — queued locally for automatic sync.',
            });
            for (const resolve of batch.resolvers) resolve(false);
            lastOutcome = false;
            continue;
          }

          this.setSyncStatus({
            status: 'saving',
            lastSyncedAt: this.currentSyncState.lastSyncedAt,
          });

          try {
            const writer: CloudWriteAdapter =
              this.cloudWriterOverride ||
              ((targetUid, targetState, zone) =>
                CloudSaveService.saveGameState(targetUid, targetState, zone));

            await writer(uid, batch.state, batch.currentZone);

            // Check whether a newer mutation arrived while this write was in flight
            const latestPending = this.getPendingSync(uid);
            if (
              !q.queued &&
              (!latestPending || latestPending.state.lastSaved <= batch.state.lastSaved)
            ) {
              this.clearPendingSync(uid);
            }

            q.retryAttempt = 0;
            if (q.retryTimer) {
              clearTimeout(q.retryTimer);
              q.retryTimer = null;
            }

            if (!q.queued) {
              this.setSyncStatus({
                status: 'saved',
                lastSyncedAt: Date.now(),
              });
            }

            for (const resolve of batch.resolvers) resolve(true);
            lastOutcome = true;
          } catch (err: any) {
            const msg = this.formatCloudError(err);
            console.error('[CloudSave Error] Sequential Firestore write failed; local queue preserved:', msg, err);

            const isOfflineErr =
              !this.isNetworkOnline() || /offline|network|unavailable|timeout/i.test(msg);

            this.setSyncStatus({
              status: isOfflineErr ? 'pending_offline' : 'error',
              lastSyncedAt: this.currentSyncState.lastSyncedAt,
              errorMessage: msg,
            });

            // Preserve snapshot on localStorage pending queue (it is already written, ensure latest survives)
            if (!q.queued) {
              this.scheduleAutoRetry(uid);
            }

            for (const resolve of batch.resolvers) resolve(false);
            lastOutcome = false;
          }
        }
      } finally {
        finishedSync = true;
        q.inFlight = null;
        if (q.queued) {
          void this.drainQueue(uid);
        }
      }

      return lastOutcome;
    };

    const promise = run();
    if (!finishedSync) {
      q.inFlight = promise;
    }
    return promise;
  }

  /**
   * Save game state locally immediately and coalesce/serialize cloud saves to Firestore.
   * NOTE: Repeated non-immediate calls update the queued snapshot WITHOUT resetting/starving
   * an already-armed debounce timer, guaranteeing sustained movement never cancels inventory saves!
   */
  public static saveGameWithCloud(
    uid: string | null | undefined,
    state: SavedGameState,
    currentZone = 'Central Plaza (Main City)',
    immediate = false
  ): Promise<boolean> {
    // 1. Instant UID-scoped local persistence & pending queue
    const normalized = this.queuePendingLocalSave(uid, state, currentZone);

    if (!uid) return Promise.resolve(false);

    const q = this.getQueue(uid);
    if (q.retryTimer) {
      clearTimeout(q.retryTimer);
      q.retryTimer = null;
    }

    return new Promise<boolean>((resolve) => {
      if (q.queued) {
        q.queued.state = normalized;
        q.queued.currentZone = currentZone;
        q.queued.resolvers.push(resolve);
      } else {
        q.queued = {
          state: normalized,
          currentZone,
          resolvers: [resolve],
        };
      }

      if (immediate) {
        if (q.debounceTimer) {
          clearTimeout(q.debounceTimer);
          q.debounceTimer = null;
        }
        this.drainQueue(uid);
        return;
      }

      // Do NOT clear/delay an already-pending debounceTimer so continuous walking cannot starve saves
      if (!q.debounceTimer) {
        q.debounceTimer = setTimeout(() => {
          q.debounceTimer = null;
          this.drainQueue(uid);
        }, DEBOUNCE_SAVE_MS);
      }
    });
  }

  /**
   * Flush any debounced/queued/in-flight saves for a UID and await full completion (safe for Sign Out).
   */
  public static async flushQueue(uid?: string): Promise<boolean> {
    if (!uid) return false;
    const q = this.getQueue(uid);
    if (q.debounceTimer) {
      clearTimeout(q.debounceTimer);
      q.debounceTimer = null;
    }
    if (q.retryTimer) {
      clearTimeout(q.retryTimer);
      q.retryTimer = null;
    }

    if (q.queued || q.inFlight) {
      const ok = await this.drainQueue(uid);
      if (ok && !this.hasPendingSync(uid)) return true;
    }

    if (this.hasPendingSync(uid)) {
      return this.syncPendingCloudChanges(uid);
    }

    return true;
  }

  /**
   * Flush any pending local changes for the authenticated UID through the sequential queue
   */
  public static async syncPendingCloudChanges(uid?: string): Promise<boolean> {
    if (!uid || !this.isCloudAuthorized(uid)) return false;

    const pending = this.getPendingSync(uid);
    if (!pending) {
      const q = this.getQueue(uid);
      if (q.queued || q.inFlight) {
        return this.drainQueue(uid);
      }
      return true;
    }

    if (!this.isNetworkOnline()) {
      this.setSyncStatus({
        status: 'pending_offline',
        lastSyncedAt: this.currentSyncState.lastSyncedAt,
        errorMessage: 'Offline — queued locally.',
      });
      return false;
    }

    const q = this.getQueue(uid);
    return new Promise<boolean>((resolve) => {
      if (q.queued) {
        if (pending.state.lastSaved > q.queued.state.lastSaved) {
          q.queued.state = pending.state;
          q.queued.currentZone = pending.currentZone;
        }
        q.queued.resolvers.push(resolve);
      } else {
        q.queued = {
          state: pending.state,
          currentZone: pending.currentZone,
          resolvers: [resolve],
        };
      }
      if (q.debounceTimer) {
        clearTimeout(q.debounceTimer);
        q.debounceTimer = null;
      }
      this.drainQueue(uid);
    });
  }

  /**
   * Retry saving latest local/pending state for the current authenticated UID
   */
  public static async retryLastSave(uid?: string): Promise<boolean> {
    if (!uid) return false;
    const q = this.getQueue(uid);
    q.retryAttempt = 0;

    if (q.queued || q.inFlight || this.hasPendingSync(uid)) {
      return this.flushQueue(uid);
    }
    const local = this.loadGame(uid);
    if (!local) return false;
    return this.saveGameWithCloud(uid, local, local.currentZone || 'Central Plaza (Main City)', true);
  }

  public static getDefaultState(playerName = 'Settler', gender: 'male' | 'female' = 'male'): SavedGameState {
    return {
      version: CURRENT_SAVE_VERSION,
      lastSaved: Date.now(),
      currentZone: 'Central Plaza (Main City)',
      player: {
        name: playerName,
        gender,
        skinTone: gender === 'female' ? '#f59e0b' : '#d97706',
        hairColor: gender === 'female' ? '#78350f' : '#292524',
        clothesColor: gender === 'female' ? '#10b981' : '#3b82f6',
        coins: 25,
        currentTool: 'axe_basic',
        facingDirection: 'down',
        ownedClothing: [],
        equippedClothing: {},
      },
      position: { tileX: 30, tileY: 30, facingDirection: 'down' },
      inventory: {
        slots: [
          { item: 'axe_basic', quantity: 1 },
          { item: 'pickaxe_basic', quantity: 1 },
          { item: 'scythe_basic', quantity: 1 },
          { item: 'wood', quantity: 10 },
          { item: 'stone', quantity: 5 },
        ],
        coins: 25,
      },
      buildings: [],
      playerStats: this.getDefaultStats(),
      playerWorldChanges: this.getDefaultWorldChanges(),
    };
  }

  /**
   * Build a clean Official Launch starter save stamped with the one-time resetEpoch
   * so stale local/offline caches never re-overwrite the official reset.
   */
  public static createOfficialResetStarterState(
    playerName: string,
    gender: 'male' | 'female',
    resetEpoch: string,
    minLastSaved = 0
  ): SavedGameState {
    const starter = this.getDefaultState(playerName, gender);
    const stampedTs = Math.max(Date.now(), minLastSaved + 1000);
    return {
      ...starter,
      lastSaved: stampedTs,
      playerWorldChanges: {
        ...this.getDefaultWorldChanges(),
        resetEpoch: resetEpoch.trim().slice(0, 64),
      },
    };
  }
}
