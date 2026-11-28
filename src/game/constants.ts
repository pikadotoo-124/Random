/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AnimalKind,
  AnimalSpeciesConfig,
  ClothingCategoryDef,
  ClothingEquipmentSlot,
  ClothingItemDefinition,
  CraftingRecipe,
  FarmPlotDefinition,
  ItemDefinition,
  ItemId,
  MovementMode,
  ShopCatalogEntry,
  ShopCategoryDef,
  ZoneDefinition,
} from './types';

export const MAP_CONFIG = {
  WIDTH: 120,
  HEIGHT: 120,
  TILE_WIDTH: 64,
  TILE_HEIGHT: 32,
  ORIGIN_X: 120 * 32, // Center horizontal offset for 120x120 isometric layout
  ORIGIN_Y: 100,
};

export const TOWN_PROTECTED_BOUNDS = {
  minX: 21,
  minY: 21,
  maxX: 39,
  maxY: 39,
};

export const BUILDABLE_ZONE_BOUNDS = {
  id: 'building_area',
  name: 'အခြေချရပ်ကွက် (Homestead District)',
  minX: 40,
  minY: 40,
  maxX: 114,
  maxY: 114,
};

/**
 * Centralized movement speed tiers (tiles per second) for future vehicles & mounts.
 * Gameplay currently locks active mode to WALK (3.8 tiles/sec).
 */
export const MOVEMENT_SPEEDS: Record<MovementMode, number> = {
  WALK: 3.8,
  BICYCLE: 6.4,
  MOTORCYCLE: 9.2,
  MOUNT: 5.8,
};

export const DEFAULT_MOVEMENT_MODE: MovementMode = 'WALK';

/**
 * Guaranteed non-purchasable, non-sellable, non-discardable starter equipment.
 */
export const STARTER_TOOLS: readonly ItemId[] = ['axe_basic', 'pickaxe_basic', 'scythe_basic'];

export function isStarterTool(itemId: string): boolean {
  return (STARTER_TOOLS as readonly string[]).includes(itemId);
}

export const MERCHANT_LOCATION = {
  id: 'shop_general',
  name: 'ဘားနဘီ ကုန်စုံဆိုင် (Barnaby)',
  tileX: 24,
  tileY: 28,
  interactionRange: 2.05,
};

export const AUNTY_GYI_LOCATION = {
  id: 'shop_clothing',
  name: 'Aunty Gyi',
  tileX: 27,
  tileY: 25,
  interactionRange: 1.95,
} as const;

export const CLOTHING_CATEGORIES: readonly ClothingCategoryDef[] = [
  { id: 'suits', label: 'Suits', labelMy: 'ဝတ်စုံအပြည့်', equipmentSlot: 'suit', icon: '👗' },
  { id: 'hats', label: 'Hats', labelMy: 'ဦးထုပ်', equipmentSlot: 'hat', icon: '👒' },
  { id: 'shoes', label: 'Shoes', labelMy: 'ဖိနပ်', equipmentSlot: 'shoes', icon: '👞' },
  { id: 'tshirts', label: 'T-Shirts', labelMy: 'တီရှပ်အင်္ကျီ', equipmentSlot: 'tshirt', icon: '👕' },
  { id: 'pants', label: 'Pants', labelMy: 'ဘောင်းဘီ', equipmentSlot: 'pants', icon: '👖' },
  { id: 'accessories', label: 'Accessories', labelMy: 'အလှဆင်ပစ္စည်း', equipmentSlot: 'accessory', icon: '👜' },
] as const;

/**
 * Future layered clothing draw order above base male/female character sprite.
 */
export const CLOTHING_RENDER_LAYER_ORDER: readonly ClothingEquipmentSlot[] = [
  'shoes',
  'pants',
  'tshirt',
  'suit',
  'hat',
  'accessory',
] as const;

export const CLOTHING_SLOT_INFO: Record<
  ClothingEquipmentSlot,
  { label: string; labelMy: string; icon: string }
> = {
  hat: { label: 'Hat', labelMy: 'ဦးထုပ်', icon: '👒' },
  tshirt: { label: 'T-Shirt', labelMy: 'တီရှပ်', icon: '👕' },
  suit: { label: 'Suit', labelMy: 'ဝတ်စုံအပြည့်', icon: '👗' },
  pants: { label: 'Pants', labelMy: 'ဘောင်းဘီ', icon: '👖' },
  shoes: { label: 'Shoes', labelMy: 'ဖိနပ်', icon: '👞' },
  accessory: { label: 'Accessory', labelMy: 'အလှဆင်', icon: '👜' },
};

/**
 * Aunty Gyi Boutique Starter Catalog (6 categories × 2 items = 12 items).
 * Prices tuned cleanly to Random City Gold Economy (25g starter, 120g cottage).
 */
