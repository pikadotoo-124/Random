/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileType } from '../types';
import { MapSystem } from './MapSystem';

export interface OverlayInstruction {
  key: string;
  depthOffset: number;
}

/**
 * Fast deterministic 2D integer spatial hash returning a non-negative integer
 */
export function hash2D(tx: number, ty: number, salt = 0): number {
  let h = (tx * 374761393 + ty * 668265263 + salt * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Selects from 8 rich Stardew-inspired grass tile variants without grid repetition
 */
export function getGrassVariantKey(tx: number, ty: number): string {
  const patchNoise =
    Math.sin(tx * 0.21 + ty * 0.17) * Math.cos(tx * 0.14 - ty * 0.23) +
    Math.sin((tx - ty) * 0.09) * 0.25;
  const h = hash2D(tx, ty, 7) % 100;

  if (patchNoise > 0.42) {
    return h < 55 ? 'tile_grass_2' : 'tile_grass_7'; // Wildflower / meadow herb clusters
  }
  if (patchNoise < -0.38) {
    return h < 60 ? 'tile_grass_1' : 'tile_grass_6'; // Clover & deep lush turf
  }
  if (h < 22) return 'tile_grass_0';
  if (h < 38) return 'tile_grass_3'; // Sunlit dappled moss
  if (h < 52) return 'tile_grass_6'; // Shaded lush blade cluster
  if (h < 64) return 'tile_grass_1'; // Three-leaf clover
  if (h < 76) return 'tile_grass_4'; // Woodland moss & leaf flecks
  if (h < 88) return 'tile_grass_5'; // Smooth meadow pebbles & tufts
  if (h < 95) return 'tile_grass_7'; // Pink/lavender tiny blossoms
  return 'tile_grass_2';
}

export function getSandVariantKey(tx: number, ty: number): string {
  const h = hash2D(tx, ty, 19) % 4;
  return `tile_sand_${h}`;
}

export function getCobbleVariantKey(tx: number, ty: number): string {
  const h = hash2D(tx, ty, 31) % 4;
  return `tile_cobble_${h}`;
}

export function getCliffVariantKey(tx: number, ty: number): string {
  const h = hash2D(tx, ty, 43) % 4;
  return `tile_cliff_${h}`;
}

export function getWaterVariantKey(tx: number, ty: number, mapSystem?: MapSystem): string {
  const isGlade = tx >= 74 && tx <= 98 && ty >= 14 && ty <= 30;
  const h = hash2D(tx, ty, 59);

  if (mapSystem) {
    const isWaterTile = (nx: number, ny: number): boolean => {
      if (!mapSystem.isTileInBounds(nx, ny)) return true;
      const t = mapSystem.tiles[ny][nx];
      return t === 'water' || t === 'bridge';
    };

    // Check immediate 4-neighbor land adjacency -> Shallow Shoreline Band
    const nearLand =
      !isWaterTile(tx - 1, ty) ||
      !isWaterTile(tx + 1, ty) ||
      !isWaterTile(tx, ty - 1) ||
      !isWaterTile(tx, ty + 1);

    if (nearLand) {
      if (isGlade) return 'tile_water_glade_shallow';
      return h % 2 === 0 ? 'tile_water_shallow_0' : 'tile_water_shallow_1';
    }

    // Check radius 2 for deep open lake center
    let isDeepCenter = true;
    for (let dy = -2; dy <= 2 && isDeepCenter; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (!isWaterTile(tx + dx, ty + dy)) {
          isDeepCenter = false;
          break;
        }
      }
    }

    if (isDeepCenter) {
      if (isGlade) return 'tile_water_glade_deep';
      return h % 2 === 0 ? 'tile_water_deep_0' : 'tile_water_deep_1';
    }
  }

  if (isGlade) {
    return 'tile_water_2';
  }
  return h % 2 === 0 ? 'tile_water_1' : 'tile_water_0';
}

/**
 * Computes 4-neighbor isometric connection bitmask (NW=1, NE=2, SE=4, SW=8)
 * for seamless curved Bezier roads & nature trails.
 */
export function getRoadConnectionMask(mapSystem: MapSystem, tx: number, ty: number): number {
  const isRoadNeighbor = (nx: number, ny: number): boolean => {
    if (!mapSystem.isTileInBounds(nx, ny)) return false;
    const nt = mapSystem.tiles[ny][nx];
    return nt === 'dirt' || nt === 'bridge' || nt === 'cobble' || nt === 'farmland';
  };

  let mask = 0;
  if (isRoadNeighbor(tx - 1, ty)) mask |= 1; // NW
  if (isRoadNeighbor(tx, ty - 1)) mask |= 2; // NE
  if (isRoadNeighbor(tx + 1, ty)) mask |= 4; // SE
  if (isRoadNeighbor(tx, ty + 1)) mask |= 8; // SW
  return mask;
}

/**
 * Computes all seamless edge, concave cove corner, and convex tip transition overlays
 * for tile (tx, ty) so terrain boundaries curve organically instead of forming square diamonds.
 */
export function getTileTransitionOverlays(mapSystem: MapSystem, tx: number, ty: number): OverlayInstruction[] {
  const tileType = mapSystem.tiles[ty][tx];
  const overlays: OverlayInstruction[] = [];

  const getTile = (nx: number, ny: number): TileType | null => {
    if (!mapSystem.isTileInBounds(nx, ny)) return null;
    return mapSystem.tiles[ny][nx];
  };

  // Water & Bridge share flowing water beneath; Land excludes both water and bridge
  const isLand = (t: TileType | null): boolean => t !== null && t !== 'water' && t !== 'bridge';

  const tNW = getTile(tx - 1, ty);
  const tNE = getTile(tx, ty - 1);
  const tSE = getTile(tx + 1, ty);
  const tSW = getTile(tx, ty + 1);

  const tN = getTile(tx - 1, ty - 1);
  const tE = getTile(tx + 1, ty - 1);
  const tS = getTile(tx + 1, ty + 1);
  const tW = getTile(tx - 1, ty + 1);

  // 1. WATER: Natural Curved Shoreline with non-uniform organic foam pockets vs calm glassy edges
  if (tileType === 'water') {
    const landNW = isLand(tNW);
    const landNE = isLand(tNE);
    const landSE = isLand(tSE);
    const landSW = isLand(tSW);

    const shoreKind = (t: TileType | null): 'sand' | 'grass' => (t === 'sand' ? 'sand' : 'grass');
    const edgeFoamPrefix = (dirSalt: number): 'fx_shore_' | 'fx_shore_calm_' => {
      const wave = Math.sin(tx * 0.62 + ty * 0.48 + dirSalt) + ((hash2D(tx, ty, 83 + dirSalt) % 100) / 100 - 0.5) * 0.85;
      return wave > -0.12 ? 'fx_shore_' : 'fx_shore_calm_';
    };

    if (landNW) overlays.push({ key: `${edgeFoamPrefix(1)}${shoreKind(tNW)}_nw`, depthOffset: 0.35 });
    if (landNE) overlays.push({ key: `${edgeFoamPrefix(2)}${shoreKind(tNE)}_ne`, depthOffset: 0.35 });
    if (landSE) overlays.push({ key: `${edgeFoamPrefix(3)}${shoreKind(tSE)}_se`, depthOffset: 0.35 });
    if (landSW) overlays.push({ key: `${edgeFoamPrefix(4)}${shoreKind(tSW)}_sw`, depthOffset: 0.35 });

    const covePrefix = (cSalt: number): 'fx_shore_in_' | 'fx_shore_in_calm_' =>
      hash2D(tx, ty, 131 + cSalt) % 100 < 56 ? 'fx_shore_in_' : 'fx_shore_in_calm_';

    // Inner concave cove caps smooth 90-degree corners into curved bays
    if (landNW && landNE) {
      const k = tNW === 'sand' || tNE === 'sand' ? 'sand' : 'grass';
      overlays.push({ key: `${covePrefix(1)}${k}_n`, depthOffset: 0.38 });
    }
    if (landNE && landSE) {
      const k = tNE === 'sand' || tSE === 'sand' ? 'sand' : 'grass';
      overlays.push({ key: `${covePrefix(2)}${k}_e`, depthOffset: 0.38 });
    }
    if (landSE && landSW) {
      const k = tSE === 'sand' || tSW === 'sand' ? 'sand' : 'grass';
      overlays.push({ key: `${covePrefix(3)}${k}_s`, depthOffset: 0.38 });
    }
    if (landSW && landNW) {
      const k = tSW === 'sand' || tNW === 'sand' ? 'sand' : 'grass';
      overlays.push({ key: `${covePrefix(4)}${k}_w`, depthOffset: 0.38 });
    }

    // Outer convex headland tips round jutting diagonal land corners
    if (!landNW && !landNE && isLand(tN)) {
      overlays.push({ key: `fx_shore_out_${shoreKind(tN)}_n`, depthOffset: 0.37 });
    }
    if (!landNE && !landSE && isLand(tE)) {
      overlays.push({ key: `fx_shore_out_${shoreKind(tE)}_e`, depthOffset: 0.37 });
    }
    if (!landSE && !landSW && isLand(tS)) {
      overlays.push({ key: `fx_shore_out_${shoreKind(tS)}_s`, depthOffset: 0.37 });
    }
    if (!landSW && !landNW && isLand(tW)) {
      overlays.push({ key: `fx_shore_out_${shoreKind(tW)}_w`, depthOffset: 0.37 });
    }

    return overlays;
  }

  // 2. SAND: Seamless Grass Overhang & Curved Meadow Borders
  if (tileType === 'sand') {
    const isG = (t: TileType | null) => t === 'grass';
    const gNW = isG(tNW);
    const gNE = isG(tNE);
    const gSE = isG(tSE);
    const gSW = isG(tSW);

    if (gNW) overlays.push({ key: 'fx_grass_edge_nw', depthOffset: 0.25 });
    if (gNE) overlays.push({ key: 'fx_grass_edge_ne', depthOffset: 0.25 });
    if (gSE) overlays.push({ key: 'fx_grass_edge_se', depthOffset: 0.25 });
    if (gSW) overlays.push({ key: 'fx_grass_edge_sw', depthOffset: 0.25 });

    if (gNW && gNE) overlays.push({ key: 'fx_grass_in_n', depthOffset: 0.27 });
    if (gNE && gSE) overlays.push({ key: 'fx_grass_in_e', depthOffset: 0.27 });
    if (gSE && gSW) overlays.push({ key: 'fx_grass_in_s', depthOffset: 0.27 });
    if (gSW && gNW) overlays.push({ key: 'fx_grass_in_w', depthOffset: 0.27 });

    if (!gNW && !gNE && isG(tN)) overlays.push({ key: 'fx_grass_out_n', depthOffset: 0.26 });
    if (!gNE && !gSE && isG(tE)) overlays.push({ key: 'fx_grass_out_e', depthOffset: 0.26 });
    if (!gSE && !gSW && isG(tS)) overlays.push({ key: 'fx_grass_out_s', depthOffset: 0.26 });
    if (!gSW && !gNW && isG(tW)) overlays.push({ key: 'fx_grass_out_w', depthOffset: 0.26 });

    return overlays;
  }

  // 3. COBBLESTONE: Soft Grass Curb & Earth Transition where Town Plaza meets Grass or Roads
  if (tileType === 'cobble') {
    if (tNW === 'grass') overlays.push({ key: 'fx_cobble_grass_nw', depthOffset: 0.25 });
    if (tNE === 'grass') overlays.push({ key: 'fx_cobble_grass_ne', depthOffset: 0.25 });
    if (tSE === 'grass') overlays.push({ key: 'fx_cobble_grass_se', depthOffset: 0.25 });
    if (tSW === 'grass') overlays.push({ key: 'fx_cobble_grass_sw', depthOffset: 0.25 });

    if (tNW === 'dirt') overlays.push({ key: 'fx_cobble_dirt_nw', depthOffset: 0.25 });
    if (tNE === 'dirt') overlays.push({ key: 'fx_cobble_dirt_ne', depthOffset: 0.25 });
    if (tSE === 'dirt') overlays.push({ key: 'fx_cobble_dirt_se', depthOffset: 0.25 });
    if (tSW === 'dirt') overlays.push({ key: 'fx_cobble_dirt_sw', depthOffset: 0.25 });

    return overlays;
  }

  // 4. CLIFF: Mossy Ledge Overhangs & Rounded Corners
  if (tileType === 'cliff') {
    const nonCliff = (t: TileType | null) => t !== null && t !== 'cliff';
    const nNW = nonCliff(tNW);
    const nNE = nonCliff(tNE);
    const nSE = nonCliff(tSE);
    const nSW = nonCliff(tSW);

    if (nNW) overlays.push({ key: 'fx_cliff_ledge_nw', depthOffset: 0.26 });
    if (nNE) overlays.push({ key: 'fx_cliff_ledge_ne', depthOffset: 0.26 });
    if (nSE) overlays.push({ key: 'fx_cliff_ledge_se', depthOffset: 0.26 });
    if (nSW) overlays.push({ key: 'fx_cliff_ledge_sw', depthOffset: 0.26 });

    if (nNW && nNE) overlays.push({ key: 'fx_cliff_in_n', depthOffset: 0.28 });
    if (nNE && nSE) overlays.push({ key: 'fx_cliff_in_e', depthOffset: 0.28 });
    if (nSE && nSW) overlays.push({ key: 'fx_cliff_in_s', depthOffset: 0.28 });
    if (nSW && nNW) overlays.push({ key: 'fx_cliff_in_w', depthOffset: 0.28 });

    return overlays;
  }

  // 5. FARMLAND: Soft Turf Garden Border
  if (tileType === 'farmland') {
    if (tNW === 'grass' || tNW === 'dirt') overlays.push({ key: 'fx_grass_edge_nw', depthOffset: 0.24 });
    if (tNE === 'grass' || tNE === 'dirt') overlays.push({ key: 'fx_grass_edge_ne', depthOffset: 0.24 });
    if (tSE === 'grass' || tSE === 'dirt') overlays.push({ key: 'fx_grass_edge_se', depthOffset: 0.24 });
    if (tSW === 'grass' || tSW === 'dirt') overlays.push({ key: 'fx_grass_edge_sw', depthOffset: 0.24 });
  }

  // 6. GRASS: Foothill Granite Scree & Cliff Skirt when bordering Cliff to NW or NE
  if (tileType === 'grass') {
    if (tNW === 'cliff') overlays.push({ key: 'fx_cliff_foothill_nw', depthOffset: 0.24 });
    if (tNE === 'cliff') overlays.push({ key: 'fx_cliff_foothill_ne', depthOffset: 0.24 });
  }

  // 7. DIRT (non-road): Soft Grass Overhang
  if (tileType === 'dirt' && mapSystem.getRoadTier(tx, ty) === 'none') {
    if (tNW === 'grass') overlays.push({ key: 'fx_grass_edge_nw', depthOffset: 0.24 });
    if (tNE === 'grass') overlays.push({ key: 'fx_grass_edge_ne', depthOffset: 0.24 });
    if (tSE === 'grass') overlays.push({ key: 'fx_grass_edge_se', depthOffset: 0.24 });
    if (tSW === 'grass') overlays.push({ key: 'fx_grass_edge_sw', depthOffset: 0.24 });
  }

  return overlays;
}

/**
 * Selects biome-appropriate, non-overlapping natural ground details
 * (wildflowers, ferns, mushrooms, fallen leaves, moss stones, cliff shrubs)
 * across meadows, Whispering Forest, roadsides, and mountain foothills.
 */
export function getNatureDecorForTile(
  mapSystem: MapSystem,
  tx: number,
  ty: number
): { key: string; flipX: boolean; alpha: number } | null {
  if (mapSystem.tiles[ty][tx] !== 'grass') return null;

  // Anti-clumping grid jitter check (keeps ground breathing and avoids adjacent duplicates)
  const h = hash2D(tx, ty, 211);
  const hKind = hash2D(tx, ty, 307);

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

  const adjRoad =
    mapSystem.getRoadTier(tx + 1, ty) !== 'none' ||
    mapSystem.getRoadTier(tx - 1, ty) !== 'none' ||
    mapSystem.getRoadTier(tx, ty + 1) !== 'none' ||
    mapSystem.getRoadTier(tx, ty - 1) !== 'none';

  const isNorthernAlpine = ty <= 15 || (tx >= 54 && ty <= 24);
  const isWhisperingForest = tx >= 38 && ty <= 49;

  // Determine natural biome density threshold out of 100
  let threshold = 5; // Calm sunlit meadow default (5%)
  if (nearCliff) threshold = 22;
  else if (isWhisperingForest) threshold = 16;
  else if (adjRoad) threshold = 14;

  if (h % 100 >= threshold) return null;

  // Prevent strict 1-tile neighbor crowding for heavy decor
  if (hash2D(tx - 1, ty, 211) % 100 < threshold && hash2D(tx, ty - 1, 211) % 100 < threshold) {
    return null;
  }

  const pick = hKind % 100;
  let key = 'obj_wildflower_clump';

  if (nearCliff || isNorthernAlpine) {
    if (pick < 30) key = 'obj_moss_stone';
    else if (pick < 56) key = 'obj_cliff_shrub';
    else if (pick < 78) key = 'obj_pebble_cluster';
    else key = 'obj_fern_tuft';
  } else if (isWhisperingForest) {
    if (pick < 32) key = 'obj_fern_tuft';
    else if (pick < 56) key = 'obj_fallen_leaves';
    else if (pick < 72) key = 'obj_mushroom_red';
    else if (pick < 86) key = 'obj_mushroom_amber';
    else if (pick < 95) key = 'obj_moss_stone';
    else key = 'obj_wildflower_clump';
  } else if (adjRoad) {
    if (pick < 42) key = 'obj_wildflower_clump';
    else if (pick < 68) key = 'obj_flower_meadow';
    else if (pick < 84) key = 'obj_pebble_cluster';
    else key = 'obj_fern_tuft';
  } else {
    if (pick < 45) key = 'obj_wildflower_clump';
    else if (pick < 78) key = 'obj_flower_meadow';
    else if (pick < 90) key = 'obj_fallen_leaves';
    else key = 'obj_pebble_cluster';
  }

  return {
    key,
    flipX: (h & 1) === 1,
    alpha: 0.9 + (h % 10) * 0.01,
  };
}
