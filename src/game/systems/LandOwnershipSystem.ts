/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BUILDABLE_ZONE_BOUNDS,
  FARM_PLOTS,
  MAP_CONFIG,
  TOWN_PROTECTED_BOUNDS,
  ZONE_SIGNPOSTS,
} from '../constants';
import { LAKESIDE_DOUBLE_BENCHES } from '../data/LakesideBenches';
import { BuildingType, FarmPlotOwnersMap, PlacedBuilding } from '../types';
import {
  getFarmPlotAtTile,
  isTileInsideFarmPlot,
  validateFarmFencePlacement,
} from './FarmPlotOwnershipSystem';
import { MapSystem } from './MapSystem';
import {
  FARM_LANDMARK_OCCUPIED_TILES,
  STEP14_SCENIC_PROPS,
  STEP7_LANDMARK_PROPS,
} from './WorldComposition';

export const MAX_CLAIM_TILES_PER_OWNER = 196;
export const MAX_ENCLOSURE_SPAN = 20;
export const HOUSE_YARD_MARGIN = 1;

export type OwnershipValidationCode =
  | 'INVALID_PLAYER'
  | 'INVALID_BUILDING'
  | 'INVALID_FARM_BUILDING'
  | 'OUT_OF_ZONE'
  | 'TILE_OCCUPIED'
  | 'CLAIMED_BY_OTHER'
  | 'MAX_CLAIM_EXCEEDED'
  | 'UNAUTHORIZED_OWNER'
  | 'FARM_PLOT_UNOWNED'
  | 'FARM_PLOT_NOT_OWNER'
  | 'NOT_FOUND';

export interface OwnershipCheckResult {
  allowed: boolean;
  code?: OwnershipValidationCode;
  reason?: string;
}

export interface OwnershipClaimsResult {
  tileOwners: Map<string, string>;
  ownerTiles: Map<string, Set<string>>;
  legacyTileOwners: Map<string, string>;
}

const VALID_BUILDING_TYPES = new Set<BuildingType>([
  'house_small',
  'house_medium',
  'house_large',
  'fence_wood',
  'campfire',
  'storage_box',
  'lantern',
  'decor_bench',
  'decor_flower_pot',
  'decor_flowerbed',
  'decor_flower_stand',
]);

