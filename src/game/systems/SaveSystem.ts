/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth } from '../../firebase/config';
import { CloudSaveService } from '../../firebase/cloudSaveService';
import {
  InventorySlot,
  PlacedBuilding,
  PlayerProfile,
  PlayerStats,
  PlayerWorldChanges,
} from '../types';
import { BuildingSystem } from './BuildingSystem';

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
  position: { tileX: number; tileY: number };
  inventory: { slots: InventorySlot[]; coins: number };
  buildings: PlacedBuilding[];
  playerStats?: PlayerStats;
  playerWorldChanges?: PlayerWorldChanges;
}

const STORAGE_KEY_DEFAULT = 'random_city_save_v1';

type SyncListener = (state: CloudSyncState) => void;

export class SaveSystem {
  private static debouncedTimer: any = null;
  private static syncListeners: Set<SyncListener> = new Set();
  private static currentSyncState: CloudSyncState = { status: 'idle' };

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

    const base = this.getDefaultState(
      raw.player?.name || fallbackName,
      raw.player?.gender === 'female' ? 'female' : fallbackGender
    );

    const coins =
      typeof raw.inventory?.coins === 'number'
        ? raw.inventory.coins
        : typeof raw.player?.coins === 'number'
        ? raw.player.coins
        : base.inventory.coins;

    const slots: InventorySlot[] = Array.isArray(raw.inventory?.slots)
      ? raw.inventory.slots
          .filter((s) => s && typeof s.item === 'string' && typeof s.quantity === 'number' && s.quantity > 0)
          .map((s) => ({ item: s.item, quantity: s.quantity }))
      : base.inventory.slots;

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
                ? b.storage.filter((s) => s && s.item && s.quantity > 0).map((s) => ({ ...s }))
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
    const worldChanges: PlayerWorldChanges = {
      tutorialCompleted: Boolean(worldChangesRaw?.tutorialCompleted),
      discoveredZones: Array.isArray(worldChangesRaw?.discoveredZones)
        ? Array.from(new Set(worldChangesRaw.discoveredZones.filter((z: any) => typeof z === 'string')))
        : ['Central Plaza (Main City)'],
    };

    return {
      version: CURRENT_SAVE_VERSION,
      lastSaved: typeof raw.lastSaved === 'number' && raw.lastSaved > 0 ? raw.lastSaved : Date.now(),
      currentZone: typeof raw.currentZone === 'string' ? raw.currentZone : 'Central Plaza (Main City)',
      player: {
        ...base.player,
        ...(raw.player || {}),
        coins,
        currentTool: raw.player?.currentTool !== undefined ? raw.player.currentTool : base.player.currentTool,
      },
      position: {
        tileX: typeof raw.position?.tileX === 'number' ? raw.position.tileX : base.position.tileX,
        tileY: typeof raw.position?.tileY === 'number' ? raw.position.tileY : base.position.tileY,
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
      // Only update guest default key when unauthenticated so authenticated users never collide
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
      return this.migrateGameState(parsed);
    } catch (e) {
      console.error('[SaveSystem Error] Failed to load game state from localStorage:', e);
      return null;
    }
  }

  public static clearSave(uid?: string): void {
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
      return {
        uid,
        state: this.migrateGameState(parsed.state),
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
    try {
      return auth.currentUser?.uid === uid;
    } catch {
      return false;
    }
  }

  /**
   * Queue local pending state synchronously (safe for pagehide/beforeunload/offline)
   */
  public static queuePendingLocalSave(
    uid: string | null | undefined,
    state: SavedGameState,
    currentZone = 'Central Plaza (Main City)'
  ): void {
    const normalized = this.migrateGameState({ ...state, currentZone });
    this.saveGame(normalized, uid || undefined);
    if (!uid || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        this.getPendingSyncKey(uid),
        JSON.stringify({ uid, state: normalized, currentZone, time: Date.now() })
      );
    } catch (e) {
      console.error('[SaveSystem Error] Failed to queue pending cloud sync:', e);
    }
  }

