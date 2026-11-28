/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FARM_PLOTS } from '../constants';
import {
  BuildingType,
  FarmPlotDefinition,
  FarmPlotOwnerRecord,
  FarmPlotOwnersMap,
  PlacedBuilding,
} from '../types';
import { MapSystem } from './MapSystem';

export type FarmFenceValidationCode =
  | 'INVALID_PLAYER'
  | 'INVALID_BUILDING'
  | 'INVALID_FARM_BUILDING'
  | 'OUT_OF_ZONE'
  | 'TILE_OCCUPIED'
  | 'FARM_PLOT_UNOWNED'
  | 'FARM_PLOT_NOT_OWNER';

export interface FarmFenceValidationResult {
  allowed: boolean;
  code?: FarmFenceValidationCode;
  reason?: string;
  plot?: FarmPlotDefinition;
}

export function getFarmPlotById(plotId: string): FarmPlotDefinition | undefined {
  return FARM_PLOTS.find((p) => p.id === plotId);
}

export function getFarmPlotAtTile(tx: number, ty: number): FarmPlotDefinition | undefined {
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return undefined;
  const rx = Math.round(tx);
  const ry = Math.round(ty);
  for (const plot of FARM_PLOTS) {
    const { minX, minY, maxX, maxY } = plot.bounds;
    if (rx >= minX && rx <= maxX && ry >= minY && ry <= maxY) {
      return plot;
    }
  }
  return undefined;
}

export function isTileInsideFarmPlot(tx: number, ty: number): boolean {
  return Boolean(getFarmPlotAtTile(tx, ty));
}

/**
 * Returns the nearest FarmPlotDefinition if the player is standing inside the plot
 * or on its surrounding 1-tile dirt walkway border.
 */
export function getNearestInteractiveFarmPlot(
  px: number,
  py: number,
  maxBorderDistance = 1.55
): FarmPlotDefinition | undefined {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return undefined;

  let bestPlot: FarmPlotDefinition | undefined;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const plot of FARM_PLOTS) {
    const { minX, minY, maxX, maxY } = plot.bounds;
    const clampedX = Math.max(minX, Math.min(maxX, px));
    const clampedY = Math.max(minY, Math.min(maxY, py));
    const dist = Math.hypot(px - clampedX, py - clampedY);
    if (dist <= maxBorderDistance && dist < bestDist) {
      bestDist = dist;
      bestPlot = plot;
    }
  }

  return bestPlot;
}

export function getShortFarmPlotName(plot: FarmPlotDefinition): string {
  const idx = FARM_PLOTS.findIndex((p) => p.id === plot.id);
  const numLabels = ['၁', '၂', '၃', '၄', '၅'];
  if (idx >= 0 && idx < numLabels.length) {
    return `မြေကွက် ${numLabels[idx]}`;
  }
  return plot.label.split('(')[0].trim();
}

export function formatFarmSignboardText(
  plot: FarmPlotDefinition,
  owner: FarmPlotOwnerRecord | undefined,
  currentUserId?: string,
  purchaseLocked = false
): string {
  const shortName = getShortFarmPlotName(plot);
  if (owner) {
    const isMine = Boolean(currentUserId && owner.ownerId === currentUserId);
    return isMine
      ? `🪧 ${shortName} • ဤလယ်ယာမြေသည် ${owner.ownerName} ပိုင်ဆိုင်သည် (သင့်မြေ)`
      : `🪧 ${shortName} • ဤလယ်ယာမြေသည် ${owner.ownerName} ပိုင်ဆိုင်သည်`;
  }
  const priceLabel = plot.purchasePrice.toLocaleString();
  return purchaseLocked
    ? `🪧 ${shortName} • ရောင်းရန်ရှိသည် • 🪙 ${priceLabel} ရွှေ (🔒 ယာယီပိတ်)`
    : `🪧 ${shortName} • ရောင်းရန်ရှိသည် • 🪙 ${priceLabel} ရွှေ`;
}

export function getFarmPlotDimensionsLabel(plot: FarmPlotDefinition): string {
  const w = plot.bounds.maxX - plot.bounds.minX + 1;
  const h = plot.bounds.maxY - plot.bounds.minY + 1;
  return `${w}×${h} ကွက် (${plot.tileCount} Tiles)`;
}

export function sanitizeOwnerName(rawName: unknown, fallback = 'Settler'): string {
  if (typeof rawName !== 'string') return fallback;
  const cleaned = rawName.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 24);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function normalizeFarmPlotOwners(raw: unknown): FarmPlotOwnersMap {
  const clean: FarmPlotOwnersMap = {};
  if (!raw || typeof raw !== 'object') return clean;

  for (const plot of FARM_PLOTS) {
    const entry = (raw as Record<string, unknown>)[plot.id] as Partial<FarmPlotOwnerRecord> | undefined;
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.ownerId !== 'string' || entry.ownerId.trim().length === 0) continue;

    clean[plot.id] = {
      plotId: plot.id,
      ownerId: entry.ownerId.trim(),
      ownerName: sanitizeOwnerName(entry.ownerName, 'Settler'),
      purchasedAt:
        typeof entry.purchasedAt === 'number' && Number.isFinite(entry.purchasedAt) && entry.purchasedAt > 0
          ? entry.purchasedAt
          : Date.now(),
      pricePaid:
        typeof entry.pricePaid === 'number' && Number.isFinite(entry.pricePaid) && entry.pricePaid >= 0
          ? Math.round(entry.pricePaid)
          : plot.purchasePrice,
    };
  }
  return clean;
}

