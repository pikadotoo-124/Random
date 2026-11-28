/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Home, X, ArrowRight } from 'lucide-react';
import { ITEMS } from '../game/constants';
import { BuildingSystem } from '../game/systems/BuildingSystem';
import { InventorySystem } from '../game/systems/InventorySystem';
import { BuildingType } from '../game/types';
import { UI_THEME } from './uiTheme';

interface BuildMenuModalProps {
  buildingSystem: BuildingSystem;
  inventory: InventorySystem;
  onSelectPiece: (type: BuildingType) => void;
  onClose: () => void;
}

export const BuildMenuModal: React.FC<BuildMenuModalProps> = ({
  buildingSystem: _buildingSystem,
  inventory,
  onSelectPiece,
  onClose,
}) => {
  const shopDecorTypes: BuildingType[] = [
    'decor_bench',
    'decor_flower_pot',
    'decor_flowerbed',
    'decor_flower_stand',
  ];
  const ownedDecorItems = shopDecorTypes.filter((t) => inventory.getItemCount(t) > 0);

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
      title: 'သစ်သားအိမ်ငယ်',
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
      title: 'နှစ်ထပ်သစ်သားအိမ်',
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
      title: 'စံအိမ်ကြီး',
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
      title: 'သစ်သားခြံစည်းရိုး',
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
      title: 'မီးဖို',
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
      title: 'သိုလှောင်သေတ္တာ',
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
      title: 'မီးအိမ်တိုင်',
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
    if (itemType !== 'fence_wood' && !inventory.hasItem(itemType, 1)) {
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
    <div className={UI_THEME.backdrop} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${UI_THEME.panel} max-w-2xl`}
      >
        {/* Header */}
        <div className={UI_THEME.header}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/75 border border-emerald-700/50 flex items-center justify-center text-emerald-300 shrink-0">
              <Home size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight leading-snug truncate">
                အဆောက်အအုံဆောက်လုပ်ခြင်း
              </h2>
              <p className="text-xs text-[#b7ad9d] leading-snug truncate">
                သစ်သားအိမ်၊ ခြံစည်းရိုး၊ မီးဖိုနှင့် အလှဆင်ပစ္စည်းများ ဆောက်လုပ်ပါ
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

        {/* Blueprint cards */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3">
          <div className="text-xs text-emerald-200/95 bg-emerald-950/45 border border-emerald-700/45 rounded-xl px-3.5 py-2.5 leading-relaxed">
            🏡 <strong>ဆောက်လုပ်နိုင်သော ဇုန် (Homestead District — X: 40–114, Y: 40–114):</strong>{' '}
            အိမ်နှင့် ခြံစည်းရိုးများကို သတ်မှတ်ထားသော အိမ်ရာဇုန်အတွင်း မြေလွတ်နေရာများတွင်သာ ဆောက်လုပ်နိုင်ပါသည် (မြို့လယ်၊ လမ်းမ၊ ရေပြင်နှင့် အများပိုင်လမ်းများပေါ်တွင် မဆောက်နိုင်ပါ)။ 🌾 မိမိဝယ်ယူပိုင်ဆိုင်ထားသော စိုက်ပျိုးမြေကွက်များအတွင်း၌လည်း <strong>သစ်သားခြံစည်းရိုး</strong> ကာရံနိုင်ပါသည်။
          </div>

          {ownedDecorItems.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-amber-200">
                🪴 ဆိုင်မှဝယ်ယူထားသော အလှဆင်ပစ္စည်းများ
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ownedDecorItems.map((decorType) => {
                  const def = ITEMS[decorType];
                  const count = inventory.getItemCount(decorType);
                  return (
                    <div
                      key={decorType}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#14110e]/85 border border-amber-700/40 gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-2xl shrink-0">{def.icon}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{def.name}</div>
                          <div className="text-[11px] text-emerald-300 font-mono">
                            အိတ်ထဲတွင်: {count}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectPiece(decorType);
                          onClose();
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${UI_THEME.primaryGreenBtn}`}
                      >
                        နေရာချမည်
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {buildingBlueprints.map((bp) => {
              const inBagCount = inventory.getItemCount(bp.type);
              const canAffordRaw = bp.mats.every((m) => inventory.getItemCount(m.itemId) >= m.count);
              const isReady = inBagCount > 0 || canAffordRaw;

              return (
                <div
                  key={bp.type}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#14110e]/85 border border-[#342d24] hover:border-[#4e4336] gap-4 transition"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-14 h-14 rounded-xl bg-[#252019] border border-[#463c2f] flex items-center justify-center text-3xl shrink-0">
                      {bp.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <h3 className="font-bold text-white text-sm leading-snug">{bp.title}</h3>
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#26211a] border border-[#3d3429] text-[#d3c9b9] font-mono">
                          {bp.tiles}
                        </span>
                        {inBagCount > 0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/35 text-emerald-300 font-bold">
                            အိတ်ထဲတွင်: {inBagCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#b7ad9d] mt-1 leading-relaxed">
                        {bp.description}
                      </p>

                      {/* Materials breakdown */}
                      <div className="flex items-center flex-wrap gap-3 mt-2">
                        {bp.mats.map((m) => {
                          const have = inventory.getItemCount(m.itemId);
                          const ok = have >= m.count;
                          return (
                            <span
                              key={m.name}
                              className={`text-[11px] font-mono flex items-center gap-1 ${
                                ok ? 'text-stone-200' : 'text-rose-400'
                              }`}
                            >
                              <span>{m.icon}</span>
                              <span>{m.name}:</span>
                              <span className="font-bold">
                                {have}/{m.count}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStartPlacement(bp.type, bp.mats)}
                    disabled={!isReady}
                    className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shrink-0 ${
                      isReady ? UI_THEME.primaryGreenBtn : UI_THEME.disabledBtn
                    }`}
                  >
                    <span>
                      {bp.type === 'fence_wood'
                        ? 'ဆက်တိုက် နေရာချမည်'
                        : inBagCount > 0
                        ? 'အိတ်ထဲမှ နေရာချမည်'
                        : 'ဖန်တီး၍ နေရာချမည်'}
                    </span>
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
