/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, RotateCcw, Shirt, ShoppingBag, Sparkles, X } from 'lucide-react';
import {
  AUNTY_GYI_CATALOG,
  CLOTHING_CATEGORIES,
  CLOTHING_SLOT_INFO,
  getClothingItemById,
} from '../game/constants';
import {
  ClothingEquipResult,
  ClothingPurchaseResult,
  ClothingSystem,
} from '../game/systems/ClothingSystem';
import {
  ClothingCategory,
  ClothingEquipmentSlot,
  ClothingItemDefinition,
  EquippedClothingState,
} from '../game/types';
import { SoundSynth } from '../game/utils/SoundSynth';
import {
  CharacterOutfitPreviewCanvas,
  ClothingItemPreviewCanvas,
} from './ClothingPreviewCanvas';
import { UI_THEME } from './uiTheme';

interface ClothingShopModalProps {
  coins: number;
  gender: 'male' | 'female';
  ownedClothing: string[];
  equippedClothing: EquippedClothingState;
  onBuy: (itemId: string) => ClothingPurchaseResult;
  onEquip: (itemId: string) => ClothingEquipResult;
  onUnequip: (slot: ClothingEquipmentSlot) => ClothingEquipResult;
  onUnequipAll?: () => ClothingEquipResult;
  onClose: () => void;
}

const DIRECTION_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: 'အရှေ့ (Front)',
  1: 'ဘယ်ဘက် (Left)',
  2: 'ညာဘက် (Right)',
  3: 'အနောက် (Back)',
};

