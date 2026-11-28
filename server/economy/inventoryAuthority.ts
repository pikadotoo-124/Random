/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AUNTY_GYI_CATALOG_MAP,
  CRAFTING_RECIPES,
  ITEMS,
  STARTER_TOOLS,
  isStarterTool,
} from '../../src/game/constants';
import { CraftingRecipe, InventorySlot, ItemId } from '../../src/game/types';

export const MAX_INVENTORY_SLOTS = 24;
export const MAX_STORAGE_BOX_SLOTS = 40;

export const CRAFTING_RECIPE_MAP = new Map<string, CraftingRecipe>(
  CRAFTING_RECIPES.map((recipe) => [recipe.id, recipe])
);

export function createStarterInventorySlots(): InventorySlot[] {
  return [
    { item: 'axe_basic', quantity: 1 },
    { item: 'pickaxe_basic', quantity: 1 },
    { item: 'scythe_basic', quantity: 1 },
    { item: 'wood', quantity: 10 },
    { item: 'stone', quantity: 5 },
  ];
}

export function createStarterToolsOnlySlots(): InventorySlot[] {
  return STARTER_TOOLS.map((toolId) => ({ item: toolId, quantity: 1 }));
}

export function cloneSlots(slots: readonly InventorySlot[]): InventorySlot[] {
  return slots.map((s) => ({ item: s.item, quantity: s.quantity }));
}

export function normalizeInventorySlots(
  rawSlots: unknown,
  options?: { ensureStarter?: boolean }
): InventorySlot[] {
  const ensureStarter = options?.ensureStarter !== false;
  const clean: InventorySlot[] = [];
  const seenStarter = new Set<string>();

  if (Array.isArray(rawSlots)) {
    for (const entry of rawSlots) {
      if (!entry || typeof entry !== 'object') continue;
      const rawItem = (entry as Record<string, unknown>).item;
      const rawQty = (entry as Record<string, unknown>).quantity;
      if (typeof rawItem !== 'string') continue;
      const itemId = rawItem.trim() as ItemId;
      const def = (ITEMS as Record<string, (typeof ITEMS)[ItemId] | undefined>)[itemId];
      if (!def) continue;
      if (typeof rawQty !== 'number' || !Number.isFinite(rawQty)) continue;
      const qty = Math.floor(rawQty);
      if (qty <= 0) continue;

      if (isStarterTool(itemId)) {
        if (seenStarter.has(itemId)) continue;
        seenStarter.add(itemId);
        clean.push({ item: itemId, quantity: 1 });
        continue;
      }

      clean.push({
        item: itemId,
        quantity: Math.max(1, Math.min(def.maxStack, qty)),
      });
    }
  }

  if (ensureStarter) {
    for (const toolId of STARTER_TOOLS) {
      if (!seenStarter.has(toolId)) {
        clean.push({ item: toolId, quantity: 1 });
        seenStarter.add(toolId);
      }
    }
  }

  return clean;
}

export function normalizeStorageSlots(rawSlots: unknown): InventorySlot[] {
  if (!Array.isArray(rawSlots)) return [];
  const merged = new Map<ItemId, number>();

  for (const entry of rawSlots) {
    if (!entry || typeof entry !== 'object') continue;
    const rawItem = (entry as Record<string, unknown>).item;
    const rawQty = (entry as Record<string, unknown>).quantity;
    if (typeof rawItem !== 'string') continue;
    const itemId = rawItem.trim() as ItemId;
    if (isStarterTool(itemId)) continue;
    const def = (ITEMS as Record<string, (typeof ITEMS)[ItemId] | undefined>)[itemId];
    if (!def) continue;
    if (typeof rawQty !== 'number' || !Number.isFinite(rawQty)) continue;
    const qty = Math.floor(rawQty);
    if (qty <= 0) continue;
    const prev = merged.get(itemId) ?? 0;
    merged.set(itemId, Math.min(9999, prev + qty));
  }

  const out: InventorySlot[] = [];
  for (const [item, quantity] of merged.entries()) {
    if (out.length >= MAX_STORAGE_BOX_SLOTS) break;
    out.push({ item, quantity });
  }
  return out;
}

