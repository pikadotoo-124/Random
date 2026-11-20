/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Shirt, Trash2, X } from 'lucide-react';
import {
  CLOTHING_SLOT_INFO,
  ITEMS,
  getClothingItemById,
  isStarterTool,
} from '../game/constants';
import { ClothingEquipResult, ClothingSystem } from '../game/systems/ClothingSystem';
import { InventorySystem } from '../game/systems/InventorySystem';
import { ClothingEquipmentSlot, EquippedClothingState } from '../game/types';
import { SoundSynth } from '../game/utils/SoundSynth';
import {
  CharacterOutfitPreviewCanvas,
  ClothingItemPreviewCanvas,
} from './ClothingPreviewCanvas';
import { UI_THEME, getCategoryLabelMy } from './uiTheme';

interface InventoryModalProps {
  inventory: InventorySystem;
  onClose: () => void;
  onSelectBuilding?: (type: any) => void;
  playerGender?: 'male' | 'female';
  ownedClothing?: string[];
  equippedClothing?: EquippedClothingState;
  onEquipClothing?: (itemId: string) => ClothingEquipResult;
  onUnequipClothing?: (slot: ClothingEquipmentSlot) => ClothingEquipResult;
}

const WARDROBE_SLOTS: readonly ClothingEquipmentSlot[] = [
  'hat',
  'tshirt',
  'suit',
  'pants',
  'shoes',
  'accessory',
];

