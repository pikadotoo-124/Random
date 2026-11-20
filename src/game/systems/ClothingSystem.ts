/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AUNTY_GYI_CATALOG_MAP,
  CLOTHING_RENDER_LAYER_ORDER,
  getClothingItemById,
} from '../constants';
import {
  ClothingEquipmentSlot,
  ClothingItemDefinition,
  EquippedClothingState,
  PlayerProfile,
} from '../types';
import { InventorySystem } from './InventorySystem';

export interface ClothingPurchaseResult {
  ok: boolean;
  reason?: 'invalid_item' | 'already_owned' | 'insufficient_gold' | 'locked';
  missingGold?: number;
  messageMy: string;
  item?: ClothingItemDefinition;
  coinsRemaining?: number;
}

export interface ClothingEquipResult {
  ok: boolean;
  reason?: 'invalid_item' | 'not_owned' | 'gender_mismatch';
  messageMy: string;
  equippedClothing?: EquippedClothingState;
}

const VALID_SLOTS: readonly ClothingEquipmentSlot[] = CLOTHING_RENDER_LAYER_ORDER;

export class ClothingSystem {
  private static pendingPurchaseIds = new Set<string>();

  public static isGenderCompatible(
    item: ClothingItemDefinition,
    gender: 'male' | 'female'
  ): boolean {
    return item.applicableGender === 'both' || item.applicableGender === gender;
  }

  public static normalizeOwnedClothing(rawOwned: unknown): string[] {
    if (!Array.isArray(rawOwned)) return [];
    const seen = new Set<string>();
    const clean: string[] = [];
    for (const id of rawOwned) {
      if (typeof id === 'string' && AUNTY_GYI_CATALOG_MAP[id] && !seen.has(id)) {
        seen.add(id);
        clean.push(id);
      }
    }
    return clean;
  }

  public static normalizeEquippedClothing(
    rawEquipped: unknown,
    ownedClothing?: string[],
    gender?: 'male' | 'female'
  ): EquippedClothingState {
    const clean: EquippedClothingState = {};
    if (!rawEquipped || typeof rawEquipped !== 'object') return clean;

    const ownedSet = ownedClothing ? new Set(ownedClothing) : null;
    for (const slot of VALID_SLOTS) {
      const val = (rawEquipped as Record<string, unknown>)[slot];
      if (typeof val !== 'string' || !val) continue;
      const item = getClothingItemById(val);
      if (!item || item.equipmentSlot !== slot) continue;
      if (ownedSet && !ownedSet.has(val)) continue;
      if (gender && !this.isGenderCompatible(item, gender)) continue;
      clean[slot] = val;
    }
    return clean;
  }

  public static getClothingTextureKey(
    itemId: string,
    gender: 'male' | 'female'
  ): string {
    return `cloth_${itemId}_${gender}`;
  }

  /**
   * Resolves ordered visible clothing layers for a character.
   * Rendering rule: wearing a Suit hides the underlying T-Shirt layer cleanly
   * so torso layers never overlap or z-fight; unequipping Suit restores the T-Shirt.
   */
  public static getEffectiveVisibleOutfit(
    equipped: EquippedClothingState | undefined | null,
    gender: 'male' | 'female'
  ): Array<{ slot: ClothingEquipmentSlot; item: ClothingItemDefinition; textureKey: string }> {
    if (!equipped || typeof equipped !== 'object') return [];

    const suitId = typeof equipped.suit === 'string' ? equipped.suit : null;
    const suitItem = suitId ? getClothingItemById(suitId) : undefined;
    const hasActiveSuit = Boolean(
      suitItem && suitItem.equipmentSlot === 'suit' && this.isGenderCompatible(suitItem, gender)
    );

    const layers: Array<{ slot: ClothingEquipmentSlot; item: ClothingItemDefinition; textureKey: string }> = [];
    for (const slot of CLOTHING_RENDER_LAYER_ORDER) {
      if (slot === 'tshirt' && hasActiveSuit) {
        continue;
      }
      const itemId = equipped[slot];
      if (typeof itemId !== 'string' || !itemId) continue;
      const item = getClothingItemById(itemId);
      if (!item || item.equipmentSlot !== slot || !this.isGenderCompatible(item, gender)) continue;
      layers.push({
        slot,
        item,
        textureKey: this.getClothingTextureKey(item.itemId, gender),
      });
    }
    return layers;
  }

  /**
   * Stable string signature for deduplicating multiplayer outfit broadcasts.
   */
  public static getOutfitSignature(equipped: EquippedClothingState | undefined | null): string {
    const norm = this.normalizeEquippedClothing(equipped);
    return VALID_SLOTS.map((slot) => `${slot}:${norm[slot] || ''}`).join('|');
  }

