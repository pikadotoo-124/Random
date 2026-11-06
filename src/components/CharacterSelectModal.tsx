/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sparkles, Loader2, LogOut } from 'lucide-react';
import { PlayerProfile } from '../game/types';
import { useAuth } from '../firebase/AuthContext';

interface CharacterSelectModalProps {
  onStart: (profile: PlayerProfile) => void;
  isLoading?: boolean;
}

export const CharacterSelectModal: React.FC<CharacterSelectModalProps> = ({ onStart, isLoading = false }) => {
  const { user, signOutUser } = useAuth();
  const defaultInitialName = user?.displayName?.split(' ')[0] || 'Settler';
  const [name, setName] = useState(defaultInitialName.slice(0, 16));
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 3) {
      setValidationError('Player name must be at least 3 characters long.');
      return;
    }
    if (cleanName.length > 16) {
      setValidationError('Player name must be at most 16 characters long.');
      return;
    }
    setValidationError(null);

    onStart({
      name: cleanName,
      gender,
      skinTone: gender === 'male' ? '#d97706' : '#f59e0b',
      hairColor: gender === 'male' ? '#292524' : '#78350f',
      clothesColor: gender === 'male' ? '#3b82f6' : '#10b981',
      coins: 25,
      currentTool: 'axe_basic',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-md bg-stone-900 border border-stone-700/80 rounded-2xl shadow-2xl p-6 text-stone-200">
        {/* Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Sparkles size={13} />
            <span>ကစားသမား အသစ်မှတ်ပုံတင်ခြင်း</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-serif">
            သင့်ဇာတ်ကောင်ကို ဖန်တီးပါ
          </h1>
          <p className="text-stone-300 text-xs mt-1">
            Random City ခရီးစဉ်စတင်ရန် သင့်အသွင်အပြင်နှင့် အမည်ကို ရွေးချယ်ပါ
          </p>
        </div>

        {/* User Identity Banner */}
        {user && (
          <div className="mb-4 p-2.5 rounded-xl bg-stone-950/60 border border-stone-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-6 h-6 rounded-full border border-stone-600" />
              ) : (
                <span className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center text-[10px]">👤</span>
              )}
              <span className="text-stone-300 font-medium truncate max-w-[200px]">
                {user.displayName || 'Google Account'}
              </span>
            </div>
            <button
              onClick={() => signOutUser()}
              className="text-stone-400 hover:text-stone-200 flex items-center gap-1 text-[11px] cursor-pointer"
              title="အကောင့်ပြောင်းမည်"
            >
              <LogOut size={12} />
              <span>အကောင့်ပြောင်း</span>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Player Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                ကစားသမား အမည်
              </label>
              <span className="text-[11px] text-stone-500 font-mono">
                {name.length}/16 စာလုံး
              </span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (validationError) setValidationError(null);
              }}
              minLength={3}
              maxLength={16}
              placeholder="စာလုံးရေ ၃ မှ ၁၆ လုံးအတွင်း ရိုက်ထည့်ပါ"
              required
              className="w-full px-4 py-2.5 rounded-xl bg-stone-950 border border-stone-700 focus:border-amber-500 focus:outline-none text-white font-medium text-sm transition"
            />
            {validationError && (
              <p className="text-xs text-red-400 mt-1 font-medium">{validationError}</p>
            )}
          </div>

          {/* Gender Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">
              ဇာတ်ကောင် အသွင်အပြင်
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-sm font-semibold transition cursor-pointer ${
                  gender === 'male'
                    ? 'border-amber-500 bg-amber-500/10 text-white shadow-lg shadow-amber-500/10'
                    : 'border-stone-800 bg-stone-950/60 text-stone-400 hover:border-stone-700'
                }`}
              >
                <div className="w-12 h-14 mb-2 flex items-center justify-center bg-stone-800 rounded-lg border border-stone-700">
                  <span className="text-2xl">👨‍🌾</span>
                </div>
                <span>အမျိုးသား ကစားသမား</span>
                <span className="text-[11px] text-stone-400 font-normal mt-0.5">အပြာရောင်ဝတ်စုံ</span>
              </button>

              <button
                type="button"
                onClick={() => setGender('female')}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-sm font-semibold transition cursor-pointer ${
                  gender === 'female'
                    ? 'border-amber-500 bg-amber-500/10 text-white shadow-lg shadow-amber-500/10'
                    : 'border-stone-800 bg-stone-950/60 text-stone-400 hover:border-stone-700'
                }`}
              >
                <div className="w-12 h-14 mb-2 flex items-center justify-center bg-stone-800 rounded-lg border border-stone-700">
                  <span className="text-2xl">👩‍🌾</span>
                </div>
                <span>အမျိုးသမီး ကစားသမား</span>
                <span className="text-[11px] text-stone-400 font-normal mt-0.5">အစိမ်းရောင်ဝတ်စုံ</span>
              </button>
            </div>
          </div>

          {/* Starter kit note */}
          <div className="p-3 bg-stone-950/70 border border-stone-800 rounded-xl text-xs text-stone-400 space-y-1">
            <div className="font-semibold text-stone-300">စတင်ကစားချိန်တွင် ပါရှိမည့်ပစ္စည်းများ:</div>
            <div className="flex flex-wrap items-center gap-3 text-stone-300 text-xs">
              <span>🪓 လက်ကိုင်ပုဆိန်</span>
              <span>⛏️ ကျောက်တူးပေါက်ဆိန်</span>
              <span>🎣 ငါးမျှားတံ</span>
              <span>🪙 ၂၅ ရွှေဒင်္ဂါး</span>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold tracking-wide shadow-lg shadow-amber-950/40 transition active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin text-stone-950" />
                <span>Cloud Profile ဖန်တီးနေသည်...</span>
              </>
            ) : (
              <span>Random City ဘဝ စတင်မည်</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
