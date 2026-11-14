/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, MapPin, Compass } from 'lucide-react';
import { ZONES } from '../game/constants';
import { MapSystem } from '../game/systems/MapSystem';

interface WorldMapModalProps {
  playerCoords: { x: number; y: number };
  currentZone: string;
  mapSystem: MapSystem;
  onClose: () => void;
}

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  playerCoords,
  currentZone,
  mapSystem,
  onClose,
}) => {
  const mapSize = 120;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400">
              <Compass size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Random City ကမ္ဘာ့မြေပုံ (120 x 120)
              </h2>
              <p className="text-xs text-stone-400">
                မြို့ပြဗဟိုချက်၊ သဘာဝနယ်မြေများနှင့် ကစားသမား တည်နေရာ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-xs text-stone-400 font-mono">
              တည်နေရာ: <span className="text-white font-bold">X: {playerCoords.x}, Y: {playerCoords.y}</span>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Map Grid Content */}
        <div className="p-6 overflow-y-auto flex flex-col items-center">
          <div className="relative w-72 h-72 sm:w-96 sm:h-96 rounded-xl border-2 border-stone-700/80 bg-stone-950 overflow-hidden shadow-2xl">
            {/* Biome Region Overlays (120x120 Scale) */}
            {/* 1. Main City Center (21..39, 21..39) */}
            <div
              style={{
                left: `${(21 / mapSize) * 100}%`,
                top: `${(21 / mapSize) * 100}%`,
                width: `${(19 / mapSize) * 100}%`,
                height: `${(19 / mapSize) * 100}%`,
              }}
              className="absolute bg-amber-500/25 border border-amber-500/50 rounded flex items-center justify-center z-10"
            >
              <span className="text-[9px] font-bold text-amber-300 bg-stone-950/85 px-1 rounded shadow text-center">
                မြို့လယ်
              </span>
            </div>

            {/* 2. Whispering Forest (North-East: 38..114, 4..48) */}
            <div
              style={{
                left: `${(38 / mapSize) * 100}%`,
                top: `${(4 / mapSize) * 100}%`,
                width: `${(76 / mapSize) * 100}%`,
                height: `${(44 / mapSize) * 100}%`,
              }}
              className="absolute bg-emerald-800/25 border border-emerald-600/35 rounded flex items-center justify-center"
            >
              <span className="text-[10px] font-bold text-emerald-300 bg-stone-950/85 px-1.5 py-0.5 rounded shadow">
                သစ်တောကြီး
              </span>
            </div>

            {/* 3. Mirror Lake (South-West: 4..40, 38..90) */}
            <div
              style={{
                left: `${(4 / mapSize) * 100}%`,
                top: `${(38 / mapSize) * 100}%`,
                width: `${(36 / mapSize) * 100}%`,
                height: `${(52 / mapSize) * 100}%`,
              }}
              className="absolute bg-sky-600/25 border border-sky-500/35 rounded-2xl flex items-center justify-center"
            >
              <span className="text-[10px] font-bold text-sky-300 bg-stone-950/85 px-1.5 py-0.5 rounded shadow">
                မှန်ကြည်ရေကန်
              </span>
            </div>

            {/* 4. Wild Meadows (North-West: 4..36, 4..36) */}
            <div
              style={{
                left: `${(4 / mapSize) * 100}%`,
                top: `${(4 / mapSize) * 100}%`,
                width: `${(32 / mapSize) * 100}%`,
                height: `${(32 / mapSize) * 100}%`,
              }}
              className="absolute bg-lime-700/20 border border-lime-600/30 rounded flex items-center justify-center"
            >
              <span className="text-[10px] font-bold text-lime-300 bg-stone-950/85 px-1 rounded shadow">
                မြက်ခင်းပြင်
              </span>
            </div>

            {/* 5. Homestead District (South-East: 38..114, 38..114) */}
            <div
              style={{
                left: `${(38 / mapSize) * 100}%`,
                top: `${(38 / mapSize) * 100}%`,
                width: `${(76 / mapSize) * 100}%`,
                height: `${(76 / mapSize) * 100}%`,
              }}
              className="absolute bg-amber-900/20 border border-amber-700/30 rounded flex items-center justify-center"
            >
              <span className="text-[10px] font-bold text-amber-200 bg-stone-950/85 px-1.5 py-0.5 rounded shadow">
                အခြေချဆောက်လုပ်ရေး
              </span>
            </div>

            {/* 6. Northern Mountain Ridges (0..120, 0..7) */}
            <div
              style={{
                left: `0%`,
                top: `0%`,
                width: `100%`,
                height: `${(7 / mapSize) * 100}%`,
              }}
              className="absolute bg-stone-700/35 border-b border-stone-600/50 flex items-center justify-center z-10"
            >
              <span className="text-[9px] font-bold text-stone-300 bg-stone-950/85 px-1.5 py-0.5 rounded shadow">
                ⛰️ မြောက်ဘက်ကျောက်တောင်တန်း (Mountain Ridges)
              </span>
            </div>

            {/* Landmark pins */}
            {/* Town Fountain (30, 29) */}
            <div
              style={{ left: `${(30 / mapSize) * 100}%`, top: `${(29 / mapSize) * 100}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-xs z-15"
              title="မြို့လယ်ရေပန်း"
            >
              ⛲
            </div>

            {/* Bakery House (24, 23) */}
            <div
              style={{ left: `${(24 / mapSize) * 100}%`, top: `${(23 / mapSize) * 100}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] z-15"
              title="မုန့်ဖိုအိမ် (Bakery House)"
            >
              🥖
            </div>

            {/* General Shop (23, 27) */}
            <div
              style={{ left: `${(23 / mapSize) * 100}%`, top: `${(27 / mapSize) * 100}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-xs z-15"
              title="ဘားနဘီ ကုန်စုံဆိုင်"
            >
              🏪
            </div>

            {/* Blacksmith & Crafting Workbench (34, 24) */}
            <div
              style={{ left: `${(34 / mapSize) * 100}%`, top: `${(24 / mapSize) * 100}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-xs z-15"
              title="ပန်းပဲဖိုနှင့် လက်မှုလုပ်ငန်းခုံ"
            >
              🔨
            </div>

            {/* Grocery Shop (24, 34) */}
            <div
              style={{ left: `${(24 / mapSize) * 100}%`, top: `${(34 / mapSize) * 100}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] z-15"
              title="ကုန်စိမ်းနှင့်သစ်သီးဆိုင် (Grocery)"
            >
              🥬
            </div>

            {/* Flower Shop (27, 36) */}
            <div
              style={{ left: `${(27 / mapSize) * 100}%`, top: `${(36 / mapSize) * 100}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] z-15"
              title="ပန်းဆိုင်လေး (Flower Shop)"
            >
              🌸
            </div>

            {/* Player Marker (Blinking Radar Pin) */}
            <div
              style={{
                left: `${(playerCoords.x / mapSize) * 100}%`,
                top: `${(playerCoords.y / mapSize) * 100}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white shadow-lg animate-ping absolute" />
              <div className="w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white shadow-lg relative flex items-center justify-center text-[8px] text-white font-bold">
                ▲
              </div>
              <span className="text-[9px] font-bold bg-black text-white px-1 rounded mt-0.5 whitespace-nowrap shadow">
                သင်
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-5 text-xs text-stone-300 w-full max-w-lg">
            <div className="flex items-center gap-2 p-1.5 bg-stone-950/40 rounded border border-stone-800">
              <span className="w-3 h-3 rounded bg-amber-500/40 border border-amber-500 shrink-0" />
              <span>မြို့လယ်ပလာဇာ</span>
            </div>
            <div className="flex items-center gap-2 p-1.5 bg-stone-950/40 rounded border border-stone-800">
              <span className="w-3 h-3 rounded bg-emerald-600/40 border border-emerald-500 shrink-0" />
              <span>သစ်တောကြီး (သစ်ပင်)</span>
            </div>
            <div className="flex items-center gap-2 p-1.5 bg-stone-950/40 rounded border border-stone-800">
              <span className="w-3 h-3 rounded bg-sky-600/40 border border-sky-500 shrink-0" />
              <span>မှန်ကြည်ရေကန် (ငါး)</span>
            </div>
            <div className="flex items-center gap-2 p-1.5 bg-stone-950/40 rounded border border-stone-800">
              <span className="w-3 h-3 rounded bg-lime-600/40 border border-lime-500 shrink-0" />
              <span>ပန်းခင်းမြက်ခင်းပြင် (တိရစ္ဆာန်)</span>
            </div>
            <div className="flex items-center gap-2 p-1.5 bg-stone-950/40 rounded border border-stone-800">
              <span className="w-3 h-3 rounded bg-amber-800/40 border border-amber-600 shrink-0" />
              <span>အခြေချဆောက်လုပ်ရေး</span>
            </div>
            <div className="flex items-center gap-2 p-1.5 bg-stone-950/40 rounded border border-stone-800">
              <span className="text-red-400 font-bold shrink-0">●</span>
              <span>သင့်လက်ရှိ တည်နေရာ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
