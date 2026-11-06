/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Package, X, ArrowLeftRight } from 'lucide-react';
import { ITEMS } from '../game/constants';
import { InventorySystem } from '../game/systems/InventorySystem';
import { ItemId, PlacedBuilding } from '../game/types';
import { SoundSynth } from '../game/utils/SoundSynth';

interface StorageBoxModalProps {
  building: PlacedBuilding;
  inventory: InventorySystem;
  onClose: () => void;
}

export const StorageBoxModal: React.FC<StorageBoxModalProps> = ({
  building,
  inventory,
  onClose,
}) => {
  if (!building.storage) {
    building.storage = [];
  }
  const [_, setRenderTick] = useState(0);

  const depositItem = (itemId: ItemId) => {
    if (!inventory.hasItem(itemId, 1)) return;
    inventory.removeItem(itemId, 1);

    const existing = building.storage!.find((s) => s.item === itemId);
    if (existing) {
      existing.quantity += 1;
    } else {
      building.storage!.push({ item: itemId, quantity: 1 });
    }

    SoundSynth.playSuccess();
    setRenderTick((t) => t + 1);
  };

  const withdrawItem = (itemId: ItemId) => {
    const existing = building.storage!.find((s) => s.item === itemId);
    if (!existing || existing.quantity <= 0) return;

    existing.quantity -= 1;
    if (existing.quantity <= 0) {
      building.storage = building.storage!.filter((s) => s.item !== itemId);
    }

    inventory.addItem(itemId, 1);
    SoundSynth.playSuccess();
    setRenderTick((t) => t + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
              <Package size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">သစ်သားသိုလှောင်သေတ္တာ (Storage Chest)</h2>
              <p className="text-xs text-stone-400">
                ပိုလျှံသော ပစ္စည်းများ ထည့်သွင်းသိမ်းဆည်းခြင်းနှင့် ပြန်လည်ထုတ်ယူခြင်း
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

        {/* Content: 2 split columns (Chest contents on left, Player bag on right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 p-6 gap-6 overflow-y-auto">
          {/* Storage Box Inventory */}
          <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-2">
                <span>📦</span>
                <span>သေတ္တာအတွင်းရှိ ပစ္စည်းများ ({building.storage.length} မျိုး)</span>
              </div>

              {building.storage.length === 0 ? (
                <div className="text-stone-500 text-xs py-8 text-center italic">
                  သေတ္တာထဲတွင် ပစ္စည်းမရှိသေးပါ။ မိမိအိတ်ထဲမှ ထည့်သွင်းသိမ်းဆည်းပါ။
                </div>
              ) : (
                <div className="space-y-2">
                  {building.storage.map((slot) => {
                    const def = ITEMS[slot.item];
                    return (
                      <div
                        key={slot.item}
                        className="flex items-center justify-between p-2 rounded-lg bg-stone-900 border border-stone-800 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span>{def.icon}</span>
                          <span className="font-semibold text-white">{def.name}</span>
                          <span className="text-stone-400 font-mono">x{slot.quantity}</span>
                        </div>
                        <button
                          onClick={() => withdrawItem(slot.item)}
                          className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-emerald-400 font-bold transition cursor-pointer text-[11px]"
                        >
                          ထုတ်ယူမည်
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Player Bag Inventory */}
          <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-stone-300 mb-3 flex items-center gap-2">
                <span>🎒</span>
                <span>သင့်လွယ်အိတ် ({inventory.slots.length} မျိုး)</span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {inventory.slots.map((slot, index) => {
                  const def = ITEMS[slot.item];
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 rounded-lg bg-stone-900 border border-stone-800 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span>{def.icon}</span>
                        <span className="font-semibold text-white">{def.name}</span>
                        <span className="text-stone-400 font-mono">x{slot.quantity}</span>
                      </div>
                      <button
                        onClick={() => depositItem(slot.item)}
                        className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-amber-300 font-bold transition cursor-pointer text-[11px]"
                      >
                        ထည့်မည်
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
