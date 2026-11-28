/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BUILDABLE_ZONE_BOUNDS, FARM_PLOTS, TOWN_PROTECTED_BOUNDS, ZONE_SIGNPOSTS } from '../constants';
import { MapSystem } from './MapSystem';
import { hash2D } from './TerrainAutotile';

export interface ZoneDecorPlacement {
  tx: number;
  ty: number;
  key: string;
  originY: number;
  depthOffset: number;
  flipX: boolean;
  alpha: number;
  solid?: boolean;
  sway?: 'flora' | 'lily' | 'reed';
  swayAmp?: number;
}

export interface BridgeApproachOverlay {
  tx: number;
  ty: number;
  key: 'fx_bridge_approach_nw' | 'fx_bridge_approach_ne' | 'fx_bridge_approach_se' | 'fx_bridge_approach_sw';
}

export interface LandmarkPropSpec {
  tx: number;
  ty: number;
  tex: string;
  originY: number;
  solid: boolean;
  protectedProp: boolean;
  shadowScale: [number, number];
  hasLanternGlow?: boolean;
  glowOffsetY?: number;
}

/**
 * Deterministic coordinates for Farm District core landmarks (Stone Well & Farmer Thomas).
 */
export const FARM_LANDMARK_OCCUPIED_TILES = new Set<string>([
  '49_74', // Stone Well
  '50_74', // Farmer Thomas
]);

/**
 * Curated Town Center, Mirror Lake Overlook, Quarry Camp, Homestead Gate & Farm District Landmark Specs.
 * Every coordinate is strictly verified clear of main avenues, doors, NPCs, fishing spots, and buildable Homestead lots.
 */
