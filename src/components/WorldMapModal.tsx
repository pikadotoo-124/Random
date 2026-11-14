/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Compass, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { ZONE_SIGNPOSTS } from '../game/constants';
import { MapSystem } from '../game/systems/MapSystem';
import { PlacedBuilding, ResourceNode } from '../game/types';

interface WorldMapModalProps {
  playerCoords: { x: number; y: number };
  currentZone: string;
  mapSystem: MapSystem;
  placedBuildings?: PlacedBuilding[];
  resourceNodes?: ResourceNode[];
  onlinePlayers?: Array<{ id: string; name: string; tileX: number; tileY: number }>;
  onClose: () => void;
}

const MAP_SIZE = 120;

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  playerCoords,
  currentZone,
  mapSystem,
  placedBuildings = [],
  resourceNodes = [],
  onlinePlayers = [],
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  // Render accurate 120x120 terrain, roads, trails, bridges, lakes, buildings & fishing pins onto crisp canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = 4; // 480x480 crisp logical pixel buffer
    canvas.width = MAP_SIZE * scale;
    canvas.height = MAP_SIZE * scale;
    ctx.imageSmoothingEnabled = false;

    for (let ty = 0; ty < MAP_SIZE; ty++) {
      for (let tx = 0; tx < MAP_SIZE; tx++) {
        const tile = mapSystem.tiles[ty]?.[tx] || 'grass';
        const roadTier = mapSystem.getRoadTier(tx, ty);
        let col = '#4f8530';

        if (tile === 'grass') {
          if (tx < 38 && ty < 38) col = '#65a30d'; // Wild Meadows
          else if (tx >= 38 && ty < 48) col = '#15803d'; // Whispering Forest canopy tint
          else col = (tx + ty) % 2 === 0 ? '#528732' : '#4d802f';
        } else if (tile === 'water') {
          col = tx >= 74 && tx <= 98 && ty >= 14 && ty <= 30 ? '#0d9488' : '#0284c7';
        } else if (tile === 'sand') {
          col = '#d97706';
        } else if (tile === 'cobble') {
          col = '#78716c';
        } else if (tile === 'cliff') {
          col = ty <= 4 ? '#44403c' : '#57534e';
        } else if (tile === 'farmland') {
          col = '#65a30d';
        } else if (tile === 'bridge') {
          col = '#b45309';
        } else if (tile === 'dirt') {
          col = roadTier === 'main' ? '#d4a373' : '#9c6644';
        }

        ctx.fillStyle = col;
        ctx.fillRect(tx * scale, ty * scale, scale, scale);

        // Farmland furrow stripe hint
        if (tile === 'farmland' && ty % 2 === 0) {
          ctx.fillStyle = '#3f6212';
          ctx.fillRect(tx * scale, ty * scale, scale, 1.5);
        }
      }
    }

    // Highlight Town Plaza boundary & Homestead boundary subtly
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(21 * scale, 21 * scale, 19 * scale, 19 * scale);

    ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(40 * scale, 40 * scale, 75 * scale, 75 * scale);
    ctx.setLineDash([]);

    // Active fishing spots (subtle sky-blue dots on shoreline)
    for (const node of resourceNodes) {
      if (node.type !== 'lake_fish') continue;
      if (node.depletedUntil && node.depletedUntil > Date.now()) continue;
      ctx.fillStyle = '#7dd3fc';
      ctx.beginPath();
      ctx.arc((node.tileX + 0.5) * scale, (node.tileY + 0.5) * scale, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Placed Homestead buildings
    for (const b of placedBuildings) {
      ctx.fillStyle = b.type.startsWith('house') ? '#f97316' : b.type === 'fence_wood' ? '#d97706' : '#fbbf24';
      ctx.fillRect(b.tileX * scale, b.tileY * scale, Math.max(1, b.width) * scale, Math.max(1, b.height) * scale);
      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.tileX * scale, b.tileY * scale, Math.max(1, b.width) * scale, Math.max(1, b.height) * scale);
    }

    // Zone Signposts (gold diamond pins)
    for (const sign of ZONE_SIGNPOSTS) {
      const sx = (sign.tileX + 0.5) * scale;
      const sy = (sign.tileY + 0.5) * scale;
      ctx.fillStyle = sign.color;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 3.5);
      ctx.lineTo(sx + 3.5, sy);
      ctx.lineTo(sx, sy + 3.5);
      ctx.lineTo(sx - 3.5, sy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Multiplayer peers
    for (const peer of onlinePlayers) {
      const px = (peer.tileX + 0.5) * scale;
      const py = (peer.tileY + 0.5) * scale;
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }, [mapSystem, placedBuildings, resourceNodes, onlinePlayers]);

  const clampPan = (nx: number, ny: number, targetZoom: number) => {
    const maxOffset = Math.max(0, ((targetZoom - 1) * 160));
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, nx)),
      y: Math.max(-maxOffset, Math.min(maxOffset, ny)),
    };
  };

  const applyZoom = (nextZoom: number) => {
    const clamped = Math.max(1, Math.min(3.5, Number(nextZoom.toFixed(2))));
    setZoom(clamped);
    setPan((prev) => (clamped === 1 ? { x: 0, y: 0 } : clampPan(prev.x, prev.y, clamped)));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden text-stone-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-stone-800 bg-stone-950/50 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400 shrink-0">
              <Compass size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                Random City ကမ္ဘာ့မြေပုံ (120 × 120)
              </h2>
              <p className="text-[11px] text-stone-400 truncate">
                လက်ရှိဇုန်: <span className="text-amber-300 font-semibold">{currentZone}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="text-[11px] text-stone-400 font-mono hidden sm:block">
              <span className="text-white font-bold">X: {playerCoords.x}, Y: {playerCoords.y}</span>
            </div>

            <button
              onClick={onClose}
              aria-label="Close world map"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Interactive Map Body */}
        <div className="p-3 sm:p-5 overflow-y-auto flex flex-col items-center gap-3">
          {/* Zoom Toolbar */}
          <div className="flex items-center justify-between w-full max-w-md gap-2">
            <div className="text-[11px] text-stone-400 font-mono sm:hidden">
              X: <span className="text-white font-bold">{playerCoords.x}</span>, Y: <span className="text-white font-bold">{playerCoords.y}</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                onClick={() => applyZoom(zoom - 0.5)}
                disabled={zoom <= 1}
                className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-xs flex items-center gap-1 border border-stone-700 cursor-pointer"
              >
                <ZoomOut size={13} />
              </button>
              <span className="text-xs font-mono text-stone-300 min-w-[42px] text-center">
                {zoom.toFixed(1)}x
              </span>
              <button
                type="button"
                onClick={() => applyZoom(zoom + 0.5)}
                disabled={zoom >= 3.5}
                className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-xs flex items-center gap-1 border border-stone-700 cursor-pointer"
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs flex items-center gap-1 border border-stone-700 cursor-pointer"
                title="Reset Zoom"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>

          {/* Interactive Zoomable / Pannable Map Viewport */}
          <div
            className="relative w-64 h-64 sm:w-[360px] sm:h-[360px] rounded-xl border-2 border-stone-700/90 bg-stone-950 overflow-hidden shadow-2xl touch-none select-none"
            onWheel={(e) => {
              e.preventDefault();
              applyZoom(zoom + (e.deltaY < 0 ? 0.35 : -0.35));
            }}
            onPointerDown={(e) => {
              dragRef.current = {
                active: true,
                startX: e.clientX,
                startY: e.clientY,
                origX: pan.x,
                origY: pan.y,
              };
            }}
            onPointerMove={(e) => {
              if (!dragRef.current.active || zoom <= 1) return;
              const dx = e.clientX - dragRef.current.startX;
              const dy = e.clientY - dragRef.current.startY;
              setPan(clampPan(dragRef.current.origX + dx, dragRef.current.origY + dy, zoom));
            }}
            onPointerUp={() => {
              dragRef.current.active = false;
            }}
            onPointerLeave={() => {
              dragRef.current.active = false;
            }}
          >
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
              className="relative w-full h-full transition-transform duration-75 ease-out"
            >
              <canvas ref={canvasRef} className="w-full h-full block" />

              {/* Compact Zone Labels & Landmark Pins */}
              <div
                style={{ left: `${(30 / MAP_SIZE) * 100}%`, top: `${(29 / MAP_SIZE) * 100}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-[11px] pointer-events-none drop-shadow"
                title="မြို့လယ်ရေပန်း (Town Plaza)"
              >
                ⛲
              </div>
              <div
                style={{ left: `${(23 / MAP_SIZE) * 100}%`, top: `${(27 / MAP_SIZE) * 100}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] pointer-events-none"
                title="ဘားနဘီ ကုန်စုံဆိုင် (Shop)"
              >
                🏪
              </div>
              <div
                style={{ left: `${(34 / MAP_SIZE) * 100}%`, top: `${(25 / MAP_SIZE) * 100}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] pointer-events-none"
                title="လက်မှုလုပ်ငန်းခုံ (Workbench)"
              >
                🔨
              </div>
              <div
                style={{ left: `${(49 / MAP_SIZE) * 100}%`, top: `${(74 / MAP_SIZE) * 100}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] pointer-events-none"
                title="ရွာရေတွင်း (Farm District)"
              >
                🌾
              </div>

              {/* Zone Readable Overlays */}
              <span
                style={{ left: '16%', top: '12%' }}
                className="absolute -translate-x-1/2 text-[8px] font-bold text-lime-200 bg-stone-950/75 px-1 rounded pointer-events-none"
              >
                မြက်ခင်းပြင်
              </span>
              <span
                style={{ left: '66%', top: '18%' }}
                className="absolute -translate-x-1/2 text-[8px] font-bold text-emerald-200 bg-stone-950/75 px-1 rounded pointer-events-none"
              >
                သစ်တောကြီး
              </span>
              <span
                style={{ left: '16%', top: '52%' }}
                className="absolute -translate-x-1/2 text-[8px] font-bold text-sky-200 bg-stone-950/75 px-1 rounded pointer-events-none"
              >
                မှန်ကြည်ရေကန်
              </span>
              <span
                style={{ left: '72%', top: '62%' }}
                className="absolute -translate-x-1/2 text-[8px] font-bold text-amber-200 bg-stone-950/75 px-1 rounded pointer-events-none"
              >
                အခြေချရပ်ကွက်
              </span>

              {/* Pulsing Local Player Pin */}
              <div
                style={{
                  left: `${(playerCoords.x / MAP_SIZE) * 100}%`,
                  top: `${(playerCoords.y / MAP_SIZE) * 100}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center pointer-events-none"
              >
                <div className="w-3.5 h-3.5 rounded-full bg-red-500/80 animate-ping absolute" />
                <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow relative flex items-center justify-center text-[7px] text-white font-bold">
                  ▲
                </div>
                <span className="text-[8px] font-bold bg-black/85 text-white px-1 rounded mt-0.5 whitespace-nowrap shadow">
                  သင်
                </span>
              </div>
            </div>
          </div>

          {/* Compact Legend */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px] text-stone-300 w-full max-w-xl">
            <div className="flex items-center gap-1.5 p-1.5 bg-stone-950/50 rounded border border-stone-800">
              <span className="w-3 h-3 rounded-sm bg-[#d4a373] shrink-0" />
              <span className="truncate">လမ်းမ / တံတား</span>
            </div>
            <div className="flex items-center gap-1.5 p-1.5 bg-stone-950/50 rounded border border-stone-800">
              <span className="w-3 h-3 rounded-sm bg-[#0284c7] shrink-0" />
              <span className="truncate">ရေကန် / မြစ် (🐟)</span>
            </div>
            <div className="flex items-center gap-1.5 p-1.5 bg-stone-950/50 rounded border border-stone-800">
              <span className="w-3 h-3 rounded-sm bg-[#f97316] shrink-0" />
              <span className="truncate">အိမ်ခြံ ({placedBuildings.length})</span>
            </div>
            <div className="flex items-center gap-1.5 p-1.5 bg-stone-950/50 rounded border border-stone-800">
              <span className="text-red-400 font-bold shrink-0">▲</span>
              <span className="truncate">သင့်တည်နေရာ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
