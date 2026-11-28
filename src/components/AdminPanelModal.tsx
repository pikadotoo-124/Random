/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  Check,
  Copy,
  Megaphone,
  RefreshCw,
  Search,
  Server,
  Shield,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../firebase/AuthContext';
import {
  AdminOverviewData,
  AdminPlayerItem,
  banPlayerByUid,
  clearGameAnnouncement,
  fetchAdminOverview,
  kickPlayerByUid,
  publishGameAnnouncement,
  unbanPlayerByUid,
} from '../firebase/adminService';
import { ActiveAnnouncement, ConnectionStatus } from '../game/multiplayer/types';
import { UI_THEME } from './uiTheme';

interface AdminPanelModalProps {
  onClose: () => void;
  connectionStatus: ConnectionStatus;
  onAnnouncementChanged?: (announcement: ActiveAnnouncement | null) => void;
}

type AdminTab = 'players' | 'announcement' | 'status';

function formatUptime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return `${hrs} နာရီ ${mins} မိနစ်`;
  if (mins > 0) return `${mins} မိနစ် ${secs} စက္ကန့်`;
  return `${secs} စက္ကန့်`;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  onClose,
  connectionStatus,
  onAnnouncementChanged,
}) => {
  const { user, isVerifiedOwner } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('players');
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionReason, setActionReason] = useState<string>('');
  const [announcementInput, setAnnouncementInput] = useState<string>('');
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken(true);
      const data = await fetchAdminOverview(token);
      setOverview(data);
      setNotice(null);
      if (onAnnouncementChanged) {
        onAnnouncementChanged(data.activeAnnouncement ?? null);
      }
    } catch (err: any) {
      setNotice({
        ok: false,
        text: err?.message || 'Admin အချက်အလက်များ ဖတ်ယူ၍ မရပါ။',
      });
    } finally {
      setLoading(false);
    }
  }, [user, onAnnouncementChanged]);

  useEffect(() => {
    if (isVerifiedOwner && user) {
      void loadOverview();
    } else {
      setLoading(false);
    }
  }, [isVerifiedOwner, user, loadOverview]);

  const filteredPlayers = useMemo(() => {
    const list = overview?.players || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.playerName.toLowerCase().includes(q) ||
        p.uid.toLowerCase().includes(q)
    );
  }, [overview?.players, searchQuery]);

  const handleCopyUid = async (uid: string) => {
    try {
      await navigator.clipboard.writeText(uid);
      setCopiedUid(uid);
      setTimeout(() => setCopiedUid((prev) => (prev === uid ? null : prev)), 1500);
    } catch {
      // Clipboard API may be unavailable
    }
  };

  const handleKick = async (player: AdminPlayerItem) => {
    if (!user || busyKey) return;
    setBusyKey(`kick:${player.uid}`);
    setNotice(null);
    try {
      const token = await user.getIdToken(true);
      const res = await kickPlayerByUid(token, player.uid, actionReason.trim() || undefined);
      setNotice({
        ok: true,
        text: res.kicked
          ? `${player.playerName} အား ဂိမ်းခန်းမှ ထုတ်ပယ်ပြီးပါပြီ။`
          : `${player.playerName} သည် အွန်လိုင်းပေါ်တွင် မရှိတော့ပါ။`,
      });
      await loadOverview();
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Kick လုပ်ဆောင်၍ မရပါ။' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleBan = async (player: AdminPlayerItem) => {
    if (!user || busyKey) return;
    setBusyKey(`ban:${player.uid}`);
    setNotice(null);
    try {
      const token = await user.getIdToken(true);
      await banPlayerByUid(
        token,
        player.uid,
        actionReason.trim() || undefined,
        player.playerName
      );
      setActionReason('');
      setNotice({
        ok: true,
        text: `${player.playerName} (${player.uid}) အား ဂိမ်းဝင်ခွင့် ပိတ်ပင်ပြီးပါပြီ။`,
      });
      await loadOverview();
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Ban လုပ်ဆောင်၍ မရပါ။' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleUnban = async (player: AdminPlayerItem) => {
    if (!user || busyKey) return;
    setBusyKey(`unban:${player.uid}`);
    setNotice(null);
    try {
      const token = await user.getIdToken(true);
      await unbanPlayerByUid(token, player.uid);
      setNotice({
        ok: true,
        text: `${player.playerName} အား Ban ပြန်လည်ဖွင့်ပေးပြီးပါပြီ။`,
      });
      await loadOverview();
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Unban လုပ်ဆောင်၍ မရပါ။' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleBroadcastAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || busyKey) return;
    const clean = announcementInput.trim();
    if (!clean) {
      setNotice({ ok: false, text: 'ကြေညာချက် စာသား ရိုက်ထည့်ပါ။' });
      return;
    }
    setBusyKey('announcement_send');
    setNotice(null);
    try {
      const token = await user.getIdToken(true);
      const res = await publishGameAnnouncement(token, clean);
      setAnnouncementInput('');
      setNotice({
        ok: true,
        text: 'ကြေညာချက်ကို Online ကစားသမားအားလုံးထံ ပေးပို့ပြီးပါပြီ။',
      });
      if (onAnnouncementChanged) {
        onAnnouncementChanged(res.announcement);
      }
      await loadOverview();
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'ကြေညာချက် ပေးပို့၍ မရပါ။' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleClearAnnouncement = async () => {
    if (!user || busyKey) return;
    setBusyKey('announcement_clear');
    setNotice(null);
    try {
      const token = await user.getIdToken(true);
      await clearGameAnnouncement(token);
      setNotice({
        ok: true,
        text: 'လက်ရှိ ကြေညာချက်ကို ပိတ်သိမ်းပြီးပါပြီ။',
      });
      if (onAnnouncementChanged) {
        onAnnouncementChanged(null);
      }
      await loadOverview();
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'ကြေညာချက် ပိတ်သိမ်း၍ မရပါ။' });
    } finally {
      setBusyKey(null);
    }
  };

  if (!isVerifiedOwner) {
    return null;
  }

  return (
    <div className={UI_THEME.backdrop} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${UI_THEME.panel} max-w-2xl`}
      >
        {/* Header */}
        <div className={UI_THEME.header}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
              <Shield size={19} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight leading-snug truncate">
                Random City — Owner Admin Panel
              </h2>
              <p className="text-xs text-[#b7ad9d] leading-snug truncate">
                Verified Owner: {user?.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={loading || busyKey !== null}
              title="ပြန်လည်စစ်ဆေးမည်"
              aria-label="ပြန်လည်စစ်ဆေးမည်"
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#28221b] border border-[#453b2f] text-amber-300 hover:bg-[#352d24] transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="ပိတ်မည်"
              className={UI_THEME.closeBtn}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 sm:px-6 pt-3 pb-2 border-b border-[#342d24] bg-[#171410] flex items-center gap-1.5 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('players')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'players'
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'bg-[#241f19] text-stone-300 hover:bg-[#2f2820] border border-[#3e362c]'
            }`}
          >
            <Users size={14} />
            <span>ကစားသမားများ ({overview?.players.length ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('announcement')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'announcement'
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'bg-[#241f19] text-stone-300 hover:bg-[#2f2820] border border-[#3e362c]'
            }`}
          >
            <Megaphone size={14} />
            <span>ကြေညာချက်</span>
            {overview?.activeAnnouncement && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'status'
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'bg-[#241f19] text-stone-300 hover:bg-[#2f2820] border border-[#3e362c]'
            }`}
          >
            <Server size={14} />
            <span>ဆာဗာ အခြေအနေ</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {notice && (
            <div
              className={`p-3 rounded-xl border text-xs font-medium leading-snug ${
                notice.ok
                  ? 'bg-emerald-950/75 border-emerald-700/75 text-emerald-200'
                  : 'bg-rose-950/75 border-rose-700/75 text-rose-200'
              }`}
            >
              {notice.text}
            </div>
          )}

          {/* TAB 1: PLAYER MANAGEMENT */}
          {activeTab === 'players' && (
            <div className="space-y-3">
              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-2">
                <div className={`p-2.5 ${UI_THEME.subCard} text-center`}>
                  <div className="text-[10px] text-[#a99f8e]">အွန်လိုင်း</div>
                  <div className="text-sm font-bold text-emerald-300 font-mono">
                    {overview?.serverStatus.onlineCount ?? 0} / {overview?.serverStatus.maxPlayers ?? 10}
                  </div>
                </div>
                <div className={`p-2.5 ${UI_THEME.subCard} text-center`}>
                  <div className="text-[10px] text-[#a99f8e]">စုစုပေါင်း စာရင်း</div>
                  <div className="text-sm font-bold text-stone-100 font-mono">
                    {overview?.players.length ?? 0}
                  </div>
                </div>
                <div className={`p-2.5 ${UI_THEME.subCard} text-center`}>
                  <div className="text-[10px] text-[#a99f8e]">ပိတ်ပင်ထားသူ (Ban)</div>
                  <div className="text-sm font-bold text-rose-300 font-mono">
                    {overview?.bannedCount ?? 0}
                  </div>
                </div>
              </div>

              {/* Search & Optional Reason */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9e9484]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="အမည် သို့မဟုတ် UID ရှာရန်..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#13110e] border border-[#3a3329] text-xs text-white placeholder:text-[#786e5f] focus:outline-none focus:border-amber-400"
                  />
                </div>
                <input
                  type="text"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  maxLength={160}
                  placeholder="Kick / Ban အကြောင်းပြချက် (optional)"
                  className="w-full px-3 py-2 rounded-xl bg-[#13110e] border border-[#3a3329] text-xs text-white placeholder:text-[#786e5f] focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Player List */}
              {loading && !overview ? (
                <div className={`p-6 ${UI_THEME.subCard} text-center text-xs text-[#a99f8e]`}>
                  ကစားသမား စာရင်း ရယူနေသည်...
                </div>
              ) : filteredPlayers.length === 0 ? (
                <div className={`p-6 ${UI_THEME.subCard} text-center text-xs text-[#a99f8e]`}>
                  ကစားသမား မတွေ့ရှိပါ။
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPlayers.map((player) => (
                    <div
                      key={player.uid}
                      className={`p-3 ${UI_THEME.subCard} flex flex-col sm:flex-row sm:items-center justify-between gap-2.5`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              player.online
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : 'bg-stone-800/80 text-stone-400 border border-stone-700/60'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                player.online ? 'bg-emerald-400' : 'bg-stone-500'
                              }`}
                            />
                            {player.online ? 'အွန်လိုင်း' : 'အော့ဖ်လိုင်း'}
                          </span>

                          <span className="font-bold text-xs sm:text-sm text-white truncate">
                            {player.playerName}
                          </span>

                          {player.isOwner && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                              Owner
                            </span>
                          )}

                          {player.banned && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                              Banned
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-[#a99f8e] font-mono">
                          <span className="truncate max-w-[230px] sm:max-w-[300px]">
                            UID: {player.uid}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleCopyUid(player.uid)}
                            title="UID ကူးယူမည်"
                            className="p-1 rounded-md hover:bg-[#27221b] text-[#b7ad9d] hover:text-amber-300 cursor-pointer shrink-0"
                          >
                            {copiedUid === player.uid ? (
                              <Check size={12} className="text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>

                        {player.banned && player.banReason && (
                          <div className="text-[11px] text-rose-300/90 leading-snug">
                            Ban အကြောင်းပြချက်: {player.banReason}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {!player.isOwner && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {player.online && (
                            <button
                              type="button"
                              disabled={busyKey !== null}
                              onClick={() => void handleKick(player)}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-500/18 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <UserMinus size={13} />
                              <span>Kick</span>
                            </button>
                          )}

                          {!player.banned ? (
                            <button
                              type="button"
                              disabled={busyKey !== null}
                              onClick={() => void handleBan(player)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600/22 hover:bg-rose-600/35 border border-rose-500/45 text-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Ban size={13} />
                              <span>Ban</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyKey !== null}
                              onClick={() => void handleUnban(player)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600/22 hover:bg-emerald-600/35 border border-emerald-500/45 text-emerald-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <UserCheck size={13} />
                              <span>Unban</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GAME ANNOUNCEMENT */}
          {activeTab === 'announcement' && (
            <div className="space-y-4">
              {overview?.activeAnnouncement ? (
                <div className="p-3.5 rounded-xl bg-amber-950/35 border border-amber-500/45 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                      <Megaphone size={15} />
                      <span>လက်ရှိ ထုတ်လွှင့်နေသော ကြေညာချက်</span>
                    </div>
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => void handleClearAnnouncement()}
                      className="px-2.5 py-1 rounded-lg bg-rose-600/25 hover:bg-rose-600/40 border border-rose-500/45 text-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                      <span>ကြေညာချက် ပိတ်မည်</span>
                    </button>
                  </div>
                  <p className="text-xs sm:text-sm text-white leading-relaxed break-words">
                    {overview.activeAnnouncement.message}
                  </p>
                </div>
              ) : (
                <div className={`p-3.5 ${UI_THEME.subCard} text-xs text-[#a99f8e]`}>
                  လက်ရှိ ထုတ်လွှင့်ထားသော ကြေညာချက် မရှိသေးပါ (ကစားသမားများ၏ UI တွင် နေရာမယူပါ)။
                </div>
              )}

              <form onSubmit={handleBroadcastAnnouncement} className={`p-4 ${UI_THEME.subCard} space-y-3`}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-200">
                    ကြေညာချက် အသစ် ရေးသားရန်
                  </label>
                  <span className="text-[11px] font-mono text-[#a99f8e]">
                    {announcementInput.length} / 280
                  </span>
                </div>
                <textarea
                  rows={3}
                  maxLength={280}
                  value={announcementInput}
                  onChange={(e) => setAnnouncementInput(e.target.value)}
                  placeholder="ဥပမာ — မကြာမီ Maintenance ပြုလုပ်ပါမည်။ ကျေးဇူးပြု၍ Save နှိပ်ထားပါ..."
                  className="w-full px-3 py-2 rounded-xl bg-[#181410] border border-[#3e362c] text-xs sm:text-sm text-white placeholder:text-[#786e5f] focus:outline-none focus:border-amber-400 resize-none"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="submit"
                    disabled={busyKey !== null || announcementInput.trim().length === 0}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                      busyKey !== null || announcementInput.trim().length === 0
                        ? UI_THEME.disabledBtn
                        : UI_THEME.primaryAmberBtn
                    }`}
                  >
                    <Megaphone size={14} />
                    <span>
                      {busyKey === 'announcement_send'
                        ? 'ပေးပို့နေသည်...'
                        : 'ကစားသမားအားလုံးထံ ပို့မည်'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: SERVER STATUS */}
          {activeTab === 'status' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className={`p-3.5 ${UI_THEME.subCard} space-y-1`}>
                  <div className="text-[11px] text-[#a99f8e] flex items-center gap-1.5">
                    <Users size={13} className="text-emerald-400" />
                    <span>အွန်လိုင်း ကစားသမား အရေအတွက်</span>
                  </div>
                  <div className="text-base font-bold text-white font-mono">
                    {overview?.serverStatus.onlineCount ?? 0} / {overview?.serverStatus.maxPlayers ?? 10}
                  </div>
                </div>

                <div className={`p-3.5 ${UI_THEME.subCard} space-y-1`}>
                  <div className="text-[11px] text-[#a99f8e] flex items-center gap-1.5">
                    <Activity size={13} className="text-amber-400" />
                    <span>Multiplayer ချိတ်ဆက်မှု အခြေအနေ</span>
                  </div>
                  <div className="text-sm font-bold text-emerald-300">
                    {connectionStatus === 'connected'
                      ? 'ချိတ်ဆက်ပြီး (Connected)'
                      : connectionStatus === 'connecting'
                      ? 'ချိတ်ဆက်နေသည်...'
                      : connectionStatus === 'reconnecting'
                      ? 'ပြန်လည်ချိတ်ဆက်နေသည်...'
                      : connectionStatus}
                  </div>
                </div>

                <div className={`p-3.5 ${UI_THEME.subCard} space-y-1`}>
                  <div className="text-[11px] text-[#a99f8e] flex items-center gap-1.5">
                    <Server size={13} className="text-sky-400" />
                    <span>ဆာဗာ ကျန်းမာရေး (Server Health)</span>
                  </div>
                  <div
                    className={`text-sm font-bold ${
                      overview?.serverStatus.health === 'degraded'
                        ? 'text-amber-300'
                        : 'text-emerald-300'
                    }`}
                  >
                    {overview?.serverStatus.health === 'degraded'
                      ? 'သတိပြုရန် (Degraded)'
                      : 'ကောင်းမွန်သည် (Healthy)'}
                  </div>
                  <div className="text-[10px] text-[#9e9484]">
                    {overview?.serverStatus.runtime === 'cloudflare-do'
                      ? 'Cloudflare Durable Object'
                      : 'Express Local Server'}{' '}
                    • Uptime: {overview ? formatUptime(overview.serverStatus.uptimeMs) : '—'}
                  </div>
                </div>

                <div className={`p-3.5 ${UI_THEME.subCard} space-y-1`}>
                  <div className="text-[11px] text-[#a99f8e] flex items-center gap-1.5">
                    <AlertTriangle size={13} className="text-rose-400" />
                    <span>Error အကျဉ်းချုပ်</span>
                  </div>
                  <div className="text-base font-bold text-white font-mono">
                    {overview?.serverStatus.recentErrorCount ?? 0} ခု
                  </div>
                </div>
              </div>

              <div className={`p-3.5 ${UI_THEME.subCard} space-y-2`}>
                <div className="text-xs font-bold text-stone-200">
                  နောက်ဆုံး Error မှတ်တမ်း အကျဉ်း
                </div>
                {!overview || overview.serverStatus.recentErrors.length === 0 ? (
                  <div className="text-xs text-emerald-300/90">
                    ✓ မည်သည့် Server Error မျှ မတွေ့ရှိပါ။
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {overview.serverStatus.recentErrors.map((err, idx) => (
                      <div
                        key={`${err.timestamp}_${idx}`}
                        className="p-2 rounded-lg bg-rose-950/35 border border-rose-700/35 text-[11px] space-y-0.5"
                      >
                        <div className="flex items-center justify-between text-rose-300 font-mono text-[10px]">
                          <span>{err.source}</span>
                          <span>{new Date(err.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-stone-200 break-words">{err.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