export const STEP7_LANDMARK_PROPS: LandmarkPropSpec[] = [
  // Town Center Plaza & Gates
  { tx: 32, ty: 29, tex: 'obj_bench', originY: 0.83, solid: true, protectedProp: true, shadowScale: [1.1, 0.72] },
  { tx: 29, ty: 22, tex: 'obj_lantern', originY: 0.9, solid: true, protectedProp: true, shadowScale: [0.75, 0.5], hasLanternGlow: true, glowOffsetY: -24 },
  { tx: 22, ty: 29, tex: 'obj_lantern', originY: 0.9, solid: true, protectedProp: true, shadowScale: [0.75, 0.5], hasLanternGlow: true, glowOffsetY: -24 },
  { tx: 38, ty: 29, tex: 'obj_lantern', originY: 0.9, solid: true, protectedProp: true, shadowScale: [0.75, 0.5], hasLanternGlow: true, glowOffsetY: -24 },
  { tx: 38, ty: 37, tex: 'obj_lantern', originY: 0.9, solid: true, protectedProp: true, shadowScale: [0.75, 0.5], hasLanternGlow: true, glowOffsetY: -24 },
  { tx: 22, ty: 24, tex: 'obj_shop_menu_board', originY: 0.88, solid: false, protectedProp: true, shadowScale: [0.75, 0.48] },
  { tx: 32, ty: 33, tex: 'obj_shop_menu_board', originY: 0.88, solid: false, protectedProp: true, shadowScale: [0.75, 0.48] },

  // Town Flower Garden & Pocket Park Low Ground Flowerbeds (non-blocking)
  { tx: 27, ty: 38, tex: 'obj_town_flowerbed', originY: 0.65, solid: false, protectedProp: true, shadowScale: [1.0, 0.65] },
  { tx: 28, ty: 38, tex: 'obj_town_flowerbed', originY: 0.65, solid: false, protectedProp: true, shadowScale: [1.0, 0.65] },
  { tx: 29, ty: 37, tex: 'obj_town_flowerbed', originY: 0.65, solid: false, protectedProp: true, shadowScale: [1.0, 0.65] },
  { tx: 34, ty: 39, tex: 'obj_town_flowerbed', originY: 0.65, solid: false, protectedProp: true, shadowScale: [1.0, 0.65] },
  { tx: 37, ty: 38, tex: 'obj_town_flowerbed', originY: 0.65, solid: false, protectedProp: true, shadowScale: [1.0, 0.65] },
  { tx: 22, ty: 22, tex: 'obj_town_flowerbed', originY: 0.65, solid: false, protectedProp: true, shadowScale: [1.0, 0.65] },
  { tx: 38, ty: 22, tex: 'obj_town_flowerbed', originY: 0.65, solid: false, protectedProp: true, shadowScale: [1.0, 0.65] },

  // Homestead District Approach Gate (just west of minX=40, zero buildable lot conflict)
  { tx: 38, ty: 41, tex: 'obj_lantern', originY: 0.9, solid: true, protectedProp: true, shadowScale: [0.75, 0.5], hasLanternGlow: true, glowOffsetY: -24 },
  { tx: 37, ty: 41, tex: 'obj_bench', originY: 0.83, solid: true, protectedProp: true, shadowScale: [1.1, 0.72] },

  // Mirror Lake North Fishing Trail Overlook (clear of trail 12,49 & fishing shore)
  { tx: 10, ty: 50, tex: 'obj_bench', originY: 0.83, solid: true, protectedProp: true, shadowScale: [1.1, 0.72] },
  { tx: 11, ty: 49, tex: 'obj_lantern', originY: 0.9, solid: true, protectedProp: true, shadowScale: [0.75, 0.5], hasLanternGlow: true, glowOffsetY: -24 },

  // Quarry Pass Mining Outpost (clear of pass trail x=60..62 & signpost 58,23)
  { tx: 59, ty: 22, tex: 'obj_quarry_blocks', originY: 0.83, solid: true, protectedProp: true, shadowScale: [1.15, 0.75] },
  { tx: 59, ty: 24, tex: 'obj_lantern', originY: 0.9, solid: true, protectedProp: true, shadowScale: [0.75, 0.5], hasLanternGlow: true, glowOffsetY: -24 },
  { tx: 63, ty: 7, tex: 'obj_ore_cart', originY: 0.83, solid: true, protectedProp: true, shadowScale: [1.25, 0.8] },
  { tx: 64, ty: 6, tex: 'obj_quarry_blocks', originY: 0.83, solid: true, protectedProp: true, shadowScale: [1.15, 0.75] },
];

/**
 * Step 14: Curated Cozy Fishing Pier & Scenic Bridge Overlook Props.
 * Every prop sits on a wing/corner tile or sandy shore entrance, keeping walkways and lakeside fishing tiles unobstructed.
 */
