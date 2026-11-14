/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Axe, Coins, Compass, Fish, Flame, Hammer, MessageCircle, Package, Signpost, X } from 'lucide-react';
import type { FishingHudState } from '../game/scenes/WorldScene';

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
      case 'crafting':
        return <Hammer className="text-cyan-400" size={14} />;
      case 'campfire':
        return <Flame className="text-orange-400" size={14} />;
      case 'storage':
        return <Package className="text-emerald-400" size={14} />;
      case 'npc':
        return <MessageCircle className="text-pink-400" size={14} />;
      case 'signpost':
        return <Signpost className="text-amber-300" size={14} />;
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
          className="fixed top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-sm w-[90%]"
          onTouchStart={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 bg-stone-900/90 backdrop-blur-md border border-amber-500/40 rounded-xl px-3.5 py-2 shadow-xl text-xs text-stone-200">
            <span className="leading-snug">
              {isTouchMode
                ? '🎮 ဘယ်ဘက် Joystick ဖြင့် လမ်းလျှောက်ပြီး အနီးရှိအရာများကို [E] ခလုတ်ဖြင့် လုပ်ဆောင်ပါ'
                : '🎮 WASD ဖြင့် လမ်းလျှောက်ပြီး အနီးရှိအရာများကို [E] နှိပ်၍ လုပ်ဆောင်ပါ'}
            </span>
            <button
              type="button"
              aria-label="Close tutorial hint"
              onClick={() => {
                setShowOnboarding(false);
                onDismissTutorial?.();
              }}
              className="text-stone-400 hover:text-white p-1 shrink-0 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 1B. Zone Entry Banner Toast when crossing into a new region */}
      {enteredZoneBanner && !isBuildMode && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-fade-in">
          <div
            style={{ borderColor: `${enteredZoneBanner.color}88` }}
            className="flex items-center gap-2 bg-stone-950/90 backdrop-blur-md border rounded-xl px-4 py-1.5 shadow-2xl"
          >
            <Compass size={14} style={{ color: enteredZoneBanner.color }} />
            <span className="text-xs font-bold text-white whitespace-nowrap">{enteredZoneBanner.name}</span>
          </div>
        </div>
      )}

      {/* 2. Fishing Timing Minigame HUD */}
      {fishingState?.active && !isBuildMode && (
        <div
          className="fixed bottom-24 sm:bottom-10 left-1/2 -translate-x-1/2 z-30 pointer-events-auto w-[86%] max-w-xs"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          onTouchStart={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="bg-stone-950/92 backdrop-blur-md border border-sky-500/50 rounded-2xl p-3 shadow-2xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Fish size={16} className={fishingState.phase === 'bite' ? 'text-emerald-400 animate-bounce' : 'text-sky-400'} />
                <span className="text-xs font-bold text-white">
                  {fishingState.phase === 'waiting'
                    ? '🌊 ငါးစာစောင့်နေသည်...'
                    : inSweetSpot
                    ? '✨ ယခုဆွဲတင်ပါ! (×2 ငါး)'
                    : '🐟 ငါးကိုက်ပြီ! အချိန်ကိုက်ဆွဲတင်ပါ'}
                </span>
              </div>
              <button
                type="button"
                aria-label="Cancel fishing"
                onClick={onCancelFishing}
                className="text-stone-400 hover:text-white p-0.5 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {fishingState.phase === 'bite' ? (
              <>
                {/* Sweeping Cursor Timing Track */}
                <div className="relative h-5 rounded-lg bg-stone-800 border border-stone-700 overflow-hidden">
                  {/* Sweet spot target zone */}
                  <div
                    style={{
                      left: `${fishingState.sweetMin * 100}%`,
                      width: `${(fishingState.sweetMax - fishingState.sweetMin) * 100}%`,
                    }}
                    className="absolute inset-y-0 bg-emerald-500/40 border-x border-emerald-400"
                  />
                  {/* Moving timing needle */}
                  <div
                    style={{ left: `${fishingState.cursorPos * 100}%` }}
                    className={`absolute top-0 bottom-0 w-1.5 -translate-x-1/2 rounded-full shadow ${
                      inSweetSpot ? 'bg-yellow-300 shadow-yellow-300/80' : 'bg-white'
                    }`}
                  />
                </div>

                {/* Remaining bite timer bar */}
                <div className="h-1 rounded-full bg-stone-800 overflow-hidden">
                  <div
                    style={{ width: `${fishingState.timeLeftRatio * 100}%` }}
                    className="h-full bg-amber-400 transition-all duration-75"
                  />
                </div>

                <button
                  type="button"
                  onClick={onCatchFishing}
                  className="w-full py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold shadow transition cursor-pointer"
                >
                  🎣 ဆွဲတင်မည် {isTouchMode ? '' : '[E]'}
                </button>
              </>
            ) : (
              <div className="h-2 rounded-full bg-stone-800 overflow-hidden">
                <div className="h-full w-1/2 bg-sky-500/70 animate-pulse rounded-full" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Small, unobtrusive, auto-fading contextual pill when near an interactable */}
      {shouldShowContextPill && prompt && (
        <div
          className="fixed bottom-20 sm:bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
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
            className="pointer-events-auto flex items-center gap-2 bg-stone-900/85 backdrop-blur-md border border-stone-700/80 hover:border-amber-400/70 rounded-xl px-3 py-1.5 shadow-lg text-left transition active:scale-95 cursor-pointer"
          >
            <div className="w-6 h-6 rounded-lg bg-stone-800 flex items-center justify-center shrink-0">
              {getIcon()}
            </div>
            <div className="text-[11px] font-semibold text-white whitespace-nowrap max-w-[180px] truncate">
              {prompt.title}
            </div>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-bold shrink-0">
              {isTouchMode ? `Touch ${prompt.actionKey}` : `[${prompt.actionKey}]`}
            </span>
          </button>
        </div>
      )}
    </>
  );
};