export const AUNTY_GYI_CATALOG: readonly ClothingItemDefinition[] = [
  // 1. Suits (2 items)
  {
    itemId: 'suit_noble_coat',
    displayName: 'City Heritage Coat',
    displayNameMy: 'မြို့တော်ကုတ်ဝတ်စုံ',
    description: 'ရွှေကြယ်သီးနှင့် နက်ပြာရောင် ခမ်းနားသည့် ဂျာကင်ဝတ်စုံအပြည့်',
    category: 'suits',
    applicableGender: 'male',
    goldPrice: 90,
    icon: '🧥',
    spriteRef: 'cloth_suit_noble_coat',
    equipmentSlot: 'suit',
  },
  {
    itemId: 'suit_rose_dress',
    displayName: 'Rose Boutique Gown',
    displayNameMy: 'နှင်းဆီပွဲတက်ဂါဝန်',
    description: 'ခရမ်းနု-ပန်းရောင် ဖဲကြိုးပါ သပ်ရပ်လှပသော ဂါဝန်ရှည်',
    category: 'suits',
    applicableGender: 'female',
    goldPrice: 90,
    icon: '👗',
    spriteRef: 'cloth_suit_rose_dress',
    equipmentSlot: 'suit',
  },

  // 2. Hats (2 items)
  {
    itemId: 'hat_straw_sun',
    displayName: 'Straw Sun Hat',
    displayNameMy: 'ကောက်ရိုးနေကာဦးထုပ်',
    description: 'ဖဲပြားနီလေးပါဝင်သော ပေါ့ပါးအေးမြသည့် ကောက်ရိုးဦးထုပ်',
    category: 'hats',
    applicableGender: 'both',
    goldPrice: 35,
    icon: '👒',
    spriteRef: 'cloth_hat_straw_sun',
    equipmentSlot: 'hat',
  },
  {
    itemId: 'hat_plum_beret',
    displayName: 'Boutique Plum Beret',
    displayNameMy: 'ခရမ်းရောင်ဘယ်ရက်ဦးထုပ်',
    description: 'မြို့လယ်ဖက်ရှင်ဆန်ဆန် ခရမ်းနုရောင် ဘယ်ရက်ဦးထုပ်',
    category: 'hats',
    applicableGender: 'both',
    goldPrice: 45,
    icon: '🧢',
    spriteRef: 'cloth_hat_plum_beret',
    equipmentSlot: 'hat',
  },

  // 3. Shoes (2 items)
  {
    itemId: 'shoes_leather_boots',
    displayName: 'Trail Leather Boots',
    displayNameMy: 'သားရေဘွတ်ဖိနပ်',
    description: 'တောတောင်နှင့် မြို့တွင်းလျှောက်လှမ်းရန် ခိုင်ခံ့သည့် သားရေညိုဖိနပ်',
    category: 'shoes',
    applicableGender: 'both',
    goldPrice: 30,
    icon: '🥾',
    spriteRef: 'cloth_shoes_leather_boots',
    equipmentSlot: 'shoes',
  },
  {
    itemId: 'shoes_sky_sneakers',
    displayName: 'Sky Canvas Sneakers',
    displayNameMy: 'မိုးပြာစနီကာဖိနပ်',
    description: 'အဖြူရောင်ခွာပါ သက်တောင့်သက်သာ မိုးပြာစနီကာဖိနပ်',
    category: 'shoes',
    applicableGender: 'both',
    goldPrice: 40,
    icon: '👟',
    spriteRef: 'cloth_shoes_sky_sneakers',
    equipmentSlot: 'shoes',
  },

  // 4. T-Shirts (2 items)
  {
    itemId: 'tshirt_coral_sunset',
    displayName: 'Coral Sunset Tee',
    displayNameMy: 'သန္တာရောင်တီရှပ်',
    description: 'နေဝင်ဆည်းဆာအရောင် နွေးထွေးတောက်ပသည့် ချည်သားတီရှပ်',
    category: 'tshirts',
    applicableGender: 'both',
    goldPrice: 25,
    icon: '👕',
    spriteRef: 'cloth_tshirt_coral_sunset',
    equipmentSlot: 'tshirt',
  },
  {
    itemId: 'tshirt_mint_breeze',
    displayName: 'Mint Breeze Tee',
    displayNameMy: 'စိမ်းနုရောင်တီရှပ်',
    description: 'လန်းဆန်းစေသော စိမ်းပြာနုရောင် ပေါ့ပါးတီရှပ်',
    category: 'tshirts',
    applicableGender: 'both',
    goldPrice: 32,
    icon: '👚',
    spriteRef: 'cloth_tshirt_mint_breeze',
    equipmentSlot: 'tshirt',
  },

  // 5. Pants (2 items)
  {
    itemId: 'pants_classic_denim',
    displayName: 'Classic Denim Jeans',
    displayNameMy: 'ဂျင်းဘောင်းဘီရှည်',
    description: 'နေ့စဉ်ဝတ်ဆင်ရန် သပ်ရပ်ခိုင်ခံ့သော နက်ပြာဂျင်းဘောင်းဘီ',
    category: 'pants',
    applicableGender: 'both',
    goldPrice: 30,
    icon: '👖',
    spriteRef: 'cloth_pants_classic_denim',
    equipmentSlot: 'pants',
  },
  {
    itemId: 'pants_olive_chino',
    displayName: 'Olive Meadow Pants',
    displayNameMy: 'သံလွင်ရောင်ဘောင်းဘီ',
    description: 'သဘာဝမြက်ခင်းစိမ်းနှင့် လိုက်ဖက်သော သံလွင်ရောင်ဘောင်းဘီ',
    category: 'pants',
    applicableGender: 'both',
    goldPrice: 38,
    icon: '🩳',
    spriteRef: 'cloth_pants_olive_chino',
    equipmentSlot: 'pants',
  },

  // 6. Accessories (2 items)
  {
    itemId: 'acc_crimson_scarf',
    displayName: 'Cozy Crimson Scarf',
    displayNameMy: 'ပဝါနီလေး',
    description: 'လည်ပင်းတွင် နွေးထွေးလှပစွာ ပတ်နိုင်သည့် ကြက်သွေးရောင်ပဝါ',
    category: 'accessories',
    applicableGender: 'both',
    goldPrice: 28,
    icon: '🧣',
    spriteRef: 'cloth_acc_crimson_scarf',
    equipmentSlot: 'accessory',
  },
  {
    itemId: 'acc_satchel_bag',
    displayName: 'Boutique Satchel',
    displayNameMy: 'သားရေလွယ်အိတ်',
    description: 'ရွှေကွင်းပါ ခရီးဆောင်သားရေလွယ်အိတ်လှလှ',
    category: 'accessories',
    applicableGender: 'both',
    goldPrice: 42,
    icon: '👜',
    spriteRef: 'cloth_acc_satchel_bag',
    equipmentSlot: 'accessory',
  },
] as const;