export const STEP14_SCENIC_PROPS: LandmarkPropSpec[] = [
  // 1. Mirror Lake East Grand Pier (2x3 head at 29..30, 60..62) — double-seater bench handled by LAKESIDE_DOUBLE_BENCHES
  { tx: 30, ty: 60, tex: 'obj_pier_pergola', originY: 0.88, solid: true, protectedProp: true, shadowScale: [1.2, 0.78], hasLanternGlow: true, glowOffsetY: -34 },
  { tx: 35, ty: 60, tex: 'obj_pier_planter', originY: 0.86, solid: true, protectedProp: true, shadowScale: [0.85, 0.56] },

  // 2. Mirror Lake North Cove Pier (2x3 head at 14..15, 55..57) — double-seater bench handled by LAKESIDE_DOUBLE_BENCHES
  { tx: 15, ty: 55, tex: 'obj_lantern', originY: 0.9, solid: true, protectedProp: true, shadowScale: [0.75, 0.5], hasLanternGlow: true, glowOffsetY: -24 },
  { tx: 9, ty: 55, tex: 'obj_pier_planter', originY: 0.86, solid: true, protectedProp: true, shadowScale: [0.85, 0.56] },

  // 3. Emerald Glade Pavilion Pier (3x2 head at 81..83, 23..24) — double-seater bench handled by LAKESIDE_DOUBLE_BENCHES
  { tx: 83, ty: 23, tex: 'obj_pier_pergola', originY: 0.88, solid: true, protectedProp: true, shadowScale: [1.2, 0.78], hasLanternGlow: true, glowOffsetY: -34 },
  { tx: 81, ty: 28, tex: 'obj_pier_planter', originY: 0.86, solid: true, protectedProp: true, shadowScale: [0.85, 0.56] },

  // 4. Highland Spring Alpine Pier (3x2 head at 14..16, 15..16) — double-seater bench handled by LAKESIDE_DOUBLE_BENCHES
  { tx: 16, ty: 15, tex: 'obj_lantern', originY: 0.9, solid: true, protectedProp: true, shadowScale: [0.75, 0.5], hasLanternGlow: true, glowOffsetY: -24 },
  { tx: 14, ty: 19, tex: 'obj_pier_planter', originY: 0.86, solid: true, protectedProp: true, shadowScale: [0.85, 0.56] },

  // 5. Silverbrook Grand Bridge Overlook Deck (88..91, 69) — double-seater bench handled by LAKESIDE_DOUBLE_BENCHES
  { tx: 91, ty: 69, tex: 'obj_lantern', originY: 0.9, solid: true, protectedProp: true, shadowScale: [0.75, 0.5], hasLanternGlow: true, glowOffsetY: -24 },
];

export class WorldComposition {
  /**
   * Computes neighbor-aware connectivity masks for wooden bridges and fishing piers:
   * - openMask (0..15): bit=1 if neighbor is walkable non-water (bridge or land); bit=0 if water/OOB (rails/pilings drawn)
   *   Bits: NW=1 (tx-1,ty), NE=2 (tx,ty-1), SE=4 (tx+1,ty), SW=8 (tx,ty+1)
   * - frontRailMask (0..3): bit 1 = SE is water, bit 2 = SW is water (for foreground ankle-level handrail sorting)
   */
  public static getBridgeMaskInfo(
    mapSystem: MapSystem,
    tx: number,
    ty: number
  ): { openMask: number; frontRailMask: number; isAbutmentEnd: boolean } {
    const isConnected = (nx: number, ny: number): boolean => {
      if (!mapSystem.isTileInBounds(nx, ny)) return false;
      const t = mapSystem.tiles[ny][nx];
      return t !== 'water' && t !== 'cliff';
    };
    const isWater = (nx: number, ny: number): boolean => {
      if (!mapSystem.isTileInBounds(nx, ny)) return true;
      return mapSystem.tiles[ny][nx] === 'water';
    };
    const isLand = (nx: number, ny: number): boolean => {
      if (!mapSystem.isTileInBounds(nx, ny)) return false;
      const t = mapSystem.tiles[ny][nx];
      return t !== 'water' && t !== 'bridge' && t !== 'cliff';
    };

    let openMask = 0;
    if (isConnected(tx - 1, ty)) openMask |= 1; // NW
    if (isConnected(tx, ty - 1)) openMask |= 2; // NE
    if (isConnected(tx + 1, ty)) openMask |= 4; // SE
    if (isConnected(tx, ty + 1)) openMask |= 8; // SW

    let frontRailMask = 0;
    if (isWater(tx + 1, ty)) frontRailMask |= 1; // SE water
    if (isWater(tx, ty + 1)) frontRailMask |= 2; // SW water

    const isAbutmentEnd =
      isLand(tx - 1, ty) || isLand(tx, ty - 1) || isLand(tx + 1, ty) || isLand(tx, ty + 1);

    return { openMask, frontRailMask, isAbutmentEnd };
  }
  /**
   * Computes timber bridge approach overlays where earthen roads meet wooden bridges.
   */
  public static getBridgeApproachOverlays(mapSystem: MapSystem): BridgeApproachOverlay[] {
    const overlays: BridgeApproachOverlay[] = [];
    for (let ty = 0; ty < mapSystem.height; ty++) {
      for (let tx = 0; tx < mapSystem.width; tx++) {
        if (mapSystem.tiles[ty][tx] !== 'dirt') continue;
        if (mapSystem.isTileInBounds(tx - 1, ty) && mapSystem.tiles[ty][tx - 1] === 'bridge') {
          overlays.push({ tx, ty, key: 'fx_bridge_approach_nw' });
        }
        if (mapSystem.isTileInBounds(tx, ty - 1) && mapSystem.tiles[ty - 1][tx] === 'bridge') {
          overlays.push({ tx, ty, key: 'fx_bridge_approach_ne' });
        }
        if (mapSystem.isTileInBounds(tx + 1, ty) && mapSystem.tiles[ty][tx + 1] === 'bridge') {
          overlays.push({ tx, ty, key: 'fx_bridge_approach_se' });
        }
        if (mapSystem.isTileInBounds(tx, ty + 1) && mapSystem.tiles[ty + 1][tx] === 'bridge') {
          overlays.push({ tx, ty, key: 'fx_bridge_approach_sw' });
        }
      }
    }
    return overlays;
  }

