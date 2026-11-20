/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { ChatMessage } from '../game/multiplayer/types';
import { UI_THEME } from './uiTheme';

interface ChatBoxProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  currentUserId: string;
  onSendMessage: (text: string) => void;
  onlineCount: number;
  maxPlayers: number;
}

export const ChatBox: React.FC<ChatBoxProps> = ({
  isOpen,
  onClose,
  messages,
  currentUserId,
  onSendMessage,
  onlineCount,
  maxPlayers,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputText.trim();
    if (!clean) return;
    onSendMessage(clean);
    setInputText('');
  };

  return (
    <div
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed top-16 right-3 sm:right-5 z-40 pointer-events-auto select-none font-sans"
    >
      <div className="rc-panel-enter w-[calc(100vw-1.5rem)] max-w-sm h-80 max-h-[calc(100dvh-5.5rem)] bg-[#1b1814]/96 backdrop-blur-md border border-[#4a4134] rounded-2xl shadow-2xl shadow-black/70 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-b from-[#27221b] to-[#1e1a15] border-b border-[#3a3329] text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <MessageSquare size={14} />
            </div>
            <span className="font-bold text-white leading-snug truncate">မြို့တွင်းစကားပြောခန်း</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono shrink-0">
              {onlineCount}/{maxPlayers}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="စကားပြောခန်း ပိတ်မည်"
            title="ပိတ်မည် [Esc / T]"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#b7ad9d] hover:text-white hover:bg-[#342d24] transition cursor-pointer shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center text-[#8f8576] text-[11px] px-4 leading-relaxed">
              စာတိုများ မရှိသေးပါ။ မြို့သူမြို့သားများနှင့် နှုတ်ဆက်စကားပြောဆိုပါ!
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.senderId === currentUserId;
              const timeStr = new Date(m.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div key={m.id} className="flex flex-col bg-[#14120f]/75 border border-[#2c261f] rounded-lg px-2.5 py-1.5">
                  <div className="flex items-baseline gap-1.5 leading-snug">
                    <span className={`font-bold text-[11px] shrink-0 ${isMe ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {m.senderName}:
                    </span>
                    <span className="text-stone-200 text-xs break-words">{m.text}</span>
                    <span className="text-[9px] text-[#7e7466] ml-auto font-mono shrink-0">{timeStr}</span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={handleSend}
          className="p-2 border-t border-[#3a3329] bg-[#14120f]/80 flex items-center gap-1.5 shrink-0"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            maxLength={120}
            placeholder="စာပို့ရန်... (စာလုံးရေ ၁၂၀ ထိ)"
            className="flex-1 px-3 py-2 rounded-xl bg-[#221e18] border border-[#3e362c] focus:border-amber-400 focus:outline-none text-xs text-white placeholder-[#7d7365]"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            aria-label="စာပို့မည်"
            title="စာပို့မည်"
            className={`p-2.5 rounded-xl shrink-0 ${
              inputText.trim() ? UI_THEME.primaryAmberBtn : UI_THEME.disabledBtn
            }`}
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
};
