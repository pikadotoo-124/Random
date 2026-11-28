/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ArrowRight, Axe, Coins, Compass, Fish, Flame, Hammer, MessageCircle, Package, Shirt, Signpost, Sprout, X } from 'lucide-react';
import type { FishingHudState } from '../game/scenes/WorldScene';
import type { MerchantGuideInfo } from '../game/types';
import { UI_THEME } from './uiTheme';

interface ActionPromptHUDProps {
  prompt: {
    type: string;
    title: string;
    subtitle: string;
    actionKey: string;
    targetId?: string;
  } | null;
  onTrigger: () => void;
  isTouchMode?: boolean;
  tutorialCompleted?: boolean;
  onDismissTutorial?: () => void;
  isBuildMode?: boolean;
  enteredZoneBanner?: { name: string; color: string } | null;
  fishingState?: FishingHudState | null;
  onCatchFishing?: () => void;
  onCancelFishing?: () => void;
  merchantGuide?: MerchantGuideInfo | null;
  onDismissMerchantGuide?: () => void;
}

export const ActionPromptHUD: React.FC<ActionPromptHUDProps> = ({
  prompt,
  onTrigger,
  isTouchMode = false,
  tutorialCompleted = true,
  onDismissTutorial,
  isBuildMode = false,
  enteredZoneBanner = null,
  fishingState = null,
  onCatchFishing,
  onCancelFishing,
  merchantGuide = null,
  onDismissMerchantGuide,
}) => {
  const [showOnboarding, setShowOnboarding] = useState<boolean>(!tutorialCompleted);
  const [visibleTargetKey, setVisibleTargetKey] = useState<string | null>(null);

  // One-time brief onboarding hint at game start (~6s)
  useEffect(() => {
    if (tutorialCompleted) {
      setShowOnboarding(false);
      return;
    }
    setShowOnboarding(true);
    const timer = setTimeout(() => {
      setShowOnboarding(false);
      onDismissTutorial?.();
    }, 6000);
    return () => clearTimeout(timer);
  }, [tutorialCompleted, onDismissTutorial]);

  // Brief contextual hint (~2.8s) only when moving close to a new interactable target
  useEffect(() => {
    if (!prompt || isBuildMode || fishingState?.active) {
      setVisibleTargetKey(null);
      return;
    }

    const key = prompt.targetId || `${prompt.type}:${prompt.title}`;
    setVisibleTargetKey(key);

    const timer = setTimeout(() => {
      setVisibleTargetKey((current) => (current === key ? null : current));
    }, 2800);

    return () => clearTimeout(timer);
  }, [prompt, isBuildMode, fishingState?.active]);

  const getIcon = () => {
    if (!prompt) return null;
    switch (prompt.type) {
      case 'shop':
        return <Coins className="text-amber-400" size={14} />;
      case 'clothing_shop':
        return <Shirt className="text-rose-300" size={14} />;
      case 'crafting':
        return <Hammer className="text-sky-400" size={14} />;
      case 'campfire':
        return <Flame className="text-orange-400" size={14} />;
      case 'storage':
        return <Package className="text-emerald-400" size={14} />;
      case 'npc':
        return <MessageCircle className="text-pink-400" size={14} />;
      case 'signpost':
        return <Signpost className="text-amber-300" size={14} />;
      case 'farm_plot':
        return <Sprout className="text-emerald-400" size={14} />;
      default:
        return <Axe className="text-yellow-400" size={14} />;
    }
  };

  const currentKey = prompt ? prompt.targetId || `${prompt.type}:${prompt.title}` : null;
  const shouldShowContextPill = Boolean(
    prompt && !isBuildMode && !fishingState?.active && visibleTargetKey === currentKey
  );

  const inSweetSpot = Boolean(
    fishingState &&
      fishingState.phase === 'bite' &&
      fishingState.cursorPos >= fishingState.sweetMin &&
      fishingState.cursorPos <= fishingState.sweetMax
  );

  return (
    <>
      {/* 1. One-time gentle onboarding toast at game start */}
      {showOnboarding && !isBuildMode && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-sm w-[92%]"
          onTouchStart={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className={`rc-toast-enter flex items-center justify-between gap-3 ${UI_THEME.hudPill} border-amber-500/40 px-3.5 py-2.5 text-xs text-stone-200`}>
            <span className="leading-relaxed">
              {isTouchMode
                ? '🎮 ဘယ်ဘက် Joystick ဖြင့် လမ်းလျှောက်ပြီး အနီးရှိအရာများကို [E] ခလုတ်ဖြင့် လုပ်ဆောင်ပါ'
                : '🎮 WASD ဖြင့် လမ်းလျှောက်ပြီး အနီးရှိအရာများကို [E] နှိပ်၍ လုပ်ဆောင်ပါ'}
            </span>
            <button
              type="button"
              aria-label="လမ်းညွှန်ပိတ်မည်"
              onClick={() => {
                setShowOnboarding(false);
                onDismissTutorial?.();
              }}
              className="text-[#b7ad9d] hover:text-white p-1.5 rounded-lg hover:bg-[#2a241c] shrink-0 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 1B. Zone Entry Banner Toast when crossing into a new region */}
      {enteredZoneBanner && !isBuildMode && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div
            style={{ borderColor: `${enteredZoneBanner.color}88` }}
            className="rc-toast-enter flex items-center gap-2 bg-[#171410]/92 backdrop-blur-md border rounded-xl px-4 py-1.5 shadow-2xl"
          >
            <Compass size={14} style={{ color: enteredZoneBanner.color }} />
            <span className="text-xs font-bold text-white whitespace-nowrap leading-snug">
              {enteredZoneBanner.name}
            </span>
          </div>
        </div>
      )}

      {/* 1C. Non-intrusive Interactive Gameplay & Direction Guidance */}
      {merchantGuide?.active && !isBuildMode && (
        <div
          className={`fixed ${enteredZoneBanner || showOnboarding ? 'top-28' : 'top-16'} left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-sm w-[92%]`}
          onTouchStart={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className={`rc-toast-enter flex flex-col gap-1.5 ${UI_THEME.hudPill} ${
              merchantGuide.kind === 'fishing'
                ? 'border-sky-500/55'
                : merchantGuide.kind === 'crafting'
                ? 'border-indigo-400/55'
                : 'border-amber-500/50'
            } px-3 py-2 text-xs text-stone-100`}
          >
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
                    merchantGuide.kind === 'fishing'
                      ? 'bg-sky-500/20 border-sky-400/45 text-sky-300'
                      : merchantGuide.kind === 'crafting'
                      ? 'bg-indigo-500/20 border-indigo-400/45 text-indigo-300'
                      : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  }`}
                >
                  <ArrowRight
                    size={15}
                    style={{ transform: `rotate(${merchantGuide.angleDeg}deg)` }}
                    className="transition-transform duration-150"
                  />
                </div>
                <div className="min-w-0 leading-snug">
                  <div
                    className={`font-bold truncate ${
                      merchantGuide.kind === 'fishing'
                        ? 'text-sky-200'
                        : merchantGuide.kind === 'crafting'
                        ? 'text-indigo-200'
                        : 'text-amber-200'
                    }`}
                  >
                    {merchantGuide.badgeIcon || '🏪'} {merchantGuide.title} • {merchantGuide.distanceTiles} ကွက် ({merchantGuide.directionLabelMy})
                  </div>
                  <div className="text-[11px] text-[#c7beae] truncate">
                    {merchantGuide.subtitle}
                  </div>
                </div>
              </div>
              {onDismissMerchantGuide && (
                <button
                  type="button"
                  aria-label="လမ်းညွှန်ပိတ်မည်"
                  onClick={onDismissMerchantGuide}
                  className="text-[#b7ad9d] hover:text-white p-1 rounded-lg hover:bg-[#2a241c] shrink-0 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {merchantGuide.requirements && merchantGuide.requirements.length > 0 && (
              <div className="flex items-center flex-wrap gap-1.5 pl-9">
                {merchantGuide.requirements.map((req) => {
                  const ok = req.have >= req.need;
                  return (
                    <span
                      key={req.itemId}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                        ok
                          ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                          : 'bg-rose-950/50 border-rose-500/35 text-rose-200'
                      }`}
                    >
                      <span>{req.icon}</span>
                      <span className="font-sans">{req.name}</span>
                      <span className="font-bold">
                        {req.have}/{req.need}
                      </span>
                    </span>
                  );
                })}
                <span className="text-[10px] text-[#9e9484] ml-auto font-mono">
                  ({merchantGuide.targetX}, {merchantGuide.targetY})
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Fishing Timing Minigame HUD */}
      {fishingState?.active && !isBuildMode && (
        <div
          className="fixed bottom-40 sm:bottom-10 left-1/2 -translate-x-1/2 z-30 pointer-events-auto w-[86%] max-w-xs"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          onTouchStart={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="rc-panel-enter bg-[#181613]/95 backdrop-blur-md border border-sky-500/45 rounded-2xl p-3.5 shadow-2xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Fish size={16} className={fishingState.phase === 'bite' ? 'text-emerald-400 animate-bounce shrink-0' : 'text-sky-400 shrink-0'} />
                <span className="text-xs font-bold text-white leading-snug truncate">
                  {fishingState.phase === 'waiting'
                    ? '🌊 ငါးစာစောင့်နေသည်...'
                    : inSweetSpot
                    ? '✨ ယခုဆွဲတင်ပါ! (+၃ ကောင်)'
                    : '🐟 ငါးကိုက်ပြီ! အစိမ်းရောင်ဇုန်ထဲ ဆွဲတင်ပါ'}
                </span>
              </div>
              <button
                type="button"
                aria-label="ငါးမျှားခြင်း ရပ်နားမည်"
                onClick={onCancelFishing}
                className="text-[#b7ad9d] hover:text-white p-1 rounded-lg hover:bg-[#2a241c] cursor-pointer shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {fishingState.phase === 'bite' ? (
              <>
                <div className="relative h-6 rounded-lg bg-[#110f0c] border border-[#3e362c] overflow-hidden">
                  <div
                    style={{
                      left: `${fishingState.sweetMin * 100}%`,
                      width: `${(fishingState.sweetMax - fishingState.sweetMin) * 100}%`,
                    }}
                    className={`absolute inset-y-0 border-x-2 transition-colors ${
                      inSweetSpot
                        ? 'bg-emerald-500/55 border-emerald-300 shadow-inner'
                        : 'bg-emerald-500/35 border-emerald-400'
                    }`}
                  />
                  <div
                    style={{ left: `${fishingState.cursorPos * 100}%` }}
                    className={`absolute top-0 bottom-0 w-2 -translate-x-1/2 rounded-full shadow ${
                      inSweetSpot ? 'bg-yellow-300 shadow-yellow-300/90' : 'bg-white'
                    }`}
                  />
                </div>

                <div className="h-1.5 rounded-full bg-[#110f0c] overflow-hidden">
                  <div
                    style={{ width: `${fishingState.timeLeftRatio * 100}%` }}
                    className="h-full bg-amber-400 transition-all duration-75"
                  />
                </div>

                <button
                  type="button"
                  onClick={onCatchFishing}
                  className={`w-full py-2.5 min-h-[42px] rounded-xl text-xs font-bold ${UI_THEME.primaryGreenBtn}`}
                >
                  🎣 {inSweetSpot ? 'ယခုဆွဲတင်မည်! (+၃ ငါး)' : 'ဆွဲတင်မည်'} {isTouchMode ? '' : '[E]'}
                </button>
              </>
            ) : (
              <div className="h-2 rounded-full bg-[#110f0c] overflow-hidden">
                <div className="h-full w-1/2 bg-sky-500/75 animate-pulse rounded-full" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Unobtrusive, auto-fading contextual action prompt when near an interactable */}
      {shouldShowContextPill && prompt && (
        <div
          className="fixed bottom-40 sm:bottom-9 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button
            type="button"
            onTouchStart={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onTrigger();
            }}
            className={`rc-toast-enter pointer-events-auto flex items-center gap-2 ${UI_THEME.hudPill} hover:border-amber-400/70 px-3 py-1.5 text-left transition active:scale-95 cursor-pointer`}
          >
            <div className="w-6 h-6 rounded-lg bg-[#27221b] border border-[#453b2f] flex items-center justify-center shrink-0">
              {getIcon()}
            </div>
            <div className="text-[11px] font-semibold text-white whitespace-nowrap max-w-[190px] truncate leading-snug">
              {prompt.title}
            </div>
            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-bold shrink-0">
              {isTouchMode ? `နှိပ်ပါ ${prompt.actionKey}` : `[${prompt.actionKey}]`}
            </span>
          </button>
        </div>
      )}
    </>
  );
};