export const AUNTY_GYI_CATALOG_MAP: Record<string, ClothingItemDefinition> = Object.fromEntries(
  AUNTY_GYI_CATALOG.map((item) => [item.itemId, item])
);

export function getClothingItemById(itemId: string | null | undefined): ClothingItemDefinition | undefined {
  if (!itemId || typeof itemId !== 'string') return undefined;
  return AUNTY_GYI_CATALOG_MAP[itemId];
}

export const CRAFTING_STATION_LOCATION = {
  id: 'craft_station',
  name: 'လက်မှုလုပ်ငန်းခုံ (Crafting Station)',
  tileX: 33,
  tileY: 25,
  interactionRange: 2.05,
};

export function getResourceSourceHintMy(itemId: ItemId): string {
  switch (itemId) {
    case 'wood':
      return 'သစ်ပင်ခုတ်ယူရန် (Axe)';
    case 'stone':
      return 'ကျောက်တုံးခွဲရန် (Pickaxe)';
    case 'fiber':
      return 'ခြုံပုတ်/မြက်ရိတ်ရန် (Scythe)';
    case 'meat':
      return 'တောယုန်/သမင် အမဲလိုက်ရန်';
    case 'fish':
      return 'ရေကန်/တံတားတွင် ငါးမျှားရန်';
    default:
      return 'သယံဇာတစုဆောင်းရန်';
  }
}

export const ANIMAL_SPECIES: Record<AnimalKind, AnimalSpeciesConfig> = {
  rabbit: {
    id: 'rabbit',
    label: 'တောယုန် (Wild Rabbit)',
    textureKey: 'res_animal_rabbit',
    yieldItem: 'meat',
    futureMeatItem: 'rabbit_meat',
    scale: 0.78,
    originY: 0.83,
  },
  deer: {
    id: 'deer',
    label: 'တောသမင် (Wild Deer)',
    textureKey: 'res_animal_deer',
    yieldItem: 'meat',
    futureMeatItem: 'venison',
    scale: 1,
    originY: 0.88,
  },
};

/**
 * Step 35 Phase 3 Production Safety Gate:
 * While Firestore playerState client-write rules and unverified sell_item inventory authority remain open
 * (see Step 35 Audit), high-value Farm Plot purchases (5,000 - 12,000 Gold) MUST remain locked in Production.
 * Existing farmPlotOwners and fence-building privileges remain 100% preserved.
 */
export const FARM_PLOT_PURCHASES_LOCKED = true;
export const FARM_PLOT_PURCHASE_LOCK_REASON =
  'Gold Ledger လုံခြုံရေး (Firestore Client Write Lock နှင့် Server Inventory Verification) အပြီးသတ် မပြင်ဆင်ရသေးမီ မြေကွက်အသစ် ဝယ်ယူမှုကို ယာယီပိတ်ထားပါသည်';

