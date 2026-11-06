/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudSaveService } from '../../firebase/cloudSaveService';
import { InventorySlot, PlacedBuilding, PlayerProfile } from '../types';

export interface SavedGameState {
  version: number;
  lastSaved: number;
  player: PlayerProfile;
  position: { tileX: number; tileY: number };
  inventory: { slots: InventorySlot[]; coins: number };
  buildings: PlacedBuilding[];
}

const STORAGE_KEY_DEFAULT = 'random_city_save_v1';
const PENDING_SYNC_KEY = 'random_city_pending_sync_v1';

export class SaveSystem {
  private static debouncedTimer: any = null;

  private static getStorageKey(uid?: string): string {
    return uid ? `random_city_save_${uid}` : STORAGE_KEY_DEFAULT;
  }

  public static hasSave(uid?: string): boolean {
    const key = this.getStorageKey(uid);
    return !!localStorage.getItem(key) || !!localStorage.getItem(STORAGE_KEY_DEFAULT);
  }

  public static saveGame(state: SavedGameState, uid?: string): boolean {
    try {
      const key = this.getStorageKey(uid);
      localStorage.setItem(key, JSON.stringify(state));
      // Also update default key as fallback
      localStorage.setItem(STORAGE_KEY_DEFAULT, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Failed to save game state to localStorage', e);
      return false;
    }
  }

  public static loadGame(uid?: string): SavedGameState | null {
    try {
      const key = this.getStorageKey(uid);
      const data = localStorage.getItem(key) || localStorage.getItem(STORAGE_KEY_DEFAULT);
      if (!data) return null;
      return JSON.parse(data) as SavedGameState;
    } catch (e) {
      console.error('Failed to load game state from localStorage', e);
      return null;
    }
  }

  public static clearSave(uid?: string): void {
    const key = this.getStorageKey(uid);
    localStorage.removeItem(key);
    localStorage.removeItem(STORAGE_KEY_DEFAULT);
    localStorage.removeItem(PENDING_SYNC_KEY);
  }

  /**
   * Save game state locally immediately and debounce cloud save to Firebase Firestore
   */
  public static saveGameWithCloud(
    uid: string | null | undefined,
    state: SavedGameState,
    currentZone = 'Central Plaza',
    immediate = false
  ): void {
    // 1. Instant local persistence
    this.saveGame(state, uid || undefined);

    if (!uid) return;

    // 2. Mark pending cloud sync
    try {
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify({ uid, state, currentZone, time: Date.now() }));
    } catch (e) {
      // Ignore quota error for local queue
    }

    // 3. Debounce Cloud Save (1.5 seconds) to avoid spamming Firestore
    if (this.debouncedTimer) {
      clearTimeout(this.debouncedTimer);
      this.debouncedTimer = null;
    }

    const executeCloudSave = async () => {
      try {
        await CloudSaveService.saveGameState(uid, state, currentZone);
        // Clear pending sync on success
        localStorage.removeItem(PENDING_SYNC_KEY);
      } catch (err) {
        console.warn('Cloud save deferred (offline or permission pending). Local state is preserved.', err);
      }
    };

    if (immediate) {
      executeCloudSave();
    } else {
      this.debouncedTimer = setTimeout(executeCloudSave, 1500);
    }
  }

  /**
   * Attempt to sync any pending offline changes if network connection is back
   */
  public static async syncPendingCloudChanges(): Promise<void> {
    try {
      const pendingRaw = localStorage.getItem(PENDING_SYNC_KEY);
      if (!pendingRaw) return;

      const { uid, state, currentZone } = JSON.parse(pendingRaw);
      if (uid && state) {
        await CloudSaveService.saveGameState(uid, state, currentZone || 'Central Plaza');
        localStorage.removeItem(PENDING_SYNC_KEY);
      }
    } catch (err) {
      console.warn('Pending sync check skipped:', err);
    }
  }

  public static getDefaultState(playerName = 'Settler', gender: 'male' | 'female' = 'male'): SavedGameState {
    return {
      version: 1,
      lastSaved: Date.now(),
      player: {
        name: playerName,
        gender,
        skinTone: '#d97706',
        hairColor: '#292524',
        clothesColor: '#3b82f6',
        coins: 25,
        currentTool: 'axe_basic',
      },
      position: { tileX: 30, tileY: 30 }, // Spawn right at Town Square
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
    };
  }
}
