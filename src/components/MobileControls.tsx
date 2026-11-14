/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Backpack, Hammer, Home, Map as MapIcon } from 'lucide-react';

interface MobileControlsProps {
  onJoystickMove: (x: number, y: number) => void;
  onInteract: () => void;
  onOpenModal: (modal: 'inventory' | 'crafting' | 'building' | 'map') => void;
  hasNearbyInteraction?: boolean;
  isBuildMode?: boolean;
  isModalOpen?: boolean;
}

function detectTouchOrMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const hasCoarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const hasTouchPoints = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || 'ontouchstart' in window;
  // Cover iPhone 11 Landscape (896x414), Portrait (414x896), and Android phones/small tablets
  const isCompactViewport = w < 768 || (w <= 1024 && h <= 540);
  return hasCoarsePointer || (hasTouchPoints && w <= 1180) || isCompactViewport;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  onJoystickMove,
  onInteract,
  onOpenModal,
  hasNearbyInteraction = false,
  isBuildMode = false,
  isModalOpen = false,
}) => {
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [activeTouchId, setActiveTouchId] = useState<number | null>(null);
  const [showControls, setShowControls] = useState<boolean>(detectTouchOrMobileViewport);
  const [isCompactLandscape, setIsCompactLandscape] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerHeight <= 460 && window.innerWidth > window.innerHeight : false
  );

  useEffect(() => {
    const updateViewport = () => {
      setShowControls(detectTouchOrMobileViewport());
      setIsCompactLandscape(window.innerHeight <= 460 && window.innerWidth > window.innerHeight);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  // Reset joystick vector if controls hide (e.g. modal opened)
  useEffect(() => {
    if (isModalOpen || !showControls) {
      setActiveTouchId(null);
      setKnobPos({ x: 0, y: 0 });
      onJoystickMove(0, 0);
    }
  }, [isModalOpen, showControls, onJoystickMove]);

  if (!showControls || isModalOpen) {
    return null;
  }

  const maxRadius = isCompactLandscape ? 32 : 38;

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

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeTouchId !== null) return;
    const touch = e.changedTouches[0];
    setActiveTouchId(touch.identifier);
    updateKnob(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === activeTouchId) {
        updateKnob(touch.clientX, touch.clientY);
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchId) {
        setActiveTouchId(null);
        setKnobPos({ x: 0, y: 0 });
        onJoystickMove(0, 0);
        break;
      }
    }
  };

  const stopCanvasLeak = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 pointer-events-none z-30 flex items-end justify-between select-none"
      style={{
        paddingLeft: 'max(0.85rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.85rem, env(safe-area-inset-right))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        paddingTop: '0.5rem',
      }}
    >
      {/* Bottom-Left: Virtual Joystick (hidden in build mode only if ultra cramped? Keep visible so user can walk while placing!) */}
      <div
        ref={joystickBaseRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onPointerDown={stopCanvasLeak}
        className={`pointer-events-auto relative rounded-full bg-stone-900/65 backdrop-blur-md border border-stone-600/60 shadow-xl flex items-center justify-center touch-none select-none transition ${
          isCompactLandscape ? 'w-24 h-24' : 'w-28 h-28'
        }`}
      >
        <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-stone-400/70" />
        <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-stone-400/70" />
        <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-stone-400/70" />
        <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-stone-400/70" />

        <div
          style={{
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
          }}
          className={`rounded-full bg-gradient-to-b from-stone-500 to-stone-800 border border-stone-400 shadow-md shadow-black/60 transition-transform duration-75 ${
            isCompactLandscape ? 'w-10 h-10' : 'w-12 h-12'
          }`}
        />
      </div>

      {/* Bottom-Right: Quick Touch Action Buttons (Visible on ALL mobile orientations including iPhone 11 Landscape 896x414) */}
      {!isBuildMode && (
        <div
          onTouchStart={stopCanvasLeak}
          onPointerDown={stopCanvasLeak}
          className={`pointer-events-auto flex items-end touch-none ${
            isCompactLandscape ? 'gap-2.5' : 'flex-col gap-2.5'
          }`}
        >
          {/* Secondary utility buttons */}
          <div className={`flex items-center ${isCompactLandscape ? 'gap-2 pb-1' : 'gap-2'}`}>
            <button
              type="button"
              aria-label="Map"
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal('map');
              }}
              className="w-11 h-11 rounded-full bg-stone-900/90 border border-stone-700/90 flex items-center justify-center text-indigo-400 active:scale-90 transition shadow-lg cursor-pointer"
            >
              <MapIcon size={18} />
            </button>
            <button
              type="button"
              aria-label="Craft"
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal('crafting');
              }}
              className="w-11 h-11 rounded-full bg-stone-900/90 border border-stone-700/90 flex items-center justify-center text-cyan-400 active:scale-90 transition shadow-lg cursor-pointer"
            >
              <Hammer size={18} />
            </button>
            <button
              type="button"
              aria-label="Build"
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal('building');
              }}
              className="w-11 h-11 rounded-full bg-stone-900/90 border border-stone-700/90 flex items-center justify-center text-emerald-400 active:scale-90 transition shadow-lg cursor-pointer"
            >
              <Home size={18} />
            </button>
            <button
              type="button"
              aria-label="Inventory"
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal('inventory');
              }}
              className="w-11 h-11 rounded-full bg-stone-900/90 border border-stone-700/90 flex items-center justify-center text-amber-400 active:scale-90 transition shadow-lg cursor-pointer"
            >
              <Backpack size={18} />
            </button>
          </div>

          {/* Primary Action / Interact Button [E] */}
          <button
            type="button"
            aria-label="Interact"
            onClick={(e) => {
              e.stopPropagation();
              onInteract();
            }}
            className={`rounded-full font-extrabold border-2 shadow-xl flex flex-col items-center justify-center active:scale-90 transition cursor-pointer ${
              isCompactLandscape ? 'w-14 h-14 text-lg' : 'w-16 h-16 text-xl'
            } ${
              hasNearbyInteraction
                ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-stone-950 border-amber-200 shadow-amber-500/35 ring-2 ring-amber-400/50'
                : 'bg-gradient-to-tr from-amber-600/90 to-amber-500/90 text-stone-950 border-amber-300/80 shadow-amber-950/60'
            }`}
          >
            <span className="leading-none">E</span>
            <span className="text-[8px] font-bold tracking-tight mt-0.5">လုပ်ဆောင်</span>
          </button>
        </div>
      )}
    </div>
  );
};
