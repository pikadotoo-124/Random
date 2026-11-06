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
  User,
  LogOut,
  Edit2,
  Check,
  Cloud,
} from 'lucide-react';
import { SoundSynth } from '../game/utils/SoundSynth';
import { useAuth } from '../firebase/AuthContext';
import { PlayerProfile } from '../game/types';

interface SettingsModalProps {
  playerProfile: PlayerProfile;
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
  onNameUpdated: (newName: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  playerProfile,
  onClose,
  onSave,
  onReset,
  onNameUpdated,
}) => {
  const { user, profile, signOutUser, updateName, isOffline } = useAuth();
  const [sound, setSound] = useState(SoundSynth.enabled);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Edit Name State
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(playerProfile.name);
  const [nameError, setNameError] = useState<string | null>(null);

  const toggleSound = () => {
    SoundSynth.enabled = !sound;
    setSound(!sound);
    if (!sound) {
      SoundSynth.playSuccess();
    }
  };

  const handleSaveClick = () => {
    onSave();
    setSaveStatus('Progress saved to Cloud Firestore & LocalStorage!');
    setTimeout(() => setSaveStatus(null), 3500);
  };

  const handleSaveName = async () => {
    const clean = nameInput.trim();
    if (clean.length < 3 || clean.length > 16) {
      setNameError('Name must be between 3 and 16 characters.');
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
      setNameError(err.message || 'Could not update name');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-xl bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-300">
              <Settings size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">ဂိမ်းဆက်တင်များနှင့် လမ်းညွှန်</h2>
              <p className="text-xs text-stone-400">Random City ပရိုဖိုင်နှင့် စနစ်များ</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* User Account & Character Card */}
          <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center text-xl">
                  {playerProfile.gender === 'female' ? '👩‍🌾' : '👨‍🌾'}
                </div>
                <div>
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        minLength={3}
                        maxLength={16}
                        className="px-2 py-1 text-xs rounded bg-stone-900 border border-stone-600 text-white font-bold"
                      />
                      <button
                        onClick={handleSaveName}
                        className="p-1 rounded bg-amber-500 text-stone-950 hover:bg-amber-400"
                        title="သိမ်းဆည်းမည်"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setIsEditingName(false)}
                        className="p-1 rounded bg-stone-800 text-stone-400 hover:text-white"
                        title="ပယ်ဖျက်မည်"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{playerProfile.name}</span>
                      <button
                        onClick={() => {
                          setNameInput(playerProfile.name);
                          setIsEditingName(true);
                        }}
                        className="text-stone-400 hover:text-amber-400 p-0.5"
                        title="အမည်ပြောင်းမည်"
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>
                  )}
                  {nameError && <div className="text-[11px] text-red-400 mt-0.5">{nameError}</div>}
                  <div className="text-[11px] text-stone-400 flex items-center gap-2 mt-0.5">
                    <span>{playerProfile.gender === 'female' ? 'အမျိုးသမီး ကစားသမား' : 'အမျိုးသား ကစားသမား'}</span>
                    <span>•</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Cloud size={12} />
                      <span>Firebase Cloud သိမ်းဆည်းမှု စနစ်အလုပ်လုပ်နေသည်</span>
                    </span>
                  </div>
                </div>
              </div>

              {user && (
                <button
                  onClick={() => signOutUser()}
                  className="px-3 py-1.5 rounded-lg border border-stone-700 hover:border-red-500/50 hover:bg-red-500/10 text-stone-300 hover:text-red-300 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                  title="Google အကောင့်မှ ထွက်မည်"
                >
                  <LogOut size={13} />
                  <span>အကောင့်ထွက်မည်</span>
                </button>
              )}
            </div>
          </div>

          {/* Audio Setting */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-stone-950/50 border border-stone-800">
            <div className="flex items-center gap-3">
              {sound ? <Volume2 className="text-amber-400" size={20} /> : <VolumeX className="text-stone-500" size={20} />}
              <div>
                <div className="text-sm font-bold text-white">အသံဖိုင် စနစ်</div>
                <div className="text-xs text-stone-400">သစ်ခုတ်၊ ကျောက်ခွဲ၊ ကုန်ရောင်းဝယ် အသံဖိုင်များ</div>
              </div>
            </div>

            <button
              onClick={toggleSound}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                sound ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400'
              }`}
            >
              {sound ? 'ဖွင့်ထားသည်' : 'ပိတ်ထားသည်'}
            </button>
          </div>

          {/* Controls Reference */}
          <div className="p-4 rounded-xl bg-stone-950/50 border border-stone-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-300">
              <Gamepad2 size={16} className="text-amber-400" />
              <span>ထိန်းချုပ်မောင်းနှင်မှု စနစ် (Controls)</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-stone-300 font-mono">
              <div className="p-2 bg-stone-900 rounded border border-stone-800 flex justify-between">
                <span>လမ်းလျှောက်ခြင်း:</span>
                <span className="text-amber-400 font-bold">WASD / မြားခလုတ်များ</span>
              </div>
              <div className="p-2 bg-stone-900 rounded border border-stone-800 flex justify-between">
                <span>လုပ်ဆောင်ချက် / ရိတ်သိမ်းခြင်း:</span>
                <span className="text-amber-400 font-bold">E / နှိပ်ပါ</span>
              </div>
              <div className="p-2 bg-stone-900 rounded border border-stone-800 flex justify-between">
                <span>ပစ္စည်းလွယ်အိတ်:</span>
                <span className="text-amber-400 font-bold">I</span>
              </div>
              <div className="p-2 bg-stone-900 rounded border border-stone-800 flex justify-between">
                <span>ဆောက်လုပ်ခြင်းပုံစံ:</span>
                <span className="text-amber-400 font-bold">B</span>
              </div>
              <div className="p-2 bg-stone-900 rounded border border-stone-800 flex justify-between">
                <span>ပစ္စည်းဖန်တီးခြင်းခုံ:</span>
                <span className="text-amber-400 font-bold">C</span>
              </div>
              <div className="p-2 bg-stone-900 rounded border border-stone-800 flex justify-between">
                <span>ကမ္ဘာ့မြေပုံ:</span>
                <span className="text-amber-400 font-bold">M</span>
              </div>
            </div>
            <div className="text-[11px] text-stone-400 italic">
              ဖုန်းဖြင့်ကစားသူများသည် Virtual Joystick နှင့် လုပ်ဆောင်ချက်ခလုတ်ကို အသုံးပြုနိုင်ပါသည်။
            </div>
          </div>

          {/* Data Management */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={handleSaveClick}
                className="flex-1 py-2.5 px-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Save size={15} />
                <span>Cloud နှင့် စက်ထဲသို့ အခုချက်ချင်း သိမ်းဆည်းမည်</span>
              </button>

              <button
                onClick={() => {
                  if (window.confirm('ကစားထားသော အချက်အလက်များကို ဖျက်ပြီး အသစ်ပြန်စတင်မလား?')) {
                    onReset();
                  }
                }}
                className="py-2.5 px-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw size={15} />
                <span>အသစ်ပြန်စမည်</span>
              </button>
            </div>

            {saveStatus && (
              <div className="p-2 rounded bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 text-xs text-center font-medium animate-fade-in">
                ကစားထားသော အချက်အလက်များကို Cloud Firestore နှင့် Device တွင် အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ!
              </div>
            )}
          </div>

          {/* Architecture info */}
          <div className="p-3 bg-stone-950/70 border border-stone-800/80 rounded-xl text-xs text-stone-400 space-y-1">
            <div className="font-bold text-stone-300 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-cyan-400" />
              <span>Step 2A: Cloud Architecture Active</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Firebase Authentication and Cloud Firestore are active. Data is scoped per-user at <code className="text-stone-300">users/{'{uid}'}</code>, protected by Firestore Security Rules.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
