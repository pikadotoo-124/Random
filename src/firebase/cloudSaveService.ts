/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './config';
import { handleFirestoreError, OperationType } from './errorHandler';
import { PlacedBuilding, PlayerProfile } from '../game/types';
import { SavedGameState } from '../game/systems/SaveSystem';

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
  playerStats: {
    health: number;
    stamina: number;
  };
  lastSavedAt: string;
}

export interface WorldStateDoc {
  placedBuildings: PlacedBuilding[];
  storageBoxes: any[];
  playerWorldChanges: Record<string, boolean>;
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
      gameVersion: 1,
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
    const path = `users/${uid}`;
    try {
      await updateDoc(doc(db, 'users', uid), {
        lastLoginAt: new Date().toISOString(),
      });
    } catch (err) {
      // Non-critical background update
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
   * Load entire game state: playerState and worldState
   */
  public static async loadGameState(uid: string, profile: UserProfileDoc): Promise<SavedGameState | null> {
    const playerStatePath = `users/${uid}/gameData/playerState`;
    const worldStatePath = `users/${uid}/gameData/worldState`;

    try {
      const playerSnap = await getDoc(doc(db, 'users', uid, 'gameData', 'playerState'));
      const worldSnap = await getDoc(doc(db, 'users', uid, 'gameData', 'worldState'));

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
        currentTool: (playerDoc.equipment?.currentTool as any) || 'axe_basic',
      };

      const gameState: SavedGameState = {
        version: 1,
        lastSaved: Date.parse(playerDoc.lastSavedAt || new Date().toISOString()) || Date.now(),
        player: playerProfile,
        position: {
          tileX: playerDoc.positionX ?? 30,
          tileY: playerDoc.positionY ?? 30,
        },
        inventory: {
          slots: (playerDoc.inventory as any) || [],
          coins: playerDoc.gold ?? 25,
        },
        buildings: (worldDoc?.placedBuildings as any) || [],
      };

      return gameState;
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
    currentZone = 'Central Plaza'
  ): Promise<boolean> {
    const playerStatePath = `users/${uid}/gameData/playerState`;
    const worldStatePath = `users/${uid}/gameData/worldState`;
    const now = new Date().toISOString();

    const playerDoc: PlayerStateDoc = {
      positionX: state.position.tileX,
      positionY: state.position.tileY,
      currentZone,
      gold: state.inventory.coins,
      inventory: state.inventory.slots.map((s) => ({ item: s.item, quantity: s.quantity })),
      equipment: {
        currentTool: state.player.currentTool || null,
      },
      playerStats: {
        health: 100,
        stamina: 100,
      },
      lastSavedAt: now,
    };

    const worldDoc: WorldStateDoc = {
      placedBuildings: state.buildings.map((b) => ({
        id: b.id,
        type: b.type,
        tileX: b.tileX,
        tileY: b.tileY,
        width: b.width,
        height: b.height,
        placedBy: b.placedBy,
        createdAt: b.createdAt,
        storage: b.storage ? b.storage.map((s) => ({ item: s.item, quantity: s.quantity })) : [],
      })),
      storageBoxes: [],
      playerWorldChanges: {},
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