  /**
   * Generates clustered, biome-specific Step 7 world details deterministically across:
   * - Wild Meadows (wildflower patches, clover carpets, sunlit meadow stones)
   * - Mirror Lake, Emerald Glade Lake, Highland Spring Lake & Riverbanks (reeds, sedge, lilypad clusters, shoreline pebbles/driftwood)
   * - Whispering Forest (mossy stumps, fallen logs, woodland floor clusters)
   * - Quarry & Outskirts (shale scree, quarry crags)
   * Strictly non-blocking & never occupies Homestead buildable grass lots or fishing spots.
   */
  public static generateZoneComposition(
    mapSystem: MapSystem,
    occupiedNodeCoords: Set<string>
  ): ZoneDecorPlacement[] {
    const items: ZoneDecorPlacement[] = [];
    const usedWaterProps = new Set<string>();
    const usedLandProps = new Set<string>();

    // Pre-mark existing hardcoded Step 3 water props so Step 7 never duplicates them
    for (const key of [
      '84_21', '88_24', '16_64', '22_66', '16_14',
      '80_20', '92_22', '12_60', '24_70', '86_67', '66_79',
      '86_20', '20_58', '70_76', '52_92',
    ]) {
      usedWaterProps.add(key);
    }

    for (const lp of STEP7_LANDMARK_PROPS) {
      usedLandProps.add(`${lp.tx}_${lp.ty}`);
    }
    for (const sp of STEP14_SCENIC_PROPS) {
      usedLandProps.add(`${sp.tx}_${sp.ty}`);
    }
    for (const s of ZONE_SIGNPOSTS) {
      usedLandProps.add(`${s.tileX}_${s.tileY}`);
    }

    const isNearBridge = (tx: number, ty: number, radius = 1): boolean => {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (mapSystem.isTileInBounds(nx, ny) && mapSystem.tiles[ny][nx] === 'bridge') {
            return true;
          }
        }
      }
      return false;
    };

    const isNearRoad = (tx: number, ty: number, radius = 1): boolean => {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (mapSystem.isTileInBounds(nx, ny) && mapSystem.getRoadTier(nx, ny) !== 'none') {
            return true;
          }
        }
      }
      return false;
    };

    const isNearFarmPlot = (tx: number, ty: number, pad = 1): boolean =>
      FARM_PLOTS.some(
        (p) =>
          tx >= p.bounds.minX - pad &&
          tx <= p.bounds.maxX + pad &&
          ty >= p.bounds.minY - pad &&
          ty <= p.bounds.maxY + pad
      );

    const isNearSignpost = (tx: number, ty: number): boolean =>
      ZONE_SIGNPOSTS.some((s) => Math.abs(s.tileX - tx) <= 1 && Math.abs(s.tileY - ty) <= 1);

    const isNearResource = (tx: number, ty: number, radius = 0): boolean => {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (occupiedNodeCoords.has(`${tx + dx}_${ty + dy}`)) return true;
        }
      }
      return false;
    };

    const isNearFishingSpot = (tx: number, ty: number, radius = 1): boolean => {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (
            mapSystem.isTileInBounds(nx, ny) &&
            mapSystem.tiles[ny][nx] === 'water' &&
            occupiedNodeCoords.has(`${nx}_${ny}`)
          ) {
            return true;
          }
        }
      }
      return false;
    };

    const isInTown = (tx: number, ty: number): boolean =>
      tx >= TOWN_PROTECTED_BOUNDS.minX &&
      tx <= TOWN_PROTECTED_BOUNDS.maxX &&
      ty >= TOWN_PROTECTED_BOUNDS.minY &&
      ty <= TOWN_PROTECTED_BOUNDS.maxY;

    const isInHomestead = (tx: number, ty: number): boolean =>
      tx >= BUILDABLE_ZONE_BOUNDS.minX &&
      tx <= BUILDABLE_ZONE_BOUNDS.maxX &&
      ty >= BUILDABLE_ZONE_BOUNDS.minY &&
      ty <= BUILDABLE_ZONE_BOUNDS.maxY;

    const shorelineTrees: Array<{ tx: number; ty: number }> = [];
    const isNearWaterTile = (tx: number, ty: number, radius = 2): boolean => {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = tx + dx;
          const ny = ty + dy;
          if (mapSystem.isTileInBounds(nx, ny) && mapSystem.tiles[ny][nx] === 'water') {
            return true;
          }
        }
      }
      return false;
    };

    for (let ty = 2; ty < mapSystem.height - 2; ty++) {
      for (let tx = 2; tx < mapSystem.width - 2; tx++) {
        const tile = mapSystem.tiles[ty][tx];
        const coordKey = `${tx}_${ty}`;
        const h = hash2D(tx, ty, 709);
        const h2 = hash2D(tx, ty, 919);

        // 1. WATER SHORELINE COMPOSITION (Mirror Lake, Emerald Glade, Highland Spring, Silverbrook River)
        const isRiverWater = tile === 'water' && mapSystem.isSilverbrookRiverTile(tx, ty);
        if (tile === 'water' && !usedWaterProps.has(coordKey) && !isNearBridge(tx, ty, isRiverWater ? 2 : 1)) {
          // Never cover fishing spot tiles or their immediate neighbors
          if (isNearResource(tx, ty, isRiverWater ? 2 : 1)) continue;

          let adjLand = false;
          let twoStepLand = false;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const nx = tx + dx;
              const ny = ty + dy;
              if (!mapSystem.isTileInBounds(nx, ny)) continue;
              const nt = mapSystem.tiles[ny][nx];
              if (nt !== 'water' && nt !== 'bridge') {
                if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) adjLand = true;
                twoStepLand = true;
              }
            }
          }

          if (adjLand) {
            // Clustered reeds / cattails / broadleaf water plants / shallow stones along organic coves
            const coveWave = Math.sin(tx * 0.34 + ty * 0.29) + Math.cos(tx * 0.19 - ty * 0.37) * 0.7;
            if (isRiverWater && coveWave > 0.62 && h % 100 < 26) {
              usedWaterProps.add(coordKey);
              const stonePick = h2 % 100;
              items.push({
                tx,
                ty,
                key: stonePick < 58 ? 'obj_river_rock_cluster' : 'obj_river_stone',
                originY: 0.72,
                depthOffset: 24,
                flipX: (h & 1) === 1,
                alpha: 0.95,
              });
            } else if (coveWave > (isRiverWater ? 0.48 : 0.66) && h % 100 < (isRiverWater ? 44 : 34)) {
              usedWaterProps.add(coordKey);
              const pickReed = h2 % 100;
              const key =
                pickReed < 26
                  ? 'obj_water_plant'
                  : isRiverWater && pickReed < 52
                  ? 'obj_cattail_reeds'
                  : pickReed < 78
                  ? 'obj_water_reed'
                  : 'obj_shore_sedge';
              items.push({
                tx,
                ty,
                key,
                originY: 0.88,
                depthOffset: 34,
                flipX: (h & 1) === 1,
                alpha: 0.96,
                sway: 'reed',
              });
            }
          } else if (twoStepLand) {
            const calmPoolWave = Math.sin(tx * 0.28 - ty * 0.22) * Math.cos(tx * 0.21 + ty * 0.31);
            if (calmPoolWave > 0.38 && h % 100 < (isRiverWater ? 28 : 26)) {
              usedWaterProps.add(coordKey);
              const pick = h2 % 100;
              if (isRiverWater && pick < 36) {
                items.push({
                  tx,
                  ty,
                  key: pick < 20 ? 'obj_river_rock_cluster' : 'obj_river_stone',
                  originY: 0.7,
                  depthOffset: 24,
                  flipX: (h & 1) === 1,
                  alpha: 0.95,
                });
              } else if (pick < 54) {
                items.push({
                  tx,
                  ty,
                  key: 'obj_lilypad_cluster',
                  originY: 0.6,
                  depthOffset: 25,
                  flipX: (h & 1) === 1,
                  alpha: 0.95,
                  sway: 'lily',
                });
              } else if (pick < 82) {
                items.push({
                  tx,
                  ty,
                  key: 'obj_lilypad',
                  originY: 0.6,
                  depthOffset: 25,
                  flipX: (h & 1) === 1,
                  alpha: 0.94,
                  sway: 'lily',
                });
              } else {
                items.push({
                  tx,
                  ty,
                  key: 'obj_river_stone',
                  originY: 0.7,
                  depthOffset: 24,
                  flipX: (h & 1) === 1,
                  alpha: 0.94,
                });
              }
            }
          }
          continue;
        }

        // 2. SAND SHORELINE & RIVERBANK CLUSTERS (Sand is unbuildable; never blocks roads, bridges, or fishing!)
        if (
          tile === 'sand' &&
          !isInTown(tx, ty) &&
          !usedLandProps.has(coordKey) &&
          !mapSystem.collisionMap[ty][tx] &&
          !isNearBridge(tx, ty, 1) &&
          !isNearRoad(tx, ty, 1) &&
          !isNearFarmPlot(tx, ty, 1) &&
          !isNearResource(tx, ty, 1) &&
          !isNearFishingSpot(tx, ty, 1) &&
          !isNearSignpost(tx, ty)
        ) {
          let nearRiver = false;
          let adjGrass = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = tx + dx;
              const ny = ty + dy;
              if (!mapSystem.isTileInBounds(nx, ny)) continue;
              if (mapSystem.isSilverbrookRiverTile(nx, ny)) nearRiver = true;
              if (mapSystem.tiles[ny][nx] === 'grass') adjGrass = true;
            }
          }

          if (nearRiver) {
            const bankClusterWave =
              Math.sin(tx * 0.29 + ty * 0.23) * Math.cos(tx * 0.17 - ty * 0.31) +
              Math.sin((tx - ty) * 0.19) * 0.25;
            if (bankClusterWave > -0.18 && h % 100 < 48) {
              usedLandProps.add(coordKey);
              const pick = h2 % 100;
              if (adjGrass && pick < 48) {
                const key =
                  pick < 18
                    ? 'obj_river_flower_bank'
                    : pick < 36
                    ? 'obj_river_fern'
                    : 'obj_shore_bush';
                items.push({
                  tx,
                  ty,
                  key,
                  originY: key === 'obj_shore_bush' ? 0.8 : 0.78,
                  depthOffset: 25,
                  flipX: (h & 1) === 1,
                  alpha: 0.96,
                  sway: 'flora',
                  swayAmp: key === 'obj_shore_bush' ? 0.024 : 0.032,
                });
              } else if (pick < 64) {
                items.push({
                  tx,
                  ty,
                  key: 'obj_mossy_bank_stone',
                  originY: 0.74,
                  depthOffset: 23,
                  flipX: (h & 1) === 1,
                  alpha: 0.94,
                });
              } else if (pick < 82) {
                items.push({
                  tx,
                  ty,
                  key: 'obj_shore_pebbles',
                  originY: 0.75,
                  depthOffset: 23,
                  flipX: (h & 1) === 1,
                  alpha: 0.92,
                });
              } else {
                items.push({
                  tx,
                  ty,
                  key: pick < 91 ? 'obj_fallen_branch' : 'obj_driftwood',
                  originY: 0.75,
                  depthOffset: 23,
                  flipX: (h & 1) === 1,
                  alpha: 0.93,
                });
              }
            }
          } else if (!isInHomestead(tx, ty) && h % 100 < 16) {
            usedLandProps.add(coordKey);
            const lakePick = h2 % 100;
            const key =
              lakePick < 22
                ? 'obj_shore_bush'
                : lakePick < 42
                ? 'obj_river_flower_bank'
                : lakePick < 62
                ? 'obj_fallen_branch'
                : lakePick < 80
                ? 'obj_shore_pebbles'
                : 'obj_driftwood';
            items.push({
              tx,
              ty,
              key,
              originY: key === 'obj_shore_bush' ? 0.8 : 0.75,
              depthOffset: 23,
              flipX: (h & 1) === 1,
              alpha: 0.93,
              sway: key === 'obj_shore_bush' || key === 'obj_river_flower_bank' ? 'flora' : undefined,
              swayAmp: 0.028,
            });
          }
          continue;
        }

        // 3. DRY LAND BIOME CLUSTERS (Wild Meadows, Whispering Forest, Quarry — never inside Town or Homestead lots!)
        if (
          tile !== 'grass' ||
          isInTown(tx, ty) ||
          isInHomestead(tx, ty) ||
          mapSystem.collisionMap[ty][tx] ||
          usedLandProps.has(coordKey) ||
          isNearResource(tx, ty, 0) ||
          isNearFishingSpot(tx, ty, 1) ||
          isNearSignpost(tx, ty) ||
          isNearBridge(tx, ty)
        ) {
          continue;
        }

        // Keep road shoulders readable (optional gentle edge details ok, heavy props keep 1 tile off road)
        const onRoad = mapSystem.getRoadTier(tx, ty) !== 'none';
        if (onRoad) continue;

        let nearRoad = false;
        for (let dy = -1; dy <= 1 && !nearRoad; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (mapSystem.getRoadTier(tx + dx, ty + dy) !== 'none') {
              nearRoad = true;
              break;
            }
          }
        }

        let nearCliff = false;
        for (let dy = -2; dy <= 2 && !nearCliff; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = tx + dx;
            const ny = ty + dy;
            if (mapSystem.isTileInBounds(nx, ny) && mapSystem.tiles[ny][nx] === 'cliff') {
              nearCliff = true;
              break;
            }
          }
        }

        const isWildMeadows = tx >= 4 && tx <= 36 && ty >= 4 && ty <= 36;
        const isQuarryNorth = (tx >= 52 && tx <= 117 && ty >= 3 && ty <= 22) || nearCliff;
        const isWhisperingForest = tx >= 38 && tx <= 114 && ty >= 6 && ty <= 39;

        // Clustered wave function breaks up uniform grid randomness
        const clusterWave =
          Math.sin(tx * 0.24 + ty * 0.18) * Math.cos(tx * 0.17 - ty * 0.26) +
          Math.sin((tx + ty) * 0.31) * 0.25;

        if (isQuarryNorth) {
          if (clusterWave > 0.25 && h % 100 < 22) {
            usedLandProps.add(coordKey);
            const useCrag = !nearRoad && h2 % 100 < 34;
            items.push({
              tx,
              ty,
              key: useCrag ? 'obj_quarry_crag' : 'obj_quarry_scree',
              originY: useCrag ? 0.8 : 0.72,
              depthOffset: useCrag ? 27 : 23,
              flipX: (h & 1) === 1,
              alpha: 0.95,
            });
          }
        } else if (isWhisperingForest) {
          // Near existing trees, place mossy stumps / fallen logs / fern-mushroom clusters cleanly off trails
          const nearTree = isNearResource(tx, ty, 1);
          if (!nearRoad && nearTree && h % 100 < 12) {
            usedLandProps.add(coordKey);
            const useLog = h2 % 100 < 44;
            items.push({
              tx,
              ty,
              key: useLog ? 'obj_mossy_log' : 'obj_tree_stump',
              originY: 0.78,
              depthOffset: 26,
              flipX: (h & 1) === 1,
              alpha: 0.96,
            });
          } else if (clusterWave > 0.35 && h % 100 < 14) {
            usedLandProps.add(coordKey);
            items.push({
              tx,
              ty,
              key: h2 % 100 < 55 ? 'obj_fern_tuft' : 'obj_fallen_leaves',
              originY: 0.78,
              depthOffset: 24,
              flipX: (h & 1) === 1,
              alpha: 0.92,
              sway: h2 % 100 < 55 ? 'flora' : undefined,
              swayAmp: 0.044,
            });
          }
        } else if (isWildMeadows) {
          if (clusterWave > 0.32 && h % 100 < 24) {
            usedLandProps.add(coordKey);
            const pick = h2 % 100;
            const key =
              pick < 52
                ? 'obj_meadow_blossoms'
                : pick < 80
                ? 'obj_meadow_stones'
                : 'obj_wildflower_clump';
            items.push({
              tx,
              ty,
              key,
              originY: 0.76,
              depthOffset: 24,
              flipX: (h & 1) === 1,
              alpha: 0.95,
              sway: key !== 'obj_meadow_stones' ? 'flora' : undefined,
              swayAmp: 0.036,
            });
          }
        }

        // 4. ORGANIC WATERSIDE TREE CLUSTERS (Willow, Birch, Small Oak) OUTSIDE HOMESTEAD & CLEAR OF ROADS/BRIDGES/FISHING SPOTS
        if (
          !usedLandProps.has(coordKey) &&
          !nearRoad &&
          !nearCliff &&
          !isNearFarmPlot(tx, ty, 2) &&
          !isNearBridge(tx, ty, 2) &&
          !isNearResource(tx, ty, 2) &&
          !isNearFishingSpot(tx, ty, 2) &&
          isNearWaterTile(tx, ty, 3)
        ) {
          const shoreGroveWave =
            Math.sin(tx * 0.21 - ty * 0.17) + Math.cos(tx * 0.14 + ty * 0.25) * 0.6;
          const spacedFromTrees = shorelineTrees.every(
            (st) => Math.hypot(st.tx - tx, st.ty - ty) >= 3.2
          );
          if (shoreGroveWave > 0.12 && spacedFromTrees && h % 100 < 28) {
            usedLandProps.add(coordKey);
            shorelineTrees.push({ tx, ty });
            const treePick = h2 % 100;
            const key =
              treePick < 48
                ? 'obj_tree_willow'
                : treePick < 78
                ? 'obj_tree_birch'
                : 'obj_tree';
            items.push({
              tx,
              ty,
              key,
              originY: 0.88,
              depthOffset: 50,
              flipX: (h & 1) === 1,
              alpha: 0.98,
              solid: true,
            });
          }
        }
      }
    }

    return items;
  }
}
