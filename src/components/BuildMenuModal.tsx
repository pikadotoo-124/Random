/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Home, X, Flame, Package, Shield, Sparkles, Check, ArrowRight } from 'lucide-react';
import { ITEMS } from '../game/constants';
import { BuildingSystem } from '../game/systems/BuildingSystem';
import { InventorySystem } from '../game/systems/InventorySystem';
import { BuildingType } from '../game/types';

interface BuildMenuModalProps {
  buildingSystem: BuildingSystem;
  inventory: InventorySystem;
  onSelectPiece: (type: BuildingType) => void;
  onClose: () => void;
}

export const BuildMenuModal: React.FC<BuildMenuModalProps> = ({
  buildingSystem,
  inventory,
  onSelectPiece,
  onClose,
}) => {
  const buildingBlueprints: {
    type: BuildingType;
    title: string;
    description: string;
    icon: string;
    tiles: string;
    mats: { name: string; icon: string; count: number; itemId: any }[];
  }[] = [
    {
      type: 'house_small',
      title: 'သစ်သားအိမ်ငယ် (Wooden Cottage)',
      description: 'နွေးထွေးသော အမိုး၊ ပြတင်းပေါက်နှင့် မီးလင်းဖို ပါရှိသည့် သက်တောင့်သက်သာ သစ်သားအိမ်ငယ်။',
      icon: '🏡',
      tiles: '၂x၂ ကွက်',
      mats: [
        { name: 'သစ်သား', icon: '🪵', count: 15, itemId: 'wood' },
        { name: 'ကျောက်တုံး', icon: '🪨', count: 8, itemId: 'stone' },
      ],
    },
    {
      type: 'house_medium',
      title: 'နှစ်ထပ်သစ်သားအိမ် (Timber Manor)',
      description: 'ကျယ်ဝန်းသော နှစ်ထပ်သစ်သားနှင့် ကျောက်သားစပ် လူနေအိမ်ကောင်း။',
      icon: '🏘️',
      tiles: '၃x၂ ကွက်',
      mats: [
        { name: 'သစ်သား', icon: '🪵', count: 25, itemId: 'wood' },
        { name: 'ကျောက်တုံး', icon: '🪨', count: 14, itemId: 'stone' },
      ],
    },
    {
      type: 'house_large',
      title: 'စံအိမ်ကြီး (Grand Villa)',
      description: 'ခမ်းနားထည်ဝါသော ဥယျာဉ်စံအိမ်ကြီး။ ခိုင်ခံ့သော ကျောက်အုတ်မြစ်နှင့် နှစ်ထပ်ခေါင်မိုး ပါရှိသည်။',
      icon: '🏰',
      tiles: '၃x၃ ကွက်',
      mats: [
        { name: 'သစ်သား', icon: '🪵', count: 40, itemId: 'wood' },
        { name: 'ကျောက်တုံး', icon: '🪨', count: 24, itemId: 'stone' },
        { name: 'အမျှင်', icon: '🌾', count: 10, itemId: 'fiber' },
      ],
    },
    {
      type: 'fence_wood',
      title: 'သစ်သားခြံစည်းရိုး (Wooden Fence)',
      description: 'မိမိ၏ အိမ်ခြံဝင်းကို သပ်ရပ်စွာ ကာရံနိုင်သော သစ်သားခြံစည်းရိုး။',
      icon: '🪵',
      tiles: '၁x၁ ကွက်',
      mats: [
        { name: 'သစ်သား', icon: '🪵', count: 2, itemId: 'wood' },
        { name: 'အမျှင်', icon: '🌾', count: 1, itemId: 'fiber' },
      ],
    },
    {
      type: 'campfire',
      title: 'မီးဖို (Campfire)',
      description: 'အသားနှင့် ငါးများကို ချက်ပြုတ်ရန်နှင့် ညအခါ အနွေးဓာတ်ရရှိစေရန် ကျောက်စီမီးဖို။',
      icon: '🔥',
      tiles: '၁x၁ ကွက်',
      mats: [
        { name: 'သစ်သား', icon: '🪵', count: 5, itemId: 'wood' },
        { name: 'ကျောက်တုံး', icon: '🪨', count: 2, itemId: 'stone' },
      ],
    },
    {
      type: 'storage_box',
      title: 'သိုလှောင်သေတ္တာ (Storage Chest)',
      description: 'ပိုလျှံသော ပစ္စည်းများနှင့် သယံဇာတများကို လုံခြုံစွာ သိမ်းဆည်းနိုင်သည့် သစ်သားသေတ္တာ။',
      icon: '📦',
      tiles: '၁x၁ ကွက်',
      mats: [
        { name: 'သစ်သား', icon: '🪵', count: 8, itemId: 'wood' },
        { name: 'အမျှင်', icon: '🌾', count: 2, itemId: 'fiber' },
      ],
    },
    {
      type: 'lantern',
      title: 'မီးအိမ်တိုင် (Lantern Post)',
      description: 'ညအခါ မိမိခြံဝင်းကို လင်းထိန်စေရန် သစ်သားမီးတိုင်။',
      icon: '🏮',
      tiles: '၁x၁ ကွက်',
      mats: [
        { name: 'သစ်သား', icon: '🪵', count: 4, itemId: 'wood' },
        { name: 'ကျောက်တုံး', icon: '🪨', count: 2, itemId: 'stone' },
      ],
    },
  ];

  const handleStartPlacement = (itemType: BuildingType, mats: any[]) => {
    // If player doesn't already have the building item in inventory, auto-craft if they have mats
    if (!inventory.hasItem(itemType, 1)) {
      // Check if they have the raw materials
      const hasAllMats = mats.every((m) => inventory.getItemCount(m.itemId) >= m.count);
      if (hasAllMats) {
        for (const m of mats) {
          inventory.removeItem(m.itemId, m.count);
        }
        inventory.addItem(itemType, 1);
      }
    }

    onSelectPiece(itemType);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
              <Home size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">အဆောက်အအုံဆောက်လုပ်ခြင်း (Building)</h2>
              <p className="text-xs text-stone-400">
                သစ်သားအိမ်၊ ခြံစည်းရိုး၊ မီးဖိုနှင့် သိုလှောင်သေတ္တာများ ဆောက်လုပ်ပါ
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

        {/* Blueprint cards */}
        <div className="p-6 overflow-y-auto space-y-3">
          <div className="text-xs text-stone-400 mb-2">
            ဆောက်လုပ်လိုသည့် အဆောက်အအုံကို ရွေးချယ်ပြီး မြေပြင်ပေါ်တွင် နေရာချထားနိုင်ပါသည် (မြို့လယ်ပလာဇာပြင်ပ နေရာလွတ်များတွင် ဆောက်လုပ်နိုင်သည်)။
          </div>

          <div className="grid grid-cols-1 gap-3">
            {buildingBlueprints.map((bp) => {
              const inBagCount = inventory.getItemCount(bp.type);
              const canAffordRaw = bp.mats.every((m) => inventory.getItemCount(m.itemId) >= m.count);
              const isReady = inBagCount > 0 || canAffordRaw;

              return (
                <div
                  key={bp.type}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-stone-950/50 border border-stone-800 hover:border-stone-700 gap-4 transition"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center text-3xl shrink-0">
                      {bp.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white text-sm">{bp.title}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 font-mono">
                          {bp.tiles}
                        </span>
                        {inBagCount > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                            အိတ်ထဲတွင်: {inBagCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                        {bp.description}
                      </p>

                      {/* Materials breakdown */}
                      <div className="flex items-center gap-3 mt-2">
                        {bp.mats.map((m) => {
                          const have = inventory.getItemCount(m.itemId);
                          const ok = have >= m.count;
                          return (
                            <span
                              key={m.name}
                              className={`text-[11px] font-mono flex items-center gap-1 ${
                                ok ? 'text-stone-300' : 'text-red-400'
                              }`}
                            >
                              <span>{m.icon}</span>
                              <span>{m.name}:</span>
                              <span className="font-bold">{have}/{m.count}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleStartPlacement(bp.type, bp.mats)}
                    disabled={!isReady}
                    className={`py-2 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shrink-0 cursor-pointer ${
                      isReady
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 active:scale-95'
                        : 'bg-stone-800 text-stone-500 cursor-not-allowed border border-stone-700/50'
                    }`}
                  >
                    <span>{inBagCount > 0 ? 'အိတ်ထဲမှ နေရာချမည်' : 'ဖန်တီး၍ နေရာချမည်'}</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
