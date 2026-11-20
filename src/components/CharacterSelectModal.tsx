/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sparkles, Loader2, LogOut } from 'lucide-react';
import { PlayerProfile } from '../game/types';
import { useAuth } from '../firebase/AuthContext';
import { UI_THEME } from './uiTheme';

interface CharacterSelectModalProps {
  onStart: (profile: PlayerProfile) => void;
  isLoading?: boolean;
}

export const CharacterSelectModal: React.FC<CharacterSelectModalProps> = ({
  onStart,
  isLoading = false,
}) => {
  const { user, signOutUser } = useAuth();
  const defaultInitialName = user?.displayName?.split(' ')[0] || 'Settler';
  const [name, setName] = useState(defaultInitialName.slice(0, 16));
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 3) {
      setValidationError('ကစားသမား အမည်သည် အနည်းဆုံး စာလုံး ၃ လုံး ရှိရပါမည်။');
      return;
    }
    if (cleanName.length > 16) {
      setValidationError('ကစားသမား အမည်သည် အများဆုံး စာလုံး ၁၆ လုံးသာ ဖြစ်ရပါမည်။');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#12100d] p-4 select-none overflow-y-auto">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),transparent_55%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.12),transparent_50%)] pointer-events-none" />

      <div className={`${UI_THEME.panel} relative max-w-md p-5 sm:p-6`}>
        {/* Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/12 border border-amber-500/35 text-amber-300 text-xs font-semibold mb-2.5">
            <Sparkles size={13} />
            <span>ကစားသမား အသစ်မှတ်ပုံတင်ခြင်း</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-serif leading-snug">
            သင့်ဇာတ်ကောင်ကို ဖန်တီးပါ
          </h1>
          <p className="text-[#c7beae] text-xs mt-1 leading-relaxed">
            Random City ခရီးစဉ်စတင်ရန် သင့်အသွင်အပြင်နှင့် အမည်ကို ရွေးချယ်ပါ
          </p>
        </div>

        {/* User Identity Banner */}
        {user && (
          <div className={`mb-4 p-2.5 ${UI_THEME.subCard} flex items-center justify-between text-xs gap-2`}>
            <div className="flex items-center gap-2 min-w-0">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="ပရိုဖိုင်ပုံ"
                  className="w-6 h-6 rounded-full border border-[#5c5040] shrink-0"
                />
              ) : (
                <span className="w-6 h-6 rounded-full bg-[#2a241d] flex items-center justify-center text-[10px] shrink-0">
                  👤
                </span>
              )}
              <span className="text-stone-200 font-medium truncate max-w-[200px]">
                {user.displayName || 'Google အကောင့်'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => signOutUser()}
              className="text-[#a99f8e] hover:text-stone-100 flex items-center gap-1 text-[11px] cursor-pointer shrink-0"
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
              <label className="text-xs font-semibold text-[#b7ad9d]">
                ကစားသမား အမည်
              </label>
              <span className="text-[11px] text-[#8f8575] font-mono">
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
              className="w-full px-4 py-2.5 rounded-xl bg-[#13110e] border border-[#453c30] focus:border-amber-400 focus:outline-none text-white font-medium text-sm transition"
            />
            {validationError && (
              <p className="text-xs text-rose-400 mt-1 font-medium">{validationError}</p>
            )}
          </div>

          {/* Gender Selection */}
          <div>
            <label className="block text-xs font-semibold text-[#b7ad9d] mb-2">
              ဇာတ်ကောင် အသွင်အပြင်
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-sm font-semibold transition cursor-pointer ${
                  gender === 'male'
                    ? 'border-amber-400 bg-amber-500/12 text-white shadow-lg shadow-amber-950/30 ring-1 ring-amber-400/25'
                    : 'border-[#342d24] bg-[#14110e]/80 text-[#9e9484] hover:border-[#524738]'
                }`}
              >
                <div className="w-12 h-14 mb-2 flex items-center justify-center bg-[#252019] rounded-xl border border-[#463c2f]">
                  <span className="text-2xl">👨‍🌾</span>
                </div>
                <span>အမျိုးသား ကစားသမား</span>
                <span className="text-[11px] text-[#a99f8e] font-normal mt-0.5">အပြာရောင်ဝတ်စုံ</span>
              </button>

              <button
                type="button"
                onClick={() => setGender('female')}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-sm font-semibold transition cursor-pointer ${
                  gender === 'female'
                    ? 'border-emerald-400 bg-emerald-500/12 text-white shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-400/25'
                    : 'border-[#342d24] bg-[#14110e]/80 text-[#9e9484] hover:border-[#524738]'
                }`}
              >
                <div className="w-12 h-14 mb-2 flex items-center justify-center bg-[#252019] rounded-xl border border-[#463c2f]">
                  <span className="text-2xl">👩‍🌾</span>
                </div>
                <span>အမျိုးသမီး ကစားသမား</span>
                <span className="text-[11px] text-[#a99f8e] font-normal mt-0.5">အစိမ်းရောင်ဝတ်စုံ</span>
              </button>
            </div>
          </div>

          {/* Starter kit note */}
          <div className={`p-3 ${UI_THEME.subCard} text-xs text-[#b7ad9d] space-y-1.5`}>
            <div className="font-semibold text-stone-200">
              စတင်ကစားချိန်တွင် ပါရှိမည့်ပစ္စည်းများ:
            </div>
            <div className="flex flex-wrap items-center gap-3 text-stone-200 text-xs leading-snug">
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
            className={`w-full py-3 px-4 rounded-xl font-bold tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 ${UI_THEME.primaryAmberBtn}`}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin text-stone-950" />
                <span>Cloud ပရိုဖိုင် ဖန်တီးနေသည်...</span>
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
