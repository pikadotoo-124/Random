/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Axe, Coins, Flame, Hammer, Package, MessageCircle, X } from 'lucide-react';

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
}

export const ActionPromptHUD: React.FC<ActionPromptHUDProps> = ({
  prompt,
  onTrigger,
  isTouchMode = false,
  tutorialCompleted = true,
  onDismissTutorial,
  isBuildMode = false,
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
    if (!prompt || isBuildMode) {
      setVisibleTargetKey(null);
      return;
    }

    const key = prompt.targetId || `${prompt.type}:${prompt.title}`;
    setVisibleTargetKey(key);

    const timer = setTimeout(() => {
      setVisibleTargetKey((current) => (current === key ? null : current));
    }, 2800);

    return () => clearTimeout(timer);
  }, [prompt, isBuildMode]);

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
      default:
        return <Axe className="text-yellow-400" size={14} />;
    }
  };

  const currentKey = prompt ? prompt.targetId || `${prompt.type}:${prompt.title}` : null;
  const shouldShowContextPill = Boolean(prompt && !isBuildMode && visibleTargetKey === currentKey);

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

      {/* 2. Small, unobtrusive, auto-fading contextual pill when near an interactable */}
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
