/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { ChatMessage } from '../game/multiplayer/types';

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
      // Auto-focus input when opened
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, isOpen]);

  // When closed, render nothing to keep the game screen, viewport, and mobile controls 100% clean
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
    <div className="fixed top-16 right-4 sm:right-6 z-40 pointer-events-auto select-none font-sans animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="w-80 sm:w-96 h-80 bg-stone-900/95 backdrop-blur-md border border-stone-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-stone-950/70 border-b border-stone-800 text-xs">
          <div className="flex items-center gap-2">
            <MessageSquare size={15} className="text-amber-400" />
            <span className="font-bold text-white tracking-tight">မြို့တွင်းစကားပြောခန်း (Town Chat)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
              {onlineCount}/{maxPlayers}
            </span>
          </div>

          <button
            onClick={onClose}
            title="ပိတ်မည် [Esc / T]"
            className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center text-stone-500 italic text-[11px] px-4">
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
                <div key={m.id} className="flex flex-col">
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`font-bold text-[11px] ${
                        isMe ? 'text-amber-400' : 'text-cyan-400'
                      }`}
                    >
                      {m.senderName}:
                    </span>
                    <span className="text-stone-200 text-xs break-words">{m.text}</span>
                    <span className="text-[9px] text-stone-500 ml-auto font-mono shrink-0">
                      {timeStr}
                    </span>
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
          className="p-2 border-t border-stone-800 bg-stone-950/60 flex items-center gap-1.5"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            maxLength={120}
            placeholder="စာပို့ရန်... (စာလုံးရေ ၁၂၀ ထိ)"
            className="flex-1 px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 focus:border-amber-500 focus:outline-none text-xs text-white placeholder-stone-500"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 transition cursor-pointer shrink-0"
            title="စာပို့မည်"
          >
            <Send size={13} />
          </button>
        </form>
      </div>
    </div>
  );
};
