/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Settings,
  X,
  Volume2,
  VolumeX,
  Save,
  RotateCcw,
  ShieldCheck,
  Gamepad2,
  LogOut,
  Edit2,
  Check,
  Cloud,
  CloudRain,
  Sun,
  Wind,
  AlertTriangle,
  Download,
  Upload,
  ChevronDown,
  ChevronUp,
  Lock,
} from 'lucide-react';
import { SoundSynth } from '../game/utils/SoundSynth';
import { SaveSystem } from '../game/systems/SaveSystem';
import { useAuth } from '../firebase/AuthContext';
import {
  downloadPersonalSaveBackup,
  downloadSharedWorldBackup,
  fetchLaunchStatus,
  isProjectOwnerEmail,
  LaunchStatusResponse,
  parseAndValidateSharedWorldBackup,
  restoreSharedWorldBackup,
  triggerOneTimeOfficialReset,
} from '../firebase/officialLaunchService';
import { PlayerProfile } from '../game/types';
import { UI_THEME } from './uiTheme';

interface SettingsModalProps {
  playerProfile: PlayerProfile;
  onClose: () => void;
  onSave: () => Promise<boolean> | boolean | void;
  onReset: () => void;
  onNameUpdated: (newName: string) => void;
  weatherEffectsEnabled?: boolean;
  onToggleWeatherEffects?: (enabled: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  playerProfile,
  onClose,
  onSave,
  onReset,
  onNameUpdated,
  weatherEffectsEnabled = true,
  onToggleWeatherEffects,
}) => {
  const { user, gameState, signOutUser, updateName, cloudSyncStatus, retryCloudSave } = useAuth();
  const [sound, setSound] = useState(SoundSynth.enabled);
  const [ambientSound, setAmbientSound] = useState(SoundSynth.ambientEnabled);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(playerProfile.name);
  const [nameError, setNameError] = useState<string | null>(null);

  // Project Owner-only Official Launch Backup & One-Time Reset state
  const isOwner = isProjectOwnerEmail(user?.email);
  const [launchPanelOpen, setLaunchPanelOpen] = useState(false);
  const [launchStatus, setLaunchStatus] = useState<LaunchStatusResponse | null>(null);
  const [launchBusy, setLaunchBusy] = useState<string | null>(null);
  const [launchNotice, setLaunchNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [backupVerified, setBackupVerified] = useState(false);
  const [verifiedBackupSummary, setVerifiedBackupSummary] = useState<string | null>(null);
  const [loadedRestoreBuildings, setLoadedRestoreBuildings] = useState<any[] | null>(null);
  const [ownerResetChecked, setOwnerResetChecked] = useState(false);
  const [ownerResetText, setOwnerResetText] = useState('');

  const toggleSound = () => {
    SoundSynth.enabled = !sound;
    setSound(!sound);
    if (!sound) {
      SoundSynth.playSuccess();
    }
  };

  const toggleAmbientSound = () => {
    const next = !ambientSound;
    SoundSynth.setAmbientEnabled(next);
    setAmbientSound(next);
    if (next) {
      SoundSynth.playAmbientBirdChirp();
    }
  };

  const handleSaveClick = async () => {
    const result = await onSave();
    const ok = typeof result === 'boolean' ? result : await retryCloudSave();
    const freshSync = SaveSystem.getSyncStatus();
    setSaveStatus({
      ok,
      text: ok
        ? 'ကစားထားသော အချက်အလက်များကို Cloud Firestore နှင့် စက်ထဲတွင် အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ!'
        : freshSync.status === 'error' && freshSync.errorMessage
        ? `Cloud သိမ်းဆည်းမှု မအောင်မြင်သေးပါ (${freshSync.errorMessage}) — စက်ထဲတွင် ယာယီသိမ်းထားပါသည်။`
        : 'Cloud ချိတ်ဆက်မှု မရသေးသဖြင့် စက်ထဲတွင် ယာယီသိမ်းထားပါသည်။ အင်တာနက်ရလျှင် အလိုအလျောက် Sync လုပ်ပါမည်။',
    });
    setTimeout(() => setSaveStatus(null), 4000);
  };

  const handleSaveName = async () => {
    const clean = nameInput.trim();
    if (clean.length < 3 || clean.length > 16) {
      setNameError('အမည်သည် စာလုံးရေ ၃ လုံးမှ ၁၆ လုံးအတွင်း ဖြစ်ရပါမည်။');
      return;
    }
    setNameError(null);
    try {
      if (updateName) {
        await updateName(clean);
      }
      onNameUpdated(clean);
      setIsEditingName(false);
      SoundSynth.playSuccess();
    } catch (err: any) {
      setNameError(err?.message || 'အမည်ပြောင်းလဲ၍ မရပါ။');
    }
  };

  const refreshLaunchStatus = async () => {
    const status = await fetchLaunchStatus();
    setLaunchStatus(status);
  };

  const handleToggleLaunchPanel = () => {
    const next = !launchPanelOpen;
    setLaunchPanelOpen(next);
    if (next) {
      void refreshLaunchStatus();
    }
  };

  const handleDownloadSharedBackup = async () => {
    if (!user) return;
    setLaunchBusy('shared_backup');
    setLaunchNotice(null);
    try {
      const token = await user.getIdToken(true);
      const backup = await downloadSharedWorldBackup(token);
      setBackupVerified(true);
      setVerifiedBackupSummary(
        `Shared World Backup ဖိုင် Validate အောင်မြင်သည် (${backup.buildingCount} Buildings • Room: ${backup.roomName} • v${backup.backupVersion}) — သူငယ်ချင်းများ၏ Firestore Data မပါဝင်ပါ`
      );
      setLaunchNotice({
        ok: true,
        text: `Shared World Backup JSON (${backup.buildingCount} Buildings) စစ်ဆေးပြီး ဒေါင်းလုဒ်ချပြီးပါပြီ။`,
      });
    } catch (err: any) {
      setBackupVerified(false);
      setLaunchNotice({ ok: false, text: err?.message || 'Shared World Backup ရယူ၍ မရပါ။' });
    } finally {
      setLaunchBusy(null);
    }
  };

  const handleDownloadPersonalBackup = async () => {
    if (!user) return;
    setLaunchBusy('personal_backup');
    setLaunchNotice(null);
    try {
      await downloadPersonalSaveBackup(user, gameState);
      setLaunchNotice({
        ok: true,
        text: 'သင်၏ ကိုယ်ပိုင် Account Save JSON ဖိုင်ကို ဒေါင်းလုဒ်ချပြီးပါပြီ။',
      });
    } catch (err: any) {
      setLaunchNotice({ ok: false, text: err?.message || 'Personal Backup ရယူ၍ မရပါ။' });
    } finally {
      setLaunchBusy(null);
    }
  };

  const handleSelectRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseAndValidateSharedWorldBackup(text);
      setLoadedRestoreBuildings(parsed.placedBuildings);
      setBackupVerified(true);
      setVerifiedBackupSummary(`Backup ဖိုင် မှန်ကန်သည် (${parsed.buildingCount} Buildings ပါဝင်သည်)`);
      setLaunchNotice({
        ok: true,
        text: `Backup ဖိုင် စစ်ဆေးအောင်မြင်သည် — Buildings ${parsed.buildingCount} ခု ပါဝင်ပါသည်။`,
      });
    } catch (err: any) {
      setLoadedRestoreBuildings(null);
      setLaunchNotice({ ok: false, text: err?.message || 'Backup ဖိုင် ဖတ်၍ မရပါ။' });
    }
  };

  const handleRestoreSharedBackup = async () => {
    if (!user || !loadedRestoreBuildings) return;
    setLaunchBusy('restore');
    setLaunchNotice(null);
    try {
      const token = await user.getIdToken(true);
      const res = await restoreSharedWorldBackup(token, loadedRestoreBuildings);
      await refreshLaunchStatus();
      setLaunchNotice({
        ok: true,
        text: `Shared World Buildings ${res.restoredCount} ခုကို ပြန်လည် Restore လုပ်ပြီးပါပြီ။`,
      });
    } catch (err: any) {
      setLaunchNotice({ ok: false, text: err?.message || 'Restore လုပ်ဆောင်၍ မရပါ။' });
    } finally {
      setLaunchBusy(null);
    }
  };

  const handleExecuteOfficialReset = async () => {
    if (!user || !backupVerified || !ownerResetChecked || ownerResetText.trim() !== 'RESET') return;
    setLaunchBusy('official_reset');
    setLaunchNotice(null);
    try {
      const token = await user.getIdToken(true);
      const res = await triggerOneTimeOfficialReset(token, {
        confirmText: 'RESET',
        backupVerified: true,
      });
      await refreshLaunchStatus();
      setLaunchNotice({
        ok: true,
        text: res.alreadyReset
          ? `Official Launch Reset ပြုလုပ်ပြီးသားဖြစ်ပါသည် (Epoch: ${res.epoch})။`
          : `Official Launch Reset အောင်မြင်စွာ ပြီးစီးပါပြီ (${res.clearedBuildingsCount} Shared Buildings ရှင်းလင်းပြီး • Epoch: ${res.epoch})။`,
      });
      setOwnerResetChecked(false);
      setOwnerResetText('');
    } catch (err: any) {
      setLaunchNotice({ ok: false, text: err?.message || 'Official Launch Reset မအောင်မြင်ပါ။' });
    } finally {
      setLaunchBusy(null);
    }
  };

  return (
    <div className={UI_THEME.backdrop} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${UI_THEME.panel} max-w-xl`}
      >
        {/* Header */}
        <div className={UI_THEME.header}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#27221b] border border-[#453b2f] flex items-center justify-center text-amber-300 shrink-0">
              <Settings size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight leading-snug truncate">
                ဂိမ်းဆက်တင်များနှင့် လမ်းညွှန်
              </h2>
              <p className="text-xs text-[#b7ad9d] leading-snug truncate">
                Random City ပရိုဖိုင်နှင့် စနစ်များ
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="ပိတ်မည်"
            className={UI_THEME.closeBtn}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* User Account & Character Card */}
          <div className={`p-4 ${UI_THEME.subCard} space-y-3`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#262019] border border-[#453c30] flex items-center justify-center text-xl shrink-0">
                  {playerProfile.gender === 'female' ? '👩‍🌾' : '👨‍🌾'}
                </div>
                <div className="min-w-0">
                  {isEditingName ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        minLength={3}
                        maxLength={16}
                        aria-label="ကစားသမား အမည်"
                        className="px-2.5 py-1 text-xs rounded-lg bg-[#1d1914] border border-[#564b3c] focus:border-amber-400 focus:outline-none text-white font-bold"
                      />
                      <button
                        type="button"
                        onClick={handleSaveName}
                        className="p-1.5 rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400 cursor-pointer"
                        title="သိမ်းဆည်းမည်"
                        aria-label="သိမ်းဆည်းမည်"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingName(false);
                          setNameError(null);
                        }}
                        className="p-1.5 rounded-lg bg-[#2a241d] text-stone-300 hover:text-white cursor-pointer"
                        title="ပယ်ဖျက်မည်"
                        aria-label="ပယ်ဖျက်မည်"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm leading-snug">
                        {playerProfile.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNameInput(playerProfile.name);
                          setIsEditingName(true);
                        }}
                        className="text-[#a99f8e] hover:text-amber-300 p-1 rounded-md hover:bg-[#27221b] transition cursor-pointer"
                        title="အမည်ပြောင်းမည်"
                        aria-label="အမည်ပြောင်းမည်"
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>
                  )}
                  {nameError && <div className="text-[11px] text-rose-400 mt-0.5">{nameError}</div>}
                  <div className="text-[11px] text-[#b7ad9d] flex items-center gap-2 mt-0.5 flex-wrap leading-snug">
                    <span>
                      {playerProfile.gender === 'female' ? 'အမျိုးသမီး ကစားသမား' : 'အမျိုးသား ကစားသမား'}
                    </span>
                    <span>•</span>
                    <span
                      className={`flex items-center gap-1 ${
                        cloudSyncStatus.status === 'error'
                          ? 'text-rose-400'
                          : cloudSyncStatus.status === 'pending_offline'
                          ? 'text-orange-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      <Cloud size={12} />
                      <span>
                        {cloudSyncStatus.status === 'saving'
                          ? 'Cloud သိမ်းနေသည်...'
                          : cloudSyncStatus.status === 'error'
                          ? 'Cloud Sync ချို့ယွင်းချက်ရှိသည်'
                          : cloudSyncStatus.status === 'pending_offline'
                          ? 'အော့ဖ်လိုင်းဖြစ်နေ၍ စက်ထဲသိမ်းထားသည်'
                          : 'Firebase Cloud သိမ်းဆည်းမှု စနစ်အလုပ်လုပ်နေသည်'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {user && (
                <button
                  type="button"
                  onClick={() => signOutUser()}
                  className="px-3 py-1.5 rounded-xl border border-[#453c30] bg-[#1d1914] hover:border-rose-500/50 hover:bg-rose-500/10 text-stone-200 hover:text-rose-300 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                  title="Google အကောင့်မှ ထွက်မည်"
                >
                  <LogOut size={13} />
                  <span>အကောင့်ထွက်မည်</span>
                </button>
              )}
            </div>
          </div>

          {/* Audio Setting */}
          <div className={`flex items-center justify-between gap-3 p-3.5 ${UI_THEME.subCard}`}>
            <div className="flex items-center gap-3 min-w-0">
              {sound ? (
                <Volume2 className="text-amber-400 shrink-0" size={20} />
              ) : (
                <VolumeX className="text-[#786e5f] shrink-0" size={20} />
              )}
              <div className="min-w-0">
                <div className="text-sm font-bold text-white leading-snug">အသံဖိုင် စနစ်</div>
                <div className="text-xs text-[#a99f8e] leading-snug">
                  သစ်ခုတ်၊ ကျောက်ခွဲ၊ ကုန်ရောင်းဝယ် အသံဖိုင်များ
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleSound}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                sound
                  ? 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                  : 'bg-[#28221b] border border-[#42382c] text-[#a99f8e]'
              }`}
            >
              {sound ? 'ဖွင့်ထားသည်' : 'ပိတ်ထားသည်'}
            </button>
          </div>

          {/* Ambient Nature Audio Setting */}
          <div className={`flex items-center justify-between gap-3 p-3.5 ${UI_THEME.subCard}`}>
            <div className="flex items-center gap-3 min-w-0">
              <Wind
                className={`shrink-0 ${ambientSound ? 'text-emerald-400' : 'text-[#786e5f]'}`}
                size={20}
              />
              <div className="min-w-0">
                <div className="text-sm font-bold text-white leading-snug">
                  သဘာဝပတ်ဝန်းကျင် အသံများ
                </div>
                <div className="text-xs text-[#a99f8e] leading-snug">
                  ညင်သာသော လေတိုက်သံ၊ ငှက်သံ၊ ရေစီးသံနှင့် ညဘက်ပိုးကောင်အသံ
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleAmbientSound}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                ambientSound
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-stone-950'
                  : 'bg-[#28221b] border border-[#42382c] text-[#a99f8e]'
              }`}
            >
              {ambientSound ? 'ဖွင့်ထားသည်' : 'ပိတ်ထားသည်'}
            </button>
          </div>

          {/* Weather Visual Effect Setting */}
          {onToggleWeatherEffects && (
            <div className={`flex items-center justify-between gap-3 p-3.5 ${UI_THEME.subCard}`}>
              <div className="flex items-center gap-3 min-w-0">
                {weatherEffectsEnabled ? (
                  <CloudRain className="text-sky-400 shrink-0" size={20} />
                ) : (
                  <Sun className="text-[#786e5f] shrink-0" size={20} />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white leading-snug">
                    ရာသီဥတု အထူးပြုလုပ်ချက် စနစ်
                  </div>
                  <div className="text-xs text-[#a99f8e] leading-snug">
                    မိုးရွာခြင်းနှင့် မြေပြင်/ရေပြင် အစက်အပြောက်များ (ကစားမှုကို မထိခိုက်ပါ)
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onToggleWeatherEffects(!weatherEffectsEnabled);
                  SoundSynth.playRustle();
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  weatherEffectsEnabled
                    ? 'bg-sky-500 hover:bg-sky-400 text-stone-950'
                    : 'bg-[#28221b] border border-[#42382c] text-[#a99f8e]'
                }`}
              >
                {weatherEffectsEnabled ? 'ဖွင့်ထားသည်' : 'ပိတ်ထားသည်'}
              </button>
            </div>
          )}

          {/* Controls Reference */}
          <div className={`p-4 ${UI_THEME.subCard} space-y-3`}>
            <div className="flex items-center gap-2 text-xs font-bold text-stone-200">
              <Gamepad2 size={16} className="text-amber-400 shrink-0" />
              <span>ထိန်းချုပ်မောင်းနှင်မှု စနစ်လမ်းညွှန်</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-stone-200">
              <div className="p-2.5 bg-[#1c1813] rounded-xl border border-[#342d24] flex items-center justify-between gap-2">
                <span>လမ်းလျှောက်ခြင်း:</span>
                <span className="text-amber-300 font-mono font-bold">WASD / မြားခလုတ်</span>
              </div>
              <div className="p-2.5 bg-[#1c1813] rounded-xl border border-[#342d24] flex items-center justify-between gap-2">
                <span>လုပ်ဆောင်ချက် / ရိတ်သိမ်းခြင်း:</span>
                <span className="text-amber-300 font-mono font-bold">E / နှိပ်ပါ</span>
              </div>
              <div className="p-2.5 bg-[#1c1813] rounded-xl border border-[#342d24] flex items-center justify-between gap-2">
                <span>ပစ္စည်းလွယ်အိတ်:</span>
                <span className="text-amber-300 font-mono font-bold">I</span>
              </div>
              <div className="p-2.5 bg-[#1c1813] rounded-xl border border-[#342d24] flex items-center justify-between gap-2">
                <span>ဆောက်လုပ်ခြင်းပုံစံ:</span>
                <span className="text-amber-300 font-mono font-bold">B</span>
              </div>
              <div className="p-2.5 bg-[#1c1813] rounded-xl border border-[#342d24] flex items-center justify-between gap-2">
                <span>ခြံစည်းရိုးလှည့်ရန်:</span>
                <span className="text-amber-300 font-mono font-bold">R</span>
              </div>
              <div className="p-2.5 bg-[#1c1813] rounded-xl border border-[#342d24] flex items-center justify-between gap-2">
                <span>ဖန်တီးခုံ / မြေပုံ:</span>
                <span className="text-amber-300 font-mono font-bold">C / M</span>
              </div>
              <div className="p-2.5 bg-[#1c1813] rounded-xl border border-[#342d24] flex items-center justify-between gap-2 sm:col-span-2">
                <span>မြင်ကွင်း ချဲ့ / ချုံ့ / ပုံမှန်:</span>
                <span className="text-amber-300 font-mono font-bold">+ / - / 0 သို့မဟုတ် Mouse Wheel</span>
              </div>
            </div>
            <div className="text-[11px] text-[#a99f8e] leading-relaxed">
              ဖုန်းဖြင့်ကစားသူများသည် ဘယ်ဘက် Virtual Joystick နှင့် ညာဘက်လုပ်ဆောင်ချက်ခလုတ်များကို အသုံးပြုနိုင်ပါသည်။
            </div>
          </div>

          {/* Data Management */}
          <div className="space-y-2.5">
            {!isConfirmingReset ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleSaveClick}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500/18 hover:bg-amber-500/28 text-amber-200 border border-amber-500/40 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Save size={15} />
                  <span>Cloud နှင့် စက်ထဲသို့ အခုချက်ချင်း သိမ်းဆည်းမည်</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsConfirmingReset(true)}
                  className="py-2.5 px-4 rounded-xl border border-rose-500/35 bg-rose-950/25 text-rose-300 hover:bg-rose-500/15 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw size={15} />
                  <span>အသစ်ပြန်စမည်</span>
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-700/50 space-y-3">
                <div className="flex items-center gap-2 text-rose-300 text-xs font-bold">
                  <AlertTriangle size={16} className="shrink-0 text-rose-400" />
                  <span>ကစားထားသော အချက်အလက်များကို ဖျက်ပြီး အသစ်ပြန်စတင်လိုပါသလား?</span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingReset(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#28221b] hover:bg-[#352d24] border border-[#453b2f] text-xs text-stone-200 font-semibold cursor-pointer"
                  >
                    မလုပ်တော့ပါ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfirmingReset(false);
                      onReset();
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs text-white font-bold cursor-pointer"
                  >
                    အသစ်ပြန်စမည်
                  </button>
                </div>
              </div>
            )}

            {saveStatus && (
              <div
                className={`p-2.5 rounded-xl border text-xs text-center font-medium leading-snug ${
                  saveStatus.ok
                    ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-300'
                    : 'bg-orange-950/80 border-orange-700/80 text-orange-300'
                }`}
              >
                {saveStatus.text}
              </div>
            )}
          </div>

          {/* Architecture info */}
          <div className={`p-3.5 ${UI_THEME.subCard} text-xs text-[#a99f8e] space-y-1`}>
            <div className="font-bold text-stone-200 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
              <span>Cloud သိမ်းဆည်းမှုနှင့် လုံခြုံရေးစနစ်</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Firebase Authentication နှင့် Cloud Firestore စနစ် ချိတ်ဆက်အလုပ်လုပ်နေပါသည်။ ကစားသမားတစ်ဦးချင်းစီ၏ အချက်အလက်များကို{' '}
              <code className="text-stone-200 font-mono">users/{'{uid}'}</code> တွင် Firestore Security Rules ဖြင့် လုံခြုံစွာ သိမ်းဆည်းထားပါသည်။
            </p>
          </div>

          {/* Owner-Only Official Launch Backup & One-Time Reset Panel (Hidden from all non-owner accounts) */}
          {isOwner && (
            <div className={`p-3.5 ${UI_THEME.subCard} border-amber-500/35 space-y-3`}>
              <button
                type="button"
                onClick={handleToggleLaunchPanel}
                className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Lock size={15} className="text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-amber-200 truncate">
                      Official Launch Backup & One-Time Reset (Owner Only)
                    </div>
                    <div className="text-[11px] text-[#a99f8e] truncate">
                      Project Owner ({user?.email}) အတွက်သာ မြင်ရသော Launch ပြင်ဆင်မှု
                    </div>
                  </div>
                </div>
                {launchPanelOpen ? (
                  <ChevronUp size={16} className="text-amber-300 shrink-0" />
                ) : (
                  <ChevronDown size={16} className="text-amber-300 shrink-0" />
                )}
              </button>

              {launchPanelOpen && (
                <div className="pt-2 border-t border-[#3a3126] space-y-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-[#1a1611] border border-[#362e24] space-y-1 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#a99f8e]">Official Launch Reset အခြေအနေ:</span>
                      <span
                        className={`font-bold ${
                          launchStatus?.officialResetEpoch ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {launchStatus === null
                          ? 'စစ်ဆေးနေသည်...'
                          : launchStatus.officialResetEpoch
                          ? 'ပြီးစီးပြီး'
                          : 'မလုပ်ဆောင်ရသေးပါ'}
                      </span>
                    </div>
                    {launchStatus?.officialResetEpoch && (
                      <div className="text-[10px] text-stone-400 font-mono break-all">
                        Epoch: {launchStatus.officialResetEpoch}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#a99f8e]">လက်ရှိ Shared Buildings:</span>
                      <span className="font-bold text-stone-200">
                        {launchStatus ? `${launchStatus.buildingCount} ခု` : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Step 1: Backup */}
                  <div className="space-y-2">
                    <div className="font-bold text-stone-200">၁။ Backup အရင်ဒေါင်းလုဒ်ချပါ</div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        disabled={launchBusy !== null}
                        onClick={handleDownloadSharedBackup}
                        className="flex-1 py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/45 text-amber-200 font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Download size={14} />
                        <span>
                          {launchBusy === 'shared_backup'
                            ? 'Backup ယူနေသည်...'
                            : 'Shared World Backup (.json)'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={launchBusy !== null}
                        onClick={handleDownloadPersonalBackup}
                        className="flex-1 py-2 px-3 rounded-xl bg-[#27221b] hover:bg-[#342d24] border border-[#453c30] text-stone-200 font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Download size={14} />
                        <span>ကိုယ်ပိုင် Save Backup (.json)</span>
                      </button>
                    </div>
                    {verifiedBackupSummary && (
                      <div className="text-[11px] text-emerald-300 font-medium leading-relaxed">
                        ✓ {verifiedBackupSummary}
                      </div>
                    )}
                    <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-600/35 text-[11px] text-amber-100/90 leading-relaxed space-y-1">
                      <div className="font-bold text-amber-300">
                        သတိပြုရန် — သူငယ်ချင်းများ၏ Firestore Data Backup:
                      </div>
                      <p>
                        အထက်ပါ ခလုတ်များသည် <strong>Shared Buildings (Cloudflare DO)</strong> နှင့်{' '}
                        <strong>Owner ကိုယ်ပိုင် Save</strong> ကိုသာ Backup ယူပေးနိုင်ပါသည်။{' '}
                        <code className="font-mono text-amber-200">firestore.rules</code>{' '}
                        လုံခြုံရေးကန့်သတ်ချက်ကြောင့် အခြားသူငယ်ချင်းများ၏{' '}
                        <code className="font-mono text-amber-200">users/{'{uid}'}</code>{' '}
                        Firestore Data များကို ဤ UI မှ တိုက်ရိုက် Backup မယူနိုင်ပါ။ သူငယ်ချင်းအားလုံး၏ Data ကိုပါ Backup လိုအပ်ပါက Reset မလုပ်မီ{' '}
                        <strong>Firebase Console → Firestore Database → Import/Export</strong> မှတစ်ဆင့် Export ယူထားပါ။
                      </p>
                    </div>
                  </div>

                  {/* Step 2: Verify or Restore */}
                  <div className="space-y-2">
                    <div className="font-bold text-stone-200">
                      ၂။ Backup JSON စစ်ဆေးခြင်း / ပြန်တင်ခြင်း (Restore)
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="px-3 py-1.5 rounded-xl bg-[#241f19] hover:bg-[#312a22] border border-[#453c30] text-stone-200 font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                        <Upload size={14} />
                        <span>Backup .json ဖိုင်ရွေးမည်</span>
                        <input
                          type="file"
                          accept=".json,application/json"
                          onChange={handleSelectRestoreFile}
                          className="hidden"
                        />
                      </label>

                      {loadedRestoreBuildings && (
                        <button
                          type="button"
                          disabled={launchBusy !== null}
                          onClick={handleRestoreSharedBackup}
                          className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/45 text-sky-200 font-bold cursor-pointer disabled:opacity-50"
                        >
                          {launchBusy === 'restore'
                            ? 'Restore လုပ်နေသည်...'
                            : `Shared Buildings ${loadedRestoreBuildings.length} ခု Restore လုပ်မည်`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Step 3: Locked One-Time Official Reset */}
                  <div className="p-3 rounded-xl bg-rose-950/25 border border-rose-700/45 space-y-2.5">
                    <div className="font-bold text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>၃။ One-Time Official Launch Reset</span>
                    </div>

                    {launchStatus?.officialResetEpoch ? (
                      <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-600/40 text-[11px] text-emerald-200 leading-relaxed">
                        Official Launch Reset တစ်ကြိမ် ပြီးစီးပြီးဖြစ်ပါသည် (Epoch:{' '}
                        <span className="font-mono">{launchStatus.officialResetEpoch}</span>)။ ကစားသမားများ၏ Official Progress မပျက်စီးစေရန် ထပ်မံ Reset လုပ်ခွင့်ကို Lock ချထားပါသည်။
                      </div>
                    ) : (
                      <>
                        <p className="text-[11px] text-stone-300 leading-relaxed">
                          Shared World Backup ဖိုင် ပြည့်စုံစွာ Validate အောင်မြင်ပြီးမှသာ Reset ခလုတ် ပွင့်ပါမည်။ Google Login / Player UID များ မပျက်စီးပါ — ကစားသမားအားလုံး၏ Gold, Inventory, Position, Clothing နှင့် Shared Buildings များသာ အစမှ ပြန်စပါမည်။
                        </p>

                        <label className="flex items-start gap-2 text-[11px] text-stone-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ownerResetChecked}
                            disabled={!backupVerified || launchBusy !== null}
                            onChange={(e) => setOwnerResetChecked(e.target.checked)}
                            className="mt-0.5 accent-rose-500"
                          />
                          <span>
                            Shared World Backup ယူပြီးဖြစ်ကြောင်း (နှင့် လိုအပ်ပါက Firebase Console မှ Firestore Backup ယူပြီးဖြစ်ကြောင်း) အတည်ပြုပြီး Player အားလုံးကို တစ်ကြိမ်တည်း Official Reset လုပ်မည်ဖြစ်ကြောင်း သဘောတူပါသည်။
                          </span>
                        </label>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={ownerResetText}
                            disabled={!backupVerified || launchBusy !== null}
                            onChange={(e) => setOwnerResetText(e.target.value)}
                            placeholder='RESET ဟု ရိုက်ထည့်ပါ'
                            className="flex-1 px-3 py-2 rounded-xl bg-[#181410] border border-[#4a3937] text-xs text-white font-mono placeholder:text-stone-500 focus:outline-none focus:border-rose-400 disabled:opacity-50"
                          />
                          <button
                            type="button"
                            disabled={
                              !backupVerified ||
                              !ownerResetChecked ||
                              ownerResetText.trim() !== 'RESET' ||
                              launchBusy !== null
                            }
                            onClick={handleExecuteOfficialReset}
                            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-rose-950/50 disabled:text-rose-400/50 text-white font-bold text-xs cursor-pointer disabled:cursor-not-allowed transition"
                          >
                            {launchBusy === 'official_reset'
                              ? 'Reset လုပ်နေသည်...'
                              : 'One-Time Official Reset စတင်မည်'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {launchNotice && (
                    <div
                      className={`p-2.5 rounded-xl border text-[11px] font-medium leading-snug ${
                        launchNotice.ok
                          ? 'bg-emerald-950/75 border-emerald-700/75 text-emerald-200'
                          : 'bg-rose-950/75 border-rose-700/75 text-rose-200'
                      }`}
                    >
                      {launchNotice.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
