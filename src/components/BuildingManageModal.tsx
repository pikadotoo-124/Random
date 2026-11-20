/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Trash2, Move, Package, X, AlertTriangle, MapPin } from 'lucide-react';
import { PlacedBuilding } from '../game/types';
import { UI_THEME } from './uiTheme';

interface BuildingManageModalProps {
  building: PlacedBuilding;
  onMove: (building: PlacedBuilding) => void;
  onDemolish: (building: PlacedBuilding) => void;
  onOpenStorage?: (building: PlacedBuilding) => void;
  onClose: () => void;
}

export const BuildingManageModal: React.FC<BuildingManageModalProps> = ({
  building,
  onMove,
  onDemolish,
  onOpenStorage,
  onClose,
}) => {
  const [isConfirmingDemolish, setIsConfirmingDemolish] = useState(false);

  const getBuildingInfo = (type: string) => {
    switch (type) {
      case 'house_small':
        return {
          name: 'သစ်သားအိမ်ငယ်',
          size: '၂x၂ ကွက်',
          icon: '🏡',
          desc: 'နွေးထွေးသော အမိုးနှင့် ပြတင်းပေါက်ပါ သစ်သားအိမ်ငယ်',
        };
      case 'house_medium':
        return {
          name: 'နှစ်ထပ်သစ်သားအိမ်',
          size: '၃x၂ ကွက်',
          icon: '🏘️',
          desc: 'ကျယ်ဝန်းသော နှစ်ထပ်သစ်သားနှင့် ကျောက်သားစပ် လူနေအိမ်ကောင်း',
        };
      case 'house_large':
        return {
          name: 'စံအိမ်ကြီး',
          size: '၃x၃ ကွက်',
          icon: '🏰',
          desc: 'ခိုင်ခံ့သော ကျောက်အုတ်မြစ်နှင့် နှစ်ထပ်ခေါင်မိုးပါ ဥယျာဉ်စံအိမ်ကြီး',
        };
      case 'fence_wood':
        return {
          name: 'သစ်သားခြံစည်းရိုး',
          size: '၁x၁ ကွက်',
          icon: '🪵',
          desc: 'အိမ်ခြံဝင်း ကာရံထားသော သစ်သားစည်းရိုး',
        };
      case 'campfire':
        return {
          name: 'မီးဖို',
          size: '၁x၁ ကွက်',
          icon: '🔥',
          desc: 'အနွေးဓာတ်ပေးပြီး အသား/ငါး ကင်နိုင်သော ကျောက်စီမီးဖို',
        };
      case 'storage_box':
        return {
          name: 'သိုလှောင်သေတ္တာ',
          size: '၁x၁ ကွက်',
          icon: '📦',
          desc: 'ပစ္စည်းနှင့် သယံဇာတများ သိမ်းဆည်းနိုင်သော သေတ္တာ',
        };
      case 'lantern':
        return {
          name: 'မီးအိမ်တိုင်',
          size: '၁x၁ ကွက်',
          icon: '🏮',
          desc: 'ညဘက် လင်းထိန်စေသော သစ်သားမီးတိုင်',
        };
      case 'decor_bench':
        return {
          name: 'ဥယျာဉ်ထိုင်ခုံ',
          size: '၁x၁ ကွက်',
          icon: '🪑',
          desc: 'အိမ်ခြံဝင်းအပြင်တွင် အပန်းဖြေရန် ထားရှိနိုင်သော သစ်သားထိုင်ခုံ',
        };
      case 'decor_flower_pot':
        return {
          name: 'ပန်းအိုးအလှ',
          size: '၁x၁ ကွက်',
          icon: '🪴',
          desc: 'အိမ်ရှေ့နှင့် ခြံဝင်းအလှဆင်ရန် ရောင်စုံပန်းအိုးငယ်',
        };
      case 'decor_flowerbed':
        return {
          name: 'ပန်းခင်းငယ်',
          size: '၁x၁ ကွက်',
          icon: '🌷',
          desc: 'ခြံဝင်းထဲတွင် စိုက်ပျိုးအလှဆင်နိုင်သော သစ်သားဘောင်ပန်းခင်း',
        };
      case 'decor_flower_stand':
        return {
          name: 'ပန်းစင်အလှ',
          size: '၁x၁ ကွက်',
          icon: '💐',
          desc: 'ပန်းမျိုးစုံ တင်ဆင်နိုင်သော သစ်သားပန်းစင်',
        };
      default:
        return {
          name: 'အဆောက်အအုံ',
          size: '၁x၁ ကွက်',
          icon: '🏗️',
          desc: 'ဆောက်လုပ်ထားသော အဆောက်အအုံ',
        };
    }
  };

  const info = getBuildingInfo(building.type);

  return (
    <div className={UI_THEME.backdrop} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${UI_THEME.panel} max-w-md`}
      >
        {/* Header */}
        <div className={UI_THEME.header}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#252019] border border-[#463c2f] flex items-center justify-center text-2xl shrink-0">
              {info.icon}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight leading-snug truncate">
                {info.name}
              </h2>
              <div className="flex items-center flex-wrap gap-2 text-xs text-[#b7ad9d] mt-0.5">
                <span className="flex items-center gap-1 font-mono">
                  <MapPin size={11} className="text-emerald-400" />
                  X:{building.tileX}, Y:{building.tileY}
                </span>
                <span>•</span>
                <span>{info.size}</span>
                {building.type === 'fence_wood' && (
                  <>
                    <span>•</span>
                    <span className="text-amber-300">
                      {(building.rotation ?? 0) % 2 === 0 ? '↖↘ တန်းလျက်' : '↗↙ ၉၀° လှည့်'}
                    </span>
                  </>
                )}
              </div>
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
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {!isConfirmingDemolish ? (
            <>
              <p className={`text-xs text-[#d1c8b8] leading-relaxed p-3.5 ${UI_THEME.subCard}`}>
                {info.desc}
              </p>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                {building.type === 'storage_box' && onOpenStorage && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenStorage(building);
                      onClose();
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-amber-500/18 border border-amber-500/45 hover:bg-amber-500/28 text-amber-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
                  >
                    <Package size={16} />
                    <span>သိုလှောင်သေတ္တာဖွင့်မည်</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onMove(building);
                    onClose();
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-[#27221b] hover:bg-[#332c23] text-stone-100 font-bold text-xs flex items-center justify-center gap-2 border border-[#473e32] transition cursor-pointer active:scale-[0.98]"
                >
                  <Move size={16} className="text-sky-400" />
                  <span>
                    {building.type === 'fence_wood'
                      ? 'နေရာရွှေ့ / လှည့်မည်'
                      : 'အဆောက်အအုံ နေရာရွှေ့ပြောင်းမည်'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsConfirmingDemolish(true)}
                  className="w-full py-3 px-4 rounded-xl bg-rose-950/35 hover:bg-rose-950/60 text-rose-300 border border-rose-700/55 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
                >
                  <Trash2 size={16} className="text-rose-400" />
                  <span>အဆောက်အအုံ ဖျက်သိမ်းမည်</span>
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4 bg-rose-950/25 border border-rose-700/50 p-4 rounded-xl">
              <div className="flex items-center gap-2.5 text-rose-300">
                <AlertTriangle size={20} className="shrink-0 text-rose-400" />
                <h3 className="font-bold text-sm leading-snug">
                  အမှန်တကယ် ဖျက်သိမ်းလိုပါသလား?
                </h3>
              </div>

              <p className="text-xs text-[#d6cec0] leading-relaxed">
                ဤအဆောက်အအုံကို ဖျက်သိမ်းပါက ဆောက်လုပ်ရာတွင် အသုံးပြုခဲ့သော ပစ္စည်းများအားလုံးကို အိတ်ထဲသို့ ပြန်လည်ထည့်သွင်းပေးပါမည်။
              </p>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsConfirmingDemolish(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#28221b] hover:bg-[#352d24] border border-[#453b2f] text-stone-200 transition cursor-pointer"
                >
                  မဖျက်တော့ပါ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDemolish(building);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40 transition cursor-pointer"
                >
                  ဖျက်သိမ်းမည်
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