export function getAuthoritativeFootprint(type: BuildingType): { width: number; height: number } {
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

export function isHouseBuildingType(type: BuildingType): boolean {
  return type === 'house_small' || type === 'house_medium' || type === 'house_large';
}

export function getEffectiveBuildingOwnerKey(b: Pick<PlacedBuilding, 'id' | 'ownerId' | 'placedBy'>): string {
  if (b.ownerId && b.ownerId.trim().length > 0) {
    return b.ownerId;
  }
  return `legacy:${b.placedBy || b.id}`;
}

export function canOwnerModifyBuilding(
  b: Pick<PlacedBuilding, 'id' | 'ownerId' | 'placedBy'>,
  requesterUid?: string
): boolean {
  if (!requesterUid || requesterUid.trim().length === 0) return false;
  if (b.ownerId && b.ownerId.trim().length > 0) {
    return b.ownerId === requesterUid;
  }
  // Legacy buildings without ownerId remain read-only/protected against strangers
  return b.placedBy === requesterUid;
}

/**
 * Pure Homestead District lot-claimable tile predicate (zero DOM/Phaser dependency).
 */
export function isHomesteadClaimableTile(mapSystem: MapSystem, tx: number, ty: number): boolean {
  if (!mapSystem.isTileInBounds(tx, ty)) return false;
  if (
    tx >= TOWN_PROTECTED_BOUNDS.minX &&
    tx <= TOWN_PROTECTED_BOUNDS.maxX &&
    ty >= TOWN_PROTECTED_BOUNDS.minY &&
    ty <= TOWN_PROTECTED_BOUNDS.maxY
  ) {
    return false;
  }
  if (
    tx < BUILDABLE_ZONE_BOUNDS.minX ||
    tx > BUILDABLE_ZONE_BOUNDS.maxX ||
    ty < BUILDABLE_ZONE_BOUNDS.minY ||
    ty > BUILDABLE_ZONE_BOUNDS.maxY
  ) {
    return false;
  }
  const tile = mapSystem.tiles[ty][tx];
  if (tile !== 'grass' && tile !== 'sand') {
    return false;
  }
  if (mapSystem.protectedPropTiles.has(`${tx}_${ty}`)) {
    return false;
  }
  return true;
}

/**
 * Builds an authoritative MapSystem seeded with all protected town, farm, signpost,
 * pier, NPC, and bench coordinates for server-side build validation (Cloudflare DO & Express).
 */
export function createAuthoritativeServerMap(): MapSystem {
  const map = new MapSystem();
  for (const s of ZONE_SIGNPOSTS) {
    map.setProtectedProp(s.tileX, s.tileY, true);
  }
  for (const prop of STEP7_LANDMARK_PROPS) {
    if (prop.protectedProp) {
      map.setProtectedProp(prop.tx, prop.ty, true);
    }
  }
  for (const prop of STEP14_SCENIC_PROPS) {
    if (prop.protectedProp) {
      map.setProtectedProp(prop.tx, prop.ty, true);
    }
  }
  for (const bench of LAKESIDE_DOUBLE_BENCHES) {
    map.setProtectedProp(bench.tileX, bench.tileY, true);
  }
  for (const farmKey of FARM_LANDMARK_OCCUPIED_TILES) {
    const [fx, fy] = farmKey.split('_').map(Number);
    if (Number.isFinite(fx) && Number.isFinite(fy)) {
      map.setProtectedProp(fx, fy, true);
    }
  }
  for (const [fx, fy] of [
    [49, 74],
    [50, 74],
  ]) {
    map.setProtectedProp(fx, fy, true);
  }
  for (const plot of FARM_PLOTS) {
    if (plot.signTile) {
      map.setProtectedProp(plot.signTile.x, plot.signTile.y, true);
    }
  }
  return map;
}

/**
 * Computes deterministic player land ownership claims across Homestead District:
 * - Houses claim their footprint + a 1-tile buildable yard border
 * - Connected fence/house enclosures (bounded within MAX_ENCLOSURE_SPAN) claim their enclosed courtyard tiles
 * - Overlapping tiles cannot be stolen from an earlier owner or from legacy buildings
 */
export function computeOwnershipClaims(
  buildings: ReadonlyArray<PlacedBuilding>,
  mapSystem: MapSystem
): OwnershipClaimsResult {
  const tileOwners = new Map<string, string>();
  const ownerTiles = new Map<string, Set<string>>();
  const legacyTileOwners = new Map<string, string>();

  const sorted = [...buildings].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const addClaim = (ownerKey: string, tx: number, ty: number, isLegacy = false): boolean => {
    if (!isHomesteadClaimableTile(mapSystem, tx, ty)) return false;
    const key = `${tx}_${ty}`;
    const existing = tileOwners.get(key);
    if (existing && existing !== ownerKey) return false;
    tileOwners.set(key, ownerKey);
    let set = ownerTiles.get(ownerKey);
    if (!set) {
      set = new Set<string>();
      ownerTiles.set(ownerKey, set);
    }
    set.add(key);
    if (isLegacy) {
      legacyTileOwners.set(key, ownerKey);
    }
    return true;
  };

  // Pass 1: Claim exact building footprints first so no yard or enclosure steals someone's structure tile
  const ownerBarrierSets = new Map<string, Set<string>>();
  const ownerHouses = new Map<string, PlacedBuilding[]>();
  const ownerFences = new Map<string, PlacedBuilding[]>();

  for (const b of sorted) {
    const ownerKey = getEffectiveBuildingOwnerKey(b);
    const isLegacy = !b.ownerId;
    const fp = getAuthoritativeFootprint(b.type);
    const w = b.width || fp.width;
    const h = b.height || fp.height;

    let barriers = ownerBarrierSets.get(ownerKey);
    if (!barriers) {
      barriers = new Set<string>();
      ownerBarrierSets.set(ownerKey, barriers);
    }

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = b.tileX + dx;
        const ty = b.tileY + dy;
        addClaim(ownerKey, tx, ty, isLegacy);
        if (
          (isHouseBuildingType(b.type) || b.type === 'fence_wood') &&
          !isTileInsideFarmPlot(tx, ty)
        ) {
          barriers.add(`${tx}_${ty}`);
        }
      }
    }

    if (isHouseBuildingType(b.type)) {
      const list = ownerHouses.get(ownerKey) || [];
      list.push(b);
      ownerHouses.set(ownerKey, list);
    } else if (b.type === 'fence_wood' && !isTileInsideFarmPlot(b.tileX, b.tileY)) {
      const list = ownerFences.get(ownerKey) || [];
      list.push(b);
      ownerFences.set(ownerKey, list);
    }
  }

  // Pass 2: Claim 1-tile house yard margins (only unobstructed claimable Homestead tiles)
  for (const [ownerKey, houses] of ownerHouses.entries()) {
    for (const h of houses) {
      const fp = getAuthoritativeFootprint(h.type);
      const w = h.width || fp.width;
      const hw = h.height || fp.height;
      const isLegacy = !h.ownerId;
      for (let dy = -HOUSE_YARD_MARGIN; dy < hw + HOUSE_YARD_MARGIN; dy++) {
        for (let dx = -HOUSE_YARD_MARGIN; dx < w + HOUSE_YARD_MARGIN; dx++) {
          const tx = h.tileX + dx;
          const ty = h.tileY + dy;
          if (!isHomesteadClaimableTile(mapSystem, tx, ty)) continue;
          const curSet = ownerTiles.get(ownerKey);
          if (curSet && curSet.size > MAX_CLAIM_TILES_PER_OWNER) break;
          addClaim(ownerKey, tx, ty, isLegacy);
        }
      }
    }
  }

  // Pass 3: Claim bounded fenced enclosures via exterior flood-fill per owner
  for (const [ownerKey, barriers] of ownerBarrierSets.entries()) {
    const fences = ownerFences.get(ownerKey) || [];
    if (fences.length < 4) continue; // At least 4 fences/wall tiles needed to enclose any courtyard

    let minX = MAP_CONFIG.WIDTH;
    let minY = MAP_CONFIG.HEIGHT;
    let maxX = -1;
    let maxY = -1;
    for (const key of barriers) {
      const [bx, by] = key.split('_').map(Number);
      if (bx < BUILDABLE_ZONE_BOUNDS.minX || bx > BUILDABLE_ZONE_BOUNDS.maxX) continue;
      if (by < BUILDABLE_ZONE_BOUNDS.minY || by > BUILDABLE_ZONE_BOUNDS.maxY) continue;
      if (bx < minX) minX = bx;
      if (by < minY) minY = by;
      if (bx > maxX) maxX = bx;
      if (by > maxY) maxY = by;
    }

    if (maxX < minX || maxY < minY) continue;
    const spanW = maxX - minX + 1;
    const spanH = maxY - minY + 1;
    // Split oversized claims safely: only flood-fill enclosures up to MAX_ENCLOSURE_SPAN
    const scanMinX = Math.max(BUILDABLE_ZONE_BOUNDS.minX - 1, minX - 1);
    const scanMinY = Math.max(BUILDABLE_ZONE_BOUNDS.minY - 1, minY - 1);
    const scanMaxX = Math.min(BUILDABLE_ZONE_BOUNDS.maxX + 1, maxX + 1);
    const scanMaxY = Math.min(BUILDABLE_ZONE_BOUNDS.maxY + 1, maxY + 1);

    if (spanW > MAX_ENCLOSURE_SPAN || spanH > MAX_ENCLOSURE_SPAN) {
      continue;
    }

    const exteriorVisited = new Set<string>();
    const queue: Array<[number, number]> = [];
    const pushIfOpen = (x: number, y: number) => {
      if (x < scanMinX || x > scanMaxX || y < scanMinY || y > scanMaxY) return;
      const k = `${x}_${y}`;
      if (exteriorVisited.has(k) || barriers.has(k)) return;
      exteriorVisited.add(k);
      queue.push([x, y]);
    };

    for (let x = scanMinX; x <= scanMaxX; x++) {
      pushIfOpen(x, scanMinY);
      pushIfOpen(x, scanMaxY);
    }
    for (let y = scanMinY; y <= scanMaxY; y++) {
      pushIfOpen(scanMinX, y);
      pushIfOpen(scanMaxX, y);
    }

    let head = 0;
    const dirs: ReadonlyArray<readonly [number, number]> = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    while (head < queue.length) {
      const [cx, cy] = queue[head++];
      for (const [dx, dy] of dirs) {
        pushIfOpen(cx + dx, cy + dy);
      }
    }

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = `${x}_${y}`;
        if (barriers.has(key) || exteriorVisited.has(key)) continue;
        if (!isHomesteadClaimableTile(mapSystem, x, y)) continue;
        const curSet = ownerTiles.get(ownerKey);
        if (curSet && curSet.size > MAX_CLAIM_TILES_PER_OWNER) break;
        addClaim(ownerKey, x, y, ownerKey.startsWith('legacy:'));
      }
    }
  }

  return { tileOwners, ownerTiles, legacyTileOwners };
}

