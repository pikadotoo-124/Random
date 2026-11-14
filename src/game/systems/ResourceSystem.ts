/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ZONE_SIGNPOSTS } from '../constants';
import { ResourceNode } from '../types';
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

    // Helper to check valid spawn location (keeps roads, bridges, farmland, and zone signposts clear)
    const canSpawnAt = (tx: number, ty: number) => {
      if (!mapSystem.isTileInBounds(tx, ty)) return false;
      if (this.nodes.some((n) => n.tileX === tx && n.tileY === ty)) return false;
      // Don't spawn on top of integrated village town center
      if (tx >= 20 && tx <= 40 && ty >= 20 && ty <= 40) return false;
      const tile = mapSystem.tiles[ty][tx];
      if (tile === 'dirt' || tile === 'bridge' || tile === 'cobble' || tile === 'farmland' || tile === 'cliff') {
        return false;
      }
      // Keep zone entrance signposts clear
      if (ZONE_SIGNPOSTS.some((s) => Math.hypot(s.tileX - tx, s.tileY - ty) <= 1.5)) {
        return false;
      }
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
    // Automatically scan shoreline-adjacent water tiles so EVERY fishing spot is both on water and reachable from land!
    const preferredFishSpots: [number, number][] = [
      // Mirror Lake shoreline pockets (South-West)
      [12, 52], [18, 52], [25, 52], [32, 58], [33, 64],
      [29, 71], [22, 72], [14, 71], [8, 65], [8, 57],
      // Emerald Glade Lake shoreline (East Whispering Forest)
      [78, 22], [82, 17], [90, 17], [94, 22], [88, 27],
      // Highland Spring Lake shoreline (Northwest Meadows)
      [25, 14], [22, 10], [14, 10], [11, 15], [18, 19],
      // Silverbrook River shoreline (Homestead District)
      [104, 58], [92, 65], [76, 74], [60, 86], [46, 100],
    ];

    const addFishingSpotIfValid = (wx: number, wy: number) => {
      if (!mapSystem.isTileInBounds(wx, wy)) return false;
      if (mapSystem.tiles[wy][wx] !== 'water') return false;
      if (!ResourceSystem.isTileReachableFromShore(mapSystem, wx, wy)) return false;
      if (this.nodes.some((n) => n.type === 'lake_fish' && Math.hypot(n.tileX - wx, n.tileY - wy) < 2.2)) {
        return false;
      }
      this.nodes.push({
        id: `res_fish_${idCounter++}`,
        type: 'lake_fish',
        tileX: wx,
        tileY: wy,
        currentHealth: 1,
        maxHealth: 1,
        yieldItem: 'fish',
        yieldAmount: 1,
        gatherDurationMs: 2200,
        requiredTool: 'rod_basic',
        respawnTimeSeconds: 20,
      });
      return true;
    };

    for (const [fx, fy] of preferredFishSpots) {
      if (addFishingSpotIfValid(fx, fy)) continue;
      // Snap to nearest valid shoreline water tile within 4 tiles
      let snapped = false;
      for (let r = 1; r <= 4 && !snapped; r++) {
        for (let dy = -r; dy <= r && !snapped; dy++) {
          for (let dx = -r; dx <= r && !snapped; dx++) {
            if (addFishingSpotIfValid(fx + dx, fy + dy)) {
              snapped = true;
            }
          }
        }
      }
    }
  }

  /**
   * Check whether a water tile can be reached from at least one adjacent walkable shore tile
   */
  public static isTileReachableFromShore(mapSystem: MapSystem, wx: number, wy: number): boolean {
    if (!mapSystem.isTileInBounds(wx, wy) || mapSystem.tiles[wy][wx] !== 'water') {
      return false;
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const sx = wx + dx;
        const sy = wy + dy;
        if (mapSystem.isTileInBounds(sx, sy) && mapSystem.isWalkable(sx, sy)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Validate whether a player can gather/interact with a resource node (e.g. Fishing requires rod_basic)
   */
  public canGatherNode(node: ResourceNode, inventory: InventorySystem): { allowed: boolean; reason?: string } {
    if (node.type === 'lake_fish') {
      if (!inventory.hasItem('rod_basic', 1)) {
        return {
          allowed: false,
          reason: 'ငါးမျှားတံ (Fishing Rod) လိုအပ်သည် — ဆိုင်တွင်ဝယ်ပါ (25🪙) သို့ ဖန်တီးပါ',
        };
      }
    }
    return { allowed: true };
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
   * Harvest resource node (optional amountOverride used for fishing timing bonus)
   */
  public harvestNode(
    node: ResourceNode,
    inventory: InventorySystem,
    mapSystem: MapSystem,
    amountOverride?: number
  ): { item: string; amount: number } {
    node.depletedUntil = Date.now() + node.respawnTimeSeconds * 1000;

    const amount = typeof amountOverride === 'number' && amountOverride > 0 ? amountOverride : node.yieldAmount;
    // Add to inventory
    inventory.addItem(node.yieldItem, amount);

    // If solid, temporarily remove collision while depleted
    if (node.type === 'tree' || node.type === 'rock') {
      mapSystem.setCollision(node.tileX, node.tileY, false);
    }

    if (this.onUpdate) {
      this.onUpdate();
    }

    return { item: node.yieldItem, amount };
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