export const FARM_PLOTS: FarmPlotDefinition[] = [
  {
    id: 'farm_plot_1',
    zoneId: 'farm_district',
    bounds: { minX: 45, minY: 76, maxX: 52, maxY: 81 },
    gateTile: { x: 48, y: 76, side: 'north' },
    signTile: { x: 47, y: 75 },
    tileCount: 48,
    purchasePrice: 12000,
    purchasedByDefault: false,
    label: 'စိုက်ပျိုးမြေကွက် ၁ (West Plot)',
  },
  {
    id: 'farm_plot_2',
    zoneId: 'farm_district',
    bounds: { minX: 45, minY: 87, maxX: 52, maxY: 92 },
    gateTile: { x: 48, y: 87, side: 'north' },
    signTile: { x: 47, y: 86 },
    tileCount: 48,
    purchasePrice: 12000,
    purchasedByDefault: false,
    label: 'စိုက်ပျိုးမြေကွက် ၂ (South Plot)',
  },
  {
    id: 'farm_plot_3',
    zoneId: 'farm_district',
    bounds: { minX: 58, minY: 73, maxX: 64, maxY: 77 },
    gateTile: { x: 58, y: 75, side: 'west' },
    signTile: { x: 57, y: 74 },
    tileCount: 35,
    purchasePrice: 10000,
    purchasedByDefault: false,
    label: 'စိုက်ပျိုးမြေကွက် ၃ (River North Plot)',
  },
  {
    id: 'farm_plot_4',
    zoneId: 'farm_district',
    bounds: { minX: 58, minY: 79, maxX: 63, maxY: 82 },
    gateTile: { x: 58, y: 80, side: 'west' },
    signTile: { x: 57, y: 81 },
    tileCount: 24,
    purchasePrice: 5000,
    purchasedByDefault: false,
    label: 'စိုက်ပျိုးမြေကွက် ၄ (River South Plot)',
  },
  {
    id: 'farm_plot_5',
    zoneId: 'farm_district',
    bounds: { minX: 72, minY: 72, maxX: 77, maxY: 76 },
    gateTile: { x: 72, y: 74, side: 'west' },
    signTile: { x: 71, y: 73 },
    tileCount: 30,
    purchasePrice: 8000,
    purchasedByDefault: false,
    label: 'စိုက်ပျိုးမြေကွက် ၅ (East Riverbank Plot)',
  },
];

