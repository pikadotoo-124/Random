/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Package, X } from 'lucide-react';
import { ITEMS, isStarterTool } from '../game/constants';
import { InventorySystem } from '../game/systems/InventorySystem';
import { InventorySlot, ItemId, PlacedBuilding } from '../game/types';
import { SoundSynth } from '../game/utils/SoundSynth';
import { UI_THEME } from './uiTheme';

interface StorageBoxModalProps {
  building: PlacedBuilding;
  inventory: InventorySystem;
  onTransferItem?: (
    direction: 'deposit' | 'withdraw',
    itemId: ItemId,
    quantity?: number
  ) => Promise<{ ok: boolean; storage?: InventorySlot[]; reason?: string }>;
  onStorageChanged?: () => void;
  onClose: () => void;
}

export const StorageBoxModal: React.FC<StorageBoxModalProps> = ({
  building,
  inventory,
  onTransferItem,
  onStorageChanged,
  onClose,
}) => {
  if (!building.storage) {
    building.storage = [];
  }
  const [_, setRenderTick] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const depositItem = async (itemId: ItemId) => {
    if (isPending || isStarterTool(itemId) || !inventory.hasItem(itemId, 1)) return;
    setFeedback(null);

    if (onTransferItem) {
      setIsPending(true);
      try {
        const res = await onTransferItem('deposit', itemId, 1);
        if (res.ok) {
          SoundSynth.playSuccess();
          setRenderTick((t) => t + 1);
        } else {
          SoundSynth.playRustle();
          setFeedback(res.reason || 'ထည့်သွင်း၍မရပါ');
        }
      } finally {
        setIsPending(false);
      }
      return;
    }

    inventory.removeItem(itemId, 1);

    const existing = building.storage!.find((s) => s.item === itemId);
    if (existing) {
      existing.quantity += 1;
    } else {
      building.storage!.push({ item: itemId, quantity: 1 });
    }

    SoundSynth.playSuccess();
    setRenderTick((t) => t + 1);
    onStorageChanged?.();
  };

  const withdrawItem = async (itemId: ItemId) => {
    if (isPending) return;
    const existing = building.storage!.find((s) => s.item === itemId);
    if (!existing || existing.quantity <= 0) return;
    if (!inventory.canFitItem(itemId, 1)) {
      SoundSynth.playRustle();
      setFeedback('🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိပါ');
      return;
    }
    setFeedback(null);

    if (onTransferItem) {
      setIsPending(true);
      try {
        const res = await onTransferItem('withdraw', itemId, 1);
        if (res.ok) {
          SoundSynth.playSuccess();
          setRenderTick((t) => t + 1);
        } else {
          SoundSynth.playRustle();
          setFeedback(res.reason || 'ထုတ်ယူ၍မရပါ');
        }
      } finally {
        setIsPending(false);
      }
      return;
    }

    existing.quantity -= 1;
    if (existing.quantity <= 0) {
      building.storage = building.storage!.filter((s) => s.item !== itemId);
    }

    inventory.addItem(itemId, 1);
    SoundSynth.playSuccess();
    setRenderTick((t) => t + 1);
    onStorageChanged?.();
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
            <div className="w-10 h-10 rounded-xl bg-emerald-950/70 border border-emerald-700/50 flex items-center justify-center text-emerald-300 shrink-0">
              <Package size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight leading-snug truncate">
                သစ်သားသိုလှောင်သေတ္တာ
              </h2>
              <p className="text-xs text-[#b7ad9d] leading-snug truncate">
                ပိုလျှံသော ပစ္စည်းများ ထည့်သွင်းသိမ်းဆည်းခြင်းနှင့် ပြန်လည်ထုတ်ယူခြင်း
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

        {feedback && (
          <div className="mx-4 sm:mx-6 mt-3 px-3.5 py-2 rounded-xl bg-rose-950/45 border border-rose-500/35 text-xs text-rose-200">
            {feedback}
          </div>
        )}

        {/* Content: 2 split columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 p-4 sm:p-6 gap-4 sm:gap-5 overflow-y-auto">
          {/* Storage Box Inventory */}
          <div className={`${UI_THEME.subCard} p-4 flex flex-col justify-between`}>
            <div>
              <div className="text-xs font-bold text-amber-300 mb-3 flex items-center gap-2">
                <span>📦</span>
                <span>သေတ္တာအတွင်းရှိ ပစ္စည်းများ ({building.storage.length} မျိုး)</span>
              </div>

              {building.storage.length === 0 ? (
                <div className="text-[#8e8373] text-xs py-8 text-center leading-relaxed">
                  သေတ္တာထဲတွင် ပစ္စည်းမရှိသေးပါ။ မိမိအိတ်ထဲမှ ထည့်သွင်းသိမ်းဆည်းပါ။
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {building.storage.map((slot) => {
                    const def = ITEMS[slot.item];
                    const canWithdraw = !isPending && inventory.canFitItem(slot.item, 1);
                    return (
                      <div
                        key={slot.item}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-[#1b1713] border border-[#342d24] text-xs gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0">{def.icon}</span>
                          <span className="font-semibold text-white truncate">{def.name}</span>
                          <span className="text-[#a99f8e] font-mono shrink-0">x{slot.quantity}</span>
                        </div>
                        <button
                          type="button"
                          disabled={!canWithdraw}
                          onClick={() => void withdrawItem(slot.item)}
                          className={`px-2.5 py-1.5 rounded-lg font-bold transition text-[11px] shrink-0 ${
                            canWithdraw
                              ? 'bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 cursor-pointer'
                              : UI_THEME.disabledBtn
                          }`}
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
          <div className={`${UI_THEME.subCard} p-4 flex flex-col justify-between`}>
            <div>
              <div className="text-xs font-bold text-stone-200 mb-3 flex items-center gap-2">
                <span>🎒</span>
                <span>သင့်လွယ်အိတ် ({inventory.slots.length} မျိုး)</span>
              </div>

              {inventory.slots.length === 0 ? (
                <div className="text-[#8e8373] text-xs py-8 text-center leading-relaxed">
                  သင့်လွယ်အိတ်ထဲတွင် ထည့်သွင်းရန် ပစ္စည်းမရှိသေးပါ။
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {inventory.slots.map((slot, index) => {
                    const def = ITEMS[slot.item];
                    const lockedStarter = isStarterTool(slot.item);
                    const canDeposit = !isPending && !lockedStarter;
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-[#1b1713] border border-[#342d24] text-xs gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0">{def.icon}</span>
                          <span className="font-semibold text-white truncate">{def.name}</span>
                          <span className="text-[#a99f8e] font-mono shrink-0">x{slot.quantity}</span>
                        </div>
                        <button
                          type="button"
                          disabled={!canDeposit}
                          onClick={() => void depositItem(slot.item)}
                          className={`px-2.5 py-1.5 rounded-lg font-bold transition text-[11px] shrink-0 ${
                            canDeposit
                              ? 'bg-amber-500/18 hover:bg-amber-500/28 border border-amber-500/40 text-amber-200 cursor-pointer'
                              : UI_THEME.disabledBtn
                          }`}
                        >
                          {lockedStarter ? 'ကိရိယာ' : 'ထည့်မည်'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
