/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { Backpack, Hammer, Home, Sparkles } from 'lucide-react';

interface MobileControlsProps {
  onJoystickMove: (x: number, y: number) => void;
  onInteract: () => void;
  onOpenModal: (modal: 'inventory' | 'crafting' | 'building' | 'map') => void;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  onJoystickMove,
  onInteract,
  onOpenModal,
}) => {
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [activeTouchId, setActiveTouchId] = useState<number | null>(null);

  const maxRadius = 38;

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (activeTouchId !== null) return;
    const touch = e.changedTouches[0];
    setActiveTouchId(touch.identifier);
    updateKnob(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === activeTouchId) {
        updateKnob(touch.clientX, touch.clientY);
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchId) {
        setActiveTouchId(null);
        setKnobPos({ x: 0, y: 0 });
        onJoystickMove(0, 0);
        break;
      }
    }
  };

  const updateKnob = (clientX: number, clientY: number) => {
    if (!joystickBaseRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist === 0) {
      setKnobPos({ x: 0, y: 0 });
      onJoystickMove(0, 0);
      return;
    }

    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    setKnobPos({ x: kx, y: ky });
    onJoystickMove(kx / maxRadius, ky / maxRadius);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 pointer-events-none z-30 p-4 pb-6 flex items-end justify-between">
      {/* Bottom-Left: Virtual Joystick */}
      <div
        ref={joystickBaseRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="pointer-events-auto relative w-28 h-28 rounded-full bg-stone-900/60 backdrop-blur-md border border-stone-700/60 shadow-xl flex items-center justify-center touch-none select-none sm:opacity-75 sm:hover:opacity-100 transition"
      >
        {/* Joystick D-pad directional indicators */}
        <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-stone-500" />
        <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-stone-500" />
        <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-stone-500" />
        <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-stone-500" />

        {/* Joystick Knob */}
        <div
          style={{
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
          }}
          className="w-12 h-12 rounded-full bg-gradient-to-b from-stone-600 to-stone-800 border border-stone-500 shadow-md shadow-black/50 transition-transform duration-75"
        />
      </div>

      {/* Bottom-Right: Quick Touch Controls */}
      <div className="pointer-events-auto flex flex-col items-end gap-3 sm:hidden">
        {/* Secondary mini buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenModal('crafting')}
            className="w-11 h-11 rounded-full bg-stone-900/90 border border-stone-700 flex items-center justify-center text-cyan-400 active:scale-90 transition shadow-lg"
          >
            <Hammer size={18} />
          </button>
          <button
            onClick={() => onOpenModal('building')}
            className="w-11 h-11 rounded-full bg-stone-900/90 border border-stone-700 flex items-center justify-center text-emerald-400 active:scale-90 transition shadow-lg"
          >
            <Home size={18} />
          </button>
          <button
            onClick={() => onOpenModal('inventory')}
            className="w-11 h-11 rounded-full bg-stone-900/90 border border-stone-700 flex items-center justify-center text-amber-400 active:scale-90 transition shadow-lg"
          >
            <Backpack size={18} />
          </button>
        </div>

        {/* Big Action / Interact Button [E] */}
        <button
          onClick={onInteract}
          className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-600 to-amber-500 text-stone-950 font-extrabold text-xl border-2 border-amber-300 shadow-xl shadow-amber-950/60 flex flex-col items-center justify-center active:scale-90 transition"
        >
          <span>E</span>
          <span className="text-[8px] font-bold tracking-tight">လုပ်ဆောင်မည်</span>
        </button>
      </div>
    </div>
  );
};