export const ITEMS: Record<ItemId, ItemDefinition> = {
  wood: {
    id: 'wood',
    name: 'သစ်သား (Timber)',
    category: 'resource',
    description: 'သစ်ပင်များမှ ခုတ်ယူရရှိသော ခိုင်ခံ့သည့် သစ်လုံးများ။ အဆောက်အအုံနှင့် မီးဖိုဆောက်လုပ်ရာတွင် သုံးသည်။',
    icon: '🪵',
    sellPrice: 2,
    buyPrice: 4,
    maxStack: 999,
  },
  stone: {
    id: 'stone',
    name: 'ကျောက်တုံး (Stone)',
    category: 'resource',
    description: 'ကျောက်ဆောင်များမှ တူးဖော်ရရှိသော ကျောက်တုံး။ ခိုင်ခံ့သော အုတ်မြစ်နှင့် မီးဖိုများအတွက် သုံးသည်။',
    icon: '🪨',
    sellPrice: 3,
    buyPrice: 6,
    maxStack: 999,
  },
  fiber: {
    id: 'fiber',
    name: 'အမျှင် (Plant Fiber)',
    category: 'resource',
    description: 'ခြုံပုတ်များမှ ရရှိသော သဘာဝအပင်မျှင်။ ကြိုးနှင့် ခြံစည်းရိုးများ ပြုလုပ်ရာတွင် သုံးသည်။',
    icon: '🌾',
    sellPrice: 1,
    buyPrice: 3,
    maxStack: 999,
  },
  meat: {
    id: 'meat',
    name: 'အသားစိမ်း (Raw Meat)',
    category: 'food',
    description: 'တောရိုင်းတိရစ္ဆာန်များမှ ရရှိသော အသား။ မီးဖိုတွင် ချက်ပြုတ်စားသောက်နိုင်သည်။',
    icon: '🥩',
    sellPrice: 5,
    buyPrice: 10,
    maxStack: 99,
  },
  fish: {
    id: 'fish',
    name: 'ငါးလတ် (Fresh Fish)',
    category: 'food',
    description: 'ရေကန်နှင့် မြစ်ထဲမှ မျှားယူရရှိသော ငါး။ မီးဖိုတွင် ကင်စားနိုင်သည်။',
    icon: '🐟',
    sellPrice: 6,
    buyPrice: 12,
    maxStack: 99,
  },
  cooked_meat: {
    id: 'cooked_meat',
    name: 'အသားကင် (Roasted Steak)',
    category: 'food',
    description: 'မီးဖိုပေါ်တွင် မွှေးကြိုင်စွာ ကင်ထားသော အသား။',
    icon: '🍖',
    sellPrice: 12,
    buyPrice: 20,
    maxStack: 99,
  },
  grilled_fish: {
    id: 'grilled_fish',
    name: 'ငါးကင် (Grilled Fish)',
    category: 'food',
    description: 'မီးကျီးခဲပေါ်တွင် ရွှေဝါရောင်သန်းအောင် ကင်ထားသော ငါးကင်။',
    icon: '🍱',
    sellPrice: 15,
    buyPrice: 25,
    maxStack: 99,
  },
  axe_basic: {
    id: 'axe_basic',
    name: 'ပုဆိန် (Basic Axe)',
    category: 'tool',
    description: 'အခြေခံ သစ်ခုတ်ကိရိယာ။ သစ်ပင်များကို လျင်မြန်စွာ ခုတ်ယူနိုင်သည် (ရောင်းချ/စွန့်ပစ်၍မရပါ)။',
    icon: '🪓',
    sellPrice: 0,
    maxStack: 1,
    isStarterTool: true,
  },
  pickaxe_basic: {
    id: 'pickaxe_basic',
    name: 'ပေါက်တူး (Basic Pickaxe)',
    category: 'tool',
    description: 'အခြေခံ ကျောက်တူးကိရိယာ။ ကျောက်တုံးများကို လွယ်ကူစွာ ခွဲထုတ်နိုင်သည် (ရောင်းချ/စွန့်ပစ်၍မရပါ)။',
    icon: '⛏️',
    sellPrice: 0,
    maxStack: 1,
    isStarterTool: true,
  },
  scythe_basic: {
    id: 'scythe_basic',
    name: 'တံစဉ် (Basic Scythe)',
    category: 'tool',
    description: 'အခြေခံ မြက်/ခြုံရှင်းကိရိယာ။ ခြုံပုတ်နှင့် အပင်မျှင်များကို လျင်မြန်စွာ ရိတ်သိမ်းနိုင်သည် (ရောင်းချ/စွန့်ပစ်၍မရပါ)။',
    icon: '🗡️',
    sellPrice: 0,
    maxStack: 1,
    isStarterTool: true,
  },
  rod_basic: {
    id: 'rod_basic',
    name: 'ငါးမျှားတံ (Fishing Rod)',
    category: 'tool',
    description: 'ရေကန်နှင့် မြစ်ကမ်းမှ ငါးမျှားနိုင်သော ငါးမျှားတံ။ မြို့လယ်ဆိုင်တွင် ဝယ်ယူ သို့မဟုတ် ဖန်တီးနိုင်သည်။',
    icon: '🎣',
    sellPrice: 10,
    buyPrice: 25,
    maxStack: 1,
  },
  fence_wood: {
    id: 'fence_wood',
    name: 'သစ်သားခြံစည်းရိုး (Fence)',
    category: 'building',
    description: 'အိမ်ခြံဝင်းကို သပ်ရပ်စွာ ကာရံနိုင်သော ၁×၁ သစ်သားခြံစည်းရိုး။',
    icon: '🪵',
    sellPrice: 3,
    buyPrice: 8,
    maxStack: 99,
  },
  house_small: {
    id: 'house_small',
    name: 'သစ်သားအိမ်ငယ် (Cottage)',
    category: 'building',
    description: 'နွေးထွေးသော ၂×၂ သစ်သားအိမ်ငယ်။',
    icon: '🏡',
    sellPrice: 50,
    buyPrice: 120,
    maxStack: 10,
  },
  house_medium: {
    id: 'house_medium',
    name: 'နှစ်ထပ်အိမ် (Manor)',
    category: 'building',
    description: 'ကျယ်ဝန်းသော ၃×၂ နှစ်ထပ်သစ်သားနှင့် ကျောက်သားစပ် လူနေအိမ်။',
    icon: '🏘️',
    sellPrice: 95,
    buyPrice: 220,
    maxStack: 10,
  },
  house_large: {
    id: 'house_large',
    name: 'စံအိမ်ကြီး (Grand Villa)',
    category: 'building',
    description: 'ခမ်းနားထည်ဝါသော ၃×၃ ဥယျာဉ်စံအိမ်ကြီး။',
    icon: '🏰',
    sellPrice: 160,
    buyPrice: 360,
    maxStack: 10,
  },
  campfire: {
    id: 'campfire',
    name: 'မီးဖို (Campfire)',
    category: 'building',
    description: 'အသား/ငါး ကင်ရန်နှင့် ညအခါ အနွေးဓာတ်ရရှိစေရန် ၁×၁ ကျောက်စီမီးဖို။',
    icon: '🔥',
    sellPrice: 8,
    buyPrice: 18,
    maxStack: 20,
  },
  storage_box: {
    id: 'storage_box',
    name: 'သိုလှောင်သေတ္တာ (Chest)',
    category: 'building',
    description: 'ပိုလျှံသော ပစ္စည်းများ သိမ်းဆည်းနိုင်သည့် ၁×၁ သစ်သားသေတ္တာ။',
    icon: '📦',
    sellPrice: 15,
    buyPrice: 35,
    maxStack: 20,
  },
  lantern: {
    id: 'lantern',
    name: 'မီးအိမ်တိုင် (Lantern)',
    category: 'building',
    description: 'ညအခါ ရွှေဝါရောင် အလင်းရောင်ပေးသည့် ၁×၁ မီးအိမ်တိုင်။',
    icon: '🏮',
    sellPrice: 12,
    buyPrice: 30,
    maxStack: 20,
  },
  decor_bench: {
    id: 'decor_bench',
    name: 'ဥယျာဉ်ထိုင်ခုံ (Bench)',
    category: 'building',
    description: 'အိမ်ခြံဝင်းအပြင်တွင် အပန်းဖြေရန် ထားရှိနိုင်သော ၁×၁ သစ်သားထိုင်ခုံ။',
    icon: '🪑',
    sellPrice: 10,
    buyPrice: 22,
    maxStack: 20,
  },
  decor_flower_pot: {
    id: 'decor_flower_pot',
    name: 'ပန်းအိုးအလှ (Flower Pot)',
    category: 'building',
    description: 'အိမ်ရှေ့နှင့် ခြံဝင်းအလှဆင်ရန် ရောင်စုံပန်းအိုးငယ် (၁×၁)။',
    icon: '🪴',
    sellPrice: 7,
    buyPrice: 15,
    maxStack: 30,
  },
  decor_flowerbed: {
    id: 'decor_flowerbed',
    name: 'ပန်းခင်းငယ် (Flowerbed)',
    category: 'building',
    description: 'ခြံဝင်းထဲတွင် စိုက်ပျိုးအလှဆင်နိုင်သော ၁×၁ သစ်သားဘောင်ပန်းခင်း။',
    icon: '🌷',
    sellPrice: 11,
    buyPrice: 24,
    maxStack: 30,
  },
  decor_flower_stand: {
    id: 'decor_flower_stand',
    name: 'ပန်းစင်အလှ (Flower Stand)',
    category: 'building',
    description: 'ပန်းမျိုးစုံ တင်ဆင်နိုင်သော ၁×၁ သစ်သားပန်းစင်။',
    icon: '💐',
    sellPrice: 14,
    buyPrice: 32,
    maxStack: 20,
  },
};

