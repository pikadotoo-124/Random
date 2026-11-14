/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BuildingType, FenceRotation, PlacedBuilding } from '../types';
import { InventorySystem } from './InventorySystem';
import { MapSystem } from './MapSystem';

export class BuildingSystem {
  public buildings: PlacedBuilding[];
  public onUpdate?: () => void;

  constructor() {
    this.buildings = [];
  }

  public static getFootprint(type: BuildingType): { width: number; height: number } {
    switch (type) {
      case 'house_small':
        return { width: 2, height: 2 };
      case 'house_medium':
        return { width: 3, height: 2 };
      case 'house_large':
        return { width: 3, height: 3 };
      default:
        return { width: 1, height: 1 };
    }
  }

  public static normalizeRotation(rot?: number): FenceRotation {
    if (typeof rot !== 'number' || Number.isNaN(rot)) return 0;
    const mod = ((Math.round(rot) % 4) + 4) % 4;
    return mod as FenceRotation;
  }

  public isPersonalBuilding(b: PlacedBuilding, uid?: string, playerName?: string): boolean {
    if (!uid) return true;
    if (b.ownerId) {
      return b.ownerId === uid;
    }
    // Legacy save compatibility (before ownerId existed)
    if (b.placedBy === uid) return true;
    if (playerName && b.placedBy === playerName) return true;
    // If neither matches and no ownerId, keep if not explicitly owned by someone else
    return false;
  }

  public getPersonalBuildings(uid?: string, playerName?: string): PlacedBuilding[] {
    return this.buildings.filter((b) => this.isPersonalBuilding(b, uid, playerName));
  }

