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
  FacingDirection,
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
  public initialPosition: { tileX: number; tileY: number; facingDirection: FacingDirection };
  public playerStats: PlayerStats;
  public playerWorldChanges: PlayerWorldChanges;
  public hasHydrated = false;
  public isSceneReady = false;
  public onSceneReady?: () => void;
  public onClothingChanged?: () => void;

  private pendingJoystickVector = { x: 0, y: 0 };
  private pendingUiOverlayOpen = false;
  private lastMovementCheckpointAt = 0;

  constructor(profile?: PlayerProfile, userId?: string, initialState?: SavedGameState) {
    this.userId = userId;
    this.mapSystem = new MapSystem();
    this.inventorySystem = new InventorySystem();
    this.buildingSystem = new BuildingSystem();
    this.craftingSystem = new CraftingSystem();
    this.resourceSystem = new ResourceSystem();
    this.networkSystem = new NetworkSystem();
    this.atmosphereSystem = new WorldAtmosphereSystem();

    // Populate natural resource nodes before validating initial spawn walkability
    this.resourceSystem.generateResources(this.mapSystem);

    const saved = initialState
      ? SaveSystem.migrateGameState(initialState, profile?.name, profile?.gender)
      : !userId
      ? SaveSystem.loadGame(undefined)
      : null;

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
      const facingDirection = SaveSystem.normalizeDirection(
        saved.position?.facingDirection ?? saved.player?.facingDirection ?? profile?.facingDirection
      );

      this.playerProfile = {
        ...(profile || saved.player),
        gender: resolvedGender,
        coins: saved.inventory.coins,
        currentTool: saved.player.currentTool ?? profile?.currentTool ?? 'axe_basic',
        facingDirection,
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

      const rawX = saved.position?.tileX ?? 30;
      const rawY = saved.position?.tileY ?? 30;
      const safePos = this.mapSystem.findNearestWalkableTile(rawX, rawY);
      this.initialPosition = {
        tileX: safePos.snapped ? safePos.tileX : Math.max(0, Math.min(119, rawX)),
        tileY: safePos.snapped ? safePos.tileY : Math.max(0, Math.min(119, rawY)),
        facingDirection,
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
      const facingDirection = SaveSystem.normalizeDirection(baseProf.facingDirection);
      this.playerProfile = {
        ...baseProf,
        facingDirection,
        ownedClothing,
        equippedClothing,
      };
      this.inventorySystem.initStarterItems();
      this.playerStats = SaveSystem.getDefaultStats();
      this.playerWorldChanges = SaveSystem.getDefaultWorldChanges();
      this.initialPosition = { tileX: 30, tileY: 30, facingDirection };
      this.hasHydrated = !userId;
    }
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

  public unequipAllClothing(): ClothingEquipResult {
    const result = ClothingSystem.unequipAll(this.playerProfile);
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

    const safePos = this.worldScene.getSafeSavePosition();
    const tileX = safePos.tileX;
    const tileY = safePos.tileY;
    const facingDirection = safePos.facingDirection;
    const currentZone = this.mapSystem.getZoneAt(Math.round(tileX), Math.round(tileY)).name;

    this.recordZoneDiscovered(currentZone);
    this.playerProfile.facingDirection = facingDirection;

    const state: SavedGameState = {
      version: CURRENT_SAVE_VERSION,
      lastSaved: Date.now(),
      currentZone,
      player: {
        ...this.playerProfile,
        coins: this.inventorySystem.coins,
        facingDirection,
      },
      position: {
        tileX,
        tileY,
        facingDirection,
      },
      inventory: this.inventorySystem.serialize(),
      buildings: this.buildingSystem.serialize(this.userId, this.playerProfile.name),
      playerStats: { ...this.playerStats },
      playerWorldChanges: {
        tutorialCompleted: this.playerWorldChanges.tutorialCompleted,
        discoveredZones: [...this.playerWorldChanges.discoveredZones],
        ...(this.playerWorldChanges.resetEpoch ? { resetEpoch: this.playerWorldChanges.resetEpoch } : {}),
      },
    };

    return { state, currentZone };
  }

  /**
   * Throttled movement checkpoint (saves every 3.5s during sustained travel or immediately on stop/zone change)
   */
  public saveMovementCheckpoint(immediate = false): Promise<boolean> {
    if (!this.hasHydrated || !this.worldScene) return Promise.resolve(false);
    const now = Date.now();
    if (!immediate && now - this.lastMovementCheckpointAt < 3500) {
      return Promise.resolve(false);
    }
    this.lastMovementCheckpointAt = now;
    return this.saveCurrentState(false);
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
    if (immediate) {
      this.lastMovementCheckpointAt = Date.now();
    }

    return SaveSystem.saveGameWithCloud(this.userId, snap.state, snap.currentZone, immediate);
  }

  /**
   * Flush current live state and wait for the entire Cloud Save queue to drain before signing out
   */
  public async flushBeforeSignOut(): Promise<boolean> {
    const ok = await this.saveCurrentState(true);
    if (this.userId) {
      const queueOk = await SaveSystem.flushQueue(this.userId);
      return ok && queueOk;
    }
    return ok;
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