export const SHOP_CATEGORIES: ShopCategoryDef[] = [
  {
    id: 'building_materials',
    label: 'အိမ်ဆောက်ပစ္စည်း (Building)',
    shortLabel: 'အိမ်ဆောက်',
    icon: '🏠',
  },
  {
    id: 'decoration',
    label: 'အလှဆင်ပစ္စည်း (Decoration)',
    shortLabel: 'အလှဆင်',
    icon: '🏮',
  },
  {
    id: 'garden_plants',
    label: 'ဥယျာဉ်နှင့် အပင် (Garden)',
    shortLabel: 'ဥယျာဉ်',
    icon: '🪴',
  },
  {
    id: 'tools_equipment',
    label: 'ကိရိယာနှင့် ပစ္စည်း (Tools)',
    shortLabel: 'ကိရိယာ',
    icon: '🎣',
  },
];

export const MERCHANT_CATALOG: ShopCatalogEntry[] = [
  // 1. Building Materials
  { id: 'wood', price: 4, category: 'building_materials' },
  { id: 'stone', price: 6, category: 'building_materials' },
  { id: 'fiber', price: 3, category: 'building_materials' },
  { id: 'fence_wood', price: 8, category: 'building_materials' },
  { id: 'campfire', price: 18, category: 'building_materials' },
  { id: 'storage_box', price: 35, category: 'building_materials' },
  { id: 'house_small', price: 120, category: 'building_materials' },
  { id: 'house_medium', price: 220, category: 'building_materials' },
  { id: 'house_large', price: 360, category: 'building_materials' },

  // 2. Decoration
  { id: 'lantern', price: 30, category: 'decoration' },

  // 3. Garden & Plants
  { id: 'decor_flower_pot', price: 15, category: 'garden_plants' },
  { id: 'decor_flowerbed', price: 24, category: 'garden_plants' },
  { id: 'decor_flower_stand', price: 32, category: 'garden_plants' },

  // 4. Tools & Equipment (Strictly excludes Starter Tools)
  { id: 'rod_basic', price: 25, category: 'tools_equipment' },
  { id: 'cooked_meat', price: 20, category: 'tools_equipment' },
  { id: 'grilled_fish', price: 25, category: 'tools_equipment' },
];

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: 'craft_rod',
    resultItem: 'rod_basic',
    resultCount: 1,
    ingredients: [
      { item: 'wood', quantity: 4 },
      { item: 'fiber', quantity: 4 },
    ],
  },
  {
    id: 'craft_fence',
    resultItem: 'fence_wood',
    resultCount: 2,
    ingredients: [
      { item: 'wood', quantity: 2 },
      { item: 'fiber', quantity: 1 },
    ],
  },
  {
    id: 'craft_campfire',
    resultItem: 'campfire',
    resultCount: 1,
    ingredients: [
      { item: 'wood', quantity: 5 },
      { item: 'stone', quantity: 2 },
    ],
  },
  {
    id: 'craft_house',
    resultItem: 'house_small',
    resultCount: 1,
    ingredients: [
      { item: 'wood', quantity: 15 },
      { item: 'stone', quantity: 8 },
    ],
  },
  {
    id: 'craft_house_medium',
    resultItem: 'house_medium',
    resultCount: 1,
    ingredients: [
      { item: 'wood', quantity: 25 },
      { item: 'stone', quantity: 14 },
    ],
  },
  {
    id: 'craft_house_large',
    resultItem: 'house_large',
    resultCount: 1,
    ingredients: [
      { item: 'wood', quantity: 40 },
      { item: 'stone', quantity: 24 },
      { item: 'fiber', quantity: 10 },
    ],
  },
  {
    id: 'craft_storage',
    resultItem: 'storage_box',
    resultCount: 1,
    ingredients: [
      { item: 'wood', quantity: 8 },
      { item: 'fiber', quantity: 2 },
    ],
  },
  {
    id: 'craft_lantern',
    resultItem: 'lantern',
    resultCount: 1,
    ingredients: [
      { item: 'wood', quantity: 4 },
      { item: 'stone', quantity: 2 },
      { item: 'fiber', quantity: 2 },
    ],
  },
  {
    id: 'cook_meat',
    resultItem: 'cooked_meat',
    resultCount: 1,
    ingredients: [{ item: 'meat', quantity: 1 }],
    requiresCampfire: true,
  },
  {
    id: 'cook_fish',
    resultItem: 'grilled_fish',
    resultCount: 1,
    ingredients: [{ item: 'fish', quantity: 1 }],
    requiresCampfire: true,
  },
];

