/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Backpack, Hammer, Home, Map as MapIcon, MessageSquare, Minus, Plus, Settings, RefreshCw } from 'lucide-react';
import { PlayerProfile } from '../game/types';
import { ConnectionStatus } from '../game/multiplayer/types';
import { CloudSyncState } from '../game/systems/SaveSystem';

interface TopNavHUDProps {
  playerProfile: PlayerProfile;
  coins: number;
  currentZone: string;
  coords: { x: number; y: number };
  onOpenModal: (modal: 'inventory' | 'crafting' | 'shop' | 'building' | 'map' | 'settings') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  isBuildMode: boolean;
  onCancelBuildMode: () => void;
  onlineCount?: number;
  maxPlayers?: number;
  connectionStatus?: ConnectionStatus;
  cloudSyncStatus?: CloudSyncState;
  onRetryCloudSave?: () => void;
  isChatOpen?: boolean;
  unreadChatCount?: number;
  onToggleChat?: () => void;
}

export const TopNavHUD: React.FC<TopNavHUDProps> = ({
  playerProfile,
  coins,
  currentZone,
  coords,
  onOpenModal,
  onZoomIn,
  onZoomOut,
  isBuildMode,
  onCancelBuildMode,
  onlineCount = 1,
  maxPlayers = 10,
  connectionStatus = 'connected',
  cloudSyncStatus = { status: 'saved' },
  onRetryCloudSave,
  isChatOpen = false,
  unreadChatCount = 0,
  onToggleChat,
}) => {
  const stopProp = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const renderCloudBadge = () => {
    const status = cloudSyncStatus.status;
    if (status === 'saving') {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono flex items-center gap-1">
          <span>☁️</span>
          <span className="hidden sm:inline">သိမ်းနေသည်...</span>
        </span>
      );
    }
    if (status === 'pending_offline') {
      return (
        <button
          type="button"
          onClick={onRetryCloudSave}
          title={cloudSyncStatus.errorMessage || 'Offline — queued locally'}
          className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono flex items-center gap-1 cursor-pointer hover:bg-orange-500/30"
        >
          <span>⏳</span>
          <span className="hidden sm:inline">Local သိမ်းထားသည်</span>
        </button>
      );
    }
    if (status === 'error') {
      return (
        <button
          type="button"
          onClick={onRetryCloudSave}
          title={cloudSyncStatus.errorMessage || 'Cloud sync failed. Click to retry.'}
          className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-300 font-mono flex items-center gap-1 cursor-pointer hover:bg-rose-500/40"
        >
          <RefreshCw size={10} />
          <span>ပြန်သိမ်းမည်</span>
        </button>
      );
    }
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono flex items-center gap-1">
        <span>☁️</span>
        <span className="hidden sm:inline">Cloud သိမ်းပြီး</span>
      </span>
    );
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 pointer-events-none flex items-start justify-between gap-2"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingLeft: 'max(0.65rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.65rem, env(safe-area-inset-right))',
      }}
    >
      {/* Left: Player Info & Location */}
      <div
        onTouchStart={stopProp}
        onPointerDown={stopProp}
        className="flex items-center gap-2 pointer-events-auto min-w-0"
      >
        <div className="flex items-center gap-2 bg-stone-900/90 backdrop-blur-md border border-stone-700/80 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-lg min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-stone-800 border border-stone-600 flex items-center justify-center text-sm sm:text-base shrink-0">
            {playerProfile.gender === 'female' ? '👩‍🌾' : '👨‍🌾'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white text-xs tracking-tight truncate max-w-[96px] sm:max-w-none">
                {playerProfile.name}
              </span>
              {renderCloudBadge()}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-stone-300 truncate">
              <span className="text-amber-300 font-semibold truncate max-w-[110px] sm:max-w-none">{currentZone}</span>
              <span className="text-stone-400 font-mono shrink-0">({coords.x},{coords.y})</span>
            </div>
          </div>
        </div>

        {/* Multiplayer Status Indicator */}
        <div className="hidden lg:flex items-center gap-1.5 bg-stone-900/90 backdrop-blur-md border border-stone-700/80 rounded-xl px-3 py-2 shadow-lg">
          {connectionStatus === 'connected' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>အွန်လိုင်း: <span className="font-mono text-white">{onlineCount}</span> / {maxPlayers}</span>
            </div>
          )}
          {connectionStatus === 'connecting' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>ချိတ်ဆက်နေသည်...</span>
            </div>
          )}
          {connectionStatus === 'reconnecting' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-400">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-ping" />
              <span>ပြန်လည်ချိတ်ဆက်နေသည်...</span>
            </div>
          )}
          {connectionStatus === 'room_full' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400" title="လူပြည့်နေပါသည်">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>အခန်းပြည့် ({maxPlayers}/{maxPlayers})</span>
            </div>
          )}
          {connectionStatus === 'auth_error' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400" title="အကောင့်စစ်ဆေးမှု မအောင်မြင်ပါ">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>Auth ချို့ယွင်းချက်</span>
            </div>
          )}
          {connectionStatus === 'disconnected' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-400">
              <span className="w-2 h-2 rounded-full bg-stone-500" />
              <span>အော့ဖ်လိုင်း</span>
            </div>
          )}
        </div>
      </div>

      {/* Center: Active Build Mode Banner if placing (hidden on tiny screens because BuildingPlacementHUD shows full details) */}
      {isBuildMode && (
        <div
          onTouchStart={stopProp}
          onPointerDown={stopProp}
          className="hidden md:flex pointer-events-auto items-center gap-3 bg-amber-500 text-stone-950 px-3.5 py-1.5 rounded-full font-bold text-xs shadow-lg"
        >
          <span>🔨 ဆောက်လုပ်မှုပုံစံ</span>
          <button
            type="button"
            onClick={onCancelBuildMode}
            className="px-2 py-0.5 bg-stone-900 text-white rounded text-[11px] hover:bg-stone-800 transition cursor-pointer"
          >
            ပယ်ဖျက်မည်
          </button>
        </div>
      )}

      {/* Right: Currency & Action Bar */}
      <div
        onTouchStart={stopProp}
        onPointerDown={stopProp}
        className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0"
      >
        {/* Coins Badge */}
        <div className="flex items-center gap-1 bg-stone-900/90 backdrop-blur-md border border-stone-700/80 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-lg text-amber-300 font-bold text-xs">
          <span className="text-xs sm:text-sm">🪙</span>
          <span className="font-mono text-xs sm:text-sm">{coins}</span>
          <span className="text-[10px] text-stone-400 font-normal hidden sm:inline">ရွှေ</span>
        </div>

        {/* Zoom controls */}
        <div className="hidden sm:flex items-center bg-stone-900/90 backdrop-blur-md border border-stone-700/80 rounded-xl p-1 shadow-lg">
          <button
            type="button"
            onClick={onZoomOut}
            title="ချုံ့မည် (Zoom Out)"
            className="w-7 h-7 flex items-center justify-center rounded text-stone-300 hover:text-white hover:bg-stone-800 transition cursor-pointer"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            title="ချဲ့မည် (Zoom In)"
            className="w-7 h-7 flex items-center justify-center rounded text-stone-300 hover:text-white hover:bg-stone-800 transition cursor-pointer"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Primary Menu Buttons */}
        <div className="flex items-center gap-0.5 sm:gap-1 bg-stone-900/90 backdrop-blur-md border border-stone-700/80 rounded-xl p-1 shadow-lg">
          <button
            type="button"
            onClick={() => onOpenModal('inventory')}
            title="ပစ္စည်းအိတ် [I]"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-200 hover:text-white hover:bg-stone-800 transition cursor-pointer"
          >
            <Backpack size={15} className="text-amber-400" />
            <span className="hidden lg:inline">ပစ္စည်းအိတ် [I]</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('crafting')}
            title="ပစ္စည်းဖန်တီးခြင်း [C]"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-200 hover:text-white hover:bg-stone-800 transition cursor-pointer"
          >
            <Hammer size={15} className="text-cyan-400" />
            <span className="hidden lg:inline">ဖန်တီးခြင်း [C]</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('building')}
            title="ဆောက်လုပ်ခြင်း [B]"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-200 hover:text-white hover:bg-stone-800 transition cursor-pointer"
          >
            <Home size={15} className="text-emerald-400" />
            <span className="hidden lg:inline">ဆောက်လုပ်ခြင်း [B]</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('map')}
            title="ကမ္ဘာ့မြေပုံ [M]"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-200 hover:text-white hover:bg-stone-800 transition cursor-pointer"
          >
            <MapIcon size={15} className="text-indigo-400" />
            <span className="hidden lg:inline">မြေပုံ [M]</span>
          </button>

          {onToggleChat && (
            <button
              type="button"
              onClick={onToggleChat}
              title="စကားပြောခန်း ဖွင့်/ပိတ် [T]"
              className={`relative flex items-center gap-1.5 px-2 py-1.5 sm:px-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                isChatOpen
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-stone-200 hover:text-white hover:bg-stone-800'
              }`}
            >
              <div className="relative">
                <MessageSquare size={15} className="text-amber-400" />
                {unreadChatCount > 0 && !isChatOpen && (
                  <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadChatCount > 9 ? '9+' : unreadChatCount}
                  </span>
                )}
              </div>
              <span className="hidden lg:inline">စကားပြော [T]</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenModal('settings')}
            title="ဆက်တင်များနှင့် လမ်းညွှန်"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition cursor-pointer"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>
    </header>
  );
};
