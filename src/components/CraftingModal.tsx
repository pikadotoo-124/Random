/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Compass, Flame, Hammer, X } from 'lucide-react';
import { getResourceSourceHintMy, ITEMS } from '../game/constants';
import { CraftingSystem } from '../game/systems/CraftingSystem';
import { InventorySystem } from '../game/systems/InventorySystem';
import { SoundSynth } from '../game/utils/SoundSynth';
import { UI_THEME, getCategoryLabelMy } from './uiTheme';

interface CraftingModalProps {
  craftingSystem: CraftingSystem;
  inventory: InventorySystem;
  isNearWorkbench: boolean;
  isNearCampfire: boolean;
  onCraftRecipe?: (recipeId: string) => Promise<{ ok: boolean; reason?: string }>;
  onCrafted?: () => void;
  onGuideToCraftStation?: () => void;
  onClose: () => void;
}

export const CraftingModal: React.FC<CraftingModalProps> = ({
  craftingSystem,
  inventory,
  isNearWorkbench,
  isNearCampfire,
  onCraftRecipe,
  onCrafted,
  onGuideToCraftStation,
  onClose,
}) => {
  const alreadyHasRod = inventory.hasItem('rod_basic', 1);
  const initialRecipeId =
    alreadyHasRod && craftingSystem.recipes[1]
      ? craftingSystem.recipes[1].id
      : craftingSystem.recipes[0].id;
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(initialRecipeId);
  const [isCraftingPending, setIsCraftingPending] = useState(false);
  const [craftFeedback, setCraftFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const selectedRecipe =
    craftingSystem.recipes.find((r) => r.id === selectedRecipeId) || craftingSystem.recipes[0];
  const targetItemDef = ITEMS[selectedRecipe.resultItem];

  const craftStatus = craftingSystem.canCraft(
    selectedRecipe,
    inventory,
    isNearWorkbench,
    isNearCampfire,
  );
  const canFitResult = inventory.canFitItem(selectedRecipe.resultItem, selectedRecipe.resultCount);
  const canExecuteCraft = craftStatus.can && canFitResult && !isCraftingPending;

  const handleCraft = async () => {
    if (!canExecuteCraft) {
      SoundSynth.playRustle();
      return;
    }

    if (onCraftRecipe) {
      setIsCraftingPending(true);
      setCraftFeedback(null);
      try {
        const res = await onCraftRecipe(selectedRecipe.id);
        if (res.ok) {
          SoundSynth.playSuccess();
          setCraftFeedback({ ok: true, text: `${targetItemDef.name} ဖန်တီးပြီးပါပြီ!` });
        } else {
          SoundSynth.playRustle();
          setCraftFeedback({ ok: false, text: res.reason || 'ဖန်တီးမှု မအောင်မြင်ပါ' });
        }
      } finally {
        setIsCraftingPending(false);
      }
      return;
    }

    const success = craftingSystem.craft(
      selectedRecipe,
      inventory,
      isNearWorkbench,
      isNearCampfire,
    );
    if (success) {
      SoundSynth.playSuccess();
      onCrafted?.();
    }
  };

  return (
    <div className={UI_THEME.backdrop} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${UI_THEME.panel} max-w-2xl`}
      >
        {/* Header */}
        <div className={UI_THEME.header}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-950/70 border border-sky-700/50 flex items-center justify-center text-sky-300 shrink-0">
              <Hammer size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight leading-snug truncate">
                ပစ္စည်းဖန်တီးခြင်းလုပ်ငန်းခုံ
              </h2>
              <p className="text-xs text-[#b7ad9d] leading-snug truncate">
                ကိရိယာများ၊ အဆောက်အအုံများနှင့် ရှင်သန်ရေးပစ္စည်းများ ဖန်တီးပါ
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="ပိတ်မည်"
            className={UI_THEME.closeBtn}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 p-4 sm:p-6 gap-4 sm:gap-5 overflow-y-auto">
          {/* Recipe List */}
          <div className="space-y-2 pr-0.5">
            <div className="text-xs font-bold text-[#c7beae] mb-2">
              ဖန်တီးနိုင်သော ပုံစံငယ်များ
            </div>
            {craftingSystem.recipes.map((recipe) => {
              const def = ITEMS[recipe.resultItem];
              const isSelected = recipe.id === selectedRecipeId;
              const canCraftThis = craftingSystem.canCraft(
                recipe,
                inventory,
                isNearWorkbench,
                isNearCampfire,
              ).can;

              return (
                <button
                  key={recipe.id}
                  type="button"
                  onClick={() => setSelectedRecipeId(recipe.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition cursor-pointer gap-2 ${
                    isSelected
                      ? 'border-sky-400/80 bg-sky-950/30 shadow-md ring-1 ring-sky-400/25'
                      : 'border-[#332c23] bg-[#14110e]/75 hover:border-[#4e4437] hover:bg-[#1f1b16]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0">{def.icon}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white flex items-center gap-1.5 leading-snug">
                        <span className="truncate">{def.name}</span>
                        {recipe.resultCount > 1 && (
                          <span className="text-xs text-sky-300 font-mono shrink-0">
                            x{recipe.resultCount}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#9e9484] line-clamp-1 leading-snug">
                        {def.description}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {recipe.resultItem === 'rod_basic' && inventory.hasItem('rod_basic', 1) ? (
                      <span className="text-[10px] text-sky-300 font-semibold px-1.5 py-0.5 rounded bg-sky-950/70 border border-sky-700/45">
                        ရှိပြီး
                      </span>
                    ) : canCraftThis ? (
                      <span className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/35 text-emerald-300 flex items-center justify-center text-xs font-bold">
                        ✓
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#7e7465] font-medium px-1.5 py-0.5 rounded bg-[#211d17] border border-[#332c23]">
                        မပြည့်စုံ
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Recipe Detail & Craft Action */}
          <div className={`${UI_THEME.subCard} p-4 sm:p-5 flex flex-col justify-between`}>
            <div className="space-y-4">
              <div className="flex items-center gap-3 border-b border-[#322c23] pb-4">
                <div className="w-14 h-14 rounded-xl bg-[#252019] border border-[#463c2f] flex items-center justify-center text-3xl shrink-0">
                  {targetItemDef.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-white text-base leading-snug">
                    {targetItemDef.name}
                  </h3>
                  <div className="flex items-center flex-wrap gap-2 mt-1">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-sky-950/80 text-sky-300 border border-sky-700/50">
                      ရရှိမည့်အရေအတွက်: x{selectedRecipe.resultCount}
                    </span>
                    <span className="text-xs text-[#b7ad9d]">
                      {getCategoryLabelMy(targetItemDef.category)}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-[#c7beae] leading-relaxed">
                {targetItemDef.description}
              </p>

              {/* Required Ingredients */}
              <div>
                <div className="text-xs font-bold text-[#c7beae] mb-2">
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
                        className="p-2.5 rounded-xl bg-[#1b1713] border border-[#332c23] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-lg shrink-0">{ingDef.icon}</span>
                            <span className="font-semibold text-white truncate">{ingDef.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 font-mono shrink-0">
                            <span
                              className={
                                hasEnough ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'
                              }
                            >
                              {currentHave}
                            </span>
                            <span className="text-[#6e6456]">/</span>
                            <span className="text-stone-200">{ing.quantity}</span>
                            {hasEnough ? (
                              <span className="text-emerald-400 text-xs">✓</span>
                            ) : (
                              <span className="text-rose-400 text-xs">✗</span>
                            )}
                          </div>
                        </div>
                        {!hasEnough && (
                          <div className="flex items-center justify-between text-[11px] text-amber-300/90 pl-7">
                            <span>{getResourceSourceHintMy(ing.item)}</span>
                            <span className="text-rose-300 font-semibold shrink-0">
                              +{ing.quantity - currentHave} လိုသည်
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Station notice */}
              {selectedRecipe.requiresCampfire && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-orange-950/45 border border-orange-700/50 text-xs text-orange-200 leading-snug">
                  <Flame size={15} className="shrink-0 text-orange-400" />
                  <span>
                    {isNearCampfire
                      ? 'မီးဖိုအနီးတွင် ရှိနေပါသည် — ချက်ပြုတ်နိုင်ပါပြီ'
                      : 'မီးလင်းနေသော မီးဖို (Campfire) အနီးတွင်သာ ချက်ပြုတ်နိုင်သည်'}
                  </span>
                </div>
              )}

              {!isNearWorkbench && !selectedRecipe.requiresCampfire && onGuideToCraftStation && (
                <button
                  type="button"
                  onClick={() => {
                    onGuideToCraftStation();
                    onClose();
                  }}
                  className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-sky-950/35 hover:bg-sky-950/55 border border-sky-700/40 text-xs text-sky-200 transition cursor-pointer"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Compass size={14} className="text-sky-400 shrink-0" />
                    <span className="truncate">Crafting Station [33, 25] လမ်းညွှန်ပြပါ</span>
                  </span>
                  <span className="text-[10px] font-semibold text-sky-300 shrink-0">သွားမည် →</span>
                </button>
              )}
            </div>

            {/* Craft Button */}
            <div className="pt-4 mt-4 border-t border-[#322c23] space-y-2">
              {!canFitResult && craftStatus.can && (
                <div className="text-[11px] font-medium text-rose-300">
                  🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိပါ
                </div>
              )}
              {craftFeedback && (
                <div
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border leading-snug ${
                    craftFeedback.ok
                      ? 'bg-emerald-950/45 border-emerald-500/35 text-emerald-200'
                      : 'bg-rose-950/45 border-rose-500/35 text-rose-200'
                  }`}
                >
                  {craftFeedback.text}
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleCraft()}
                disabled={!canExecuteCraft}
                className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 ${
                  canExecuteCraft
                    ? 'bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white shadow-lg shadow-sky-950/50 border border-sky-400/30 transition active:scale-[0.98] cursor-pointer'
                    : UI_THEME.disabledBtn
                }`}
              >
                <Hammer size={16} />
                <span>
                  {isCraftingPending ? 'ဖန်တီးနေသည်...' : `${targetItemDef.name} ဖန်တီးမည်`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
