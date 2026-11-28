/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BuildingType, FenceRotation, PlacedBuilding } from '../types';
import { InventorySystem } from './InventorySystem';
import { MapSystem } from './MapSystem';

/**
 * Isometric 4-neighbor fence connectivity bitmask:
 * NW = 1 (tx - 1, ty)
 * NE = 2 (tx, ty - 1)
 * SE = 4 (tx + 1, ty)
 * SW = 8 (tx, ty + 1)
 */
export const FENCE_BIT_NW = 1;
export const FENCE_BIT_NE = 2;
export const FENCE_BIT_SE = 4;
export const FENCE_BIT_SW = 8;

export const FENCE_RAW_WOOD_COST = 2;
export const FENCE_RAW_FIBER_COST = 1;

export interface FenceVisualMaskInfo {
  mask: number;
  rawMask: number;
  braced: boolean;
  textureKey: string;
}

export interface ContinuousFenceCostPlan {
  canAfford: boolean;
  source: 'bag' | 'raw' | 'insufficient';
  inBag: number;
  woodHave: number;
  fiberHave: number;
  missingWood: number;
  missingFiber: number;
}

export function normalizeFenceRotation(rot?: number): FenceRotation {
  if (typeof rot !== 'number' || Number.isNaN(rot)) return 0;
  return (((Math.round(rot) % 4) + 4) % 4) as FenceRotation;
}

export function buildFenceCoordSet(buildings: ReadonlyArray<Pick<PlacedBuilding, 'type' | 'tileX' | 'tileY'>>): Set<string> {
  const set = new Set<string>();
  for (const b of buildings) {
    if (b.type === 'fence_wood') {
      set.add(`${b.tileX}_${b.tileY}`);
    }
  }
  return set;
}

/**
 * Computes isometric connection bitmask for a fence at (tileX, tileY).
 * Isolated fences (no neighboring fences) fall back to straight panel mask 5 (NW-SE) or 10 (NE-SW)
 * according to rotation % 2.
 */
export function computeFenceConnectionMask(
  buildingsOrSet: ReadonlyArray<Pick<PlacedBuilding, 'type' | 'tileX' | 'tileY'>> | ReadonlySet<string>,
  tileX: number,
  tileY: number,
  rotation?: number
): FenceVisualMaskInfo {
  const fenceCoords =
    buildingsOrSet instanceof Set
      ? buildingsOrSet
      : buildFenceCoordSet(buildingsOrSet as ReadonlyArray<Pick<PlacedBuilding, 'type' | 'tileX' | 'tileY'>>);

  let rawMask = 0;
  if (fenceCoords.has(`${tileX - 1}_${tileY}`)) rawMask |= FENCE_BIT_NW;
  if (fenceCoords.has(`${tileX}_${tileY - 1}`)) rawMask |= FENCE_BIT_NE;
  if (fenceCoords.has(`${tileX + 1}_${tileY}`)) rawMask |= FENCE_BIT_SE;
  if (fenceCoords.has(`${tileX}_${tileY + 1}`)) rawMask |= FENCE_BIT_SW;

  const normRot = normalizeFenceRotation(rotation);
  const braced = normRot >= 2;
  const mask = rawMask === 0 ? (normRot % 2 === 0 ? FENCE_BIT_NW | FENCE_BIT_SE : FENCE_BIT_NE | FENCE_BIT_SW) : rawMask;
  const textureKey = `obj_fence_wood_${braced ? 'b_' : ''}m${mask}`;

  return {
    mask,
    rawMask,
    braced,
    textureKey,
  };
}

/**
 * Resolves exact placement resource plan for continuous fence building:
 * Consumes strictly 1 unit per fence (either 1 crafted `fence_wood` from bag, or converts 2 wood + 1 fiber -> 1 fence).
 */
export function getContinuousFenceCostPlan(inventory: InventorySystem): ContinuousFenceCostPlan {
  const inBag = inventory.getItemCount('fence_wood');
  const woodHave = inventory.getItemCount('wood');
  const fiberHave = inventory.getItemCount('fiber');

  if (inBag >= 1) {
    return {
      canAfford: true,
      source: 'bag',
      inBag,
      woodHave,
      fiberHave,
      missingWood: 0,
      missingFiber: 0,
    };
  }

  if (woodHave >= FENCE_RAW_WOOD_COST && fiberHave >= FENCE_RAW_FIBER_COST) {
    return {
      canAfford: true,
      source: 'raw',
      inBag,
      woodHave,
      fiberHave,
      missingWood: 0,
      missingFiber: 0,
    };
  }

  return {
    canAfford: false,
    source: 'insufficient',
    inBag,
    woodHave,
    fiberHave,
    missingWood: Math.max(0, FENCE_RAW_WOOD_COST - woodHave),
    missingFiber: Math.max(0, FENCE_RAW_FIBER_COST - fiberHave),
  };
}

/**
 * Formats concise Burmese insufficient-wood/fiber guidance message when continuous fence placement stops.
 */
export function formatFenceInsufficientMessage(plan: ContinuousFenceCostPlan): string {
  const parts: string[] = [];
  if (plan.missingWood > 0) {
    parts.push(`သစ်သား ${plan.missingWood} ခု ထပ်လိုသည် (စုစုပေါင်း ${FENCE_RAW_WOOD_COST} ခုလို)`);
  }
  if (plan.missingFiber > 0) {
    parts.push(`အမျှင် ${plan.missingFiber} ခု ထပ်လိုသည်`);
  }
  if (parts.length === 0) {
    return `ခြံစည်းရိုး ၁ ခုဆောက်ရန် သစ်သား ${FENCE_RAW_WOOD_COST} + အမျှင် ${FENCE_RAW_FIBER_COST} လိုအပ်ပါသည်`;
  }
  return `သစ်သား/ပစ္စည်း မလုံလောက်၍ ခြံစည်းရိုးဆောက်ခြင်း ရပ်နားလိုက်ပါသည် — ${parts.join('၊ ')}`;
}

/**
 * Computes next open tile for continuous fence placement along the chosen axis.
 * Respects map bounds and custom validator (walkable/buildable/ownership).
 */
export function getNextContinuousFenceTile(
  mapSystem: MapSystem,
  curX: number,
  curY: number,
  rotation: number,
  canPlaceTileFn: (tx: number, ty: number) => boolean
): { tileX: number; tileY: number } | null {
  const normRot = normalizeFenceRotation(rotation);
  const [dx, dy] = normRot % 2 === 0 ? [1, 0] : [0, 1];

  const candidates: Array<[number, number]> = [
    [curX + dx, curY + dy],
    [curX - dx, curY - dy],
    [curX + dx * 2, curY + dy * 2],
    [curX - dx * 2, curY - dy * 2],
  ];

  for (const [nx, ny] of candidates) {
    if (!mapSystem.isTileInBounds(nx, ny)) continue;
    if (canPlaceTileFn(nx, ny)) {
      return { tileX: nx, tileY: ny };
    }
  }

  return null;
}

export function isFenceBuildingType(type: BuildingType): boolean {
  return type === 'fence_wood';
}
