/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ANIMAL_SPECIES, BUILDABLE_ZONE_BOUNDS, SCENIC_FISHING_PIERS, ZONE_SIGNPOSTS } from '../constants';
import { AnimalKind, ResourceNode } from '../types';
import { InventorySystem } from './InventorySystem';
import { MapSystem } from './MapSystem';
import { hash2D } from './TerrainAutotile';

export class ResourceSystem {
  public nodes: ResourceNode[];
  public onUpdate?: () => void;

  constructor() {
    this.nodes = [];
  }

  /**
   * Populate natural resources across the 120x120 map based on zones
   */
  public generateResources(mapSystem: MapSystem): void {
    this.nodes = [];
    let idCounter = 1;

    // Helper to check valid spawn location (keeps water, roads, bridges, farmland, cliffs, Homestead District, and zone signposts clear)
    const canSpawnAt = (tx: number, ty: number) => {
      if (!mapSystem.isTileInBounds(tx, ty)) return false;
      if (mapSystem.collisionMap[ty][tx]) return false;
      if (this.nodes.some((n) => n.tileX === tx && n.tileY === ty)) return false;
      // Don't spawn on top of integrated village town center
      if (tx >= 20 && tx <= 40 && ty >= 20 && ty <= 40) return false;
      // Step 12: Keep Homestead District (X 40..114, Y 40..114) clear of natural trees, rocks, bushes & animals
      if (
        tx >= BUILDABLE_ZONE_BOUNDS.minX &&
        tx <= BUILDABLE_ZONE_BOUNDS.maxX &&
        ty >= BUILDABLE_ZONE_BOUNDS.minY &&
        ty <= BUILDABLE_ZONE_BOUNDS.maxY
      ) {
        return false;
      }
      const tile = mapSystem.tiles[ty][tx];
      if (
        tile === 'water' ||
        tile === 'dirt' ||
        tile === 'bridge' ||
        tile === 'cobble' ||
        tile === 'farmland' ||
        tile === 'cliff'
      ) {
        return false;
      }
      if (mapSystem.protectedPropTiles.has(`${tx}_${ty}`)) {
        return false;
      }
      // Keep zone entrance signposts clear
      if (ZONE_SIGNPOSTS.some((s) => Math.hypot(s.tileX - tx, s.tileY - ty) <= 1.5)) {
        return false;
      }
      return true;
    };

    // Strict dry-meadow spawn check for wildlife (must be walkable grass and buffered from water/cliff tiles)
    const canSpawnAnimalAt = (tx: number, ty: number) => {
      if (!canSpawnAt(tx, ty)) return false;
      if (mapSystem.tiles[ty][tx] !== 'grass') return false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = tx + dx;
          const ny = ty + dy;
          if (!mapSystem.isTileInBounds(nx, ny)) return false;
          const nt = mapSystem.tiles[ny][nx];
          if (nt === 'water' || nt === 'bridge' || nt === 'cliff') {
            return false;
          }
        }
      }
      return true;
    };

    // 1. Whispering Forest Organic Clustered Groves & Sunlit Glades (Northeast: tx 40..114, ty 7..39)
    // Multi-frequency grove density + deterministic spacing breaks up rectangular grid lines completely
    for (let ty = 7; ty <= 48; ty++) {
      for (let tx = 40; tx <= 114; tx++) {
        const isPath =
          (tx >= 28 && tx <= 33 && ty <= 24) ||
          (ty >= 24 && ty <= 27 && tx <= 94) ||
          (tx >= 60 && tx <= 63 && ty <= 15);
        if (isPath) continue;

        // Multi-octave organic woodland grove density with sunny open meadows
        const groveMacro =
          Math.sin(tx * 0.14 + ty * 0.11) * Math.cos(tx * 0.09 - ty * 0.13) +
          Math.sin((tx + ty) * 0.21) * 0.35 +
          Math.cos(tx * 0.31 - ty * 0.27) * 0.22;

        if (groveMacro <= 0.06) continue;

        const h = hash2D(tx, ty, 503);
        const spawnChance = groveMacro > 0.55 ? 24 : 15; // % chance per candidate tile in grove
        if (h % 100 >= spawnChance) continue;

        if (!canSpawnAt(tx, ty) || mapSystem.tiles[ty][tx] !== 'grass') continue;

        // Avoid blocking walkable paths: ensure minimum separation from nearby trees
        const minSpacing = groveMacro > 0.65 ? 1.45 : 1.9;
        const tooClose = this.nodes.some(
          (n) => n.type === 'tree' && Math.hypot(n.tileX - tx, n.tileY - ty) < minSpacing
        );
        if (tooClose) continue;

        this.nodes.push({
          id: `res_tree_${idCounter++}`,
          type: 'tree',
          tileX: tx,
          tileY: ty,
          currentHealth: 3,
          maxHealth: 3,
          yieldItem: 'wood',
          yieldAmount: 3,
          gatherDurationMs: 1800,
          requiredTool: 'axe_basic',
          respawnTimeSeconds: 23,
        });
        mapSystem.setCollision(tx, ty, true);
      }
    }

    // 2. Scattered Natural Groves across Meadows, Lake Approaches & Outskirts (strictly outside Homestead)
    const scatterTrees = [
      [8, 10], [12, 16], [18, 8], [22, 14], [10, 22], [16, 28],
      [42, 38], [14, 82], [22, 92], [32, 100],
      [8, 30], [10, 34], [14, 28], [28, 16], [32, 12],
      [15, 38], [20, 42], [28, 44], [35, 48],
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
          respawnTimeSeconds: 23,
        });
        mapSystem.setCollision(tx, ty, true);
      }
    }

    // 3. Quarry, Outskirts & Expanded Whispering Forest Rocks (Pickaxe mineable stone boulders)
    const rockLocations: Array<[number, number]> = [
      [5, 5], [7, 7], [12, 4], [16, 6], [22, 5], [32, 6],
      [58, 8], [72, 12], [86, 16], [102, 10], [112, 18],
      [42, 32], [54, 34], [68, 28], [84, 36], [106, 32],
      [6, 32], [8, 36], [12, 48], [16, 52],
      [82, 116], [98, 116], [115, 104], [112, 116],
    ];
    for (const [tx, ty] of rockLocations) {
      if (canSpawnAt(tx, ty)) {
        const variant = (hash2D(tx, ty, 733) % 3) as 0 | 1 | 2;
        this.nodes.push({
          id: `res_rock_${idCounter++}`,
          type: 'rock',
          rockVariant: variant,
          tileX: tx,
          tileY: ty,
          currentHealth: 3,
          maxHealth: 3,
          yieldItem: 'stone',
          yieldAmount: 2,
          gatherDurationMs: 2000,
          requiredTool: 'pickaxe_basic',
          respawnTimeSeconds: 28,
        });
        mapSystem.setCollision(tx, ty, true);
      }
    }

    // 3B. Whispering Forest Natural Rock Outcrops & Glade Boulders (tx 40..114, ty 7..39)
    // Guaranteed deterministic placement with >= 2.15 tile separation and 1-tile road clearance
    for (let ty = 7; ty <= 39; ty++) {
      for (let tx = 40; tx <= 114; tx++) {
        if (!canSpawnAt(tx, ty) || mapSystem.tiles[ty][tx] !== 'grass') continue;
        // Keep away from main roads, trails, bridges, and piers
        let nearRoadOrWater = false;
        for (let dy = -1; dy <= 1 && !nearRoadOrWater; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = tx + dx;
            const ny = ty + dy;
            if (!mapSystem.isTileInBounds(nx, ny)) continue;
            const nt = mapSystem.tiles[ny][nx];
            if (mapSystem.getRoadTier(nx, ny) !== 'none' || nt === 'water' || nt === 'bridge' || nt === 'dirt') {
              nearRoadOrWater = true;
              break;
            }
          }
        }
        if (nearRoadOrWater) continue;

        const isNorthernFoothill = ty <= 16 || (tx >= 70 && ty <= 21);
        const outcropWave =
          Math.sin(tx * 0.19 - ty * 0.23) * Math.cos(tx * 0.13 + ty * 0.17) +
          (isNorthernFoothill ? 0.34 : 0);
        if (outcropWave <= 0.14) continue;

        const h = hash2D(tx, ty, 827);
        const spawnThreshold = isNorthernFoothill ? 14 : 9;
        if (h % 100 >= spawnThreshold) continue;

        // Enforce spacing >= 2.2 tiles from existing rocks and >= 1.6 from existing trees
        const tooClose = this.nodes.some((n) => {
          const d = Math.hypot(n.tileX - tx, n.tileY - ty);
          if (n.type === 'rock') return d < 2.25;
          if (n.type === 'tree') return d < 1.65;
          return d < 1.4;
        });
        if (tooClose) continue;

        const variant = (hash2D(tx, ty, 733) % 3) as 0 | 1 | 2;
        this.nodes.push({
          id: `res_rock_${idCounter++}`,
          type: 'rock',
          rockVariant: variant,
          tileX: tx,
          tileY: ty,
          currentHealth: 3,
          maxHealth: 3,
          yieldItem: 'stone',
          yieldAmount: isNorthernFoothill ? 3 : 2,
          gatherDurationMs: 2000,
          requiredTool: 'pickaxe_basic',
          respawnTimeSeconds: 28,
        });
        mapSystem.setCollision(tx, ty, true);
      }
    }

    // 4. Wild Flowering Berry Bushes (Meadows & Forest Edges — harvested efficiently with Scythe)
    const bushLocations = [
      [9, 12], [14, 18], [19, 11], [24, 17], [16, 23],
      [36, 12], [41, 19], [47, 8], [53, 14], [66, 18], [80, 22],
      [38, 34], [49, 39], [16, 40], [36, 20], [62, 37], [36, 90],
      [22, 39], [25, 45], [18, 52], [26, 78], [34, 86],
    ];
    for (const [tx, ty] of bushLocations) {
      if (canSpawnAt(tx, ty) && mapSystem.tiles[ty][tx] === 'grass') {
        this.nodes.push({
          id: `res_bush_${idCounter++}`,
          type: 'bush',
          spriteVariant: 'berry_bush',
          tileX: tx,
          tileY: ty,
          currentHealth: 1,
          maxHealth: 1,
          yieldItem: 'fiber',
          yieldAmount: 2,
          gatherDurationMs: 1200,
          requiredTool: 'scythe_basic',
          respawnTimeSeconds: 18,
        });
      }
    }

    // 5. Gentle Wild Animals (Rabbits & Deer strictly on dry walkable Meadows & Woodland clearings outside Homestead)
    const animalLocations: [number, number][] = [
      [7, 14], [11, 8], [8, 20], [26, 20], [13, 22], [6, 24],
      [25, 8], [28, 18], [34, 14], [48, 16], [58, 22], [75, 28],
      [18, 86], [24, 94], [38, 98], [28, 96],
    ];
    animalLocations.forEach(([tx, ty], index) => {
      let spawnX = -1;
      let spawnY = -1;
      if (canSpawnAnimalAt(tx, ty)) {
        spawnX = tx;
        spawnY = ty;
      } else {
        for (let r = 1; r <= 6 && spawnX === -1; r++) {
          for (let dy = -r; dy <= r && spawnX === -1; dy++) {
            for (let dx = -r; dx <= r && spawnX === -1; dx++) {
              if (canSpawnAnimalAt(tx + dx, ty + dy)) {
                spawnX = tx + dx;
                spawnY = ty + dy;
              }
            }
          }
        }
      }
      if (spawnX !== -1 && spawnY !== -1) {
        const animalKind: AnimalKind = index % 2 === 0 ? 'rabbit' : 'deer';
        const species = ANIMAL_SPECIES[animalKind];
        this.nodes.push({
          id: `res_animal_${idCounter++}`,
          type: 'animal',
          animalKind,
          tileX: spawnX,
          tileY: spawnY,
          currentHealth: 1,
          maxHealth: 1,
          yieldItem: species.yieldItem,
          yieldAmount: 2,
          gatherDurationMs: 1500,
          respawnTimeSeconds: 33,
        });
      }
    });

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
      // Silverbrook River shoreline (Homestead District — preserved on water)
      [104, 58], [92, 65], [76, 74], [60, 86], [46, 100],
    ];

    const addFishingSpotIfValid = (wx: number, wy: number, allowClose = false) => {
      if (!mapSystem.isTileInBounds(wx, wy)) return false;
      if (mapSystem.tiles[wy][wx] !== 'water') return false;
      if (!ResourceSystem.isTileReachableFromShore(mapSystem, wx, wy)) return false;
      const minSpacing = allowClose ? 1.35 : 2.2;
      if (this.nodes.some((n) => n.type === 'lake_fish' && Math.hypot(n.tileX - wx, n.tileY - wy) < minSpacing)) {
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

    // Dedicated scenic fishing pier & bridge overlook spots (reachable directly from pier platforms!)
    for (const pier of SCENIC_FISHING_PIERS) {
      for (const [fx, fy] of pier.fishSpots) {
        addFishingSpotIfValid(fx, fy, true);
      }
    }

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

    // 7. Step 15: Natural Lakeside & Outer-Riverbank Harvestable Tall Grass Clusters
    // Placed in organic pockets along grass & sand shores of Mirror Lake, Emerald Glade,
    // Highland Spring, and Silverbrook outer banks — strictly outside Homestead Build Zone,
    // never blocking roads, bridges, fishing piers, or fishing spot casting tiles.
    const pierAndTrailTiles = new Set<string>();
    for (const pier of SCENIC_FISHING_PIERS) {
      for (const [px, py] of [...pier.approachTrailTiles, ...pier.deckTiles]) {
        pierAndTrailTiles.add(`${px}_${py}`);
      }
    }

    const canSpawnLakesideGrass = (tx: number, ty: number): boolean => {
      if (!canSpawnAt(tx, ty)) return false;
      const tile = mapSystem.tiles[ty][tx];
      if (tile !== 'grass' && tile !== 'sand') return false;
      if (mapSystem.getRoadTier(tx, ty) !== 'none') return false;

      // Keep bridges, piers, pier trails, and fishing spots clear of obstructions
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (!mapSystem.isTileInBounds(nx, ny)) continue;
          if (mapSystem.tiles[ny][nx] === 'bridge') return false;
          if (pierAndTrailTiles.has(`${nx}_${ny}`)) return false;
          if (this.nodes.some((n) => n.type === 'lake_fish' && n.tileX === nx && n.tileY === ny)) {
            return false;
          }
        }
      }

      // Natural spacing: keep organic cluster separation without grid crowding
      if (this.nodes.some((n) => n.type === 'bush' && Math.hypot(n.tileX - tx, n.tileY - ty) < 1.35)) {
        return false;
      }

      return true;
    };

    const lakesideGrassClusters: [number, number][] = [
      // Mirror Lake shoreline pockets (North, NE Cove, East Shore, West/SW Cove)
      [20, 49], [22, 49], [24, 50],
      [27, 52], [28, 54], [29, 56],
      [31, 57], [34, 59], [34, 68],
      [7, 60], [8, 62], [7, 68],
      // Emerald Glade Lake shoreline pockets (North, East, SW/South)
      [79, 16], [85, 16], [91, 16],
      [94, 19], [95, 24], [93, 27],
      [78, 25], [89, 28],
      // Highland Spring Lake shoreline pockets (North, East, SW Cove)
      [15, 8], [21, 8],
      [24, 11], [25, 12],
      [10, 17], [12, 19],
      // Silverbrook River outer sandy/grassy banks (strictly outside Homestead X:40..114, Y:40..114)
      [115, 55], [116, 58], [115, 62],
      [36, 115], [41, 115], [43, 116],
    ];

    for (const [tx, ty] of lakesideGrassClusters) {
      if (canSpawnLakesideGrass(tx, ty)) {
        this.nodes.push({
          id: `res_bush_${idCounter++}`,
          type: 'bush',
          spriteVariant: 'tall_grass',
          tileX: tx,
          tileY: ty,
          currentHealth: 1,
          maxHealth: 1,
          yieldItem: 'fiber',
          yieldAmount: 2,
          gatherDurationMs: 1200,
          requiredTool: 'scythe_basic',
          respawnTimeSeconds: 18,
        });
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
   * Check whether a node tile remains valid for safe respawn (never on Homestead land lots, roads, bridges, or buildings)
   */
  public static isNodeRespawnSafe(
    node: ResourceNode,
    mapSystem: MapSystem,
    blockedTiles?: Set<string>
  ): boolean {
    const { tileX: tx, tileY: ty, type } = node;
    if (!mapSystem.isTileInBounds(tx, ty)) return false;
    if (blockedTiles?.has(`${tx}_${ty}`)) return false;

    const tile = mapSystem.tiles[ty][tx];
    if (type === 'lake_fish') {
      return tile === 'water';
    }

    if (
      tx >= BUILDABLE_ZONE_BOUNDS.minX &&
      tx <= BUILDABLE_ZONE_BOUNDS.maxX &&
      ty >= BUILDABLE_ZONE_BOUNDS.minY &&
      ty <= BUILDABLE_ZONE_BOUNDS.maxY
    ) {
      return false;
    }

    if (
      tile === 'water' ||
      tile === 'dirt' ||
      tile === 'bridge' ||
      tile === 'cobble' ||
      tile === 'farmland' ||
      tile === 'cliff'
    ) {
      return false;
    }

    if (mapSystem.getRoadTier(tx, ty) !== 'none') return false;
    return true;
  }

  /**
   * Periodic respawn tick (safe against buildings, roads, Homestead lots, duplicate spawns & standing players)
   */
  public updateRespawns(
    mapSystem: MapSystem,
    guard?: {
      blockedTiles?: Set<string>;
      playerPositions?: Array<{ x: number; y: number }>;
    }
  ): void {
    const now = Date.now();
    let updated = false;
    const activeCoords = new Set<string>();
    for (const n of this.nodes) {
      if (!n.depletedUntil || n.depletedUntil > now) {
        if (!n.depletedUntil) activeCoords.add(`${n.tileX}_${n.tileY}`);
      }
    }

    for (const node of this.nodes) {
      if (node.depletedUntil && node.depletedUntil <= now) {
        // Never respawn onto roads, bridges, buildings, or inside Homestead District
        if (!ResourceSystem.isNodeRespawnSafe(node, mapSystem, guard?.blockedTiles)) {
          continue;
        }

        // Prevent duplicate resource stacking on the same tile
        const coordKey = `${node.tileX}_${node.tileY}`;
        if (activeCoords.has(coordKey)) {
          node.depletedUntil = now + 2000;
          continue;
        }

        // Defer gently if a player is currently standing right on the node tile
        if (
          node.type !== 'lake_fish' &&
          guard?.playerPositions?.some(
            (p) => Math.abs(p.x - node.tileX) < 0.78 && Math.abs(p.y - node.tileY) < 0.78
          )
        ) {
          node.depletedUntil = now + 1500;
          continue;
        }

        node.depletedUntil = undefined;
        node.currentHealth = node.maxHealth;
        activeCoords.add(coordKey);
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
