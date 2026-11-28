/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TileType = 'grass' | 'cobble' | 'water' | 'sand' | 'dirt' | 'wood_floor' | 'cliff' | 'farmland' | 'bridge';

export type ResourceType = 'tree' | 'rock' | 'bush' | 'animal' | 'lake_fish';

export type AnimalKind = 'rabbit' | 'deer';

export type MovementMode = 'WALK' | 'BICYCLE' | 'MOTORCYCLE' | 'MOUNT';

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
  | 'scythe_basic'
  | 'rod_basic'
  | 'fence_wood'
  | 'house_small'
  | 'house_medium'
  | 'house_large'
  | 'campfire'
  | 'storage_box'
  | 'lantern'
  | 'decor_bench'
  | 'decor_flower_pot'
  | 'decor_flowerbed'
  | 'decor_flower_stand';

export interface ItemDefinition {
  id: ItemId;
  name: string;
  category: 'tool' | 'resource' | 'food' | 'building';
  description: string;
  icon: string;
  sellPrice: number;
  buyPrice?: number;
  maxStack: number;
  isStarterTool?: boolean;
}

export interface InventorySlot {
  item: ItemId;
  quantity: number;
}

export type BuildingType =
  | 'house_small'
  | 'house_medium'
  | 'house_large'
  | 'fence_wood'
  | 'campfire'
  | 'storage_box'
  | 'lantern'
  | 'decor_bench'
  | 'decor_flower_pot'
  | 'decor_flowerbed'
  | 'decor_flower_stand';

export type FenceRotation = 0 | 1 | 2 | 3;

export interface PlacedBuilding {
  id: string;
  type: BuildingType;
  tileX: number;
  tileY: number;
  width: number;
  height: number;
  rotation?: FenceRotation;
  ownerId?: string;
  placedBy: string;
  createdAt: number;
  storage?: InventorySlot[];
}

export interface ResourceNode {
  id: string;
  type: ResourceType;
  animalKind?: AnimalKind;
  spriteVariant?: 'berry_bush' | 'tall_grass';
  rockVariant?: 0 | 1 | 2;
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

export interface AnimalSpeciesConfig {
  id: AnimalKind;
  label: string;
  textureKey: string;
  yieldItem: ItemId;
  futureMeatItem: string;
  scale: number;
  originY: number;
}

export interface FarmPlotDefinition {
  id: string;
  zoneId: 'farm_district';
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  gateTile?: {
    x: number;
    y: number;
    side: 'north' | 'south' | 'west' | 'east';
  };
  signTile?: {
    x: number;
    y: number;
  };
  tileCount: number;
  purchasePrice: number;
  purchasedByDefault: boolean;
  label: string;
}

export type ShopCategoryId = 'building_materials' | 'decoration' | 'garden_plants' | 'tools_equipment';

export interface ShopCategoryDef {
  id: ShopCategoryId;
  label: string;
  shortLabel: string;
  icon: string;
}

export interface ShopCatalogEntry {
  id: ItemId;
  price: number;
  category: ShopCategoryId;
}

export type ActionToolKind = 'axe' | 'pickaxe' | 'scythe' | 'hunt';

export interface GuidanceRequirementItem {
  itemId: ItemId;
  name: string;
  icon: string;
  have: number;
  need: number;
}

export interface MerchantGuideInfo {
  active: boolean;
  title: string;
  subtitle: string;
  targetX: number;
  targetY: number;
  distanceTiles: number;
  directionLabelMy: string;
  angleDeg: number;
  kind?: 'merchant' | 'crafting' | 'fishing' | 'action';
  badgeIcon?: string;
  targetLabel?: string;
  requirements?: GuidanceRequirementItem[];
  suppressCompass?: boolean;
}

export interface CraftingRecipe {
  id: string;
  resultItem: ItemId;
  resultCount: number;
  ingredients: { item: ItemId; quantity: number }[];
  requiresWorkbench?: boolean;
  requiresCampfire?: boolean;
}

export type ClothingCategory =
  | 'suits'
  | 'hats'
  | 'shoes'
  | 'tshirts'
  | 'pants'
  | 'accessories';

export type ClothingEquipmentSlot =
  | 'suit'
  | 'hat'
  | 'shoes'
  | 'tshirt'
  | 'pants'
  | 'accessory';

export type ClothingApplicableGender = 'male' | 'female' | 'both';

export type ClothingItemId =
  | 'suit_noble_coat'
  | 'suit_rose_dress'
  | 'hat_straw_sun'
  | 'hat_plum_beret'
  | 'shoes_leather_boots'
  | 'shoes_sky_sneakers'
  | 'tshirt_coral_sunset'
  | 'tshirt_mint_breeze'
  | 'pants_classic_denim'
  | 'pants_olive_chino'
  | 'acc_crimson_scarf'
  | 'acc_satchel_bag';

export interface ClothingCategoryDef {
  id: ClothingCategory;
  label: string;
  labelMy: string;
  equipmentSlot: ClothingEquipmentSlot;
  icon: string;
}

export interface ClothingItemDefinition {
  itemId: ClothingItemId | string;
  displayName: string;
  displayNameMy?: string;
  description?: string;
  category: ClothingCategory;
  applicableGender: ClothingApplicableGender;
  goldPrice: number;
  icon: string;
  spriteRef: string;
  equipmentSlot: ClothingEquipmentSlot;
}

export interface EquippedClothingState {
  suit?: string | null;
  hat?: string | null;
  shoes?: string | null;
  tshirt?: string | null;
  pants?: string | null;
  accessory?: string | null;
}

export type FacingDirection = 'down' | 'left' | 'right' | 'up';

export interface PlayerProfile {
  name: string;
  gender: 'male' | 'female';
  skinTone: string;
  hairColor: string;
  clothesColor: string;
  coins: number;
  currentTool: ItemId | null;
  facingDirection?: FacingDirection;
  ownedClothing?: string[];
  equippedClothing?: EquippedClothingState;
}

export interface PlayerStats {
  health: number;
  stamina: number;
  totalGathered: number;
  totalCrafted: number;
  totalBuilt: number;
  totalSoldGold: number;
}

export interface FarmPlotOwnerRecord {
  plotId: string;
  ownerId: string;
  ownerName: string;
  purchasedAt: number;
  pricePaid: number;
}

export type FarmPlotOwnersMap = Record<string, FarmPlotOwnerRecord>;

export interface PlayerWorldChanges {
  tutorialCompleted: boolean;
  discoveredZones: string[];
  resetEpoch?: string;
  ownedFarmPlots?: string[];
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
