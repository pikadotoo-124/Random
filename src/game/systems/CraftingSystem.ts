/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CRAFTING_RECIPES } from '../constants';
import { CraftingRecipe } from '../types';
import { InventorySystem } from './InventorySystem';

export class CraftingSystem {
  public recipes: CraftingRecipe[];

  constructor() {
    this.recipes = CRAFTING_RECIPES;
  }

  /**
   * Check if a player can craft a specific recipe
   */
  public canCraft(
    recipe: CraftingRecipe,
    inventory: InventorySystem,
    nearWorkbench = false,
    nearCampfire = false
  ): { can: boolean; reason?: string } {
    if (recipe.requiresWorkbench && !nearWorkbench) {
      return { can: false, reason: 'Requires Crafting Workbench in Main City or Home' };
    }
    if (recipe.requiresCampfire && !nearCampfire) {
      return { can: false, reason: 'Requires nearby lit Campfire' };
    }

    for (const ingredient of recipe.ingredients) {
      const current = inventory.getItemCount(ingredient.item);
      if (current < ingredient.quantity) {
        return {
          can: false,
          reason: `Missing ingredients`,
        };
      }
    }

    return { can: true };
  }

  /**
   * Execute recipe craft
   */
  public craft(
    recipe: CraftingRecipe,
    inventory: InventorySystem,
    nearWorkbench = false,
    nearCampfire = false
  ): boolean {
    const check = this.canCraft(recipe, inventory, nearWorkbench, nearCampfire);
    if (!check.can) return false;

    // Deduct ingredients
    for (const ingredient of recipe.ingredients) {
      inventory.removeItem(ingredient.item, ingredient.quantity);
    }

    // Add crafted result
    inventory.addItem(recipe.resultItem, recipe.resultCount);
    return true;
  }
}
