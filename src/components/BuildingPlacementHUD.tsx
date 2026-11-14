/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Check, X, Move, AlertCircle, MapPin, RotateCw } from 'lucide-react';
import { BuildingType, FenceRotation } from '../game/types';

interface BuildingPlacementHUDProps {
  buildingType: BuildingType;
  isMoving?: boolean;
  tileX: number;
  tileY: number;
  rotation?: FenceRotation;
  valid: boolean;
  reason?: string;
  onRotate?: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export const BuildingPlacementHUD: React.FC<BuildingPlacementHUDProps> = ({
  buildingType,
  isMoving = false,
  tileX,
  tileY,
  rotation = 0,
  valid,
  reason,
  onRotate,
  onConfirm,
  onCancel,
}) => {
  const getBuildingLabel = (type: BuildingType) => {
    switch (type) {
      case 'house_small':
        return { name: 'သစ်သားအိမ်ငယ်', size: '၂x၂', icon: '🏡' };
      case 'house_medium':
        return { name: 'နှစ်ထပ်သစ်သားအိမ်', size: '၃x၂', icon: '🏘️' };
      case 'house_large':
        return { name: 'စံအိမ်ကြီး', size: '၃x၃', icon: '🏰' };
      case 'fence_wood':
        return { name: 'သစ်သားခြံစည်းရိုး', size: '၁x၁', icon: '🪵' };
      case 'campfire':
        return { name: 'မီးဖို', size: '၁x၁', icon: '🔥' };
      case 'storage_box':
        return { name: 'သိုလှောင်သေတ္တာ', size: '၁x၁', icon: '📦' };
      case 'lantern':
        return { name: 'မီးအိမ်တိုင်', size: '၁x၁', icon: '🏮' };
      default:
        return { name: 'အဆောက်အအုံ', size: '၁x၁', icon: '🏗️' };
    }
  };

  const getRotationLabel = (rot: FenceRotation) => {
    switch (rot) {
      case 0:
        return '↖↘ NW–SE (ပုံမှန်)';
      case 1:
        return '↗↙ NE–SW (၉၀°)';
      case 2:
        return '↖↘ NW–SE တိုင်ကြီး';
      case 3:
        return '↗↙ NE–SW တိုင်ကြီး';
      default:
        return '↖↘ NW–SE';
    }
  };

  const info = getBuildingLabel(buildingType);
  const isFence = buildingType === 'fence_wood';

  const stopProp = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      onTouchStart={stopProp}
      onPointerDown={stopProp}
      className="fixed bottom-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:bottom-5 z-40 w-[calc(100vw-8.5rem)] sm:w-[95%] max-w-md select-none pointer-events-auto"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div className="bg-stone-900/95 backdrop-blur-md border border-stone-700/80 rounded-2xl shadow-2xl p-3 sm:p-4 text-stone-200 space-y-2.5">
        {/* Header: Title and coordinates */}
        <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl sm:text-2xl shrink-0">{info.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
                  {isMoving ? `ရွှေ့ပြောင်း: ${info.name}` : info.name}
                </h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-mono">
                  {info.size}
                </span>
                {isFence && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                    {getRotationLabel(rotation)}
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-stone-400 truncate">
                မြေပြင်ကို တို့ထိ၍ နေရာရွေးပြီးမှ &quot;ဆောက်လုပ်မည်&quot; ကို နှိပ်ပါ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-800/80 text-[10px] sm:text-[11px] font-mono text-stone-300 shrink-0">
            <MapPin size={11} className="text-emerald-400" />
            <span>{tileX},{tileY}</span>
          </div>
        </div>

        {/* Validation Status message */}
        <div
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-medium border ${
            valid
              ? 'bg-emerald-950/70 border-emerald-700/70 text-emerald-300'
              : 'bg-rose-950/70 border-rose-700/70 text-rose-300'
          }`}
        >
          {valid ? (
            <>
              <Check size={14} className="text-emerald-400 shrink-0" />
              <span className="leading-tight">ဆောက်လုပ်နိုင်သော နေရာဖြစ်ပါသည်</span>
            </>
          ) : (
            <>
              <AlertCircle size={14} className="text-rose-400 shrink-0" />
              <span className="leading-tight">{reason || 'ဤနေရာတွင် ဆောက်လုပ်၍မရပါ'}</span>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-0.5 flex-wrap">
          {isFence && onRotate && (
            <button
              type="button"
              onClick={onRotate}
              className="px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-amber-600/25 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <RotateCw size={14} />
              <span>လှည့်မည် (R)</span>
            </button>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-300 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <X size={14} />
            <span>ပယ်ဖျက်</span>
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={!valid}
            className={`px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg ${
              valid
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40 cursor-pointer active:scale-95'
                : 'bg-stone-800 text-stone-500 border border-stone-700/50 cursor-not-allowed'
            }`}
          >
            {isMoving ? <Move size={14} /> : <Check size={14} />}
            <span>{isMoving ? 'ရွှေ့မည်' : 'ဆောက်လုပ်မည်'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
