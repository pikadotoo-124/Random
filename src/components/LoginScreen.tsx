/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Cloud, ShieldCheck, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../firebase/AuthContext';

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle, loading, authError, clearAuthError, isOffline } = useAuth();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950 p-4 select-none">
      {/* Background ambient pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-950/20 via-stone-950 to-stone-950 pointer-events-none" />

      <div className="relative w-full max-w-md bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl p-7 text-stone-200">
        {/* Title & Badge */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles size={13} />
            <span>Step 2A: Cloud Save Enabled</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white font-serif">
            Random City
          </h1>
          <p className="text-stone-300 text-xs mt-1.5 leading-relaxed">
            ပေါ့ပါးလန်းဆန်းသော 2D Open-World Multiplayer ဂိမ်း
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="p-3.5 bg-stone-950/70 border border-stone-800/80 rounded-xl space-y-2 mb-6 text-xs text-stone-300">
          <div className="flex items-center gap-2.5">
            <Cloud size={16} className="text-cyan-400 shrink-0" />
            <span>Firebase Cloud စနစ်ဖြင့် စက်ပစ္စည်းတိုင်းတွင် အလိုအလျောက် သိမ်းဆည်းနိုင်သည်</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
            <span>လုံခြုံစိတ်ချရသော Google Account နှင့် Realtime Multiplayer လောက</span>
          </div>
        </div>

        {/* Error Alert */}
        {authError && (
          <div className="mb-5 p-3 rounded-xl bg-red-950/60 border border-red-700/60 text-red-200 text-xs flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
            <button
              onClick={clearAuthError}
              className="text-red-400 hover:text-white text-xs font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Offline indicator */}
        {isOffline && (
          <div className="mb-5 p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs text-center">
            ⚠️ အော့ဖ်လိုင်း စနစ်ဖြင့် ကစားနေပါသည်
          </div>
        )}

        {/* Action Button: Sign in with Google */}
        <div className="space-y-3">
          <button
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-stone-100 text-stone-900 font-bold text-sm tracking-wide shadow-xl shadow-black/40 transition active:scale-[0.99] flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin text-stone-600" />
                <span>Google သို့ ချိတ်ဆက်နေသည်...</span>
              </>
            ) : (
              <>
                {/* Official Google 'G' icon */}
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

        <div className="mt-5 text-center text-[11px] text-stone-400">
          ကစားထားသော အချက်အလက်များ၊ ရွှေဒင်္ဂါးများနှင့် အဆောက်အအုံများကို Google Account တွင် အလိုအလျောက် သိမ်းဆည်းပေးမည်။
        </div>
      </div>
    </div>
  );
};