export function normalizeOwnedClothingList(rawOwned: unknown): string[] {
  if (!Array.isArray(rawOwned)) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const entry of rawOwned) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (AUNTY_GYI_CATALOG_MAP[id] && !seen.has(id)) {
      seen.add(id);
      clean.push(id);
    }
  }
  return clean;
}

export function getItemCountInSlots(slots: readonly InventorySlot[], itemId: string): number {
  let total = 0;
  for (const slot of slots) {
    if (slot.item === itemId) {
      total += slot.quantity;
    }
  }
  return total;
}

export function hasItemInSlots(
  slots: readonly InventorySlot[],
  itemId: string,
  requiredAmount = 1
): boolean {
  if (requiredAmount <= 0) return true;
  let total = 0;
  for (const slot of slots) {
    if (slot.item === itemId) {
      total += slot.quantity;
      if (total >= requiredAmount) return true;
    }
  }
  return false;
}

export function getRemainingCapacityInSlots(
  slots: readonly InventorySlot[],
  itemId: string,
  maxSlots = MAX_INVENTORY_SLOTS
): number {
  const def = (ITEMS as Record<string, (typeof ITEMS)[ItemId] | undefined>)[itemId];
  if (!def) return 0;

  let capacity = 0;
  for (const slot of slots) {
    if (slot.item === itemId && slot.quantity < def.maxStack) {
      capacity += def.maxStack - slot.quantity;
    }
  }
  const emptySlots = Math.max(0, maxSlots - slots.length);
  capacity += emptySlots * def.maxStack;
  return capacity;
}

export function canFitInSlots(
  slots: readonly InventorySlot[],
  itemId: string,
  amount = 1,
  maxSlots = MAX_INVENTORY_SLOTS
): boolean {
  if (amount <= 0) return true;
  return getRemainingCapacityInSlots(slots, itemId, maxSlots) >= amount;
}

export function addItemToSlots(
  slots: InventorySlot[],
  itemId: ItemId | string,
  amount = 1,
  maxSlots = MAX_INVENTORY_SLOTS
): boolean {
  const def = (ITEMS as Record<string, (typeof ITEMS)[ItemId] | undefined>)[itemId];
  if (!def || !Number.isFinite(amount) || amount <= 0) return false;

  const cleanAmount = Math.floor(amount);
  if (!canFitInSlots(slots, itemId, cleanAmount, maxSlots)) {
    return false;
  }

  let remaining = cleanAmount;
  for (const slot of slots) {
    if (slot.item === itemId && slot.quantity < def.maxStack) {
      const space = def.maxStack - slot.quantity;
      const toAdd = Math.min(space, remaining);
      slot.quantity += toAdd;
      remaining -= toAdd;
      if (remaining <= 0) break;
    }
  }

  while (remaining > 0 && slots.length < maxSlots) {
    const toAdd = Math.min(def.maxStack, remaining);
    slots.push({ item: itemId as ItemId, quantity: toAdd });
    remaining -= toAdd;
  }

  return remaining === 0;
}

export function removeItemFromSlots(
  slots: InventorySlot[],
  itemId: string,
  amount = 1
): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const cleanAmount = Math.floor(amount);
  if (!hasItemInSlots(slots, itemId, cleanAmount)) return false;

  let remaining = cleanAmount;
  for (let i = slots.length - 1; i >= 0; i--) {
    const slot = slots[i];
    if (slot.item === itemId) {
      if (slot.quantity <= remaining) {
        remaining -= slot.quantity;
        slots.splice(i, 1);
      } else {
        slot.quantity -= remaining;
        remaining = 0;
      }
      if (remaining <= 0) break;
    }
  }
  return remaining === 0;
}
