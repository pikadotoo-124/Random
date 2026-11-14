/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Phaser from 'phaser';
import { WorldScene } from './scenes/WorldScene';
import { BuildingSystem } from './systems/BuildingSystem';
import { CraftingSystem } from './systems/CraftingSystem';
import { InventorySystem } from './systems/InventorySystem';
import { MapSystem } from './systems/MapSystem';
import { NetworkSystem } from './systems/NetworkSystem';
import { ResourceSystem } from './systems/ResourceSystem';
import { CURRENT_SAVE_VERSION, SaveSystem, SavedGameState } from './systems/SaveSystem';
import { BuildingType, PlayerProfile, PlayerStats, PlayerWorldChanges } from './types';

export class GameManager {
  public game: Phaser.Game | null = null;
  public worldScene: WorldScene | null = null;

  public userId?: string;
  public mapSystem: MapSystem;
  public inventorySystem: InventorySystem;
  public buildingSystem: BuildingSystem;
  public craftingSystem: CraftingSystem;
  public resourceSystem: ResourceSystem;
  public networkSystem: NetworkSystem;
  public playerProfile: PlayerProfile;
  public initialPosition: { tileX: number; tileY: number };
  public playerStats: PlayerStats;
  public playerWorldChanges: PlayerWorldChanges;
  public hasHydrated = false;

  constructor(profile?: PlayerProfile, userId?: string, initialState?: SavedGameState) {
    this.userId = userId;
    this.mapSystem = new MapSystem();
    this.inventorySystem = new InventorySystem();
    this.buildingSystem = new BuildingSystem();
    this.craftingSystem = new CraftingSystem();
    this.resourceSystem = new ResourceSystem();
    this.networkSystem = new NetworkSystem();

    const saved = initialState
      ? SaveSystem.migrateGameState(initialState, profile?.name, profile?.gender)
      : SaveSystem.loadGame(userId);

    this.initialPosition = saved?.position || { tileX: 30, tileY: 30 };
    if (saved) {
      this.playerProfile = {
        ...(profile || saved.player),
        coins: saved.inventory.coins,
        currentTool: saved.player.currentTool ?? profile?.currentTool ?? 'axe_basic',
      };
      this.inventorySystem.deserialize(saved.inventory);
      this.buildingSystem.deserialize(saved.buildings, this.mapSystem, userId);
      this.playerStats = {
        ...SaveSystem.getDefaultStats(),
        ...(saved.playerStats || {}),
      };
      this.playerWorldChanges = {
        ...SaveSystem.getDefaultWorldChanges(),
        ...(saved.playerWorldChanges || {}),
      };
      this.hasHydrated = true;
    } else {
      this.playerProfile = profile || {
        name: 'Settler',
        gender: 'male',
        skinTone: '#d97706',
        hairColor: '#292524',
        clothesColor: '#3b82f6',
        coins: 25,
        currentTool: 'axe_basic',
      };
      this.inventorySystem.initStarterItems();
      this.playerStats = SaveSystem.getDefaultStats();
      this.playerWorldChanges = SaveSystem.getDefaultWorldChanges();
      this.hasHydrated = !userId;
    }

    // Populate natural resource nodes
    this.resourceSystem.generateResources(this.mapSystem);
  }

  public initGame(parentContainerId: string): void {
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
    }

    const initPos = this.initialPosition || { tileX: 30, tileY: 30 };

    this.worldScene = new WorldScene();
    this.worldScene.setupData({
      mapSystem: this.mapSystem,
      inventorySystem: this.inventorySystem,
      buildingSystem: this.buildingSystem,
      craftingSystem: this.craftingSystem,
      resourceSystem: this.resourceSystem,
      networkSystem: this.networkSystem,
      playerProfile: this.playerProfile,
      initialPosition: initPos,
    });

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: parentContainerId,
      width: window.innerWidth,
      height: window.innerHeight,
      pixelArt: true,
      backgroundColor: '#1c1917',
      physics: {
        default: 'arcade',
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [this.worldScene],
    };

