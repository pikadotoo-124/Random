/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TileType = 'grass' | 'cobble' | 'water' | 'sand' | 'dirt' | 'wood_floor' | 'cliff' | 'farmland' | 'bridge';

export type ResourceType = 'tree' | 'rock' | 'bush' | 'animal' | 'lake_fish';

export type ItemId =
  | 'wood'
  | 'stone'
  | 'fiber'
  | 'meat'
  | 'fish'
  | 'cooked_meat'
  | 'grilled_fish'
  | 'axe_basic'
  | 'pickaxe_basic'
  | 'rod_basic'
  | 'fence_wood'
  | 'house_small'
  | 'campfire'
  | 'storage_box'
  | 'lantern';

export interface ItemDefinition {
  id: ItemId;
  name: string;
  category: 'tool' | 'resource' | 'food' | 'building';
  description: string;
  icon: string;
  sellPrice: number;
  buyPrice?: number;
  maxStack: number;
}

export interface InventorySlot {
  item: ItemId;
  quantity: number;
}

export type BuildingType = 'house_small' | 'fence_wood' | 'campfire' | 'storage_box' | 'lantern';

export interface PlacedBuilding {
  id: string;
  type: BuildingType;
  tileX: number;
  tileY: number;
  width: number;
  height: number;
  placedBy: string;
  createdAt: number;
  storage?: InventorySlot[];
}

export interface ResourceNode {
  id: string;
  type: ResourceType;
  tileX: number;
  tileY: number;
  currentHealth: number;
  maxHealth: number;
  yieldItem: ItemId;
  yieldAmount: number;
  gatherDurationMs: number;
  requiredTool?: ItemId;
  respawnTimeSeconds: number;
  depletedUntil?: number;
}

export interface CraftingRecipe {
  id: string;
  resultItem: ItemId;
  resultCount: number;
  ingredients: { item: ItemId; quantity: number }[];
  requiresWorkbench?: boolean;
  requiresCampfire?: boolean;
}

export interface PlayerProfile {
  name: string;
  gender: 'male' | 'female';
  skinTone: string;
  hairColor: string;
  clothesColor: string;
  coins: number;
  currentTool: ItemId | null;
}

export interface ZoneDefinition {
  id: string;
  name: string;
  description: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  color: string;
}

export interface GameSettings {
  soundEnabled: boolean;
  joystickSize: number;
  zoomLevel: number;
}