  /**
   * Atomic clothing purchase: checks ownership, double-click lock, and gold sufficiency
   * before adding to playerProfile.ownedClothing and deducting coins once.
   */
  public static purchaseClothing(
    itemId: string,
    inventory: InventorySystem,
    playerProfile: PlayerProfile
  ): ClothingPurchaseResult {
    const item = getClothingItemById(itemId);
    if (!item) {
      return {
        ok: false,
        reason: 'invalid_item',
        messageMy: 'အဝတ်အစားပစ္စည်း ရှာမတွေ့ပါ',
      };
    }

    if (this.pendingPurchaseIds.has(itemId)) {
      return {
        ok: false,
        reason: 'locked',
        messageMy: 'ဝယ်ယူမှု လုပ်ဆောင်နေပါသည်...',
      };
    }

    const owned = this.normalizeOwnedClothing(playerProfile.ownedClothing);
    if (owned.includes(itemId)) {
      return {
        ok: false,
        reason: 'already_owned',
        messageMy: 'ဤအဝတ်အစားကို ဝယ်ယူပြီးသား ဖြစ်ပါသည်',
      };
    }

    if (inventory.coins < item.goldPrice) {
      const missingGold = item.goldPrice - inventory.coins;
      return {
        ok: false,
        reason: 'insufficient_gold',
        missingGold,
        messageMy: `ရွှေဒင်္ဂါး မလုံလောက်ပါ (နောက်ထပ် ${missingGold} ရွှေ လိုအပ်သည်)`,
      };
    }

    this.pendingPurchaseIds.add(itemId);
    try {
      // Mutate ownership first so concurrent/rapid repeat calls immediately see already_owned
      playerProfile.ownedClothing = [...owned, itemId];
      inventory.addCoins(-item.goldPrice);
      playerProfile.coins = inventory.coins;

      return {
        ok: true,
        item,
        coinsRemaining: inventory.coins,
        messageMy: `${item.displayNameMy || item.displayName} ကို ${item.goldPrice} ရွှေဖြင့် ဝယ်ယူပြီးပါပြီ!`,
      };
    } finally {
      this.pendingPurchaseIds.delete(itemId);
    }
  }

  public static equipClothing(
    itemId: string,
    playerProfile: PlayerProfile
  ): ClothingEquipResult {
    const item = getClothingItemById(itemId);
    if (!item) {
      return {
        ok: false,
        reason: 'invalid_item',
        messageMy: 'အဝတ်အစားပစ္စည်း မတွေ့ရှိပါ',
      };
    }

    const owned = this.normalizeOwnedClothing(playerProfile.ownedClothing);
    if (!owned.includes(itemId)) {
      return {
        ok: false,
        reason: 'not_owned',
        messageMy: 'ဝယ်ယူပြီးသော အဝတ်အစားများကိုသာ ဝတ်ဆင်နိုင်ပါသည်',
      };
    }

    if (!this.isGenderCompatible(item, playerProfile.gender)) {
      return {
        ok: false,
        reason: 'gender_mismatch',
        messageMy:
          item.applicableGender === 'female'
            ? 'ဤဝတ်စုံသည် Female Character အတွက်သာ ဖြစ်ပါသည်'
            : 'ဤဝတ်စုံသည် Male Character အတွက်သာ ဖြစ်ပါသည်',
      };
    }

    const nextEquipped = this.normalizeEquippedClothing(
      playerProfile.equippedClothing,
      owned,
      playerProfile.gender
    );
    nextEquipped[item.equipmentSlot] = item.itemId;
    playerProfile.equippedClothing = nextEquipped;

    return {
      ok: true,
      messageMy: `${item.displayNameMy || item.displayName} ကို ဝတ်ဆင်လိုက်ပါပြီ`,
      equippedClothing: { ...nextEquipped },
    };
  }

  public static unequipSlot(
    slot: ClothingEquipmentSlot,
    playerProfile: PlayerProfile
  ): ClothingEquipResult {
    const owned = this.normalizeOwnedClothing(playerProfile.ownedClothing);
    const nextEquipped = this.normalizeEquippedClothing(
      playerProfile.equippedClothing,
      owned,
      playerProfile.gender
    );
    delete nextEquipped[slot];
    playerProfile.equippedClothing = nextEquipped;

    return {
      ok: true,
      messageMy: 'မူလအဝတ်အစားပုံစံသို့ ပြန်လည်ပြောင်းလဲပြီးပါပြီ',
      equippedClothing: { ...nextEquipped },
    };
  }

  public static unequipAll(playerProfile: PlayerProfile): ClothingEquipResult {
    playerProfile.equippedClothing = {};
    return {
      ok: true,
      messageMy: 'ဝတ်စုံအားလုံးကို ချွတ်၍ မူလပုံစံသို့ ပြန်လည်ပြောင်းလဲပြီးပါပြီ',
      equippedClothing: {},
    };
  }
}
