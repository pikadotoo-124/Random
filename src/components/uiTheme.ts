/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ItemDefinition } from '../game/types';

export const UI_THEME = {
  backdrop:
    'fixed inset-0 z-50 flex items-center justify-center bg-stone-950/78 backdrop-blur-sm p-2.5 sm:p-4 select-none',
  panel:
    'rc-panel-enter w-full bg-[#1b1814]/96 border border-[#4a4134] rounded-2xl shadow-2xl shadow-black/70 ring-1 ring-emerald-500/10 flex flex-col max-h-[90dvh] overflow-hidden text-stone-200',
  header:
    'flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[#3a3329] bg-gradient-to-b from-[#27221b] to-[#1e1a15] gap-3 shrink-0',
  closeBtn:
    'w-9 h-9 rounded-xl flex items-center justify-center bg-[#28221b] border border-[#453b2f] text-[#b7ad9d] hover:text-white hover:bg-[#352d24] hover:border-[#635544] transition active:scale-95 cursor-pointer shrink-0',
  subCard:
    'bg-[#13110e]/85 border border-[#322c23] rounded-xl',
  goldBadge:
    'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-amber-500/12 border border-amber-500/30 rounded-xl text-amber-300 font-bold text-xs shrink-0',
  hudPill:
    'bg-[#191612]/90 backdrop-blur-md border border-[#473e32] shadow-lg shadow-black/45 rounded-xl',
  primaryGreenBtn:
    'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/30 shadow-md shadow-emerald-950/45 transition active:scale-[0.98] cursor-pointer',
  primaryAmberBtn:
    'bg-amber-500 hover:bg-amber-400 text-stone-950 border border-amber-300/40 shadow-md shadow-amber-950/40 transition active:scale-[0.98] cursor-pointer',
  disabledBtn:
    'bg-[#26211b] text-[#73695b] border border-[#362f26] cursor-not-allowed',
} as const;

export function getCategoryLabelMy(category: ItemDefinition['category'] | string): string {
  switch (category) {
    case 'resource':
      return 'သယံဇာတ';
    case 'tool':
      return 'ကိရိယာ';
    case 'food':
      return 'အစားအစာ';
    case 'building':
      return 'အဆောက်အအုံ';
    default:
      return category;
  }
}
