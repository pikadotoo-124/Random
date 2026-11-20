/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const knobRef = useRef<HTMLDivElement>(null);
  const activeInputRef = useRef<{ kind: 'pointer' | 'touch'; id: number } | null>(null);

  const [showControls, setShowControls] = useState<boolean>(detectTouchOrMobileViewport);
  const [isCompactLandscape, setIsCompactLandscape] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerHeight <= 460 && window.innerWidth > window.innerHeight : false
  );

  const maxRadius = isCompactLandscape ? 32 : 38;
  const maxRadiusRef = useRef<number>(maxRadius);
  maxRadiusRef.current = maxRadius;

  const applyKnobVisual = useCallback((kx: number, ky: number) => {
    if (knobRef.current) {
      knobRef.current.style.transform = `translate3d(${kx}px, ${ky}px, 0)`;
    }
  }, []);

  const resetJoystick = useCallback(() => {
    activeInputRef.current = null;
    applyKnobVisual(0, 0);
    onJoystickMove(0, 0);
  }, [applyKnobVisual, onJoystickMove]);

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

  useEffect(() => {
    if (isModalOpen || !showControls) {
      resetJoystick();
    }
  }, [isModalOpen, showControls, resetJoystick]);

  // Safety cleanup if browser tab loses focus or switches mid-drag
  useEffect(() => {
    const handleWindowBlur = () => {
      if (activeInputRef.current) {
        resetJoystick();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && activeInputRef.current) {
        resetJoystick();
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (activeInputRef.current) {
        resetJoystick();
      }
    };
  }, [resetJoystick]);

  if (!showControls || isModalOpen) {
    return null;
  }

  const updateKnob = (clientX: number, clientY: number) => {
    if (!joystickBaseRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const radius = maxRadiusRef.current;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist === 0 || !Number.isFinite(dist)) {
      applyKnobVisual(0, 0);
      onJoystickMove(0, 0);
      return;
    }

    const clampedDist = Math.min(dist, radius);
    const invDist = 1 / dist;
    const kx = dx * invDist * clampedDist;
    const ky = dy * invDist * clampedDist;

    applyKnobVisual(kx, ky);
    onJoystickMove(kx / radius, ky / radius);
  };

  // Primary Unified Pointer Events (synchronous ref tracking + pointer capture = zero initial drag drops)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    if (activeInputRef.current !== null) return;

    activeInputRef.current = { kind: 'pointer', id: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore environments where pointer capture is unavailable
    }
    updateKnob(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const active = activeInputRef.current;
    if (!active || active.kind !== 'pointer' || active.id !== e.pointerId) return;
    updateKnob(e.clientX, e.clientY);
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const active = activeInputRef.current;
    if (!active || active.kind !== 'pointer' || active.id !== e.pointerId) return;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }
    resetJoystick();
  };

  // Touch Events Fallback (only runs if Pointer Events didn't claim the gesture)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeInputRef.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    activeInputRef.current = { kind: 'touch', id: touch.identifier };
    updateKnob(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const active = activeInputRef.current;
    if (!active || active.kind !== 'touch') return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === active.id) {
        updateKnob(touch.clientX, touch.clientY);
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const active = activeInputRef.current;
    if (!active || active.kind !== 'touch') return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === active.id) {
        resetJoystick();
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
        paddingLeft: isCompactLandscape
          ? 'max(1.5rem, calc(env(safe-area-inset-left) + 0.85rem))'
          : 'max(1.15rem, calc(env(safe-area-inset-left) + 0.65rem))',
        paddingRight: isCompactLandscape
          ? 'max(1.5rem, calc(env(safe-area-inset-right) + 0.85rem))'
          : 'max(1.15rem, calc(env(safe-area-inset-right) + 0.65rem))',
        paddingBottom: isCompactLandscape
          ? 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1.1rem))'
          : 'max(2rem, calc(env(safe-area-inset-bottom) + 1.45rem))',
        paddingTop: '0.5rem',
      }}
    >
      {/* Bottom-Left: Zero-Lag Virtual Joystick */}
      <div
        ref={joystickBaseRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={stopCanvasLeak}
        style={{ touchAction: 'none' }}
        className={`pointer-events-auto relative rounded-full bg-[#191612]/88 border border-[#5a4e3e] shadow-xl flex items-center justify-center touch-none select-none ${
          isCompactLandscape ? 'w-24 h-24' : 'w-28 h-28'
        }`}
      >
        <div className="pointer-events-none absolute top-2 w-1.5 h-1.5 rounded-full bg-[#a89b87]/65" />
        <div className="pointer-events-none absolute bottom-2 w-1.5 h-1.5 rounded-full bg-[#a89b87]/65" />
        <div className="pointer-events-none absolute left-2 w-1.5 h-1.5 rounded-full bg-[#a89b87]/65" />
        <div className="pointer-events-none absolute right-2 w-1.5 h-1.5 rounded-full bg-[#a89b87]/65" />

        <div
          ref={knobRef}
          style={{
            transform: 'translate3d(0px, 0px, 0)',
            willChange: 'transform',
          }}
          className={`pointer-events-none rounded-full bg-gradient-to-b from-[#7a6d5a] to-[#3a3329] border border-[#c4b7a2]/75 shadow-md shadow-black/65 ${
            isCompactLandscape ? 'w-10 h-10' : 'w-12 h-12'
          }`}
        />
      </div>

      {/* Bottom-Right: Quick Touch Action Buttons */}
      {!isBuildMode && (
        <div
          onTouchStart={stopCanvasLeak}
          onPointerDown={stopCanvasLeak}
          className={`pointer-events-auto flex items-end touch-none ${
            isCompactLandscape ? 'gap-2.5' : 'flex-col gap-2.5'
          }`}
        >
          <div className={`flex items-center ${isCompactLandscape ? 'gap-2 pb-1' : 'gap-2'}`}>
            <button
              type="button"
              aria-label="ကမ္ဘာ့မြေပုံ"
              title="ကမ္ဘာ့မြေပုံ"
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal('map');
              }}
              className="w-11 h-11 rounded-full bg-[#1a1713]/92 border border-[#4a4134] hover:border-[#6a5c4a] flex items-center justify-center text-indigo-400 active:scale-90 transition shadow-lg cursor-pointer"
            >
              <MapIcon size={18} />
            </button>
            <button
              type="button"
              aria-label="ပစ္စည်းဖန်တီးခြင်း"
              title="ပစ္စည်းဖန်တီးခြင်း"
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal('crafting');
              }}
              className="w-11 h-11 rounded-full bg-[#1a1713]/92 border border-[#4a4134] hover:border-[#6a5c4a] flex items-center justify-center text-sky-400 active:scale-90 transition shadow-lg cursor-pointer"
            >
              <Hammer size={18} />
            </button>
            <button
              type="button"
              aria-label="ဆောက်လုပ်ခြင်း"
              title="ဆောက်လုပ်ခြင်း"
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal('building');
              }}
              className="w-11 h-11 rounded-full bg-[#1a1713]/92 border border-[#4a4134] hover:border-[#6a5c4a] flex items-center justify-center text-emerald-400 active:scale-90 transition shadow-lg cursor-pointer"
            >
              <Home size={18} />
            </button>
            <button
              type="button"
              aria-label="ခရီးသွားလွယ်အိတ်"
              title="ခရီးသွားလွယ်အိတ်"
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal('inventory');
              }}
              className="w-11 h-11 rounded-full bg-[#1a1713]/92 border border-[#4a4134] hover:border-[#6a5c4a] flex items-center justify-center text-amber-400 active:scale-90 transition shadow-lg cursor-pointer"
            >
              <Backpack size={18} />
            </button>
          </div>

          <button
            type="button"
            aria-label="လုပ်ဆောင်မည်"
            title="လုပ်ဆောင်မည် [E]"
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
