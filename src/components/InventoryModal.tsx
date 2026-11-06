/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Trash2, ArrowRight } from 'lucide-react';
import { ITEMS } from '../game/constants';
import { InventorySystem } from '../game/systems/InventorySystem';
import { InventorySlot, ItemId } from '../game/types';

interface InventoryModalProps {
  inventory: InventorySystem;
  onClose: () => void;
  onSelectBuilding?: (type: any) => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  inventory,
  onClose,
  onSelectBuilding,
}) => {
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(0);

  const slots = inventory.slots;
  const totalSlots = inventory.maxSlots;

  // Selected item definition
  const selectedSlot = selectedSlotIndex !== null ? slots[selectedSlotIndex] : null;
  const selectedDef = selectedSlot ? ITEMS[selectedSlot.item] : null;

  const handleDiscard = () => {
    if (selectedSlotIndex === null || !selectedSlot) return;
    inventory.removeItem(selectedSlot.item, 1);
    if (inventory.slots.length === 0) {
      setSelectedSlotIndex(null);
    } else if (selectedSlotIndex >= inventory.slots.length) {
      setSelectedSlotIndex(inventory.slots.length - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/40">
          <div className="flex items-center gap-3">
            <span className="text-xl">🎒</span>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">ခရီးသွားလွယ်အိတ် (Backpack)</h2>
              <p className="text-xs text-stone-400">
                {slots.length} / {totalSlots} နေရာ အသုံးပြုထားသည်
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

        {/* Content Body: Grid & Detail Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 p-6 gap-6 overflow-y-auto">
          {/* Inventory Grid (2 columns on left) */}
          <div className="md:col-span-2">
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
              {Array.from({ length: totalSlots }).map((_, index) => {
                const slot = slots[index];
                const def = slot ? ITEMS[slot.item] : null;
                const isSelected = selectedSlotIndex === index;

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedSlotIndex(slot ? index : null)}
                    className={`relative aspect-square rounded-xl border flex flex-col items-center justify-center p-1.5 transition cursor-pointer select-none ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/15 ring-2 ring-amber-500/30'
                        : slot
                        ? 'border-stone-700/80 bg-stone-800/80 hover:border-stone-500 hover:bg-stone-800'
                        : 'border-stone-800/60 bg-stone-950/40'
                    }`}
                  >
                    {slot && def ? (
                      <>
                        <span className="text-2xl mb-1">{def.icon}</span>
                        <span className="absolute bottom-1 right-1.5 font-mono text-[11px] font-bold text-stone-200 bg-stone-950/80 px-1 rounded">
                          {slot.quantity}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] text-stone-700 font-mono">
                        {index + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Item Details Panel */}
          <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4 flex flex-col justify-between">
            {selectedSlot && selectedDef ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 border-b border-stone-800 pb-3">
                  <div className="w-12 h-12 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center text-3xl">
                    {selectedDef.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm leading-tight">
                      {selectedDef.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-stone-800 text-stone-300">
                        {selectedDef.category}
                      </span>
                      <span className="text-xs text-amber-400 font-mono">
                        🪙 {selectedDef.sellPrice} ရွှေ
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-stone-400 leading-relaxed">
                  {selectedDef.description}
                </p>

                <div className="text-xs text-stone-400 space-y-1 bg-stone-900/80 p-2.5 rounded-lg border border-stone-800/80">
                  <div className="flex justify-between">
                    <span>အိတ်ထဲရှိ အရေအတွက်:</span>
                    <span className="font-mono text-white font-bold">{selectedSlot.quantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>အများဆုံးထည့်နိုင်မှု:</span>
                    <span className="font-mono text-stone-300">{selectedDef.maxStack}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>စုစုပေါင်းတန်ဖိုး:</span>
                    <span className="font-mono text-amber-300 font-bold">
                      {selectedSlot.quantity * selectedDef.sellPrice} ရွှေ
                    </span>
                  </div>
                </div>

                {selectedDef.category === 'building' && onSelectBuilding && (
                  <button
                    onClick={() => {
                      onSelectBuilding(selectedDef.id);
                      onClose();
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>မြေပုံပေါ်တွင် တည်ဆောက်မည်</span>
                    <ArrowRight size={14} />
                  </button>
                )}

                <button
                  onClick={handleDiscard}
                  className="w-full py-1.5 px-3 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>၁ ခု စွန့်ပစ်မည်</span>
                </button>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-stone-500">
                <span className="text-3xl mb-2">📦</span>
                <span className="text-xs font-medium">ပစ္စည်းအချက်အလက်များ ကြည့်ရှုရန် အကွက်တစ်ခုကို ရွေးချယ်ပါ</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