    this.game = new Phaser.Game(config);
  }

  public setJoystickVector(vx: number, vy: number): void {
    if (this.worldScene) {
      this.worldScene.joystickVector = { x: vx, y: vy };
    }
  }

  public triggerAction(): void {
    if (this.worldScene) {
      this.worldScene.triggerInteraction();
    }
  }

  public triggerFishingCatch(): void {
    if (this.worldScene) {
      this.worldScene.triggerFishingCatch();
    }
  }

  public cancelFishing(): void {
    if (this.worldScene) {
      this.worldScene.cancelFishing(false);
    }
  }

  public setBuildMode(type: BuildingType | null, movingBuildingId?: string): void {
    if (this.worldScene) {
      this.worldScene.setBuildMode(type, movingBuildingId);
    }
  }

  public rotateBuildPreview(): void {
    if (this.worldScene) {
      this.worldScene.rotateBuildPreview();
    }
  }

  public confirmBuildPlacement(tx?: number, ty?: number): void {
    if (this.worldScene) {
      this.worldScene.confirmPlacementFromUI(tx, ty);
    }
  }

  public dismantleBuilding(buildingId: string): boolean {
    const target = this.buildingSystem.buildings.find((b) => b.id === buildingId);
    if (!target || !this.buildingSystem.isPersonalBuilding(target, this.userId, this.playerProfile.name)) {
      return false;
    }
    const success = this.buildingSystem.dismantleBuilding(buildingId, this.mapSystem, this.inventorySystem);
    if (success) {
      this.networkSystem.broadcastDismantle(buildingId);
      this.saveCurrentState(false);
    }
    return success;
  }

  public zoomIn(): void {
    if (this.worldScene) {
      this.worldScene.setZoom(this.worldScene.getZoom() + 0.15);
    }
  }

  public zoomOut(): void {
    if (this.worldScene) {
      this.worldScene.setZoom(this.worldScene.getZoom() - 0.15);
    }
  }

  public recordStat(
    key: 'totalGathered' | 'totalCrafted' | 'totalBuilt' | 'totalSoldGold',
    delta = 1
  ): void {
    this.playerStats = {
      ...this.playerStats,
      [key]: (this.playerStats[key] || 0) + delta,
    };
  }

  public markTutorialCompleted(): void {
    if (this.playerWorldChanges.tutorialCompleted) return;
    this.playerWorldChanges = {
      ...this.playerWorldChanges,
      tutorialCompleted: true,
    };
    this.saveCurrentState(false);
  }

  public recordZoneDiscovered(zoneName: string): void {
    if (!zoneName) return;
    if (!this.playerWorldChanges.discoveredZones.includes(zoneName)) {
      this.playerWorldChanges = {
        ...this.playerWorldChanges,
        discoveredZones: [...this.playerWorldChanges.discoveredZones, zoneName],
      };
    }
  }

  private buildSnapshot(): { state: SavedGameState; currentZone: string } | null {
    if (!this.worldScene || !this.hasHydrated) return null;

    const tileX = Math.round(this.worldScene.playerTileX);
    const tileY = Math.round(this.worldScene.playerTileY);
    const currentZone = this.mapSystem.getZoneAt(tileX, tileY).name;

    this.recordZoneDiscovered(currentZone);

    const state: SavedGameState = {
      version: CURRENT_SAVE_VERSION,
      lastSaved: Date.now(),
      currentZone,
      player: {
        ...this.playerProfile,
        coins: this.inventorySystem.coins,
      },
      position: {
        tileX,
        tileY,
      },
      inventory: this.inventorySystem.serialize(),
      buildings: this.buildingSystem.serialize(this.userId, this.playerProfile.name),
      playerStats: { ...this.playerStats },
      playerWorldChanges: {
        tutorialCompleted: this.playerWorldChanges.tutorialCompleted,
        discoveredZones: [...this.playerWorldChanges.discoveredZones],
      },
    };

    return { state, currentZone };
  }

  /**
   * Synchronously store pending state into UID-scoped localStorage on pagehide/beforeunload
   */
  public flushPendingLocalOnly(): void {
    const snap = this.buildSnapshot();
    if (!snap) return;
    SaveSystem.queuePendingLocalSave(this.userId, snap.state, snap.currentZone);
  }

  public saveCurrentState(immediate = false): Promise<boolean> {
    const snap = this.buildSnapshot();
    if (!snap) return Promise.resolve(false);

    return SaveSystem.saveGameWithCloud(this.userId, snap.state, snap.currentZone, immediate);
  }

  public destroy(): void {
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
      this.worldScene = null;
    }
  }
}
