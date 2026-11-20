/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { X, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { ITEMS, MERCHANT_CATALOG, SHOP_CATEGORIES, isStarterTool } from '../game/constants';
import { InventorySystem } from '../game/systems/InventorySystem';
import { ItemId, ShopCategoryId } from '../game/types';
import { SoundSynth } from '../game/utils/SoundSynth';
import { UI_THEME } from './uiTheme';

interface ShopModalProps {
  inventory: InventorySystem;
  onSold?: (goldEarned: number) => void;
  onClose: () => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({ inventory, onSold, onClose }) => {
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [activeCategory, setActiveCategory] = useState<ShopCategoryId>('building_materials');

  const filteredCatalog = useMemo(
    () =>
      MERCHANT_CATALOG.filter(
        (entry) => entry.category === activeCategory && !isStarterTool(entry.id)
      ),
    [activeCategory]
  );

  const sellableSlots = useMemo(
    () =>
      inventory.slots
        .map((slot, index) => ({ slot, index }))
        .filter(({ slot }) => !isStarterTool(slot.item)),
    [inventory.slots]
  );

  const handleBuy = (itemId: ItemId, price: number) => {
    if (isStarterTool(itemId) || inventory.coins < price) {
      SoundSynth.playRustle();
      return;
    }
    inventory.addCoins(-price);
    inventory.addItem(itemId, 1);
    SoundSynth.playCoin();
  };

  const handleSell = (itemId: ItemId, sellPrice: number) => {
    if (isStarterTool(itemId) || sellPrice <= 0 || !inventory.hasItem(itemId, 1)) return;
    inventory.removeItem(itemId, 1);
    inventory.addCoins(sellPrice);
    SoundSynth.playCoin();
    onSold?.(sellPrice);
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
            <div className="w-10 h-10 rounded-xl bg-amber-950/75 border border-amber-700/55 flex items-center justify-center text-amber-300 text-xl shrink-0">
              🏪
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight leading-snug truncate">
                ဘားနဘီ၏ အထွေထွေကုန်စုံဆိုင်
              </h2>
              <p className="text-xs text-[#b7ad9d] leading-snug truncate">
                မြို့လယ်ပလာဇာရှိ ကုန်စည်နှင့် အလှဆင်ပစ္စည်း အရောင်းအဝယ်ဆိုင်
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className={UI_THEME.goldBadge}>
              <span>🪙</span>
              <span className="font-mono">{inventory.coins}</span>
              <span>ရွှေ</span>
            </div>

            <button
              onClick={onClose}
              aria-label="ပိတ်မည်"
              className={UI_THEME.closeBtn}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#3a3329] bg-[#171410] px-4 sm:px-6 pt-2.5 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('buy')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-bold text-xs transition cursor-pointer ${
              activeTab === 'buy'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-[#9e9484] hover:text-stone-200'
            }`}
          >
            <ArrowDownLeft size={15} />
            <span>ပစ္စည်းများ ဝယ်ယူရန်</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sell')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-bold text-xs transition cursor-pointer ${
              activeTab === 'sell'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-[#9e9484] hover:text-stone-200'
            }`}
          >
            <ArrowUpRight size={15} />
            <span>ပစ္စည်းများ ရောင်းချရန်</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3">
          {activeTab === 'buy' ? (
            <div className="space-y-3">
              {/* 4 Clean Category Tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SHOP_CATEGORIES.map((cat) => {
                  const isActive = cat.id === activeCategory;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-bold transition cursor-pointer min-w-0 ${
                        isActive
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm'
                          : 'bg-[#14110e]/85 border-[#342d24] text-[#b7ad9d] hover:border-[#4e4336] hover:text-white'
                      }`}
                    >
                      <span className="shrink-0">{cat.icon}</span>
                      <span className="truncate">{cat.shortLabel}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredCatalog.map((item) => {
                  const def = ITEMS[item.id];
                  const canAfford = inventory.coins >= item.price;

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#14110e]/85 border border-[#342d24] hover:border-[#4e4336] transition gap-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl shrink-0">{def.icon}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate leading-snug">
                            {def.name}
                          </div>
                          <div className="text-[11px] text-amber-300 font-mono font-bold">
                            🪙 {item.price} ရွှေ
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleBuy(item.id, item.price)}
                        disabled={!canAfford}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                          canAfford ? UI_THEME.primaryAmberBtn : UI_THEME.disabledBtn
                        }`}
                      >
                        ဝယ်ယူမည်
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-xs text-[#b7ad9d] mb-3 flex items-center justify-between gap-2 flex-wrap">
                <span>ရွှေဒင်္ဂါးရရှိရန် မိမိအိတ်ထဲမှ ပစ္စည်းများကို ရောင်းချပါ:</span>
                <span className="font-mono text-[#d4cbbd]">{sellableSlots.length} မျိုး ရောင်းချနိုင်သည်</span>
              </div>

              {sellableSlots.length === 0 ? (
                <div className={`${UI_THEME.subCard} p-8 text-center text-[#968c7c] text-xs sm:text-sm leading-relaxed`}>
                  သင့်အိတ်ထဲတွင် ရောင်းချရန် ပစ္စည်းမရှိသေးပါ (အခြေခံကိရိယာများကို ရောင်းချ၍မရပါ)။ မြို့ပြင်တွင် သစ်ခုတ်၊ ကျောက်ခွဲ၊ ငါးမျှားနိုင်ပါသည်။
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sellableSlots.map(({ slot, index }) => {
                    const def = ITEMS[slot.item];

                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-xl bg-[#14110e]/85 border border-[#342d24] hover:border-[#4e4336] transition gap-2"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-2xl shrink-0">{def.icon}</span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white flex items-center gap-1.5 leading-snug">
                              <span className="truncate">{def.name}</span>
                              <span className="font-mono text-[#a99f8e] text-[11px] shrink-0">
                                (x{slot.quantity})
                              </span>
                            </div>
                            <div className="text-[11px] text-amber-300 font-mono">
                              +{def.sellPrice} ရွှေ
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSell(slot.item, def.sellPrice)}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-500/18 hover:bg-amber-500/28 text-amber-200 border border-amber-500/40 text-xs font-bold transition active:scale-95 cursor-pointer"
                          >
                            ၁ ခုရောင်း
                          </button>
                          {slot.quantity >= 5 && (
                            <button
                              type="button"
                              onClick={() => {
                                for (let i = 0; i < 5; i++) {
                                  handleSell(slot.item, def.sellPrice);
                                }
                              }}
                              className="px-2 py-1.5 rounded-lg bg-[#2a241d] hover:bg-[#383027] border border-[#463c2f] text-stone-200 text-xs font-mono transition cursor-pointer"
                            >
                              x5
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
