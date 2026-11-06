/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Axe, Coins, Flame, Hammer, Package, Sparkles } from 'lucide-react';

interface ActionPromptHUDProps {
  prompt: {
    type: string;
    title: string;
    subtitle: string;
    actionKey: string;
  } | null;
  onTrigger: () => void;
}

export const ActionPromptHUD: React.FC<ActionPromptHUDProps> = ({ prompt, onTrigger }) => {
  if (!prompt) return null;

  const getIcon = () => {
    switch (prompt.type) {
      case 'shop':
        return <Coins className="text-amber-400" size={18} />;
      case 'crafting':
        return <Hammer className="text-cyan-400" size={18} />;
      case 'campfire':
        return <Flame className="text-orange-400" size={18} />;
      case 'storage':
        return <Package className="text-emerald-400" size={18} />;
      default:
        return <Axe className="text-yellow-400" size={18} />;
    }
  };

  return (
    <div className="fixed bottom-24 sm:bottom-10 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-bounce">
      <button
        onClick={onTrigger}
        className="pointer-events-auto flex items-center gap-3 bg-stone-900/95 backdrop-blur-md border border-amber-500/60 hover:border-amber-400 rounded-2xl px-5 py-2.5 shadow-2xl shadow-black/80 text-left transition hover:scale-105 active:scale-95 cursor-pointer group"
      >
        <div className="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center shrink-0 group-hover:bg-amber-500/20 group-hover:border-amber-500 transition">
          {getIcon()}
        </div>

        <div className="pr-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-xs sm:text-sm tracking-tight">
              {prompt.title}
            </span>
            <kbd className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-bold">
              {prompt.actionKey}
            </kbd>
          </div>
          <div className="text-[11px] text-stone-400 font-medium">
            {prompt.subtitle}
          </div>
        </div>

        <div className="text-xs font-bold text-amber-400 pl-2 border-l border-stone-700 tracking-wider hidden sm:block">
          နှိပ်ပါ သို့မဟုတ် [{prompt.actionKey}]
        </div>
      </button>
    </div>
  );
};
