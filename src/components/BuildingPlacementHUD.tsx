/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Check, X, Move, AlertCircle, MapPin } from 'lucide-react';
import { BuildingType } from '../game/types';

interface BuildingPlacementHUDProps {
  buildingType: BuildingType;
  isMoving?: boolean;
  tileX: number;
  tileY: number;
  valid: boolean;
  reason?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const BuildingPlacementHUD: React.FC<BuildingPlacementHUDProps> = ({
  buildingType,
  isMoving = false,
  tileX,
  tileY,
  valid,
  reason,
  onConfirm,
  onCancel,
}) => {
  const getBuildingLabel = (type: BuildingType) => {
    switch (type) {
      case 'house_small':
        return { name: 'သစ်သားအိမ်ငယ် (Wooden Cottage)', size: '၂x၂ ကွက်', icon: '🏡' };
      case 'house_medium':
        return { name: 'နှစ်ထပ်သစ်သားအိမ် (Timber Manor)', size: '၃x၂ ကွက်', icon: '🏘️' };
      case 'house_large':
        return { name: 'စံအိမ်ကြီး (Grand Villa)', size: '၃x၃ ကွက်', icon: '🏰' };
      case 'fence_wood':
        return { name: 'သစ်သားခြံစည်းရိုး (Wooden Fence)', size: '၁x၁ ကွက်', icon: '🪵' };
      case 'campfire':
        return { name: 'မီးဖို (Campfire)', size: '၁x၁ ကွက်', icon: '🔥' };
      case 'storage_box':
        return { name: 'သိုလှောင်သေတ္တာ (Storage Chest)', size: '၁x၁ ကွက်', icon: '📦' };
      case 'lantern':
        return { name: 'မီးအိမ်တိုင် (Lantern Post)', size: '၁x၁ ကွက်', icon: '🏮' };
      default:
        return { name: 'အဆောက်အအုံ (Building)', size: '၁x၁ ကွက်', icon: '🏗️' };
    }
  };

  const info = getBuildingLabel(buildingType);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-lg select-none pointer-events-auto">
      <div className="bg-stone-900/95 backdrop-blur-md border border-stone-700/80 rounded-2xl shadow-2xl p-4 text-stone-200 space-y-3">
        {/* Header: Title and coordinates */}
        <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-2.5">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{info.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  {isMoving ? `ရွှေ့ပြောင်းနေသည်: ${info.name}` : info.name}
                </h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-mono">
                  {info.size}
                </span>
              </div>
              <p className="text-[11px] text-stone-400">
                မြေပြင်ပေါ်တွင် ထိတွေ့/ကလစ်နှိပ်၍ အဆောက်အအုံ နေရာရွှေ့ပါ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-800/80 text-[11px] font-mono text-stone-300 shrink-0">
            <MapPin size={12} className="text-emerald-400" />
            <span>X:{tileX}, Y:{tileY}</span>
          </div>
        </div>

        {/* Validation Status message */}
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border ${
            valid
              ? 'bg-emerald-950/70 border-emerald-700/70 text-emerald-300'
              : 'bg-rose-950/70 border-rose-700/70 text-rose-300'
          }`}
        >
          {valid ? (
            <>
              <Check size={16} className="text-emerald-400 shrink-0" />
              <span>ဤနေရာတွင် ဆောက်လုပ်နိုင်ပါသည် (ဆောက်လုပ်မည်ကို နှိပ်ပါ)</span>
            </>
          ) : (
            <>
              <AlertCircle size={16} className="text-rose-400 shrink-0" />
              <span className="leading-tight">{reason || 'ဤနေရာတွင် ဆောက်လုပ်၍မရပါ'}</span>
            </>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-300 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <X size={14} />
            <span>ပယ်ဖျက်မည် (ESC)</span>
          </button>

          <button
            onClick={onConfirm}
            disabled={!valid}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg ${
              valid
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40 cursor-pointer active:scale-95'
                : 'bg-stone-800 text-stone-500 border border-stone-700/50 cursor-not-allowed'
            }`}
          >
            {isMoving ? <Move size={14} /> : <Check size={14} />}
            <span>{isMoving ? 'ဤနေရာသို့ ရွှေ့မည်' : 'ဆောက်လုပ်မည်'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
