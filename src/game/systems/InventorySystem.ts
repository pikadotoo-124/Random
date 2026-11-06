/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ITEMS } from '../constants';
import { InventorySlot, ItemId } from '../types';

export class InventorySystem {
  public slots: InventorySlot[];
  public maxSlots: number;
  public coins: number;
  public onUpdate?: () => void;

  constructor(maxSlots = 24, initialCoins = 20) {
    this.maxSlots = maxSlots;
    this.coins = initialCoins;
    this.slots = [];
    this.initStarterItems();
  }

  /**
   * Initialize starter items: Basic Axe, Basic Pickaxe, Basic Fishing Rod
   */
  public initStarterItems(): void {
    this.slots = [
      { item: 'axe_basic', quantity: 1 },
      { item: 'pickaxe_basic', quantity: 1 },
      { item: 'rod_basic', quantity: 1 },
    ];
  }

  /**
   * Add an item to the player's inventory
   * Handles stacking up to maxStack and filling empty slots
   */
  public addItem(itemId: ItemId, amount = 1): boolean {
    const itemDef = ITEMS[itemId];
    if (!itemDef || amount <= 0) return false;

    let remaining = amount;

    // 1. Try stacking in existing slots
    for (const slot of this.slots) {
      if (slot.item === itemId && slot.quantity < itemDef.maxStack) {
        const space = itemDef.maxStack - slot.quantity;
        const toAdd = Math.min(space, remaining);
        slot.quantity += toAdd;
        remaining -= toAdd;
        if (remaining <= 0) break;
      }
    }

    // 2. If still remaining and have open inventory slots
    while (remaining > 0 && this.slots.length < this.maxSlots) {
      const toAdd = Math.min(itemDef.maxStack, remaining);
      this.slots.push({ item: itemId, quantity: toAdd });
      remaining -= toAdd;
    }

    this.notifyUpdate();
    return remaining === 0;
  }

  /**
   * Check if player has the specified amount of an item
   */
  public hasItem(itemId: ItemId, requiredAmount = 1): boolean {
    let total = 0;
    for (const slot of this.slots) {
      if (slot.item === itemId) {
        total += slot.quantity;
        if (total >= requiredAmount) return true;
      }
    }
    return total >= requiredAmount;
  }

  /**
   * Count total quantity of a specific item in inventory
   */
  public getItemCount(itemId: ItemId): number {
    return this.slots
      .filter((s) => s.item === itemId)
      .reduce((sum, s) => sum + s.quantity, 0);
  }

  /**
   * Remove specified quantity of an item from inventory
   */
  public removeItem(itemId: ItemId, amount = 1): boolean {
    if (!this.hasItem(itemId, amount)) return false;

    let remaining = amount;
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const slot = this.slots[i];
      if (slot.item === itemId) {
        if (slot.quantity <= remaining) {
          remaining -= slot.quantity;
          this.slots.splice(i, 1);
        } else {
          slot.quantity -= remaining;
          remaining = 0;
        }
        if (remaining <= 0) break;
      }
    }

    this.notifyUpdate();
    return true;
  }

  /**
   * Add or subtract coins
   */
  public addCoins(amount: number): void {
    this.coins = Math.max(0, this.coins + amount);
    this.notifyUpdate();
  }

  public notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate();
    }
  }

  /**
   * Serialize for save game
   */
  public serialize(): { slots: InventorySlot[]; coins: number } {
    return {
      slots: [...this.slots],
      coins: this.coins,
    };
  }

  /**
   * Deserialize saved inventory
   */
  public deserialize(data: { slots: InventorySlot[]; coins: number }): void {
    if (data.slots && Array.isArray(data.slots)) {
      this.slots = data.slots;
    }
    if (typeof data.coins === 'number') {
      this.coins = data.coins;
    }
    this.notifyUpdate();
  }
}
