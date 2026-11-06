/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Hammer, X, Check, Flame, AlertCircle } from 'lucide-react';
import { ITEMS } from '../game/constants';
import { CraftingSystem } from '../game/systems/CraftingSystem';
import { InventorySystem } from '../game/systems/InventorySystem';
import { CraftingRecipe } from '../game/types';
import { SoundSynth } from '../game/utils/SoundSynth';

interface CraftingModalProps {
  craftingSystem: CraftingSystem;
  inventory: InventorySystem;
  isNearWorkbench: boolean;
  isNearCampfire: boolean;
  onClose: () => void;
}

export const CraftingModal: React.FC<CraftingModalProps> = ({
  craftingSystem,
  inventory,
  isNearWorkbench,
  isNearCampfire,
  onClose,
}) => {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(craftingSystem.recipes[0].id);

  const selectedRecipe = craftingSystem.recipes.find((r) => r.id === selectedRecipeId) || craftingSystem.recipes[0];
  const targetItemDef = ITEMS[selectedRecipe.resultItem];

  const craftStatus = craftingSystem.canCraft(selectedRecipe, inventory, isNearWorkbench, isNearCampfire);

  const handleCraft = () => {
    if (!craftStatus.can) return;
    const success = craftingSystem.craft(selectedRecipe, inventory, isNearWorkbench, isNearCampfire);
    if (success) {
      SoundSynth.playSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400">
              <Hammer size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">ပစ္စည်းဖန်တီးခြင်းလုပ်ငန်းခုံ (Crafting)</h2>
              <p className="text-xs text-stone-400">
                ကိရိယာများ၊ အဆောက်အအုံများနှင့် ရှင်သန်ရေးပစ္စည်းများ ဖန်တီးပါ
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 p-6 gap-6 overflow-y-auto">
          {/* Recipe List */}
          <div className="space-y-2 pr-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">
              ဖန်တီးနိုင်သော ပုံစံငယ်များ
            </div>
            {craftingSystem.recipes.map((recipe) => {
              const def = ITEMS[recipe.resultItem];
              const isSelected = recipe.id === selectedRecipeId;
              const canCraftThis = craftingSystem.canCraft(recipe, inventory, isNearWorkbench, isNearCampfire).can;

              return (
                <button
                  key={recipe.id}
                  onClick={() => setSelectedRecipeId(recipe.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition cursor-pointer ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-950/30 shadow-md'
                      : 'border-stone-800 bg-stone-950/40 hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{def.icon}</span>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>{def.name}</span>
                        {recipe.resultCount > 1 && (
                          <span className="text-xs text-cyan-400 font-mono">
                            x{recipe.resultCount}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-stone-400 line-clamp-1">
                        {def.description}
                      </span>
                    </div>
                  </div>

                  <div>
                    {canCraftThis ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">
                        ✓
                      </span>
                    ) : (
                      <span className="text-[10px] text-stone-500 font-mono">
                        ပစ္စည်းမပြည့်
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Recipe Detail & Craft Action */}
          <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-5 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="flex items-center gap-3 border-b border-stone-800 pb-4">
                <div className="w-14 h-14 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center text-3xl">
                  {targetItemDef.icon}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    {targetItemDef.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                      ရရှိမည့်အရေအတွက်: x{selectedRecipe.resultCount}
                    </span>
                    <span className="text-xs text-stone-400 capitalize">
                      {targetItemDef.category}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-stone-300 leading-relaxed">
                {targetItemDef.description}
              </p>

              {/* Required Ingredients */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2.5">
                  လိုအပ်သော ပစ္စည်းများ
                </div>
                <div className="space-y-2">
                  {selectedRecipe.ingredients.map((ing) => {
                    const ingDef = ITEMS[ing.item];
                    const currentHave = inventory.getItemCount(ing.item);
                    const hasEnough = currentHave >= ing.quantity;

                    return (
                      <div
                        key={ing.item}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-stone-900 border border-stone-800 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{ingDef.icon}</span>
                          <span className="font-medium text-white">{ingDef.name}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span
                            className={hasEnough ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}
                          >
                            {currentHave}
                          </span>
                          <span className="text-stone-500">/</span>
                          <span className="text-stone-300">{ing.quantity}</span>
                          {hasEnough ? (
                            <span className="text-emerald-400 text-xs">✓</span>
                          ) : (
                            <span className="text-red-400 text-xs">✗</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Station notice */}
              {selectedRecipe.requiresCampfire && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-orange-950/40 border border-orange-800/60 text-xs text-orange-300">
                  <Flame size={15} className="shrink-0" />
                  <span>မီးလင်းနေသော မီးဖိုအနီးတွင် ရှိရန်လိုအပ်သည်</span>
                </div>
              )}
            </div>

            {/* Craft Button */}
            <div className="pt-4 mt-4 border-t border-stone-800">
              <button
                onClick={handleCraft}
                disabled={!craftStatus.can}
                className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                  craftStatus.can
                    ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white shadow-lg shadow-cyan-950/50 active:scale-[0.99]'
                    : 'bg-stone-800 text-stone-500 border border-stone-700/60 cursor-not-allowed'
                }`}
              >
                <Hammer size={16} />
                <span>{targetItemDef.name} ဖန်တီးမည်</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
