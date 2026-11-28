/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CheckCircle2, Coins, Fence, Loader2, Lock, MapPin, Sprout, X } from 'lucide-react';
import { FARM_PLOT_PURCHASES_LOCKED, FARM_PLOT_PURCHASE_LOCK_REASON } from '../game/constants';
import { ConnectionStatus } from '../game/multiplayer/types';
import {
  formatFarmSignboardText,
  getFarmPlotDimensionsLabel,
  getShortFarmPlotName,
} from '../game/systems/FarmPlotOwnershipSystem';
import { FarmPlotDefinition, FarmPlotOwnerRecord } from '../game/types';
import { SoundSynth } from '../game/utils/SoundSynth';
import { UI_THEME } from './uiTheme';

interface FarmPlotPurchaseModalProps {
  plot: FarmPlotDefinition;
  owner?: FarmPlotOwnerRecord;
  currentUserId?: string;
  playerCoins: number;
  connectionStatus: ConnectionStatus;
  onPurchase: (plotId: string) => Promise<{
    ok: boolean;
    message: string;
    remainingGold?: number;
  }>;
  onBuildFence: () => void;
  onClose: () => void;
}

export const FarmPlotPurchaseModal: React.FC<FarmPlotPurchaseModalProps> = ({
  plot,
  owner,
  currentUserId,
  playerCoins,
  connectionStatus,
  onPurchase,
  onBuildFence,
  onClose,
}) => {
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(
    null
  );

  const isOwned = Boolean(owner);
  const isMine = Boolean(owner && currentUserId && owner.ownerId === currentUserId);
  const isOnline = connectionStatus === 'connected';
  const isPurchaseLocked = !isOwned && FARM_PLOT_PURCHASES_LOCKED;
  const hasEnoughGold = playerCoins >= plot.purchasePrice;
  const shortName = getShortFarmPlotName(plot);
  const dimensions = getFarmPlotDimensionsLabel(plot);
  const signboardLabel = formatFarmSignboardText(
    plot,
    owner,
    currentUserId,
    FARM_PLOT_PURCHASES_LOCKED
  );

  const handleConfirmPurchase = async () => {
    if (isPurchasing || isOwned || isPurchaseLocked || !isOnline || !hasEnoughGold) {
      SoundSynth.playRustle();
      return;
    }

    setIsPurchasing(true);
    setFeedback(null);
    try {
      const res = await onPurchase(plot.id);
      if (res.ok) {
        SoundSynth.playCoin();
        setFeedback({ type: 'success', message: res.message });
      } else {
        SoundSynth.playRustle();
        setFeedback({ type: 'error', message: res.message });
      }
    } catch {
      SoundSynth.playRustle();
      setFeedback({
        type: 'error',
        message: 'မြေကွက်ဝယ်ယူရာတွင် ဆာဗာချိတ်ဆက်မှု အမှားဖြစ်ပေါ်ခဲ့ပါသည်',
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <div className={UI_THEME.backdrop} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${UI_THEME.panel} max-w-md`}
      >
        {/* Header */}
        <div className={UI_THEME.header}>
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
                isMine
                  ? 'bg-emerald-950/75 border-emerald-600/55 text-emerald-300'
                  : isOwned
                  ? 'bg-sky-950/75 border-sky-600/55 text-sky-300'
                  : 'bg-amber-950/75 border-amber-700/55 text-amber-300'
              }`}
            >
              <Sprout size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight leading-snug truncate">
                {shortName} — စိုက်ပျိုးမြေကွက်
              </h2>
              <p className="text-xs text-[#b7ad9d] leading-snug truncate">
                Farming District • {dimensions}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className={UI_THEME.goldBadge}>
              <span>🪙</span>
              <span className="font-mono">{playerCoins}</span>
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

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Plot Info Card */}
          <div className={`${UI_THEME.subCard} p-3.5 space-y-2.5`}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#b7ad9d] flex items-center gap-1.5">
                <MapPin size={13} className="text-emerald-400 shrink-0" />
                <span>တည်နေရာ</span>
              </span>
              <span className="font-mono font-bold text-stone-200">
                X: {plot.bounds.minX}–{plot.bounds.maxX}, Y: {plot.bounds.minY}–{plot.bounds.maxY}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#b7ad9d]">မြေကွက်အကျယ်</span>
              <span className="font-mono font-semibold text-stone-200">{dimensions}</span>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#b7ad9d] flex items-center gap-1.5">
                <Coins size={13} className="text-amber-400 shrink-0" />
                <span>ဝယ်ယူခ</span>
              </span>
              <span className="font-mono font-bold text-amber-300">
                🪙 {plot.purchasePrice.toLocaleString()} ရွှေ
              </span>
            </div>

            <div className="px-2.5 py-2 rounded-lg bg-[#1d1710] border border-[#3f3426] text-[11px] font-semibold text-amber-200/95 leading-snug">
              {signboardLabel}
            </div>

            <div className="pt-2 border-t border-[#342d24] flex items-center justify-between gap-2 text-xs">
              <span className="text-[#b7ad9d]">ပိုင်ဆိုင်မှု အခြေအနေ</span>
              {isMine ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold">
                  <CheckCircle2 size={12} />
                  <span>သင်ပိုင်ဆိုင်သည် ({owner?.ownerName})</span>
                </span>
              ) : isOwned ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/20 border border-sky-500/40 text-sky-300 font-bold">
                  <Lock size={12} />
                  <span>{owner?.ownerName}</span>
                </span>
              ) : isPurchaseLocked ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-200 font-bold">
                  <Lock size={12} />
                  <span>ဝယ်ယူမှု ယာယီပိတ်ထားသည်</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold">
                  ဝယ်ယူနိုင်သည်
                </span>
              )}
            </div>
          </div>

          {/* Ownership Rules Hint */}
          <div className="text-xs text-[#c7beae] bg-[#14110e]/85 border border-[#342d24] rounded-xl p-3.5 leading-relaxed space-y-1">
            {isMine ? (
              <>
                <p className="text-emerald-300 font-semibold">
                  🏡 ဤစိုက်ပျိုးမြေကွက်သည် သင့်ပိုင်ဆိုင်မှု ဖြစ်ပါသည်။
                </p>
                <p>
                  မြေကွက်အတွင်း <strong>သစ်သားခြံစည်းရိုး (Fence)</strong> များကို ဆက်တိုက်ချိတ်ဆက် ဆောက်လုပ်နိုင်ပါသည် (အပြင်လမ်းများကို မပိတ်ပါ)။
                </p>
              </>
            ) : isOwned ? (
              <>
                <p className="text-sky-300 font-semibold">
                  🔒 ပိုင်ရှင်: {owner?.ownerName}
                </p>
                <p>
                  အခြားကစားသမား ပိုင်ဆိုင်ထားပြီးသား စိုက်ပျိုးမြေကွက်ဖြစ်သောကြောင့် ဝယ်ယူခြင်းနှင့် ခြံစည်းရိုးဆောက်/ဖျက်ခြင်း မပြုလုပ်နိုင်ပါ။
                </p>
              </>
            ) : (
              <>
                <p className="text-amber-200 font-semibold">
                  🌾 ကိုယ်ပိုင် စိုက်ပျိုးမြေကွက် ဝယ်ယူပါ
                </p>
                <p>
                  ဝယ်ယူပြီးပါက ဤမြေကွက်အတွင်း၌ သင့်စိတ်ကြိုက် သစ်သားခြံစည်းရိုး (Fence) များကို လုံခြုံစွာ ကာရံတည်ဆောက်နိုင်ပါမည်။
                </p>
              </>
            )}
          </div>

          {/* Feedback banner */}
          {feedback && (
            <div
              className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold leading-relaxed ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/45 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-500/45 text-rose-200'
              }`}
            >
              {feedback.message}
            </div>
          )}

          {/* Action Buttons */}
          {isMine ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onBuildFence();
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 ${UI_THEME.primaryGreenBtn}`}
              >
                <Fence size={16} />
                <span>ခြံစည်းရိုး ဆောက်လုပ်မည်</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#27221b] hover:bg-[#352d24] border border-[#463c2f] text-stone-200 transition cursor-pointer"
              >
                ပိတ်မည်
              </button>
            </div>
          ) : isOwned ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#27221b] hover:bg-[#352d24] border border-[#463c2f] text-stone-200 transition cursor-pointer"
            >
              ပိတ်မည်
            </button>
          ) : (
            <div className="space-y-2">
              {isPurchaseLocked && (
                <div className="px-3 py-2.5 rounded-xl bg-amber-950/55 border border-amber-500/45 text-[11px] text-amber-200 leading-relaxed">
                  🔒 {FARM_PLOT_PURCHASE_LOCK_REASON}
                </div>
              )}
              {!isPurchaseLocked && !isOnline && (
                <div className="text-[11px] text-amber-300 text-center">
                  ⚠️ အွန်လိုင်းဆာဗာနှင့် ချိတ်ဆက်ပြီးမှသာ မြေကွက်ဝယ်ယူနိုင်ပါသည်
                </div>
              )}
              {!isPurchaseLocked && isOnline && !hasEnoughGold && (
                <div className="text-[11px] text-rose-300 text-center">
                  ရွှေဒင်္ဂါး မလုံလောက်ပါ — နောက်ထပ် 🪙 {(plot.purchasePrice - playerCoins).toLocaleString()} ရွှေ လိုအပ်ပါသည်
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleConfirmPurchase}
                  disabled={isPurchasing || isPurchaseLocked || !isOnline || !hasEnoughGold}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 ${
                    !isPurchasing && !isPurchaseLocked && isOnline && hasEnoughGold
                      ? UI_THEME.primaryAmberBtn
                      : UI_THEME.disabledBtn
                  }`}
                >
                  {isPurchasing ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>ဝယ်ယူနေသည်...</span>
                    </>
                  ) : isPurchaseLocked ? (
                    <>
                      <Lock size={15} />
                      <span>Gold Ledger စစ်ဆေးနေဆဲ (ယာယီပိတ်)</span>
                    </>
                  ) : (
                    <>
                      <Coins size={15} />
                      <span>🪙 {plot.purchasePrice.toLocaleString()} ရွှေဖြင့် ဝယ်ယူမည်</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#27221b] hover:bg-[#352d24] border border-[#463c2f] text-stone-200 transition cursor-pointer"
                >
                  {isPurchaseLocked ? 'ပိတ်မည်' : 'မဝယ်သေးပါ'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
