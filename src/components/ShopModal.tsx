/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Coins, X, ShoppingBag, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { ITEMS } from '../game/constants';
import { InventorySystem } from '../game/systems/InventorySystem';
import { ItemId } from '../game/types';
import { SoundSynth } from '../game/utils/SoundSynth';

interface ShopModalProps {
  inventory: InventorySystem;
  onClose: () => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({ inventory, onClose }) => {
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('sell');

  // Items for sale by merchant
  const merchantCatalog: { id: ItemId; price: number }[] = [
    { id: 'axe_basic', price: 25 },
    { id: 'pickaxe_basic', price: 25 },
    { id: 'rod_basic', price: 25 },
    { id: 'wood', price: 4 },
    { id: 'stone', price: 6 },
    { id: 'fiber', price: 3 },
    { id: 'campfire', price: 18 },
    { id: 'storage_box', price: 35 },
    { id: 'house_small', price: 120 },
    { id: 'house_medium', price: 220 },
    { id: 'house_large', price: 360 },
    { id: 'cooked_meat', price: 20 },
    { id: 'grilled_fish', price: 25 },
  ];

  const handleBuy = (itemId: ItemId, price: number) => {
    if (inventory.coins < price) {
      SoundSynth.playRustle();
      return;
    }
    inventory.addCoins(-price);
    inventory.addItem(itemId, 1);
    SoundSynth.playCoin();
  };

  const handleSell = (itemId: ItemId, sellPrice: number) => {
    if (!inventory.hasItem(itemId, 1)) return;
    inventory.removeItem(itemId, 1);
    inventory.addCoins(sellPrice);
    SoundSynth.playCoin();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-800 flex items-center justify-center text-amber-400 text-xl">
              🏪
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                ဘားနဘီ၏ အထွေထွေကုန်စုံဆိုင် (Merchant Shop)
              </h2>
              <p className="text-xs text-stone-400">
                မြို့လယ်ပလာဇာရှိ ကုန်စည်နှင့် သယံဇာတ အရောင်းအဝယ်ဆိုင်
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 font-bold text-xs">
              <span>🪙</span>
              <span className="font-mono">{inventory.coins}</span> ရွှေ
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-stone-800 bg-stone-950/20 px-6 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('sell')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 font-bold text-xs transition cursor-pointer ${
              activeTab === 'sell'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <ArrowUpRight size={15} />
            <span>ပစ္စည်းများ ရောင်းချရန်</span>
          </button>

          <button
            onClick={() => setActiveTab('buy')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 font-bold text-xs transition cursor-pointer ${
              activeTab === 'buy'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <ArrowDownLeft size={15} />
            <span>ပစ္စည်းများ ဝယ်ယူရန်</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-3">
          {activeTab === 'sell' ? (
            /* Sell goods from inventory */
            <div>
              <div className="text-xs text-stone-400 mb-3 flex items-center justify-between">
                <span>ရွှေဒင်္ဂါးရရှိရန် မိမိအိတ်ထဲမှ ပစ္စည်းများကို ရောင်းချပါ:</span>
                <span className="font-mono">{inventory.slots.length} မျိုး အိတ်ထဲရှိသည်</span>
              </div>

              {inventory.slots.length === 0 ? (
                <div className="p-8 text-center bg-stone-950/40 rounded-xl border border-stone-800 text-stone-500 text-sm">
                  သင့်အိတ်ထဲတွင် ရောင်းချရန် ပစ္စည်းမရှိသေးပါ။ မြို့ပြင်တွင် သစ်ခုတ်၊ ကျောက်ခွဲ၊ ငါးမျှားနိုင်ပါသည်။
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {inventory.slots.map((slot, index) => {
                    const def = ITEMS[slot.item];

                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-xl bg-stone-950/50 border border-stone-800 hover:border-stone-700 transition"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{def.icon}</span>
                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>{def.name}</span>
                              <span className="font-mono text-stone-400 text-[11px]">
                                (x{slot.quantity})
                              </span>
                            </div>
                            <div className="text-[11px] text-amber-400 font-mono">
                              +{def.sellPrice} ရွှေ
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleSell(slot.item, def.sellPrice)}
                            className="px-2.5 py-1 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition active:scale-95 cursor-pointer"
                          >
                            ၁ ခုရောင်း
                          </button>
                          {slot.quantity >= 5 && (
                            <button
                              onClick={() => {
                                for (let i = 0; i < 5; i++) {
                                  handleSell(slot.item, def.sellPrice);
                                }
                              }}
                              className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-mono transition cursor-pointer"
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
          ) : (
            /* Buy goods from merchant */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {merchantCatalog.map((item) => {
                const def = ITEMS[item.id];
                const canAfford = inventory.coins >= item.price;

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-stone-950/50 border border-stone-800 hover:border-stone-700 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{def.icon}</span>
                      <div>
                        <div className="text-xs font-bold text-white">{def.name}</div>
                        <div className="text-[11px] text-amber-400 font-mono font-bold">
                          🪙 {item.price} ရွှေ
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleBuy(item.id, item.price)}
                      disabled={!canAfford}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        canAfford
                          ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 active:scale-95 shadow-sm'
                          : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                      }`}
                    >
                      ဝယ်ယူမည်
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
