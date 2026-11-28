/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Step 35 Phase 5: Future Farming Foundation Schema (DESIGN ONLY — NO ACTIVE GAMEPLAY YET)
 *
 * Defines additive TypeScript contracts and blueprint constants for the upcoming
 * crop planting, watering, growth, harvesting, selling, multiplayer sync, and
 * Save v2-compatible persistence architecture.
 */

export type SeedItemId =
  | 'seed_turnip'
  | 'seed_wheat'
  | 'seed_strawberry'
  | 'seed_pumpkin';

export type CropItemId =
  | 'crop_turnip'
  | 'crop_wheat'
  | 'crop_strawberry'
  | 'crop_pumpkin';

/** 0 = planted seed, 1 = sprout, 2 = growing leaves, 3 = flowering/budding, 4 = ready to harvest */
export type CropGrowthStage = 0 | 1 | 2 | 3 | 4;

export interface CropCatalogDefinition {
  cropId: CropItemId;
  seedId: SeedItemId;
  name: string;
  seedName: string;
  seedBuyPrice: number;
  cropSellPrice: number;
  totalGrowthDurationMs: number;
  stages: 4;
  minYield: number;
  maxYield: number;
  waterBonusFactor: number;
}

export interface PlantedCropTileState {
  plotId: string;
  tileX: number;
  tileY: number;
  cropId: CropItemId;
  plantedByUid: string;
  plantedAt: number;
  growthStage: CropGrowthStage;
  wateredAt: number | null;
  waterExpiryAt: number | null;
  nextStageAt: number | null;
  harvestReadyAt: number;
}

/** Authoritative Durable Object storage shape (`farmCropTiles` key) */
export type FarmPlotCropsMap = Record<string, Record<string, PlantedCropTileState>>;

/** Additive Save v2 extension (never breaks CURRENT_SAVE_VERSION = 2) */
export interface FutureFarmingSaveMeta {
  wateringCanCharges?: number;
  totalCropsHarvested?: number;
  totalCropGoldEarned?: number;
}

export const FUTURE_CROP_CATALOG: Readonly<Record<CropItemId, CropCatalogDefinition>> = {
  crop_turnip: {
    cropId: 'crop_turnip',
    seedId: 'seed_turnip',
    name: 'မုန်လာဥဖြူ (Turnip)',
    seedName: 'မုန်လာဥမျိုးစေ့',
    seedBuyPrice: 12,
    cropSellPrice: 30,
    totalGrowthDurationMs: 3 * 60 * 1000,
    stages: 4,
    minYield: 1,
    maxYield: 2,
    waterBonusFactor: 1.5,
  },
  crop_wheat: {
    cropId: 'crop_wheat',
    seedId: 'seed_wheat',
    name: 'ရွှေဂျုံ (Golden Wheat)',
    seedName: 'ဂျုံမျိုးစေ့',
    seedBuyPrice: 20,
    cropSellPrice: 48,
    totalGrowthDurationMs: 6 * 60 * 1000,
    stages: 4,
    minYield: 2,
    maxYield: 3,
    waterBonusFactor: 1.5,
  },
  crop_strawberry: {
    cropId: 'crop_strawberry',
    seedId: 'seed_strawberry',
    name: 'စတော်ဘယ်ရီ (Strawberry)',
    seedName: 'စတော်ဘယ်ရီမျိုးစေ့',
    seedBuyPrice: 40,
    cropSellPrice: 95,
    totalGrowthDurationMs: 10 * 60 * 1000,
    stages: 4,
    minYield: 2,
    maxYield: 3,
    waterBonusFactor: 1.5,
  },
  crop_pumpkin: {
    cropId: 'crop_pumpkin',
    seedId: 'seed_pumpkin',
    name: 'ဖရုံသီးကြီး (Pumpkin)',
    seedName: 'ဖရုံမျိုးစေ့',
    seedBuyPrice: 70,
    cropSellPrice: 165,
    totalGrowthDurationMs: 15 * 60 * 1000,
    stages: 4,
    minYield: 1,
    maxYield: 2,
    waterBonusFactor: 1.5,
  },
};