export const InventoryModal: React.FC<InventoryModalProps> = ({
  inventory,
  onClose,
  onSelectBuilding,
  playerGender = 'male',
  ownedClothing = [],
  equippedClothing = {},
  onEquipClothing,
  onUnequipClothing,
}) => {
  const [activeTab, setActiveTab] = useState<'backpack' | 'wardrobe'>('backpack');
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(
    inventory.slots.length > 0 ? 0 : null
  );
  const [selectedClothingId, setSelectedClothingId] = useState<string | null>(
    ownedClothing[0] ?? null
  );
  const [previewDir, setPreviewDir] = useState<0 | 1 | 2 | 3>(0);
  const [wardrobeFeedback, setWardrobeFeedback] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  const slots = inventory.slots;
  const totalSlots = inventory.maxSlots;

  const selectedSlot = selectedSlotIndex !== null ? slots[selectedSlotIndex] : null;
  const selectedDef = selectedSlot ? ITEMS[selectedSlot.item] : null;
  const isSelectedStarter = selectedDef ? isStarterTool(selectedDef.id) : false;

  const ownedItems = useMemo(
    () =>
      ownedClothing
        .map((id) => getClothingItemById(id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [ownedClothing]
  );

  const selectedGarment = useMemo(() => {
    if (selectedClothingId) {
      const found = ownedItems.find((i) => i.itemId === selectedClothingId);
      if (found) return found;
    }
    return ownedItems[0] || null;
  }, [selectedClothingId, ownedItems]);

  const handleDiscard = () => {
    if (selectedSlotIndex === null || !selectedSlot || isStarterTool(selectedSlot.item)) return;
    inventory.removeItem(selectedSlot.item, 1);
    if (inventory.slots.length === 0) {
      setSelectedSlotIndex(null);
    } else if (selectedSlotIndex >= inventory.slots.length) {
      setSelectedSlotIndex(inventory.slots.length - 1);
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
            <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-700/50 flex items-center justify-center text-xl shrink-0">
              {activeTab === 'wardrobe' ? '👗' : '🎒'}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight leading-snug truncate">
                {activeTab === 'wardrobe' ? 'အဝတ်အစားဗီရို' : 'ခရီးသွားလွယ်အိတ်'}
              </h2>
              <p className="text-xs text-[#b7ad9d] leading-snug truncate">
                {activeTab === 'wardrobe'
                  ? `ပိုင်ဆိုင်ပြီး ဝတ်စုံ ${ownedItems.length} မျိုး`
                  : `${slots.length} / ${totalSlots} နေရာ အသုံးပြုထားသည်`}
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

        {/* Backpack vs Wardrobe Switcher */}
        <div className="px-4 sm:px-6 pt-3 pb-2.5 border-b border-[#322c23] bg-[#16130f] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('backpack')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'backpack'
                ? 'bg-amber-500 text-stone-950'
                : 'bg-[#221d17] text-[#b7ad9d] hover:text-white border border-[#383026]'
            }`}
          >
            🎒 လွယ်အိတ် ({slots.length}/{totalSlots})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('wardrobe')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'wardrobe'
                ? 'bg-rose-600 text-white'
                : 'bg-[#221d17] text-[#b7ad9d] hover:text-white border border-[#383026]'
            }`}
          >
            <Shirt size={14} />
            <span>အဝတ်အစားဗီရို ({ownedItems.length})</span>
          </button>
        </div>

        {/* Content Body */}
        {activeTab === 'backpack' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 p-4 sm:p-6 gap-4 sm:gap-5 overflow-y-auto">
            {/* Inventory Grid */}
            <div className="md:col-span-2">
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-2.5">
                {Array.from({ length: totalSlots }).map((_, index) => {
                  const slot = slots[index];
                  const def = slot ? ITEMS[slot.item] : null;
                  const isSelected = selectedSlotIndex === index;

                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setSelectedSlotIndex(slot ? index : null)}
                      aria-label={def ? `${def.name} (${slot.quantity})` : `အကွက် ${index + 1}`}
                      className={`relative aspect-square min-h-[48px] rounded-xl border flex flex-col items-center justify-center p-1.5 transition cursor-pointer select-none ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/30 shadow-inner'
                          : slot
                          ? 'border-[#453c30] bg-[#241f19] hover:border-[#6c5e4b] hover:bg-[#2c261f]'
                          : 'border-[#2f2921] bg-[#13100d]/70 hover:border-[#3e362b]'
                      }`}
                    >
                      {slot && def ? (
                        <>
                          <span className="text-2xl mb-0.5 drop-shadow-sm">{def.icon}</span>
                          <span className="absolute bottom-1 right-1.5 font-mono text-[11px] font-bold text-stone-100 bg-[#14110e]/90 border border-[#3d352a] px-1 rounded leading-tight">
                            {slot.quantity}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-[#564c3f] font-mono">
                          {index + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Item Details Panel */}
            <div className={`${UI_THEME.subCard} p-4 flex flex-col justify-between`}>
              {selectedSlot && selectedDef ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 border-b border-[#322c23] pb-3">
                    <div className="w-12 h-12 rounded-xl bg-[#252019] border border-[#463c2f] flex items-center justify-center text-3xl shrink-0">
                      {selectedDef.icon}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-white text-sm leading-snug">
                        {selectedDef.name}
                      </h3>
                      <div className="flex items-center flex-wrap gap-1.5 mt-1">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#26211a] border border-[#3f362b] text-[#d3c9b9]">
                          {getCategoryLabelMy(selectedDef.category)}
                        </span>
                        {isSelectedStarter ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/35 text-emerald-300">
                            အခြေခံကိရိယာ
                          </span>
                        ) : (
                          <span className="text-xs text-amber-300 font-mono">
                            🪙 {selectedDef.sellPrice} ရွှေ
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[#c7beae] leading-relaxed">
                    {selectedDef.description}
                  </p>

                  <div className="text-xs text-[#b7ad9d] space-y-1.5 bg-[#1b1713] p-3 rounded-xl border border-[#332c23]">
                    <div className="flex justify-between gap-2">
                      <span>အိတ်ထဲရှိ အရေအတွက်:</span>
                      <span className="font-mono text-white font-bold">{selectedSlot.quantity}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>အများဆုံးထည့်နိုင်မှု:</span>
                      <span className="font-mono text-stone-200">{selectedDef.maxStack}</span>
                    </div>
                    {!isSelectedStarter && (
                      <div className="flex justify-between gap-2">
                        <span>စုစုပေါင်းတန်ဖိုး:</span>
                        <span className="font-mono text-amber-300 font-bold">
                          {selectedSlot.quantity * selectedDef.sellPrice} ရွှေ
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {selectedDef.category === 'building' && onSelectBuilding && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectBuilding(selectedDef.id);
                          onClose();
                        }}
                        className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${UI_THEME.primaryGreenBtn}`}
                      >
                        <span>မြေပုံပေါ်တွင် တည်ဆောက်မည်</span>
                        <ArrowRight size={14} />
                      </button>
                    )}

                    {isSelectedStarter ? (
                      <div className="w-full py-2 px-3 rounded-xl border border-emerald-700/40 bg-emerald-950/30 text-emerald-200 text-[11px] font-medium text-center leading-snug">
                        🛡️ အခြေခံကိရိယာ ဖြစ်၍ စွန့်ပစ် / ရောင်းချ၍ မရပါ
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleDiscard}
                        className="w-full py-2 px-3 rounded-xl border border-rose-500/35 bg-rose-950/20 text-rose-300 hover:bg-rose-500/15 text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>၁ ခု စွန့်ပစ်မည်</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center p-4 text-[#8c8171]">
                  <span className="text-3xl mb-2">📦</span>
                  <span className="text-xs font-medium leading-relaxed">
                    ပစ္စည်းအချက်အလက်များ ကြည့်ရှုရန် အကွက်တစ်ခုကို ရွေးချယ်ပါ
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 p-4 sm:p-5 gap-4 overflow-y-auto">
            {/* Left: Equipped Slots + Owned Clothing List */}
            <div className="md:col-span-7 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {WARDROBE_SLOTS.map((slot) => {
                  const eqId = equippedClothing[slot];
                  const eqItem = eqId ? getClothingItemById(eqId) : null;
                  const meta = CLOTHING_SLOT_INFO[slot];
                  return (
                    <div
                      key={slot}
                      className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${
                        eqItem
                          ? 'bg-emerald-950/25 border-emerald-500/35'
                          : 'bg-[#171410] border-[#2e2820]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] text-[#a99e8e] truncate">
                          {meta.icon} {meta.labelMy}
                        </div>
                        <div className="text-[11px] font-bold text-stone-100 truncate">
                          {eqItem ? eqItem.displayNameMy || eqItem.displayName : '—'}
                        </div>
                      </div>
                      {eqItem && onUnequipClothing && (
                        <button
                          type="button"
                          onClick={() => {
                            const res = onUnequipClothing(slot);
                            setWardrobeFeedback({ ok: res.ok, text: res.messageMy });
                            SoundSynth.playRustle();
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/35 text-rose-200 hover:bg-rose-500/25 shrink-0 cursor-pointer"
                        >
                          ချွတ်
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {ownedItems.length === 0 ? (
                <div className={`${UI_THEME.subCard} p-6 text-center space-y-2`}>
                  <div className="text-3xl">🛍️</div>
                  <div className="text-sm font-bold text-stone-200">
                    ဝယ်ယူထားသော ဝတ်စုံ မရှိသေးပါ
                  </div>
                  <p className="text-xs text-[#a99e8e] leading-relaxed">
                    Town Center ရှိ Aunty Gyi အထည်ဆိုင် (27, 25) တွင် ဝတ်စုံအသစ်များ သွားရောက်ဝယ်ယူနိုင်ပါသည်။
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {ownedItems.map((item) => {
                    const isEquipped = equippedClothing[item.equipmentSlot] === item.itemId;
                    const isSelected = selectedGarment?.itemId === item.itemId;
                    return (
                      <button
                        key={item.itemId}
                        type="button"
                        onClick={() => {
                          setSelectedClothingId(item.itemId);
                          setWardrobeFeedback(null);
                        }}
                        className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                          isSelected
                            ? 'border-rose-400 bg-rose-500/15 ring-2 ring-rose-400/25'
                            : 'border-[#3d3428] bg-[#211c16] hover:border-[#5e5140]'
                        }`}
                      >
                        <ClothingItemPreviewCanvas
                          itemId={item.itemId}
                          gender={playerGender}
                          className="w-10 h-10"
                        />
                        <span className="text-[10px] font-bold text-stone-100 truncate w-full text-center">
                          {item.displayNameMy || item.displayName}
                        </span>
                        {isEquipped && (
                          <span className="text-[9px] font-bold px-1.5 rounded bg-emerald-500/20 text-emerald-300">
                            ဝတ်ထား
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Live Character Outfit Preview & Equip Controls */}
            <div className={`${UI_THEME.subCard} md:col-span-5 p-4 flex flex-col justify-between gap-3`}>
              <div className="flex flex-col items-center gap-2">
                <div className="w-24 h-32 rounded-xl bg-gradient-to-b from-[#28221b] to-[#17130f] border border-[#443a2e] flex items-center justify-center">
                  <CharacterOutfitPreviewCanvas
                    gender={playerGender}
                    equipped={equippedClothing}
                    direction={previewDir}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="ဘယ်ဘက်လှည့်မည်"
                    onClick={() => setPreviewDir((d) => (((d + 3) % 4) as 0 | 1 | 2 | 3))}
                    className="p-1.5 rounded-lg bg-[#231e18] border border-[#3d3428] text-stone-300 hover:text-white cursor-pointer"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[11px] font-semibold text-stone-300">
                    {playerGender === 'female' ? 'Female Outfit' : 'Male Outfit'}
                  </span>
                  <button
                    type="button"
                    aria-label="ညာဘက်လှည့်မည်"
                    onClick={() => setPreviewDir((d) => (((d + 1) % 4) as 0 | 1 | 2 | 3))}
                    className="p-1.5 rounded-lg bg-[#231e18] border border-[#3d3428] text-stone-300 hover:text-white cursor-pointer"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {selectedGarment && (
                <div className="space-y-2 border-t border-[#322c23] pt-3">
                  <div className="text-xs font-bold text-white">
                    {selectedGarment.displayNameMy || selectedGarment.displayName}
                  </div>
                  <div className="text-[11px] text-[#b7ad9d]">
                    {CLOTHING_SLOT_INFO[selectedGarment.equipmentSlot].icon}{' '}
                    {CLOTHING_SLOT_INFO[selectedGarment.equipmentSlot].labelMy}
                  </div>

                  {wardrobeFeedback && (
                    <div
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] border ${
                        wardrobeFeedback.ok
                          ? 'bg-emerald-950/45 border-emerald-500/35 text-emerald-200'
                          : 'bg-rose-950/45 border-rose-500/35 text-rose-200'
                      }`}
                    >
                      {wardrobeFeedback.text}
                    </div>
                  )}

                  {!ClothingSystem.isGenderCompatible(selectedGarment, playerGender) ? (
                    <div className="py-2 px-3 rounded-xl text-[11px] text-center bg-[#231e18] border border-[#3d3428] text-stone-400">
                      Character Gender နှင့် မကိုက်ညီပါ
                    </div>
                  ) : equippedClothing[selectedGarment.equipmentSlot] === selectedGarment.itemId ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!onUnequipClothing) return;
                        const res = onUnequipClothing(selectedGarment.equipmentSlot);
                        setWardrobeFeedback({ ok: res.ok, text: res.messageMy });
                        SoundSynth.playRustle();
                      }}
                      className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-[#2b241d] hover:bg-[#382e25] text-rose-200 border border-rose-500/40 transition cursor-pointer"
                    >
                      ချွတ်မည် (Unequip)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!onEquipClothing) return;
                        const res = onEquipClothing(selectedGarment.itemId);
                        setWardrobeFeedback({ ok: res.ok, text: res.messageMy });
                        if (res.ok) SoundSynth.playSuccess();
                        else SoundSynth.playRustle();
                      }}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${UI_THEME.primaryGreenBtn}`}
                    >
                      <Check size={14} />
                      <span>ဝတ်ဆင်မည် (Equip)</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
