/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Check, X, Move, AlertCircle, MapPin, RotateCw } from 'lucide-react';
import { BuildingType, FenceRotation } from '../game/types';
import { UI_THEME } from './uiTheme';

interface BuildingPlacementHUDProps {
  buildingType: BuildingType;
  isMoving?: boolean;
  tileX: number;
  tileY: number;
  rotation?: FenceRotation;
  valid: boolean;
  reason?: string;
  stockLabel?: string;
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
  stockLabel,
  onRotate,
  onConfirm,
  onCancel,
}) => {
  const getBuildingLabel = (type: BuildingType) => {
    switch (type) {
      case 'house_small':
        return { name: 'သစ်သားအိမ်ငယ်', size: '၂×၂', icon: '🏡' };
      case 'house_medium':
        return { name: 'နှစ်ထပ်သစ်သားအိမ်', size: '၃×၂', icon: '🏘️' };
      case 'house_large':
        return { name: 'စံအိမ်ကြီး', size: '၃×၃', icon: '🏰' };
      case 'fence_wood':
        return { name: 'သစ်သားခြံစည်းရိုး', size: '၁×၁', icon: '🪵' };
      case 'campfire':
        return { name: 'မီးဖို', size: '၁×၁', icon: '🔥' };
      case 'storage_box':
        return { name: 'သိုလှောင်သေတ္တာ', size: '၁×၁', icon: '📦' };
      case 'lantern':
        return { name: 'မီးအိမ်တိုင်', size: '၁×၁', icon: '🏮' };
      case 'decor_bench':
        return { name: 'ဥယျာဉ်ထိုင်ခုံ', size: '၁×၁', icon: '🪑' };
      case 'decor_flower_pot':
        return { name: 'ပန်းအိုးအလှ', size: '၁×၁', icon: '🪴' };
      case 'decor_flowerbed':
        return { name: 'ပန်းခင်းငယ်', size: '၁×၁', icon: '🌷' };
      case 'decor_flower_stand':
        return { name: 'ပန်းစင်အလှ', size: '၁×၁', icon: '💐' };
      default:
        return { name: 'အဆောက်အအုံ', size: '၁×၁', icon: '🏗️' };
    }
  };

  const getRotationLabel = (rot: FenceRotation) => {
    switch (rot) {
      case 0:
        return '↖↘ တန်းလျက် (ပုံမှန်)';
      case 1:
        return '↗↙ ၉၀° လှည့်';
      case 2:
        return '↖↘ တိုင်ကြီး';
      case 3:
        return '↗↙ တိုင်ကြီး (၉၀°)';
      default:
        return '↖↘ တန်းလျက်';
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
      <div className="rc-panel-enter bg-[#1b1814]/96 backdrop-blur-md border border-[#4a4134] rounded-2xl shadow-2xl p-3 sm:p-4 text-stone-200 space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[#3a3329] pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl sm:text-2xl shrink-0">{info.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-xs sm:text-sm font-bold text-white leading-snug truncate">
                  {isMoving ? `ရွှေ့ပြောင်း: ${info.name}` : info.name}
                </h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#28221b] border border-[#453b2f] text-stone-300 font-mono">
                  {info.size}
                </span>
                {isFence && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300">
                    {getRotationLabel(rotation)}
                  </span>
                )}
                {isFence && stockLabel && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-700/40 text-emerald-300 font-mono">
                    {stockLabel}
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#a89f91] truncate leading-snug">
                မြေပြင်ကို တို့ထိ၍ နေရာရွေးပြီးမှ &quot;ဆောက်လုပ်မည်&quot; ကို နှိပ်ပါ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#252019] border border-[#3e362c] text-[10px] sm:text-[11px] font-mono text-stone-200 shrink-0">
            <MapPin size={11} className="text-emerald-400" />
            <span>
              {tileX},{tileY}
            </span>
          </div>
        </div>

        {/* Validation Status */}
        <div
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-medium border ${
            valid
              ? 'bg-emerald-950/65 border-emerald-700/65 text-emerald-300'
              : 'bg-rose-950/65 border-rose-700/65 text-rose-300'
          }`}
        >
          {valid ? (
            <>
              <Check size={14} className="text-emerald-400 shrink-0" />
              <span className="leading-snug">ဆောက်လုပ်နိုင်သော နေရာဖြစ်ပါသည်</span>
            </>
          ) : (
            <>
              <AlertCircle size={14} className="text-rose-400 shrink-0" />
              <span className="leading-snug">{reason || 'ဤနေရာတွင် ဆောက်လုပ်၍မရပါ'}</span>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-0.5 flex-wrap">
          {isFence && onRotate && (
            <button
              type="button"
              onClick={onRotate}
              className="px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-amber-500/18 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <RotateCw size={14} />
              <span>လှည့်မည် [R]</span>
            </button>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold bg-[#27221b] border border-[#453b2f] hover:bg-[#342d24] text-stone-200 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <X size={14} />
            <span>ပယ်ဖျက်</span>
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={!valid}
            className={`px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold flex items-center gap-1.5 ${
              valid ? UI_THEME.primaryGreenBtn : UI_THEME.disabledBtn
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
