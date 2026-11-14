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
import { SaveSystem, SavedGameState } from './systems/SaveSystem';
import { BuildingType, PlayerProfile } from './types';

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

  constructor(profile?: PlayerProfile, userId?: string, initialState?: SavedGameState) {
    this.userId = userId;
    this.mapSystem = new MapSystem();
    this.inventorySystem = new InventorySystem();
    this.buildingSystem = new BuildingSystem();
    this.craftingSystem = new CraftingSystem();
    this.resourceSystem = new ResourceSystem();
    this.networkSystem = new NetworkSystem();

    const saved = initialState || SaveSystem.loadGame(userId);
    this.initialPosition = saved?.position || { tileX: 30, tileY: 30 };
    if (saved) {
      this.playerProfile = profile || saved.player;
      this.inventorySystem.deserialize(saved.inventory);
      this.buildingSystem.deserialize(saved.buildings, this.mapSystem);
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

  public setBuildMode(type: BuildingType | null, movingBuildingId?: string): void {
    if (this.worldScene) {
      this.worldScene.setBuildMode(type, movingBuildingId);
    }
  }

  public confirmBuildPlacement(tx?: number, ty?: number): void {
    if (this.worldScene) {
      this.worldScene.confirmPlacementFromUI(tx, ty);
    }
  }

  public dismantleBuilding(buildingId: string): boolean {
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

  public saveCurrentState(immediate = false): void {
    if (!this.worldScene) return;

    const currentZone = this.mapSystem.getZoneAt(
      Math.round(this.worldScene.playerTileX),
      Math.round(this.worldScene.playerTileY)
    ).name;

    const state: SavedGameState = {
      version: 1,
      lastSaved: Date.now(),
      player: {
        ...this.playerProfile,
        coins: this.inventorySystem.coins,
      },
      position: {
        tileX: Math.round(this.worldScene.playerTileX),
        tileY: Math.round(this.worldScene.playerTileY),
      },
      inventory: this.inventorySystem.serialize(),
      buildings: this.buildingSystem.serialize(),
    };

    SaveSystem.saveGameWithCloud(this.userId, state, currentZone, immediate);
  }

  public destroy(): void {
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
      this.worldScene = null;
    }
  }
}