  /**
   * Save game state locally immediately and debounce (or flush) cloud save to Firebase Firestore.
   */
  public static saveGameWithCloud(
    uid: string | null | undefined,
    state: SavedGameState,
    currentZone = 'Central Plaza (Main City)',
    immediate = false
  ): Promise<boolean> {
    const normalized = this.migrateGameState({ ...state, currentZone });

    // 1. Instant UID-scoped local persistence & pending queue
    this.queuePendingLocalSave(uid, normalized, currentZone);

    if (!uid) return Promise.resolve(false);

    if (this.debouncedTimer) {
      clearTimeout(this.debouncedTimer);
      this.debouncedTimer = null;
    }

    const executeCloudSave = async (): Promise<boolean> => {
      if (!this.isCloudAuthorized(uid)) {
        this.setSyncStatus({
          status: 'pending_offline',
          errorMessage: 'Auth session inactive; queued locally.',
        });
        return false;
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.setSyncStatus({
          status: 'pending_offline',
          errorMessage: 'Offline — queued locally for sync.',
        });
        return false;
      }

      this.setSyncStatus({
        status: 'saving',
        lastSyncedAt: this.currentSyncState.lastSyncedAt,
      });

      try {
        await CloudSaveService.saveGameState(uid, normalized, currentZone);
        // Only clear pending sync if no newer mutation overwrote it while the request was in flight
        const latestPending = this.getPendingSync(uid);
        if (!latestPending || latestPending.state.lastSaved <= normalized.lastSaved) {
          this.clearPendingSync(uid);
        }
        this.setSyncStatus({
          status: 'saved',
          lastSyncedAt: Date.now(),
        });
        return true;
      } catch (err: any) {
        const msg = err?.message || 'Cloud save failed';
        console.error('[CloudSave Error] Firestore write failed; local queue preserved:', err);
        const isOfflineErr =
          (typeof navigator !== 'undefined' && navigator.onLine === false) ||
          /offline|network|unavailable/i.test(msg);
        this.setSyncStatus({
          status: isOfflineErr ? 'pending_offline' : 'error',
          lastSyncedAt: this.currentSyncState.lastSyncedAt,
          errorMessage: msg,
        });
        return false;
      }
    };

    if (immediate) {
      return executeCloudSave();
    }

    return new Promise<boolean>((resolve) => {
      this.debouncedTimer = setTimeout(() => {
        this.debouncedTimer = null;
        executeCloudSave().then(resolve);
      }, 1200);
    });
  }

  /**
   * Flush any pending local changes for the authenticated UID to Firestore
   */
  public static async syncPendingCloudChanges(uid?: string): Promise<boolean> {
    if (!uid || !this.isCloudAuthorized(uid)) return false;

    const pending = this.getPendingSync(uid);
    if (!pending) return true;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setSyncStatus({ status: 'pending_offline', errorMessage: 'Offline' });
      return false;
    }

    this.setSyncStatus({ status: 'saving', lastSyncedAt: this.currentSyncState.lastSyncedAt });
    try {
      await CloudSaveService.saveGameState(uid, pending.state, pending.currentZone);
      const currentPending = this.getPendingSync(uid);
      if (!currentPending || currentPending.state.lastSaved <= pending.state.lastSaved) {
        this.clearPendingSync(uid);
      }
      this.setSyncStatus({ status: 'saved', lastSyncedAt: Date.now() });
      return true;
    } catch (err: any) {
      console.error('[CloudSave Error] Failed to sync pending offline changes:', err);
      this.setSyncStatus({
        status: 'error',
        lastSyncedAt: this.currentSyncState.lastSyncedAt,
        errorMessage: err?.message || 'Cloud sync failed',
      });
      return false;
    }
  }

  /**
   * Retry saving latest local/pending state for the current authenticated UID
   */
  public static async retryLastSave(uid?: string): Promise<boolean> {
    if (!uid) return false;
    if (this.hasPendingSync(uid)) {
      return this.syncPendingCloudChanges(uid);
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
      },
      position: { tileX: 30, tileY: 30 },
      inventory: {
        slots: [
          { item: 'axe_basic', quantity: 1 },
          { item: 'pickaxe_basic', quantity: 1 },
          { item: 'rod_basic', quantity: 1 },
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
}
