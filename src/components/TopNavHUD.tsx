/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  CloudRain,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  Backpack,
  Hammer,
  Home,
  Map as MapIcon,
  MessageSquare,
  Minus,
  Plus,
  Settings,
  Shield,
  RefreshCw,
} from 'lucide-react';
import { PlayerProfile } from '../game/types';
import { ConnectionStatus } from '../game/multiplayer/types';
import { CloudSyncState } from '../game/systems/SaveSystem';
import { AtmosphereSnapshot } from '../game/systems/WorldAtmosphereSystem';
import { UI_THEME } from './uiTheme';

interface TopNavHUDProps {
  playerProfile: PlayerProfile;
  coins: number;
  currentZone: string;
  coords: { x: number; y: number };
  onOpenModal: (modal: 'inventory' | 'crafting' | 'shop' | 'building' | 'map' | 'settings' | 'admin') => void;
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
  atmosphere?: AtmosphereSnapshot | null;
  isVerifiedOwner?: boolean;
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
  atmosphere = null,
  isVerifiedOwner = false,
}) => {
  const stopProp = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const renderCloudBadge = () => {
    const status = cloudSyncStatus.status;
    if (status === 'saving') {
      return (
        <span
          title="Cloud Firestore သို့ သိမ်းဆည်းနေသည်..."
          className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/25 font-medium flex items-center gap-1 shrink-0"
        >
          <span>☁️</span>
          <span>သိမ်းနေ...</span>
        </span>
      );
    }
    if (status === 'pending_offline') {
      return (
        <button
          type="button"
          onClick={onRetryCloudSave}
          title={
            cloudSyncStatus.errorMessage ||
            'အော့ဖ်လိုင်းဖြစ်နေ၍ စက်ထဲတွင် ယာယီသိမ်းထားသည် — ပြန်စမ်းရန်နှိပ်ပါ'
          }
          className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-300 border border-orange-500/30 font-medium flex items-center gap-1 cursor-pointer hover:bg-orange-500/25 shrink-0"
        >
          <span>⏳</span>
          <span className="sm:hidden">Local</span>
          <span className="hidden sm:inline">Local သိမ်းထားသည်</span>
        </button>
      );
    }
    if (status === 'error') {
      return (
        <button
          type="button"
          onClick={onRetryCloudSave}
          title={
            cloudSyncStatus.errorMessage ||
            'Cloud သိမ်းဆည်းမှု မအောင်မြင်ပါ — ထပ်မံကြိုးစားရန်နှိပ်ပါ'
          }
          className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/35 font-medium flex items-center gap-1 cursor-pointer hover:bg-rose-500/35 shrink-0"
        >
          <RefreshCw size={10} />
          <span>ပြန်သိမ်းမည်</span>
        </button>
      );
    }
    return (
      <span
        title="Cloud Firestore တွင် နောက်ဆုံးအခြေအနေ သိမ်းဆည်းပြီးပါပြီ"
        className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 font-medium flex items-center gap-1 shrink-0"
      >
        <span>☁️</span>
        <span className="sm:hidden">သိမ်းပြီး</span>
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
      {/* Left: Player Info, Multiplayer Status & Time/Weather */}
      <div
        onTouchStart={stopProp}
        onPointerDown={stopProp}
        className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto min-w-0"
      >
        <div className={`flex items-center gap-2 ${UI_THEME.hudPill} px-2.5 py-1.5 sm:px-3 sm:py-1.5 min-w-0`}>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#27221b] border border-[#4e4437] flex items-center justify-center text-sm sm:text-base shrink-0">
            {playerProfile.gender === 'female' ? '👩‍🌾' : '👨‍🌾'}
          </div>
          <div className="min-w-0 leading-snug">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-stone-100 text-xs truncate max-w-[92px] sm:max-w-[140px]">
                {playerProfile.name}
              </span>
              {renderCloudBadge()}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-stone-300 truncate">
              <span className="text-emerald-300 font-semibold truncate max-w-[100px] sm:max-w-[180px]">
                {currentZone}
              </span>
              <span className="text-[#9e9484] font-mono shrink-0">
                ({coords.x},{coords.y})
              </span>
            </div>
          </div>
        </div>

        {/* Multiplayer Status Indicator */}
        <div className={`hidden lg:flex items-center gap-1.5 ${UI_THEME.hudPill} px-3 py-2`}>
          {connectionStatus === 'connected' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                အွန်လိုင်း: <span className="font-mono text-white">{onlineCount}</span> / {maxPlayers}
              </span>
            </div>
          )}
          {connectionStatus === 'connecting' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
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
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400" title="လူပြည့်နေပါသည်">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>အခန်းပြည့် ({maxPlayers}/{maxPlayers})</span>
            </div>
          )}
          {connectionStatus === 'auth_error' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400" title="အကောင့်စစ်ဆေးမှု မအောင်မြင်ပါ">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>အကောင့် ချို့ယွင်းချက်</span>
            </div>
          )}
          {connectionStatus === 'disconnected' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#9e9484]">
              <span className="w-2 h-2 rounded-full bg-stone-500" />
              <span>အော့ဖ်လိုင်း</span>
            </div>
          )}
        </div>

        {/* Burmese World Time & Weather Indicator */}
        {atmosphere && (
          <div
            title={`${atmosphere.phaseLabelMy} • ${atmosphere.weatherLabelMy}`}
            className={`flex items-center gap-1.5 ${UI_THEME.hudPill} px-2.5 py-2 sm:px-3 shrink-0`}
          >
            {atmosphere.phase === 'morning' && <Sunrise size={14} className="text-amber-300 shrink-0" />}
            {atmosphere.phase === 'day' && <Sun size={14} className="text-yellow-300 shrink-0" />}
            {atmosphere.phase === 'evening' && <Sunset size={14} className="text-orange-400 shrink-0" />}
            {atmosphere.phase === 'night' && <Moon size={14} className="text-indigo-300 shrink-0" />}

            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-stone-100 whitespace-nowrap leading-snug">
              <span className="hidden md:inline text-amber-200">{atmosphere.phaseLabelMy}</span>
              <span className="hidden md:inline text-[#6e6456]">•</span>
              <span className="font-mono text-white">{atmosphere.formattedTimeMy}</span>
            </div>

            {atmosphere.weather === 'rain' && (
              <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold text-sky-300 pl-1.5 border-l border-[#3e362c]">
                <CloudRain size={13} className="shrink-0" />
                <span className="hidden sm:inline">မိုးရွာ</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Center: Active Build Mode Banner */}
      {isBuildMode && (
        <div
          onTouchStart={stopProp}
          onPointerDown={stopProp}
          className="hidden md:flex pointer-events-auto items-center gap-3 bg-[#242019]/95 border border-emerald-500/60 text-emerald-200 px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-lg"
        >
          <span>🔨 ဆောက်လုပ်မှုပုံစံ</span>
          <button
            type="button"
            onClick={onCancelBuildMode}
            className="px-2.5 py-1 bg-[#161310] border border-[#453b2f] text-stone-200 rounded-lg text-[11px] hover:bg-[#2c251d] transition cursor-pointer"
          >
            ပယ်ဖျက်မည်
          </button>
        </div>
      )}

      {/* Right: Currency, Zoom & Primary Action Bar */}
      <div
        onTouchStart={stopProp}
        onPointerDown={stopProp}
        className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0"
      >
        {/* Coins Badge */}
        <div className={`flex items-center gap-1.5 ${UI_THEME.hudPill} px-2.5 py-2 sm:px-3 text-amber-300 font-bold text-xs`}>
          <span className="text-xs sm:text-sm leading-none">🪙</span>
          <span className="font-mono text-xs sm:text-sm leading-none">{coins}</span>
          <span className="text-[10px] text-[#b4aa9a] font-medium hidden sm:inline">ရွှေ</span>
        </div>

        {/* Zoom Controls */}
        <div className={`hidden sm:flex items-center ${UI_THEME.hudPill} p-1 gap-0.5`}>
          <button
            type="button"
            onClick={onZoomOut}
            aria-label="မြင်ကွင်း ချုံ့မည်"
            title="မြင်ကွင်း ချုံ့မည် [-]"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#b7ad9d] hover:text-white hover:bg-[#2a241c] transition active:scale-95 cursor-pointer"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            aria-label="မြင်ကွင်း ချဲ့မည်"
            title="မြင်ကွင်း ချဲ့မည် [+]"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#b7ad9d] hover:text-white hover:bg-[#2a241c] transition active:scale-95 cursor-pointer"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Primary Menu Buttons */}
        <div className={`flex items-center gap-0.5 sm:gap-1 ${UI_THEME.hudPill} p-1`}>
          <button
            type="button"
            onClick={() => onOpenModal('inventory')}
            title="ခရီးသွားလွယ်အိတ် [I]"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-200 hover:text-white hover:bg-[#2a241c] transition cursor-pointer"
          >
            <Backpack size={15} className="text-amber-400 shrink-0" />
            <span className="hidden lg:inline">ပစ္စည်းအိတ် [I]</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('crafting')}
            title="ပစ္စည်းဖန်တီးခြင်း [C]"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-200 hover:text-white hover:bg-[#2a241c] transition cursor-pointer"
          >
            <Hammer size={15} className="text-sky-400 shrink-0" />
            <span className="hidden lg:inline">ဖန်တီးခြင်း [C]</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('building')}
            title="အဆောက်အအုံဆောက်လုပ်ခြင်း [B]"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-200 hover:text-white hover:bg-[#2a241c] transition cursor-pointer"
          >
            <Home size={15} className="text-emerald-400 shrink-0" />
            <span className="hidden lg:inline">ဆောက်လုပ်ခြင်း [B]</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('map')}
            title="ကမ္ဘာ့မြေပုံ [M]"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-200 hover:text-white hover:bg-[#2a241c] transition cursor-pointer"
          >
            <MapIcon size={15} className="text-indigo-400 shrink-0" />
            <span className="hidden lg:inline">မြေပုံ [M]</span>
          </button>

          {onToggleChat && (
            <button
              type="button"
              onClick={onToggleChat}
              aria-label="မြို့တွင်းစကားပြောခန်း"
              title="စကားပြောခန်း ဖွင့်/ပိတ် [T]"
              className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                isChatOpen
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-stone-200 hover:text-white hover:bg-[#2a241c]'
              }`}
            >
              <div className="relative">
                <MessageSquare size={15} className="text-amber-400 shrink-0" />
                {unreadChatCount > 0 && !isChatOpen && (
                  <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-1 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadChatCount > 9 ? '9+' : unreadChatCount}
                  </span>
                )}
              </div>
              <span className="hidden lg:inline">စကားပြော [T]</span>
            </button>
          )}

          {isVerifiedOwner && (
            <button
              type="button"
              onClick={() => onOpenModal('admin')}
              aria-label="Admin Panel"
              title="Owner Admin Panel"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/35 hover:bg-amber-500/25 transition cursor-pointer"
            >
              <Shield size={14} className="shrink-0" />
              <span className="hidden lg:inline">Admin</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenModal('settings')}
            aria-label="ဂိမ်းဆက်တင်များ"
            title="ဂိမ်းဆက်တင်များနှင့် လမ်းညွှန်"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#b7ad9d] hover:text-white hover:bg-[#2a241c] transition cursor-pointer"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>
    </header>
  );
};
