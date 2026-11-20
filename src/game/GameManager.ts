/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Phaser from 'phaser';
import { WorldScene } from './scenes/WorldScene';
import { BuildingSystem } from './systems/BuildingSystem';
import {
  ClothingEquipResult,
  ClothingPurchaseResult,
  ClothingSystem,
} from './systems/ClothingSystem';
import { CraftingSystem } from './systems/CraftingSystem';
import { InventorySystem } from './systems/InventorySystem';
import { MapSystem } from './systems/MapSystem';
import { NetworkSystem } from './systems/NetworkSystem';
import { ResourceSystem } from './systems/ResourceSystem';
import { CURRENT_SAVE_VERSION, SaveSystem, SavedGameState } from './systems/SaveSystem';
import { WorldAtmosphereSystem } from './systems/WorldAtmosphereSystem';
import {
  BuildingType,
  ClothingEquipmentSlot,
  PlayerProfile,
  PlayerStats,
  PlayerWorldChanges,
} from './types';

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
  public atmosphereSystem: WorldAtmosphereSystem;
  public playerProfile: PlayerProfile;
  public initialPosition: { tileX: number; tileY: number };
  public playerStats: PlayerStats;
  public playerWorldChanges: PlayerWorldChanges;
  public hasHydrated = false;
  public isSceneReady = false;
  public onSceneReady?: () => void;
  public onClothingChanged?: () => void;

  private pendingJoystickVector = { x: 0, y: 0 };
  private pendingUiOverlayOpen = false;

  constructor(profile?: PlayerProfile, userId?: string, initialState?: SavedGameState) {
    this.userId = userId;
    this.mapSystem = new MapSystem();
    this.inventorySystem = new InventorySystem();
    this.buildingSystem = new BuildingSystem();
    this.craftingSystem = new CraftingSystem();
    this.resourceSystem = new ResourceSystem();
    this.networkSystem = new NetworkSystem();
    this.atmosphereSystem = new WorldAtmosphereSystem();

    const saved = initialState
      ? SaveSystem.migrateGameState(initialState, profile?.name, profile?.gender)
      : SaveSystem.loadGame(userId);

    this.initialPosition = saved?.position || { tileX: 30, tileY: 30 };
    if (saved) {
      const resolvedGender = (profile?.gender || saved.player.gender) === 'female' ? 'female' : 'male';
      const ownedClothing = ClothingSystem.normalizeOwnedClothing(
        saved.player.ownedClothing ?? profile?.ownedClothing
      );
      const equippedClothing = ClothingSystem.normalizeEquippedClothing(
        saved.player.equippedClothing ?? profile?.equippedClothing,
        ownedClothing,
        resolvedGender
      );

      this.playerProfile = {
        ...(profile || saved.player),
        gender: resolvedGender,
        coins: saved.inventory.coins,
        currentTool: saved.player.currentTool ?? profile?.currentTool ?? 'axe_basic',
        ownedClothing,
        equippedClothing,
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
      const baseProf = profile || {
        name: 'Settler',
        gender: 'male' as const,
        skinTone: '#d97706',
        hairColor: '#292524',
        clothesColor: '#3b82f6',
        coins: 25,
        currentTool: 'axe_basic' as const,
      };
      const ownedClothing = ClothingSystem.normalizeOwnedClothing(baseProf.ownedClothing);
      const equippedClothing = ClothingSystem.normalizeEquippedClothing(
        baseProf.equippedClothing,
        ownedClothing,
        baseProf.gender
      );
      this.playerProfile = {
        ...baseProf,
        ownedClothing,
        equippedClothing,
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

    this.isSceneReady = false;
    const initPos = this.initialPosition || { tileX: 30, tileY: 30 };

    this.worldScene = new WorldScene();
    this.worldScene.joystickVector = { ...this.pendingJoystickVector };
    this.worldScene.isUiOverlayOpen = this.pendingUiOverlayOpen;
    this.worldScene.onSceneReady = () => {
      this.isSceneReady = true;
      if (this.worldScene) {
        this.worldScene.joystickVector = { ...this.pendingJoystickVector };
        this.worldScene.isUiOverlayOpen = this.pendingUiOverlayOpen;
      }
      this.onSceneReady?.();
    };
    this.worldScene.setupData({
      mapSystem: this.mapSystem,
      inventorySystem: this.inventorySystem,
      buildingSystem: this.buildingSystem,
      craftingSystem: this.craftingSystem,
      resourceSystem: this.resourceSystem,
      networkSystem: this.networkSystem,
      atmosphereSystem: this.atmosphereSystem,
      playerProfile: this.playerProfile,
      initialPosition: initPos,
    });

    const parentEl =
      typeof document !== 'undefined' ? document.getElementById(parentContainerId) : null;
    const initWidth = parentEl && parentEl.clientWidth > 0 ? parentEl.clientWidth : window.innerWidth;
    const initHeight = parentEl && parentEl.clientHeight > 0 ? parentEl.clientHeight : window.innerHeight;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: parentContainerId,
      width: initWidth,
      height: initHeight,
      pixelArt: true,
      render: {
        pixelArt: true,
        antialias: false,
        roundPixels: true,
      },
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
    this.pendingJoystickVector = { x: vx, y: vy };
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
      this.worldScene.adjustZoom(WorldScene.ZOOM_STEP);
    }
  }

  public zoomOut(): void {
    if (this.worldScene) {
      this.worldScene.adjustZoom(-WorldScene.ZOOM_STEP);
    }
  }

  public resetZoom(): void {
    if (this.worldScene) {
      this.worldScene.resetZoom();
    }
  }

  public setUiOverlayOpen(open: boolean): void {
    this.pendingUiOverlayOpen = open;
    if (this.worldScene) {
      this.worldScene.isUiOverlayOpen = open;
    }
  }

  public syncViewportSize(): void {
    if (!this.game || typeof document === 'undefined') return;
    const parentEl = document.getElementById('phaser-canvas-container');
    const targetW = parentEl && parentEl.clientWidth > 0 ? parentEl.clientWidth : window.innerWidth;
    const targetH = parentEl && parentEl.clientHeight > 0 ? parentEl.clientHeight : window.innerHeight;
    if (targetW > 0 && targetH > 0) {
      if (this.game.scale.width !== targetW || this.game.scale.height !== targetH) {
        this.game.scale.resize(targetW, targetH);
      } else {
        this.game.scale.refresh();
      }
    }
  }

  public setWeatherEffectsEnabled(enabled: boolean): void {
    this.atmosphereSystem.setWeatherEffectsEnabled(enabled);
    this.worldScene?.refreshAtmosphereImmediately();
  }

  public isWeatherEffectsEnabled(): boolean {
    return this.atmosphereSystem.isWeatherEffectsEnabled();
  }

  public buyClothing(itemId: string): ClothingPurchaseResult {
    const result = ClothingSystem.purchaseClothing(itemId, this.inventorySystem, this.playerProfile);
    if (result.ok) {
      this.onClothingChanged?.();
      this.saveCurrentState(false);
    }
    return result;
  }

  public equipClothing(itemId: string): ClothingEquipResult {
    const result = ClothingSystem.equipClothing(itemId, this.playerProfile);
    if (result.ok && result.equippedClothing) {
      this.worldScene?.applyEquippedClothing(result.equippedClothing);
      this.networkSystem.broadcastOutfit(result.equippedClothing);
      this.onClothingChanged?.();
      this.saveCurrentState(false);
    }
    return result;
  }

  public unequipClothing(slot: ClothingEquipmentSlot): ClothingEquipResult {
    const result = ClothingSystem.unequipSlot(slot, this.playerProfile);
    if (result.ok && result.equippedClothing) {
      this.worldScene?.applyEquippedClothing(result.equippedClothing);
      this.networkSystem.broadcastOutfit(result.equippedClothing);
      this.onClothingChanged?.();
      this.saveCurrentState(false);
    }
    return result;
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
    this.networkSystem.disconnect();
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
      this.worldScene = null;
    }
  }
}
