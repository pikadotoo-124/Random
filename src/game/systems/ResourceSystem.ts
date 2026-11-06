/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResourceNode, ResourceType } from '../types';
import { InventorySystem } from './InventorySystem';
import { MapSystem } from './MapSystem';

export class ResourceSystem {
  public nodes: ResourceNode[];
  public onUpdate?: () => void;

  constructor() {
    this.nodes = [];
  }

  /**
   * Populate natural resources across the 60x60 map based on zones
   */
  public generateResources(mapSystem: MapSystem): void {
    this.nodes = [];
    let idCounter = 1;

    // Helper to check valid spawn location
    const canSpawnAt = (tx: number, ty: number) => {
      if (!mapSystem.isTileInBounds(tx, ty)) return false;
      if (this.nodes.some((n) => n.tileX === tx && n.tileY === ty)) return false;
      // Don't spawn on top of main city plaza
      if (tx >= 24 && tx <= 36 && ty >= 24 && ty <= 36) return false;
      return true;
    };

    // 1. Whispering Forest Natural Clusters & Dense Groves (Northeast: tx 40..114, ty 7..48)
    // Organic clumping replacing rigid mathematical 3x3 grids:
    // Pine ridge to the north, Golden Birches in middle, Stately Oaks in deep forest
    for (let ty = 7; ty <= 48; ty += 2) {
      for (let tx = 40; tx <= 114; tx += 2) {
        // Organic natural density function with forest clearings
        const forestNoise = Math.sin(tx * 0.35 + ty * 0.4) * Math.cos(tx * 0.25 - ty * 0.2) + Math.sin(tx * 0.15) * 0.4;
        const isPath = (tx >= 28 && tx <= 33 && ty <= 24) || (ty >= 24 && ty <= 27 && tx <= 94) || (tx >= 60 && tx <= 63 && ty <= 15);

        // Clustered dense groves with glades and trails
        if (!isPath && forestNoise > -0.15 && canSpawnAt(tx, ty) && mapSystem.tiles[ty][tx] === 'grass') {
          // Slight natural jitter
          const jitterX = ((tx * 7 + ty * 13) % 3 === 0) ? 1 : 0;
          const jitterY = ((tx * 11 + ty * 5) % 3 === 0) ? 1 : 0;
          const spawnX = tx + jitterX;
          const spawnY = ty + jitterY;

          if (canSpawnAt(spawnX, spawnY) && mapSystem.tiles[spawnY][spawnX] === 'grass') {
            this.nodes.push({
              id: `res_tree_${idCounter++}`,
              type: 'tree',
              tileX: spawnX,
              tileY: spawnY,
              currentHealth: 3,
              maxHealth: 3,
              yieldItem: 'wood',
              yieldAmount: 3,
              gatherDurationMs: 1800,
              requiredTool: 'axe_basic',
              respawnTimeSeconds: 25,
            });
            mapSystem.setCollision(spawnX, spawnY, true);
          }
        }
      }
    }

    // 2. Scattered Natural Groves across Meadows, Riverbanks & Homestead Fringes
    const scatterTrees = [
      [8, 10], [12, 16], [18, 8], [22, 14], [10, 22], [16, 28],
      [42, 38], [52, 44], [64, 52], [78, 62], [88, 72], [96, 56],
      [14, 82], [22, 92], [32, 100], [52, 104], [68, 96], [82, 104],
      [8, 30], [10, 34], [14, 28], [28, 16], [32, 12],
      [15, 38], [20, 42], [28, 44], [35, 48], [48, 60], [60, 68]
    ];
    for (const [tx, ty] of scatterTrees) {
      if (canSpawnAt(tx, ty) && mapSystem.tiles[ty][tx] === 'grass') {
        this.nodes.push({
          id: `res_tree_${idCounter++}`,
          type: 'tree',
          tileX: tx,
          tileY: ty,
          currentHealth: 3,
          maxHealth: 3,
          yieldItem: 'wood',
          yieldAmount: 2,
          gatherDurationMs: 1800,
          requiredTool: 'axe_basic',
          respawnTimeSeconds: 25,
        });
        mapSystem.setCollision(tx, ty, true);
      }
    }

    // 3. Quarry & Outskirts Rocks (Stone boulders across hills and cliffs)
    const rockLocations = [
      [5, 5], [7, 7], [12, 4], [16, 6], [22, 5], [32, 6],
      [58, 8], [72, 12], [86, 16], [102, 10], [112, 18],
      [42, 32], [54, 34], [68, 28], [84, 36], [106, 32],
      [6, 32], [8, 36], [12, 48], [16, 52],
      [60, 78], [74, 84], [90, 88], [108, 92], [114, 104],
      [82, 114], [98, 112], [112, 116]
    ];
    for (const [tx, ty] of rockLocations) {
      if (canSpawnAt(tx, ty)) {
        this.nodes.push({
          id: `res_rock_${idCounter++}`,
          type: 'rock',
          tileX: tx,
          tileY: ty,
          currentHealth: 3,
          maxHealth: 3,
          yieldItem: 'stone',
          yieldAmount: 2,
          gatherDurationMs: 2000,
          requiredTool: 'pickaxe_basic',
          respawnTimeSeconds: 30,
        });
        mapSystem.setCollision(tx, ty, true);
      }
    }

    // 4. Wild Flowering Berry Bushes (Meadows & forest edges)
    const bushLocations = [
      [9, 12], [14, 18], [19, 11], [24, 17], [16, 23],
      [36, 12], [41, 19], [47, 8], [53, 14], [66, 18], [80, 22],
      [38, 34], [44, 46], [49, 39], [58, 56], [72, 66], [84, 76],
      [22, 39], [25, 45], [18, 52], [26, 78], [34, 86]
    ];
    for (const [tx, ty] of bushLocations) {
      if (canSpawnAt(tx, ty) && mapSystem.tiles[ty][tx] === 'grass') {
        this.nodes.push({
          id: `res_bush_${idCounter++}`,
          type: 'bush',
          tileX: tx,
          tileY: ty,
          currentHealth: 1,
          maxHealth: 1,
          yieldItem: 'fiber',
          yieldAmount: 2,
          gatherDurationMs: 1200,
          respawnTimeSeconds: 20,
        });
      }
    }

    // 5. Gentle Wild Animals (Hares & Deer in Meadows & Woodland)
    const animalLocations = [
      [7, 14], [11, 9], [15, 14], [19, 19], [13, 21], [6, 20],
      [22, 10], [28, 18], [34, 14], [48, 16], [58, 22], [76, 18],
      [18, 86], [24, 94], [38, 98], [56, 88]
    ];
    for (const [tx, ty] of animalLocations) {
      if (canSpawnAt(tx, ty)) {
        this.nodes.push({
          id: `res_animal_${idCounter++}`,
          type: 'animal',
          tileX: tx,
          tileY: ty,
          currentHealth: 1,
          maxHealth: 1,
          yieldItem: 'meat',
          yieldAmount: 2,
          gatherDurationMs: 1500,
          respawnTimeSeconds: 35,
        });
      }
    }

    // 6. Fishing Spots across Mirror Lake, Emerald Glade Lake, Highland Spring Lake & Silverbrook River
    const fishLocations = [
      // Mirror Lake (South-West)
      [14, 52], [18, 54], [24, 56], [28, 62], [26, 68],
      [20, 72], [14, 70], [10, 64], [12, 58], [16, 60],
      // Lake 2: Emerald Glade Lake (East Whispering Forest)
      [84, 18], [90, 20], [86, 25], [80, 22], [92, 24],
      // Lake 3: Highland Spring Lake (Northwest Meadows)
      [15, 12], [21, 13], [17, 16], [14, 15],
      // Silverbrook River (Homestead District)
      [100, 58], [88, 66], [74, 74], [58, 86], [48, 98]
    ];
    for (const [tx, ty] of fishLocations) {
      if (canSpawnAt(tx, ty)) {
        this.nodes.push({
          id: `res_fish_${idCounter++}`,
          type: 'lake_fish',
          tileX: tx,
          tileY: ty,
          currentHealth: 1,
          maxHealth: 1,
          yieldItem: 'fish',
          yieldAmount: 2,
          gatherDurationMs: 2200,
          requiredTool: 'rod_basic',
          respawnTimeSeconds: 25,
        });
      }
    }
  }