export const ClothingShopModal: React.FC<ClothingShopModalProps> = ({
  coins,
  gender,
  ownedClothing,
  equippedClothing,
  onBuy,
  onEquip,
  onUnequip,
  onUnequipAll,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'shop' | 'wardrobe'>('shop');
  const [activeCategory, setActiveCategory] = useState<'all' | ClothingCategory>('all');
  const [selectedItemId, setSelectedItemId] = useState<string>(AUNTY_GYI_CATALOG[0].itemId);
  const [previewTryOn, setPreviewTryOn] = useState<boolean>(true);
  const [previewDir, setPreviewDir] = useState<0 | 1 | 2 | 3>(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPurchasePending, setIsPurchasePending] = useState(false);
  const purchaseGuardRef = useRef(false);

  const ownedSet = useMemo(() => new Set(ownedClothing), [ownedClothing]);

  const filteredItems = useMemo(() => {
    const base =
      activeTab === 'wardrobe'
        ? AUNTY_GYI_CATALOG.filter((item) => ownedSet.has(item.itemId))
        : [...AUNTY_GYI_CATALOG];
    if (activeCategory === 'all') return base;
    return base.filter((item) => item.category === activeCategory);
  }, [activeTab, activeCategory, ownedSet]);

  const selectedItem: ClothingItemDefinition | undefined = useMemo(() => {
    const found = getClothingItemById(selectedItemId);
    if (found && (activeTab === 'shop' || ownedSet.has(found.itemId))) {
      return found;
    }
    return filteredItems[0] || AUNTY_GYI_CATALOG[0];
  }, [selectedItemId, activeTab, ownedSet, filteredItems]);

  const isSelectedOwned = selectedItem ? ownedSet.has(selectedItem.itemId) : false;
  const isSelectedCompatible = selectedItem
    ? ClothingSystem.isGenderCompatible(selectedItem, gender)
    : true;
  const isSelectedEquipped = Boolean(
    selectedItem && equippedClothing[selectedItem.equipmentSlot] === selectedItem.itemId
  );

  // Live preview outfit: overlays compatible selected item when Try-On is active
  const previewOutfit: EquippedClothingState = useMemo(() => {
    const base: EquippedClothingState = { ...equippedClothing };
    if (previewTryOn && selectedItem && ClothingSystem.isGenderCompatible(selectedItem, gender)) {
      base[selectedItem.equipmentSlot] = selectedItem.itemId;
      // Previewing any T-Shirt (owned or unowned) temporarily lifts Suit overlay so the tee is visible
      if (selectedItem.equipmentSlot === 'tshirt') {
        delete base.suit;
      }
    }
    return base;
  }, [equippedClothing, previewTryOn, selectedItem, gender]);

  const equippedCount = useMemo(
    () => Object.values(equippedClothing).filter((val) => typeof val === 'string' && val.length > 0).length,
    [equippedClothing]
  );

  const isPreviewingTshirtOverSuit = Boolean(
    previewTryOn && selectedItem?.equipmentSlot === 'tshirt' && equippedClothing.suit
  );

  const suitHidesTshirtActive = Boolean(
    equippedClothing.suit && equippedClothing.tshirt && !isPreviewingTshirtOverSuit
  );

  const handleBuyClick = (item: ClothingItemDefinition) => {
    if (purchaseGuardRef.current || isPurchasePending) return;
    purchaseGuardRef.current = true;
    setIsPurchasePending(true);
    try {
      const res = onBuy(item.itemId);
      setFeedback({ ok: res.ok, text: res.messageMy });
      if (res.ok) {
        SoundSynth.playCoin();
      } else {
        SoundSynth.playRustle();
      }
    } finally {
      setTimeout(() => {
        purchaseGuardRef.current = false;
        setIsPurchasePending(false);
      }, 220);
    }
  };

  const handleEquipClick = (item: ClothingItemDefinition) => {
    const res = onEquip(item.itemId);
    setFeedback({ ok: res.ok, text: res.messageMy });
    if (res.ok) {
      SoundSynth.playSuccess();
    } else {
      SoundSynth.playRustle();
    }
  };

  const handleUnequipClick = (slot: ClothingEquipmentSlot) => {
    const res = onUnequip(slot);
    setFeedback({ ok: res.ok, text: res.messageMy });
    SoundSynth.playRustle();
  };

  const handleUnequipAllClick = () => {
    if (equippedCount === 0) return;
    if (onUnequipAll) {
      const res = onUnequipAll();
      setFeedback({ ok: res.ok, text: res.messageMy });
    } else {
      for (const slot of Object.keys(equippedClothing) as ClothingEquipmentSlot[]) {
        if (equippedClothing[slot]) {
          onUnequip(slot);
        }
      }
      setFeedback({
        ok: true,
        text: 'ဝတ်စုံအားလုံးကို ချွတ်၍ မူလပုံစံသို့ ပြန်လည်ပြောင်းလဲပြီးပါပြီ',
      });
    }
    SoundSynth.playRustle();
  };

  const missingGold = selectedItem ? Math.max(0, selectedItem.goldPrice - coins) : 0;

  return (
    <div className={UI_THEME.backdrop} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aunty-gyi-shop-title"
        onClick={(e) => e.stopPropagation()}
        className={`${UI_THEME.panel} max-w-4xl`}
      >
        {/* Header */}
        <div className={UI_THEME.header}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-rose-950/75 border border-rose-500/40 flex items-center justify-center text-rose-300 shrink-0">
              <Shirt size={20} />
            </div>
            <div className="min-w-0">
              <h2
                id="aunty-gyi-shop-title"
                className="text-base font-bold text-white tracking-tight leading-snug truncate"
              >
                Aunty Gyi အထည်ဆိုင်
              </h2>
              <p className="text-xs text-[#b7ad9d] leading-snug truncate">
                ဖက်ရှင်ဝတ်စုံ ၁၂ မျိုး · ဝယ်ယူပြီး ချက်ချင်းဝတ်ဆင်နိုင်သည်
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className={UI_THEME.goldBadge}>
              <span>🪙</span>
              <span className="font-mono" data-testid="clothing-shop-coins">
                {coins}
              </span>
              <span>ရွှေ</span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="ပိတ်မည်"
              className={UI_THEME.closeBtn}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Top Shop / Wardrobe Tabs + Categories */}
        <div className="px-4 sm:px-6 pt-2.5 pb-2 border-b border-[#322c23] bg-[#16130f] space-y-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex bg-[#120f0c] p-1 rounded-xl border border-[#322c23] gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('shop')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'shop'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-[#b7ad9d] hover:text-white hover:bg-[#231e18]'
                }`}
              >
                <ShoppingBag size={14} />
                <span>ဆိုင်ခန်း ({AUNTY_GYI_CATALOG.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('wardrobe')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'wardrobe'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-[#b7ad9d] hover:text-white hover:bg-[#231e18]'
                }`}
              >
                <Sparkles size={14} />
                <span>ကျွန်ုပ်၏ ဗီရို ({ownedClothing.length})</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {equippedCount > 0 && (
                <button
                  type="button"
                  onClick={handleUnequipAllClick}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#251f19] hover:bg-rose-950/50 border border-[#44392d] hover:border-rose-500/40 text-rose-200 flex items-center gap-1 transition cursor-pointer"
                  title="ဝတ်ထားသမျှ အဝတ်အစားအားလုံး ချွတ်မည်"
                >
                  <RotateCcw size={12} />
                  <span>အားလုံးချွတ်</span>
                </button>
              )}
              <div className="text-[11px] font-medium text-[#b7ad9d]">
                Character:{' '}
                <span className="text-stone-100 font-bold">
                  {gender === 'female' ? '👩 Female' : '👨 Male'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap border transition cursor-pointer shrink-0 ${
                activeCategory === 'all'
                  ? 'bg-amber-500/18 border-amber-400/50 text-amber-200'
                  : 'bg-[#1e1a15] border-[#383026] text-[#b7ad9d] hover:text-white'
              }`}
            >
              ✨ အားလုံး
            </button>
            {CLOTHING_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap border flex items-center gap-1 transition cursor-pointer shrink-0 ${
                  activeCategory === cat.id
                    ? 'bg-rose-500/20 border-rose-400/55 text-rose-200'
                    : 'bg-[#1e1a15] border-[#383026] text-[#b7ad9d] hover:text-white'
                }`}
              >
                <span aria-hidden="true">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Body: independent scroll panes on md+ (tablets/landscape/desktop) & compact Preview-first split on portrait mobile */}
        <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-12 gap-3 sm:gap-4 p-3 sm:p-5 overflow-hidden">
          {/* Item Catalog Grid */}
          <div className="md:col-span-7 flex-1 min-h-0 overflow-y-auto pr-0.5 order-last md:order-first">
            {filteredItems.length === 0 ? (
              <div className={`${UI_THEME.subCard} p-6 text-center space-y-2.5`}>
                <div className="text-3xl">👗</div>
                <div className="text-sm font-bold text-stone-200">
                  ဝယ်ယူထားသော အဝတ်အစား မရှိသေးပါ
                </div>
                <p className="text-xs text-[#a99e8e]">
                  ဆိုင်ခန်း Tab မှ နှစ်သက်ရာ ဝတ်စုံများကို ရွှေဒင်္ဂါးဖြင့် ဝယ်ယူနိုင်ပါသည်။
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('shop')}
                  className={`px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold ${UI_THEME.primaryAmberBtn}`}
                >
                  ဆိုင်ခန်းသို့ သွားမည်
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5 pb-1">
                {filteredItems.map((item) => {
                  const isOwned = ownedSet.has(item.itemId);
                  const isEquipped = equippedClothing[item.equipmentSlot] === item.itemId;
                  const isSelected = selectedItem?.itemId === item.itemId;
                  const compatible = ClothingSystem.isGenderCompatible(item, gender);
                  const canAfford = coins >= item.goldPrice;

                  return (
                    <button
                      key={item.itemId}
                      type="button"
                      onClick={() => {
                        setSelectedItemId(item.itemId);
                        setFeedback(null);
                      }}
                      className={`text-left rounded-xl border p-2.5 flex flex-col gap-1.5 transition cursor-pointer ${
                        isSelected
                          ? 'border-rose-400 bg-rose-500/14 ring-2 ring-rose-400/25'
                          : isEquipped
                          ? 'border-emerald-500/45 bg-emerald-950/18 hover:border-emerald-400/70'
                          : 'border-[#3a3228] bg-[#211c16] hover:border-[#5b4e3e] hover:bg-[#27211a]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-[#15120e] border border-[#342c22] flex items-center justify-center shrink-0">
                          <ClothingItemPreviewCanvas itemId={item.itemId} gender={gender} />
                        </div>
                        <div className="flex flex-col items-end gap-1 min-w-0">
                          {isEquipped ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                              ဝတ်ထား
                            </span>
                          ) : isOwned ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-200">
                              ပိုင်ဆိုင်ပြီး
                            </span>
                          ) : (
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                canAfford
                                  ? 'bg-[#14110e] border-[#3d3428] text-amber-300'
                                  : 'bg-rose-950/35 border-rose-500/35 text-rose-300'
                              }`}
                            >
                              🪙 {item.goldPrice}
                            </span>
                          )}
                          {!isOwned && !canAfford && (
                            <span className="text-[9px] font-semibold text-rose-300/90 leading-none">
                              ရွှေမလောက်
                            </span>
                          )}
                          {!compatible && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-stone-800 text-stone-300">
                              {item.applicableGender === 'female' ? 'Female' : 'Male'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white leading-snug truncate">
                          {item.displayNameMy || item.displayName}
                        </div>
                        <div className="text-[10px] text-[#a99e8e] truncate">
                          {item.displayName}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Panel (Top on portrait mobile): Live Preview + Item Detail & Actions */}
          <div className="md:col-span-5 flex flex-col gap-2.5 sm:gap-3 shrink-0 md:min-h-0 md:overflow-y-auto order-first md:order-last">
            {/* Live Character Outfit Preview Card */}
            <div className={`${UI_THEME.subCard} p-2.5 sm:p-3.5 flex items-center gap-3 border-rose-500/25`}>
              <div className="relative w-20 h-28 sm:w-24 sm:h-32 rounded-xl bg-gradient-to-b from-[#28221b] to-[#17130f] border border-[#443a2e] flex items-center justify-center shrink-0">
                <CharacterOutfitPreviewCanvas
                  gender={gender}
                  equipped={previewOutfit}
                  direction={previewDir}
                  className="w-20 h-28 sm:w-24 sm:h-32"
                />
              </div>

              <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-rose-200 truncate">
                    ဝတ်စုံအစမ်းကြည့်ရှုရန်
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewTryOn((v) => !v)}
                    className={`px-2 py-1 rounded text-[10px] font-bold border cursor-pointer shrink-0 ${
                      previewTryOn
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-[#26211b] border-[#3d3428] text-stone-300'
                    }`}
                  >
                    {previewTryOn ? 'Try-On: ON' : 'Equipped'}
                  </button>
                </div>

                {/* 4-direction rotation controls */}
                <div className="flex items-center justify-between bg-[#1b1713] border border-[#342d24] rounded-lg px-1 py-0.5">
                  <button
                    type="button"
                    aria-label="ဘယ်ဘက်လှည့်မည်"
                    onClick={() => setPreviewDir((d) => (((d + 3) % 4) as 0 | 1 | 2 | 3))}
                    className="w-8 h-8 flex items-center justify-center text-[#b7ad9d] hover:text-white cursor-pointer"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="text-[11px] font-medium text-stone-200 truncate px-1">
                    {DIRECTION_LABELS[previewDir]}
                  </span>
                  <button
                    type="button"
                    aria-label="ညာဘက်လှည့်မည်"
                    onClick={() => setPreviewDir((d) => (((d + 1) % 4) as 0 | 1 | 2 | 3))}
                    className="w-8 h-8 flex items-center justify-center text-[#b7ad9d] hover:text-white cursor-pointer"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>

                {/* Quick Equipped Slots Strip */}
                <div className="flex flex-wrap gap-1">
                  {(['hat', 'tshirt', 'suit', 'pants', 'shoes', 'accessory'] as ClothingEquipmentSlot[]).map(
                    (slot) => {
                      const eqId = equippedClothing[slot];
                      const eqItem = eqId ? getClothingItemById(eqId) : null;
                      const slotMeta = CLOTHING_SLOT_INFO[slot];
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={!eqItem}
                          onClick={() => eqItem && handleUnequipClick(slot)}
                          title={
                            eqItem
                              ? `${eqItem.displayNameMy || eqItem.displayName} (နှိပ်၍ချွတ်မည်)`
                              : `${slotMeta.labelMy}: မဝတ်ထားပါ`
                          }
                          className={`px-1.5 py-1 rounded text-[10px] border transition ${
                            eqItem
                              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200 hover:bg-rose-500/20 hover:border-rose-400/50 cursor-pointer'
                              : 'bg-[#191612] border-[#2e2820] text-[#6d6253] cursor-default'
                          }`}
                        >
                          {slotMeta.icon} {eqItem ? '✓' : '—'}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            </div>

            {isPreviewingTshirtOverSuit && (
              <div className="px-3 py-1.5 rounded-lg bg-sky-950/35 border border-sky-500/30 text-[11px] text-sky-200 leading-snug">
                👀 တီရှပ်ကို အစမ်းကြည့်နိုင်ရန် Suit အလွှာကို ယာယီဖယ်ပြထားပါသည်။
              </div>
            )}

            {suitHidesTshirtActive && (
              <div className="px-3 py-1.5 rounded-lg bg-amber-950/35 border border-amber-500/25 text-[11px] text-amber-200 leading-snug">
                ℹ️ ဝတ်စုံအပြည့် (Suit) ဝတ်ဆင်ထားချိန်တွင် တီရှပ်အလွှာကို ဖုံးအုပ်ပြသပါမည်။ Suit ချွတ်ပါက တီရှပ်ပြန်ပေါ်လာပါမည်။
              </div>
            )}

            {/* Selected Item Detail Card */}
            {selectedItem && (
              <div className={`${UI_THEME.subCard} p-3 sm:p-4 space-y-2.5 sm:space-y-3 md:flex-1 flex flex-col justify-between`}>
                <div className="space-y-2 sm:space-y-2.5">
                  <div className="flex items-start justify-between gap-2.5 border-b border-[#322c23] pb-2 sm:pb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#252019] border border-[#463c2f] flex items-center justify-center shrink-0">
                        <ClothingItemPreviewCanvas
                          itemId={selectedItem.itemId}
                          gender={gender}
                          className="w-9 h-9 sm:w-11 sm:h-11"
                        />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white leading-snug truncate">
                          {selectedItem.displayNameMy || selectedItem.displayName}
                        </h3>
                        <p className="text-[11px] text-[#a99e8e] truncate">{selectedItem.displayName}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-amber-300">
                        🪙 {selectedItem.goldPrice} ရွှေ
                      </div>
                      <div className="text-[10px] text-[#9b8f7e]">
                        {CLOTHING_SLOT_INFO[selectedItem.equipmentSlot].labelMy}
                      </div>
                    </div>
                  </div>

                  <p className="hidden sm:block text-xs text-[#cfc6b7] leading-relaxed">
                    {selectedItem.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-[#241f19] border border-[#3d3428] text-stone-300">
                      {CLOTHING_SLOT_INFO[selectedItem.equipmentSlot].icon}{' '}
                      {CLOTHING_SLOT_INFO[selectedItem.equipmentSlot].label}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md border ${
                        isSelectedCompatible
                          ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                      }`}
                    >
                      {selectedItem.applicableGender === 'both'
                        ? 'Male / Female နှစ်မျိုးလုံး'
                        : selectedItem.applicableGender === 'female'
                        ? 'Female Character သီးသန့်'
                        : 'Male Character သီးသန့်'}
                    </span>
                    {isSelectedOwned && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-amber-200 inline-flex items-center gap-1">
                        <Check size={11} /> ဝယ်ယူပြီးသား
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  {feedback && (
                    <div
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border leading-snug ${
                        feedback.ok
                          ? 'bg-emerald-950/45 border-emerald-500/35 text-emerald-200'
                          : 'bg-rose-950/45 border-rose-500/35 text-rose-200'
                      }`}
                    >
                      {feedback.text}
                    </div>
                  )}

                  {!isSelectedOwned ? (
                    <div className="space-y-1.5">
                      {missingGold > 0 && (
                        <div className="text-[11px] font-medium text-rose-300">
                          ရွှေဒင်္ဂါး မလုံလောက်ပါ (နောက်ထပ် {missingGold} ရွှေ လိုအပ်သည်)
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={missingGold > 0 || isPurchasePending}
                        onClick={() => handleBuyClick(selectedItem)}
                        className={`w-full py-2.5 px-4 min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-2 ${
                          missingGold > 0 || isPurchasePending
                            ? UI_THEME.disabledBtn
                            : UI_THEME.primaryAmberBtn
                        }`}
                      >
                        <ShoppingBag size={15} />
                        <span>
                          {isPurchasePending
                            ? 'ဝယ်ယူနေသည်...'
                            : `ဝယ်ယူမည် · 🪙 ${selectedItem.goldPrice} ရွှေ`}
                        </span>
                      </button>
                    </div>
                  ) : !isSelectedCompatible ? (
                    <div className="w-full py-2.5 px-4 min-h-[44px] flex items-center justify-center rounded-xl text-xs font-semibold text-center bg-[#231e18] border border-[#3d3428] text-stone-400">
                      {selectedItem.applicableGender === 'female'
                        ? 'Female Character များသာ ဝတ်ဆင်နိုင်ပါသည်'
                        : 'Male Character များသာ ဝတ်ဆင်နိုင်ပါသည်'}
                    </div>
                  ) : isSelectedEquipped ? (
                    <button
                      type="button"
                      onClick={() => handleUnequipClick(selectedItem.equipmentSlot)}
                      className="w-full py-2.5 px-4 min-h-[44px] rounded-xl text-xs font-bold bg-[#2b241d] hover:bg-[#382e25] text-rose-200 border border-rose-500/40 transition cursor-pointer"
                    >
                      ချွတ်မည် (Unequip)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleEquipClick(selectedItem)}
                      className={`w-full py-2.5 px-4 min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-2 ${UI_THEME.primaryGreenBtn}`}
                    >
                      <Check size={15} />
                      <span>ဝတ်ဆင်မည် (Equip)</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
