/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Cloud, ShieldCheck, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../firebase/AuthContext';
import { UI_THEME } from './uiTheme';

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle, loading, authError, clearAuthError, isOffline } = useAuth();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#12100d] p-4 select-none overflow-y-auto">
      {/* Background meadow & harvest glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.16),transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(245,158,11,0.12),transparent_50%)] pointer-events-none" />

      <div className={`${UI_THEME.panel} relative max-w-md p-6 sm:p-7`}>
        {/* Title & Badge */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/12 border border-amber-500/35 text-amber-300 text-xs font-semibold mb-3">
            <Sparkles size={13} />
            <span>Cloud သိမ်းဆည်းမှု စနစ်ပါဝင်သည်</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white font-serif leading-tight">
            Random City
          </h1>
          <p className="text-[#c7beae] text-xs mt-1.5 leading-relaxed">
            သဘာဝဆန်ပြီး ပေါ့ပါးလန်းဆန်းသော 2D Open-World Multiplayer Life-Sim ဂိမ်း
          </p>
        </div>

        {/* Feature Highlights */}
        <div className={`p-3.5 ${UI_THEME.subCard} space-y-2.5 mb-6 text-xs text-stone-200 leading-relaxed`}>
          <div className="flex items-start gap-2.5">
            <Cloud size={16} className="text-sky-400 shrink-0 mt-0.5" />
            <span>
              Firebase Cloud စနစ်ဖြင့် စက်ပစ္စည်းတိုင်းတွင် အလိုအလျောက် သိမ်းဆည်းနိုင်သည်
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <span>
              လုံခြုံစိတ်ချရသော Google အကောင့်နှင့် Realtime Multiplayer လောက
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {authError && (
          <div className="mb-5 p-3 rounded-xl bg-rose-950/60 border border-rose-700/60 text-rose-200 text-xs flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 leading-relaxed">
              <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
            <button
              type="button"
              onClick={clearAuthError}
              aria-label="သတိပေးချက် ပိတ်မည်"
              className="text-rose-300 hover:text-white text-xs font-bold px-1 cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* Offline indicator */}
        {isOffline && (
          <div className="mb-5 p-2.5 rounded-xl bg-amber-950/45 border border-amber-700/50 text-amber-200 text-xs text-center leading-snug">
            ⚠️ အော့ဖ်လိုင်း စနစ်ဖြင့် ကစားနေပါသည်
          </div>
        )}

        {/* Action Button: Sign in with Google */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-[#f7f4ee] hover:bg-white text-stone-900 font-bold text-sm tracking-wide shadow-xl shadow-black/45 transition active:scale-[0.98] flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin text-stone-600" />
                <span>Google သို့ ချိတ်ဆက်နေသည်...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Google အကောင့်ဖြင့် ဝင်ရောက်ကစားမည်</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-5 text-center text-[11px] text-[#a99f8e] leading-relaxed">
          ကစားထားသော အချက်အလက်များ၊ ရွှေဒင်္ဂါးများနှင့် အဆောက်အအုံများကို Google အကောင့်တွင် အလိုအလျောက် သိမ်းဆည်းပေးမည်။
        </div>
      </div>
    </div>
  );
};