  /**
   * Validate if a building can be placed at (tileX, tileY) across its entire footprint
   */
  public canPlaceBuilding(
    type: BuildingType,
    tileX: number,
    tileY: number,
    mapSystem: MapSystem,
    playerPos?: { x: number; y: number },
    remotePlayers?: Array<{ x: number; y: number }>,
    npcs?: Array<{ tileX: number; tileY: number }>,
    resourceNodes?: Array<{ tileX: number; tileY: number }>,
    excludeBuildingId?: string
  ): { valid: boolean; reason?: string } {
    const { width, height } = BuildingSystem.getFootprint(type);

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const tx = tileX + dx;
        const ty = tileY + dy;

        // 1. Check map boundaries & designated Buildable Zone (Homestead District, roads, water, farmland, town center)
        const zoneCheck = mapSystem.isTileInBuildableZone(tx, ty);
        if (!zoneCheck.allowed) {
          return { valid: false, reason: zoneCheck.reason };
        }

        // 2. Check if Player is currently standing on the footprint (Prevent self-trapping bug!)
        if (playerPos) {
          const pIntX = Math.round(playerPos.x);
          const pIntY = Math.round(playerPos.y);
          if (pIntX === tx && pIntY === ty) {
            return { valid: false, reason: 'မိမိရပ်နေသောနေရာတွင် ဆောက်လုပ်၍မရပါ (ဘေးသို့အနည်းငယ်ရွှေ့ပါ)' };
          }
          if (Math.hypot(playerPos.x - tx, playerPos.y - ty) < 0.75) {
            return { valid: false, reason: 'မိမိရပ်နေသောနေရာနှင့် နီးကပ်လွန်းပါသည် (ဘေးသို့အနည်းငယ်ရွှေ့ပါ)' };
          }
        }

        // 3. Check if Remote Players are standing on the footprint
        if (remotePlayers && remotePlayers.length > 0) {
          for (const rp of remotePlayers) {
            if (Math.round(rp.x) === tx && Math.round(rp.y) === ty) {
              return { valid: false, reason: 'အခြားကစားသမား ရပ်နေသောနေရာတွင် ဆောက်လုပ်၍မရပါ' };
            }
          }
        }

        // 4. Check if any NPC is on this tile
        if (npcs && npcs.length > 0) {
          for (const npc of npcs) {
            if (npc.tileX === tx && npc.tileY === ty) {
              return { valid: false, reason: 'ရွာသူရွာသား (NPC) ရှိနေသောနေရာတွင် ဆောက်လုပ်၍မရပါ' };
            }
          }
        }

        // 5. Check if any intact Resource Node (Tree, Rock, Fish spot) is on this tile
        if (resourceNodes && resourceNodes.length > 0) {
          for (const node of resourceNodes) {
            if (node.tileX === tx && node.tileY === ty) {
              return { valid: false, reason: 'သစ်ပင် သို့မဟုတ် ကျောက်တုံးရှိနေသောနေရာတွင် ဆောက်လုပ်၍မရပါ' };
            }
          }
        }

        // 6. Check if overlaps an existing placed building (ignoring self if in move mode)
        for (const b of this.buildings) {
          if (excludeBuildingId && b.id === excludeBuildingId) continue;
          if (tx >= b.tileX && tx < b.tileX + b.width && ty >= b.tileY && ty < b.tileY + b.height) {
            return { valid: false, reason: 'အခြားအဆောက်အအုံနှင့် ထပ်နေပါသည်' };
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Place building structure
   */
  public placeBuilding(
    type: BuildingType,
    tileX: number,
    tileY: number,
    playerName: string,
    mapSystem: MapSystem,
    inventory: InventorySystem,
    playerPos?: { x: number; y: number },
    remotePlayers?: Array<{ x: number; y: number }>,
    npcs?: Array<{ tileX: number; tileY: number }>,
    resourceNodes?: Array<{ tileX: number; tileY: number }>,
    rotation: FenceRotation = 0,
    ownerId?: string
  ): PlacedBuilding | null {
    const check = this.canPlaceBuilding(
      type,
      tileX,
      tileY,
      mapSystem,
      playerPos,
      remotePlayers,
      npcs,
      resourceNodes
    );
    if (!check.valid) return null;

    // Check if player has item in bag
    if (!inventory.hasItem(type, 1)) {
      return null;
    }

    inventory.removeItem(type, 1);

    const { width, height } = BuildingSystem.getFootprint(type);

    const building: PlacedBuilding = {
      id: `b_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type,
      tileX,
      tileY,
      width,
      height,
      rotation: type === 'fence_wood' ? BuildingSystem.normalizeRotation(rotation) : 0,
      ownerId,
      placedBy: playerName,
      createdAt: Date.now(),
      storage: type === 'storage_box' ? [] : undefined,
    };

    this.buildings.push(building);

    // Update map collision for solid buildings
    if (type !== 'campfire') {
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          mapSystem.setCollision(tileX + dx, tileY + dy, true);
        }
      }
    }

    if (this.onUpdate) {
      this.onUpdate();
    }

    return building;
  }

  /**
   * Move (and optionally rotate) an existing building to a new valid location
   */
  public moveBuilding(
    id: string,
    newTx: number,
    newTy: number,
    mapSystem: MapSystem,
    playerPos?: { x: number; y: number },
    remotePlayers?: Array<{ x: number; y: number }>,
    npcs?: Array<{ tileX: number; tileY: number }>,
    resourceNodes?: Array<{ tileX: number; tileY: number }>,
    newRotation?: FenceRotation
  ): PlacedBuilding | null {
    const building = this.buildings.find((b) => b.id === id);
    if (!building) return null;

    // Validate new location
    const check = this.canPlaceBuilding(
      building.type,
      newTx,
      newTy,
      mapSystem,
      playerPos,
      remotePlayers,
      npcs,
      resourceNodes,
      id
    );
    if (!check.valid) return null;

    // Clear old collision
    for (let dy = 0; dy < building.height; dy++) {
      for (let dx = 0; dx < building.width; dx++) {
        mapSystem.setCollision(building.tileX + dx, building.tileY + dy, false);
      }
    }

    // Set new coordinates & rotation
    building.tileX = newTx;
    building.tileY = newTy;
    if (building.type === 'fence_wood' && newRotation !== undefined) {
      building.rotation = BuildingSystem.normalizeRotation(newRotation);
    }

    // Set new collision
    if (building.type !== 'campfire') {
      for (let dy = 0; dy < building.height; dy++) {
        for (let dx = 0; dx < building.width; dx++) {
          mapSystem.setCollision(newTx + dx, newTy + dy, true);
        }
      }
    }

    if (this.onUpdate) {
      this.onUpdate();
    }

    return building;
  }

  /**
   * Remove/demolish a building and refund material
   */
  public dismantleBuilding(id: string, mapSystem: MapSystem, inventory: InventorySystem): boolean {
    const index = this.buildings.findIndex((b) => b.id === id);
    if (index === -1) return false;

    const b = this.buildings[index];
    // Free collision
    for (let dy = 0; dy < b.height; dy++) {
      for (let dx = 0; dx < b.width; dx++) {
        mapSystem.setCollision(b.tileX + dx, b.tileY + dy, false);
      }
    }

    // Refund building item
    inventory.addItem(b.type, 1);
    this.buildings.splice(index, 1);

    if (this.onUpdate) {
      this.onUpdate();
    }

    return true;
  }

  /**
   * Serialize buildings for local/remote save
   */
  public serialize(uid?: string, playerName?: string): PlacedBuilding[] {
    return uid ? this.getPersonalBuildings(uid, playerName) : this.buildings;
  }

  /**
   * Deserialize saved buildings
   */
  public deserialize(buildings: PlacedBuilding[], mapSystem: MapSystem, defaultOwnerId?: string): void {
    this.buildings = (buildings || []).map((b) => {
      const fp = BuildingSystem.getFootprint(b.type);
      return {
        ...b,
        width: b.width || fp.width,
        height: b.height || fp.height,
        rotation: b.type === 'fence_wood' ? BuildingSystem.normalizeRotation(b.rotation) : 0,
        ownerId: b.ownerId || defaultOwnerId,
      };
    });
    for (const b of this.buildings) {
      if (b.type !== 'campfire') {
        for (let dy = 0; dy < b.height; dy++) {
          for (let dx = 0; dx < b.width; dx++) {
            mapSystem.setCollision(b.tileX + dx, b.tileY + dy, true);
          }
        }
      }
    }
    if (this.onUpdate) {
      this.onUpdate();
    }
  }
}