/**
 * Validates whether a building placement or move inside Farming District plots is authorized.
 * Rules:
 * - Only `fence_wood` (1x1) can be built inside a Farming Plot.
 * - The plot must already be purchased and owned by `requesterUid`.
 * - Multi-tile buildings spanning across farm plots and non-farm tiles are rejected.
 */
export function validateFarmFencePlacement(
  farmPlotOwners: FarmPlotOwnersMap | undefined,
  existingBuildings: ReadonlyArray<PlacedBuilding>,
  candidate: {
    id?: string;
    type: BuildingType;
    tileX: number;
    tileY: number;
    width: number;
    height: number;
  },
  requesterUid: string | undefined,
  mapSystem: MapSystem,
  options?: { excludeBuildingId?: string }
): FarmFenceValidationResult {
  if (!requesterUid || requesterUid.trim().length === 0) {
    return {
      allowed: false,
      code: 'INVALID_PLAYER',
      reason: 'ကစားသမားအချက်အလက် မမှန်ကန်ပါ',
    };
  }

  let matchedPlot: FarmPlotDefinition | undefined;
  let allTilesInsideSamePlot = true;

  for (let dy = 0; dy < candidate.height; dy++) {
    for (let dx = 0; dx < candidate.width; dx++) {
      const tx = candidate.tileX + dx;
      const ty = candidate.tileY + dy;
      const plot = getFarmPlotAtTile(tx, ty);
      if (!plot) {
        allTilesInsideSamePlot = false;
      } else if (!matchedPlot) {
        matchedPlot = plot;
      } else if (matchedPlot.id !== plot.id) {
        allTilesInsideSamePlot = false;
      }
    }
  }

  if (!matchedPlot) {
    return {
      allowed: false,
      code: 'OUT_OF_ZONE',
      reason: 'စိုက်ပျိုးမြေကွက် နယ်နိမိတ်ပြင်ပ ဖြစ်နေပါသည်',
    };
  }

  if (candidate.type !== 'fence_wood' || !allTilesInsideSamePlot || candidate.width !== 1 || candidate.height !== 1) {
    return {
      allowed: false,
      code: 'INVALID_FARM_BUILDING',
      reason: 'စိုက်ပျိုးမြေကွက်ပေါ်တွင် သစ်သားခြံစည်းရိုး (Fence) ကိုသာ ဆောက်လုပ်နိုင်ပါသည်',
      plot: matchedPlot,
    };
  }

  const tx = candidate.tileX;
  const ty = candidate.tileY;

  if (!mapSystem.isTileInBounds(tx, ty)) {
    return {
      allowed: false,
      code: 'OUT_OF_ZONE',
      reason: 'မြေပုံနယ်နိမိတ်ပြင်ပ ဖြစ်နေပါသည် (Out of bounds)',
      plot: matchedPlot,
    };
  }

  const tile = mapSystem.tiles[ty]?.[tx];
  if (tile === 'water' || tile === 'bridge' || tile === 'cliff') {
    return {
      allowed: false,
      code: 'OUT_OF_ZONE',
      reason: 'ရေပြင်၊ တံတား (သို့) ကျောက်ဆောင်ပေါ်တွင် ဆောက်လုပ်၍မရပါ',
      plot: matchedPlot,
    };
  }

  if (mapSystem.protectedPropTiles.has(`${tx}_${ty}`)) {
    return {
      allowed: false,
      code: 'OUT_OF_ZONE',
      reason: 'ရွာပိုင်ပစ္စည်းများ ရှိနေသောနေရာတွင် ဆောက်လုပ်၍မရပါ',
      plot: matchedPlot,
    };
  }

  const owner = farmPlotOwners?.[matchedPlot.id];
  if (!owner) {
    return {
      allowed: false,
      code: 'FARM_PLOT_UNOWNED',
      reason: `ဤစိုက်ပျိုးမြေကွက်ကို ဝယ်ယူပြီးမှသာ ခြံစည်းရိုးဆောက်နိုင်ပါသည် (${matchedPlot.purchasePrice} ရွှေ)`,
      plot: matchedPlot,
    };
  }

  if (owner.ownerId !== requesterUid) {
    return {
      allowed: false,
      code: 'FARM_PLOT_NOT_OWNER',
      reason: `ဤစိုက်ပျိုးမြေကွက်သည် ${owner.ownerName} ပိုင်ဆိုင်သော မြေကွက်ဖြစ်ပါသည်`,
      plot: matchedPlot,
    };
  }

  const excludeId = options?.excludeBuildingId;
  for (const b of existingBuildings) {
    if (excludeId && b.id === excludeId) continue;
    const bw = b.width || 1;
    const bh = b.height || 1;
    if (tx >= b.tileX && tx < b.tileX + bw && ty >= b.tileY && ty < b.tileY + bh) {
      return {
        allowed: false,
        code: 'TILE_OCCUPIED',
        reason: 'အခြားခြံစည်းရိုး/အဆောက်အအုံနှင့် ထပ်နေပါသည်',
        plot: matchedPlot,
      };
    }
  }

  return {
    allowed: true,
    plot: matchedPlot,
  };
}