/**
 * Authoritative shared validation for placing or moving a building across both Client & Server (Express + Cloudflare DO).
 */
export function validateServerOrClientBuild(
  existingBuildings: ReadonlyArray<PlacedBuilding>,
  candidate: {
    id?: string;
    type: BuildingType;
    tileX: number;
    tileY: number;
  },
  requesterUid: string | undefined,
  mapSystem: MapSystem,
  options?: { excludeBuildingId?: string; farmPlotOwners?: FarmPlotOwnersMap }
): OwnershipCheckResult {
  if (!requesterUid || requesterUid.trim().length === 0) {
    return {
      allowed: false,
      code: 'INVALID_PLAYER',
      reason: 'ကစားသမားအချက်အလက် မမှန်ကန်ပါ',
    };
  }

  if (
    !VALID_BUILDING_TYPES.has(candidate.type) ||
    !Number.isInteger(candidate.tileX) ||
    !Number.isInteger(candidate.tileY)
  ) {
    return {
      allowed: false,
      code: 'INVALID_BUILDING',
      reason: 'အဆောက်အအုံ တည်နေရာ မမှန်ကန်ပါ',
    };
  }

  const excludeId = options?.excludeBuildingId;
  if (excludeId) {
    const target = existingBuildings.find((b) => b.id === excludeId);
    if (!target) {
      return {
        allowed: false,
        code: 'NOT_FOUND',
        reason: 'ရွှေ့ပြောင်းမည့် အဆောက်အအုံကို ရှာမတွေ့ပါ',
      };
    }
    if (!canOwnerModifyBuilding(target, requesterUid)) {
      return {
        allowed: false,
        code: 'UNAUTHORIZED_OWNER',
        reason: 'အခြားကစားသမားပိုင် အဆောက်အအုံကို ရွှေ့ပြောင်းခွင့်မရှိပါ',
      };
    }
    const targetFarmPlot = getFarmPlotAtTile(target.tileX, target.tileY);
    if (targetFarmPlot && options?.farmPlotOwners) {
      const targetPlotOwner = options.farmPlotOwners[targetFarmPlot.id];
      if (!targetPlotOwner || targetPlotOwner.ownerId !== requesterUid) {
        return {
          allowed: false,
          code: 'FARM_PLOT_NOT_OWNER',
          reason: 'အခြားကစားသမားပိုင် စိုက်ပျိုးမြေကွက်အတွင်းရှိ ခြံစည်းရိုးကို ရွှေ့ပြောင်းခွင့်မရှိပါ',
        };
      }
    }
  }

  const fp = getAuthoritativeFootprint(candidate.type);
  const filteredExisting = excludeId
    ? existingBuildings.filter((b) => b.id !== excludeId)
    : existingBuildings;

  // 0. If footprint touches any Farming District Plot, validate strictly via FarmPlotOwnershipSystem
  let touchesFarmPlot = false;
  for (let dy = 0; dy < fp.height && !touchesFarmPlot; dy++) {
    for (let dx = 0; dx < fp.width; dx++) {
      if (isTileInsideFarmPlot(candidate.tileX + dx, candidate.tileY + dy)) {
        touchesFarmPlot = true;
        break;
      }
    }
  }
  if (touchesFarmPlot) {
    return validateFarmFencePlacement(
      options?.farmPlotOwners,
      filteredExisting,
      {
        id: candidate.id,
        type: candidate.type,
        tileX: candidate.tileX,
        tileY: candidate.tileY,
        width: fp.width,
        height: fp.height,
      },
      requesterUid,
      mapSystem,
      { excludeBuildingId: excludeId }
    );
  }

  // 1. Validate Homestead District terrain & protected props across footprint
  for (let dy = 0; dy < fp.height; dy++) {
    for (let dx = 0; dx < fp.width; dx++) {
      const tx = candidate.tileX + dx;
      const ty = candidate.tileY + dy;
      const zoneCheck = mapSystem.isTileInBuildableZone(tx, ty);
      if (!zoneCheck.allowed) {
        return {
          allowed: false,
          code: 'OUT_OF_ZONE',
          reason: zoneCheck.reason || 'ဆောက်လုပ်ခွင့်မရှိသော နေရာဖြစ်ပါသည်',
        };
      }

      // 2. Check existing building footprint collisions
      for (const b of filteredExisting) {
        const bFp = getAuthoritativeFootprint(b.type);
        const bw = b.width || bFp.width;
        const bh = b.height || bFp.height;
        if (tx >= b.tileX && tx < b.tileX + bw && ty >= b.tileY && ty < b.tileY + bh) {
          return {
            allowed: false,
            code: 'TILE_OCCUPIED',
            reason: 'အခြားအဆောက်အအုံနှင့် ထပ်နေပါသည်',
          };
        }
      }
    }
  }

  // 3. Enforce Homestead Player Land Ownership boundaries (yards, enclosed fences, legacy buildings)
  const preClaims = computeOwnershipClaims(filteredExisting, mapSystem);
  for (let dy = 0; dy < fp.height; dy++) {
    for (let dx = 0; dx < fp.width; dx++) {
      const tx = candidate.tileX + dx;
      const ty = candidate.tileY + dy;
      const claimOwner = preClaims.tileOwners.get(`${tx}_${ty}`);
      if (claimOwner && claimOwner !== requesterUid) {
        return {
          allowed: false,
          code: 'CLAIMED_BY_OTHER',
          reason: 'ဤမြေကွက်သည် အခြားကစားသမားပိုင် ခြံဝင်း/အိမ်မြေဖြစ်နေပါသည်',
        };
      }
    }
  }

  // 4. Simulate post-build claims to enforce fair per-player max claim cap
  if (isHouseBuildingType(candidate.type) || candidate.type === 'fence_wood') {
    const simulated: PlacedBuilding[] = [
      ...filteredExisting,
      {
        id: candidate.id || '__candidate__',
        type: candidate.type,
        tileX: candidate.tileX,
        tileY: candidate.tileY,
        width: fp.width,
        height: fp.height,
        ownerId: requesterUid,
        placedBy: requesterUid,
        createdAt: Date.now(),
      },
    ];
    const postClaims = computeOwnershipClaims(simulated, mapSystem);
    const ownerTileCount = postClaims.ownerTiles.get(requesterUid)?.size ?? 0;
    const prevCount = preClaims.ownerTiles.get(requesterUid)?.size ?? 0;
    if (ownerTileCount > MAX_CLAIM_TILES_PER_OWNER && ownerTileCount >= prevCount) {
      return {
        allowed: false,
        code: 'MAX_CLAIM_EXCEEDED',
        reason: `ကစားသမားတစ်ဦး ပိုင်ဆိုင်နိုင်သော မြေကွက်အကျယ် (${MAX_CLAIM_TILES_PER_OWNER} tiles) ပြည့်နေပါပြီ`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Authoritative dismantle / demolish check for both owned and legacy buildings.
 */
export function validateDismantleAction(
  existingBuildings: ReadonlyArray<PlacedBuilding>,
  buildingId: string,
  requesterUid: string | undefined,
  farmPlotOwners?: FarmPlotOwnersMap
): OwnershipCheckResult {
  if (!requesterUid || requesterUid.trim().length === 0) {
    return {
      allowed: false,
      code: 'INVALID_PLAYER',
      reason: 'ကစားသမားအချက်အလက် မမှန်ကန်ပါ',
    };
  }
  const target = existingBuildings.find((b) => b.id === buildingId);
  if (!target) {
    return {
      allowed: false,
      code: 'NOT_FOUND',
      reason: 'ဖျက်သိမ်းမည့် အဆောက်အအုံကို ရှာမတွေ့ပါ',
    };
  }
  if (!canOwnerModifyBuilding(target, requesterUid)) {
    return {
      allowed: false,
      code: 'UNAUTHORIZED_OWNER',
      reason: 'အခြားကစားသမား၏ အဆောက်အအုံကို ဖျက်သိမ်းခွင့်မရှိပါ',
    };
  }
  const plot = getFarmPlotAtTile(target.tileX, target.tileY);
  if (plot && farmPlotOwners) {
    const plotOwner = farmPlotOwners[plot.id];
    if (!plotOwner || plotOwner.ownerId !== requesterUid) {
      return {
        allowed: false,
        code: 'FARM_PLOT_NOT_OWNER',
        reason: 'အခြားကစားသမားပိုင် စိုက်ပျိုးမြေကွက်အတွင်းရှိ ခြံစည်းရိုးကို ဖျက်သိမ်းခွင့်မရှိပါ',
      };
    }
  }
  return { allowed: true };
}