  /**
   * Find nearest interactive node to a tile
   */
  public getNearbyNode(tx: number, ty: number, maxDistance = 1.6): ResourceNode | null {
    let closest: ResourceNode | null = null;
    let minDist = maxDistance;

    const now = Date.now();
    for (const node of this.nodes) {
      if (node.depletedUntil && node.depletedUntil > now) {
        continue; // Currently depleted / waiting to respawn
      }

      const dist = Math.hypot(node.tileX - tx, node.tileY - ty);
      if (dist <= minDist) {
        minDist = dist;
        closest = node;
      }
    }

    return closest;
  }

  /**
   * Calculate effective gather duration taking player tools into account
   */
  public getGatherDuration(node: ResourceNode, inventory: InventorySystem): number {
    let duration = node.gatherDurationMs;

    if (node.requiredTool) {
      const hasTool = inventory.hasItem(node.requiredTool, 1);
      if (hasTool) {
        duration = Math.max(800, duration * 0.65); // 35% faster with proper tool!
      } else {
        duration = duration * 1.5; // slower without proper tool
      }
    }

    return Math.round(duration);
  }

  /**
   * Harvest resource node
   */
  public harvestNode(
    node: ResourceNode,
    inventory: InventorySystem,
    mapSystem: MapSystem
  ): { item: string; amount: number } {
    node.depletedUntil = Date.now() + node.respawnTimeSeconds * 1000;

    // Add to inventory
    inventory.addItem(node.yieldItem, node.yieldAmount);

    // If solid, temporarily remove collision while depleted
    if (node.type === 'tree' || node.type === 'rock') {
      mapSystem.setCollision(node.tileX, node.tileY, false);
    }

    if (this.onUpdate) {
      this.onUpdate();
    }

    return { item: node.yieldItem, amount: node.yieldAmount };
  }

  /**
   * Periodic respawn tick
   */
  public updateRespawns(mapSystem: MapSystem): void {
    const now = Date.now();
    let updated = false;

    for (const node of this.nodes) {
      if (node.depletedUntil && node.depletedUntil <= now) {
        node.depletedUntil = undefined;
        node.currentHealth = node.maxHealth;
        if (node.type === 'tree' || node.type === 'rock') {
          mapSystem.setCollision(node.tileX, node.tileY, true);
        }
        updated = true;
      }
    }

    if (updated && this.onUpdate) {
      this.onUpdate();
    }
  }
}