export const ZONES: ZoneDefinition[] = [
  {
    id: 'main_city',
    name: 'ဗဟိုမြို့တော်ရွာ (Village Town Center)',
    description: 'Random City ၏ အချက်အချာကျသော ကျေးရွာဗဟို။ ကုန်စုံဆိုင်၊ လက်မှုလုပ်ငန်းခုံနှင့် ပန်းခြံငယ် တည်ရှိသည်။',
    minX: 21,
    minY: 21,
    maxX: 39,
    maxY: 39,
    color: '#d97706',
  },
  {
    id: 'forest',
    name: 'တောအုပ်စိမ်း (Whispering Forest)',
    description: 'အရိပ်ကောင်းသော သစ်ပင်များနှင့် ဘယ်ရီခြုံပုတ်များ ပေါများသည့် တောအုပ်ကြီး။',
    minX: 38,
    minY: 4,
    maxX: 114,
    maxY: 48,
    color: '#15803d',
  },
  {
    id: 'lake',
    name: 'မှန်ကြည်ရေကန် (Mirror Lake)',
    description: 'ငါးများ ပေါများပြီး သဲသောင်ကမ်းခြေရှိသည့် ကြည်လင်သော သဘာဝရေကန်။',
    minX: 4,
    minY: 38,
    maxX: 40,
    maxY: 90,
    color: '#0284c7',
  },
  {
    id: 'grassland',
    name: 'ပန်းခင်းမြက်ခင်းပြင် (Wild Meadows)',
    description: 'တောယုန်နှင့် တောသမင်များ လွတ်လပ်စွာ ကျက်စားနေသော မြက်ခင်းပြင်။',
    minX: 4,
    minY: 4,
    maxX: 36,
    maxY: 36,
    color: '#65a30d',
  },
  {
    id: 'farm_district',
    name: 'စိုက်ပျိုးရေးရပ်ကွက် (Farm District)',
    description: 'ရွာရေတွင်းနှင့် စနစ်တကျ ပိုင်းခြားထားသော စိုက်ပျိုးမြေကွက်များ တည်ရှိရာဇုန်။',
    minX: 43,
    minY: 71,
    maxX: 83,
    maxY: 96,
    color: '#16a34a',
  },
  {
    id: 'building_area',
    name: 'အခြေချရပ်ကွက် (Homestead District)',
    description: 'ကိုယ်ပိုင်အိမ်များ၊ ခြံစည်းရိုးများနှင့် ဥယျာဉ်အလှဆင်ပစ္စည်းများ ဆောက်လုပ်နိုင်သော မြေနေရာ။',
    minX: 38,
    minY: 38,
    maxX: 114,
    maxY: 114,
    color: '#854d0e',
  },
  {
    id: 'gathering_area',
    name: 'ကျောက်တောင်နှင့် ဆင်ခြေဖုံး (Quarry & Outskirts)',
    description: 'ကျောက်တုံးများနှင့် သဘာဝသယံဇာတများ ကြွယ်ဝသည့် ကျောက်တောင်ဆင်ခြေဖုံး နယ်မြေ။',
    minX: 0,
    minY: 0,
    maxX: 119,
    maxY: 119,
    color: '#78716c',
  },
];

export interface ZoneSignpostDef {
  id: string;
  zoneId: string;
  tileX: number;
  tileY: number;
  label: string;
  shortLabel: string;
  color: string;
  facing: 'right' | 'left';
  hint: string;
}

export const ZONE_SIGNPOSTS: ZoneSignpostDef[] = [
  {
    id: 'sign_town_north',
    zoneId: 'main_city',
    tileX: 28,
    tileY: 21,
    label: '🏘️ ဗဟိုမြို့တော် (Town Center)',
    shortLabel: 'Town Center',
    color: '#fde047',
    facing: 'left',
    hint: 'မြောက်ဘက်: မြက်ခင်းပြင် | တောင်ဘက်: ဗဟိုမြို့တော်',
  },
  {
    id: 'sign_wild_meadows',
    zoneId: 'grassland',
    tileX: 29,
    tileY: 18,
    label: '🌿 မြက်ခင်းပြင် (Wild Meadows)',
    shortLabel: 'Wild Meadows',
    color: '#bef264',
    facing: 'left',
    hint: 'မြက်ခင်းပြင်နှင့် တောင်ပေါ်ရေကန် (Highland Spring Lake)',
  },
  {
    id: 'sign_mirror_lake',
    zoneId: 'lake',
    tileX: 19,
    tileY: 29,
    label: '🌊 မှန်ကြည်ရေကန် (Mirror Lake)',
    shortLabel: 'Mirror Lake',
    color: '#7dd3fc',
    facing: 'left',
    hint: 'အနောက်ဘက်လမ်းအတိုင်း မှန်ကြည်ရေကန် ငါးမျှားကမ်းခြေသို့',
  },
  {
    id: 'sign_whispering_forest',
    zoneId: 'forest',
    tileX: 41,
    tileY: 29,
    label: '🌲 တောအုပ်စိမ်း (Whispering Forest)',
    shortLabel: 'Whispering Forest',
    color: '#86efac',
    facing: 'right',
    hint: 'အရှေ့ဘက်: တောအုပ်စိမ်းနှင့် Emerald Lake',
  },
  {
    id: 'sign_quarry',
    zoneId: 'gathering_area',
    tileX: 58,
    tileY: 23,
    label: '⛰️ ကျောက်တောင်နယ်မြေ (Quarry)',
    shortLabel: 'Quarry',
    color: '#d6d3d1',
    facing: 'right',
    hint: 'မြောက်ဘက်တောင်ကြားလမ်း: ကျောက်တောင်နယ်မြေ',
  },
  {
    id: 'sign_homestead',
    zoneId: 'building_area',
    tileX: 39,
    tileY: 41,
    label: '🏡 အခြေချရပ်ကွက် (Homestead District)',
    shortLabel: 'Homestead District',
    color: '#fdba74',
    facing: 'right',
    hint: 'အိမ်ခြံမြေကွက်များနှင့် အလှဆင်ဧရိယာ',
  },
  {
    id: 'sign_farm_district',
    zoneId: 'farm_district',
    tileX: 43,
    tileY: 71,
    label: '🌾 စိုက်ပျိုးရေးရပ်ကွက် (Farm District)',
    shortLabel: 'Farm District',
    color: '#4ade80',
    facing: 'right',
    hint: 'ရွာရေတွင်းနှင့် စိုက်ပျိုးမြေကွက် ၅ ကွက်',
  },
];

