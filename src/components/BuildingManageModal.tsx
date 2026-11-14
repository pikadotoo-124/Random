/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Home, Trash2, Move, Package, X, AlertTriangle, ShieldCheck, Clock, MapPin } from 'lucide-react';
import { PlacedBuilding } from '../game/types';

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
        return { name: 'သစ်သားအိမ်ငယ် (Wooden Cottage)', size: '၂x၂ ကွက်', icon: '🏡', desc: 'နွေးထွေးသော အမိုးနှင့် ပြတင်းပေါက်ပါ သစ်သားအိမ်ငယ်' };
      case 'house_medium':
        return { name: 'နှစ်ထပ်သစ်သားအိမ် (Timber Manor)', size: '၃x၂ ကွက်', icon: '🏘️', desc: 'ကျယ်ဝန်းသော နှစ်ထပ်သစ်သားနှင့် ကျောက်သားစပ် လူနေအိမ်ကောင်း' };
      case 'house_large':
        return { name: 'စံအိမ်ကြီး (Grand Villa)', size: '၃x၃ ကွက်', icon: '🏰', desc: 'ခိုင်ခံ့သော ကျောက်အုတ်မြစ်နှင့် နှစ်ထပ်ခေါင်မိုးပါ ဥယျာဉ်စံအိမ်ကြီး' };
      case 'fence_wood':
        return { name: 'သစ်သားခြံစည်းရိုး (Wooden Fence)', size: '၁x၁ ကွက်', icon: '🪵', desc: 'အိမ်ခြံဝင်း ကာရံထားသော သစ်သားစည်းရိုး' };
      case 'campfire':
        return { name: 'မီးဖို (Campfire)', size: '၁x၁ ကွက်', icon: '🔥', desc: 'အနွေးဓာတ်ပေးပြီး အသား/ငါး ကင်နိုင်သော ကျောက်စီမီးဖို' };
      case 'storage_box':
        return { name: 'သိုလှောင်သေတ္တာ (Storage Chest)', size: '၁x၁ ကွက်', icon: '📦', desc: 'ပစ္စည်းနှင့် သယံဇာတများ သိမ်းဆည်းနိုင်သော သေတ္တာ' };
      case 'lantern':
        return { name: 'မီးအိမ်တိုင် (Lantern Post)', size: '၁x၁ ကွက်', icon: '🏮', desc: 'ညဘက် လင်းထိန်စေသော သစ်သားမီးတိုင်' };
      default:
        return { name: 'အဆောက်အအုံ (Building)', size: '၁x၁ ကွက်', icon: '🏗️', desc: 'ဆောက်လုပ်ထားသော အဆောက်အအုံ' };
    }
  };

  const info = getBuildingInfo(building.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-md bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800 bg-stone-950/40">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{info.icon}</span>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">{info.name}</h2>
              <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5">
                <span className="flex items-center gap-1">
                  <MapPin size={11} className="text-emerald-400" />
                  X:{building.tileX}, Y:{building.tileY}
                </span>
                <span>•</span>
                <span>{info.size}</span>
                {building.type === 'fence_wood' && (
                  <>
                    <span>•</span>
                    <span className="text-amber-300">
                      {((building.rotation ?? 0) % 2 === 0) ? '↖↘ NW–SE' : '↗↙ NE–SW'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {!isConfirmingDemolish ? (
            <>
              <p className="text-xs text-stone-300 leading-relaxed bg-stone-950/40 p-3 rounded-xl border border-stone-800/80">
                {info.desc}
              </p>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                {/* Storage Box option */}
                {building.type === 'storage_box' && onOpenStorage && (
                  <button
                    onClick={() => {
                      onOpenStorage(building);
                      onClose();
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-amber-600/20 border border-amber-600/50 hover:bg-amber-600/30 text-amber-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
                  >
                    <Package size={16} />
                    <span>သိုလှောင်သေတ္တာဖွင့်မည် (Open Chest)</span>
                  </button>
                )}

                {/* Move Button */}
                <button
                  onClick={() => {
                    onMove(building);
                    onClose();
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs flex items-center justify-center gap-2 border border-stone-700 transition cursor-pointer active:scale-95"
                >
                  <Move size={16} className="text-sky-400" />
                  <span>
                    {building.type === 'fence_wood'
                      ? 'နေရာရွှေ့ / လှည့်မည် (Move & Rotate)'
                      : 'အဆောက်အအုံ နေရာရွှေ့ပြောင်းမည် (Move)'}
                  </span>
                </button>

                {/* Demolish Button */}
                <button
                  onClick={() => setIsConfirmingDemolish(true)}
                  className="w-full py-3 px-4 rounded-xl bg-rose-950/30 hover:bg-rose-950/60 text-rose-300 border border-rose-800/60 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
                >
                  <Trash2 size={16} className="text-rose-400" />
                  <span>အဆောက်အအုံ ဖျက်သိမ်းမည် (Demolish & Refund)</span>
                </button>
              </div>
            </>
          ) : (
            /* Demolish Confirmation Mode */
            <div className="space-y-4 bg-rose-950/20 border border-rose-800/50 p-4 rounded-xl">
              <div className="flex items-center gap-2.5 text-rose-400">
                <AlertTriangle size={20} className="shrink-0" />
                <h3 className="font-bold text-sm">အမှန်တကယ် ဖျက်သိမ်းလိုပါသလား?</h3>
              </div>

              <p className="text-xs text-stone-300 leading-relaxed">
                ဤအဆောက်အအုံကို ဖျက်သိမ်းပါက ဆောက်လုပ်ရာတွင် အသုံးပြုခဲ့သော ပစ္စည်းများအားလုံးကို အိတ်ထဲသို့ ပြန်လည်ထည့်သွင်းပေးပါမည်။
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsConfirmingDemolish(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-300 transition cursor-pointer"
                >
                  မဖျက်တော့ပါ (Cancel)
                </button>
                <button
                  onClick={() => {
                    onDemolish(building);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40 transition cursor-pointer"
                >
                  ဖျက်သိမ်းမည် (Confirm)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
