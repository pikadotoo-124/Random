/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './config';
import { handleFirestoreError, OperationType } from './errorHandler';
import { PlacedBuilding, PlayerProfile, PlayerStats, PlayerWorldChanges } from '../game/types';
import { BuildingSystem } from '../game/systems/BuildingSystem';
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

/**
 * Remove undefined fields recursively before writing to Firestore
 */
function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForFirestore(item)) as any;
  }
  if (typeof obj === 'object') {
    const cleanObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        cleanObj[key] = sanitizeForFirestore(val);
      }
    }
    return cleanObj as any;
  }
  return obj;
}

export class CloudSaveService {
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

      if (!playerSnap.exists()) {
        return null;
      }

      const playerDoc = playerSnap.data() as PlayerStateDoc;
      const worldDoc = worldSnap.exists() ? (worldSnap.data() as WorldStateDoc) : null;

      const playerProfile: PlayerProfile = {
        name: profile.playerName,
        gender: profile.gender,
        skinTone: profile.gender === 'male' ? '#d97706' : '#f59e0b',
        hairColor: profile.gender === 'male' ? '#292524' : '#78350f',
        clothesColor: profile.gender === 'male' ? '#3b82f6' : '#10b981',
        coins: playerDoc.gold ?? 25,
        currentTool: (playerDoc.equipment?.currentTool as any) ?? 'axe_basic',
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
          tileX: playerDoc.positionX ?? 30,
          tileY: playerDoc.positionY ?? 30,
        },
        inventory: {
          slots: (playerDoc.inventory as any) || [],
          coins: playerDoc.gold ?? 25,
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
   * Save game state to Firestore: users/{uid}/gameData/playerState & worldState
   */
  public static async saveGameState(
    uid: string,
    state: SavedGameState,
    currentZone = 'Central Plaza (Main City)'
  ): Promise<boolean> {
    const playerStatePath = `users/${uid}/gameData/playerState`;
    const worldStatePath = `users/${uid}/gameData/worldState`;
    const now = new Date(state.lastSaved || Date.now()).toISOString();

    const stats: PlayerStats = {
      ...SaveSystem.getDefaultStats(),
      ...(state.playerStats || {}),
    };

    const worldChanges: PlayerWorldChanges = {
      ...SaveSystem.getDefaultWorldChanges(),
      ...(state.playerWorldChanges || {}),
    };

    const playerDoc: PlayerStateDoc = {
      positionX: state.position.tileX,
      positionY: state.position.tileY,
      currentZone: state.currentZone || currentZone,
      gold: state.inventory.coins,
      inventory: state.inventory.slots.map((s) => ({ item: s.item, quantity: s.quantity })),
      equipment: {
        currentTool: state.player.currentTool || null,
      },
      playerStats: stats,
      lastSavedAt: now,
    };

    const serializedBuildings: PlacedBuilding[] = state.buildings.map((b) => {
      const fp = BuildingSystem.getFootprint(b.type);
      return {
        id: b.id,
        type: b.type,
        tileX: b.tileX,
        tileY: b.tileY,
        width: b.width || fp.width,
        height: b.height || fp.height,
        rotation: b.type === 'fence_wood' ? BuildingSystem.normalizeRotation(b.rotation) : 0,
        ownerId: b.ownerId || uid,
        placedBy: b.placedBy || state.player.name,
        createdAt: b.createdAt,
        storage: b.storage ? b.storage.map((s) => ({ item: s.item, quantity: s.quantity })) : [],
      };
    });

    const storageBoxes: StoredChestSnapshot[] = serializedBuildings
      .filter((b) => b.type === 'storage_box')
      .map((b) => ({
        id: b.id,
        tileX: b.tileX,
        tileY: b.tileY,
        storage: (b.storage || []).map((s) => ({ item: s.item, quantity: s.quantity })),
      }));

    const worldDoc: WorldStateDoc = {
      placedBuildings: serializedBuildings,
      storageBoxes,
      playerWorldChanges: worldChanges,
      lastSavedAt: now,
    };

    try {
      await Promise.all([
        setDoc(doc(db, 'users', uid, 'gameData', 'playerState'), sanitizeForFirestore(playerDoc)),
        setDoc(doc(db, 'users', uid, 'gameData', 'worldState'), sanitizeForFirestore(worldDoc)),
      ]);
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${playerStatePath} | ${worldStatePath}`);
    }
  }
}