export type BridgeStyle = 'main' | 'rustic' | 'pier';

export interface ScenicPierDefinition {
  id: string;
  name: string;
  approachTrailTiles: ReadonlyArray<readonly [number, number]>;
  deckTiles: ReadonlyArray<readonly [number, number]>;
  fishSpots: ReadonlyArray<readonly [number, number]>;
}

/**
 * Curated Wooden Fishing Piers & Scenic Bridge Overlook Alcoves across lakes and Silverbrook River.
 * Shared single source of truth across MapSystem, ResourceSystem, WorldComposition, and WorldScene.
 */
export const SCENIC_FISHING_PIERS: readonly ScenicPierDefinition[] = [
  {
    id: 'pier_mirror_lake_east',
    name: 'မှန်ကြည်ရေကန် အရှေ့ဘက် ငါးမျှားတံတား (Mirror Lake Grand Pier)',
    approachTrailTiles: [
      [35, 61],
      [34, 61],
    ],
    deckTiles: [
      [33, 61],
      [32, 61],
      [31, 61],
      [29, 60],
      [30, 60],
      [29, 61],
      [30, 61],
      [29, 62],
      [30, 62],
    ],
    fishSpots: [
      [28, 61],
      [29, 63],
    ],
  },
  {
    id: 'pier_mirror_lake_north',
    name: 'မှန်ကြည်ရေကန် မြောက်ဘက် ငါးမျှားစင် (Mirror Lake North Cove Pier)',
    approachTrailTiles: [
      [12, 50],
      [12, 51],
      [11, 51],
      [11, 52],
      [10, 52],
      [10, 53],
      [10, 54],
      [10, 55],
      [10, 56],
    ],
    deckTiles: [
      [11, 56],
      [12, 56],
      [13, 56],
      [14, 55],
      [15, 55],
      [14, 56],
      [15, 56],
      [14, 57],
      [15, 57],
    ],
    fishSpots: [
      [16, 56],
      [15, 58],
    ],
  },
  {
    id: 'pier_emerald_glade_south',
    name: 'တောအုပ်ရေကန် ငါးမျှားစင် (Emerald Glade Pavilion Pier)',
    approachTrailTiles: [
      [82, 29],
      [82, 28],
    ],
    deckTiles: [
      [82, 27],
      [82, 26],
      [82, 25],
      [81, 23],
      [82, 23],
      [83, 23],
      [81, 24],
      [82, 24],
      [83, 24],
    ],
    fishSpots: [
      [80, 23],
      [82, 22],
    ],
  },
  {
    id: 'pier_highland_spring_south',
    name: 'တောင်ပေါ်စမ်းရေကန် ငါးမျှားစင် (Highland Spring Pier)',
    approachTrailTiles: [
      [25, 16],
      [25, 17],
      [25, 18],
      [25, 19],
      [25, 20],
      [24, 20],
      [23, 20],
      [22, 20],
      [21, 20],
      [20, 20],
      [19, 20],
      [18, 20],
      [17, 20],
      [16, 20],
      [15, 20],
      [15, 19],
    ],
    deckTiles: [
      [15, 18],
      [15, 17],
      [14, 15],
      [15, 15],
      [16, 15],
      [14, 16],
      [15, 16],
      [16, 16],
    ],
    fishSpots: [
      [13, 15],
      [15, 14],
    ],
  },
  {
    id: 'pier_silverbrook_lookout',
    name: 'ငွေချောင်းတံတား ရှုခင်းသာစင် (Silverbrook River Overlook Deck)',
    approachTrailTiles: [],
    deckTiles: [
      [88, 69],
      [89, 69],
      [90, 69],
      [91, 69],
    ],
    fishSpots: [[89, 68]],
  },
];

