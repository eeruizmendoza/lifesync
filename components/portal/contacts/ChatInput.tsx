'use client';

/**
 * ChatInput
 * Inline chat message composer for in-app chat or SMS.
 * Sits at the bottom of the contact timeline view.
 * Phase 55: Added SMS channel toggle when receiverPhone is provided.
 */

import { useState, useRef, useCallback } from 'react';
import { Send, Loader2, AlertCircle, MessageSquare, Smartphone } from 'lucide-react';
import { VoiceMessageButton } from './VoiceMessageButton';
import { FileShareButton } from './FileShareButton';

type Channel = 'chat' | 'sms';

interface ChatInputProps {
  receiverUserId: string;
  receiverName: string;
  receiverPhone?: string;    // Phase 55: enables SMS channel toggle
  userLanguage?: string;
  receiverLanguage?: string;
  onMessageSent?: () => void;
}

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', zh: 'Chinese', fr: 'French',
  de: 'German', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  ar: 'Arabic', ru: 'Russian', hi: 'Hindi', it: 'Italian',
  nl: 'Dutch', sv: 'Swedish', pl: 'Polish', tr: 'Turkish',
  vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', uk: 'Ukrainian',
};

export function ChatInput({
  receiverUserId,
  receiverName,
  receiverPhone,
  userLanguage = 'en',
  receiverLanguage = 'en',
  onMessageSent,
}: ChatInputProps) {
  const [text, setText]           = useState('');
  const [sending, setSending]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [sent, setSent]           = useState(false);
  const [channel, setChannel]     = useState<Channel>('chat');
  const textareaRef               = useRef<HTMLTextAreaElement>(null);

  const send = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    try {
      const token = getToken();

      if (channel === 'sms' && receiverPhone) {
        // ── SMS path ─────────────────────────────────────────────────────
        const res = await fetch('/api/sms/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            to:              receiverPhone,
            content:         trimmed,
            contactUserId:   receiverUserId,
            language:        userLanguage,
            targetLanguage:  receiverLanguage,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to send SMS');
      } else {
        // ── In-app chat path ─────────────────────────────────────────────
        const res = await fetch('/api/chat/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            receiverUserId,
            content:        trimmed,
            language:       userLanguage,
            targetLanguage: receiverLanguage,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to send');
      }

      setText('');
      setSent(true);
      setTimeout(() => setSent(false), 2000);
      textareaRef.current?.focus();
      onMessageSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }, [text, sending, channel, receiverUserId, receiverPhone, userLanguage, receiverLanguage, onMessageSent]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const isDifferentLang = userLanguage !== receiverLanguage;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header with optional channel selector */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        {channel === 'sms'
          ? <Smartphone size={14} className="text-blue-500 flex-shrink-0" />
          : <MessageSquare size={14} className="text-violet-500 flex-shrink-0" />}
        <span className="text-xs font-medium text-gray-700">
          Message {receiverName}
        </span>

        {/* Channel toggle — only when SMS is available */}
        {receiverPhone && (
          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5 ml-1">
            <button
              onClick={() => setChannel('chat')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                channel === 'chat'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <MessageSquare size={10} />
              App
            </button>
            <button
              onClick={() => setChannel('sms')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                channel === 'sms'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Smartphone size={10} />
              SMS
            </button>
          </div>
        )}

        {isDifferentLang && (
          <span className="ml-auto text-[10px] text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
            {LANG_NAMES[userLanguage] ?? userLanguage.toUpperCase()}
            {' → '}
            {LANG_NAMES[receiverLanguage] ?? receiverLanguage.toUpperCase()}
          </span>
        )}
      </div>

      {/* Input area */}
      <div className="p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => { setText(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            placeholder={channel === 'sms'
              ? `Send SMS to ${receiverName}… (Enter to send)`
              : `Message ${receiverName}… (Enter to send, Shift+Enter for newline)`}
            rows={2}
            maxLength={4000}
            disabled={sending}
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent placeholder-gray-400 disabled:opacity-50 transition-all"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              sent
                ? 'bg-green-500 text-white'
                : text.trim() && !sending
                ? channel === 'sms'
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                  : 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
            }`}
            title="Send message"
          >
            {sending
              ? <Loader2 size={16} className="animate-spin" />
              : <Send size={16} />}
          </button>
          <VoiceMessageButton
            receiverUserId={receiverUserId}
            receiverName={receiverName}
            userLanguage={userLanguage}
            receiverLanguage={receiverLanguage}
            onMessageSent={onMessageSent}
          />
        </div>

        {/* File & photo share buttons */}
        <div className="mt-2">
          <FileShareButton
            receiverUserId={receiverUserId}
            receiverName={receiverName}
            userLanguage={userLanguage}
            onMessageSent={onMessageSent}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
            <AlertCircle size={12} />
            {error}
          </div>
        )}

        {/* Translation hint */}
        {isDifferentLang && text.trim() && !error && (
          <p className="mt-1.5 text-[10px] text-gray-400">
            Will be auto-translated to {LANG_NAMES[receiverLanguage] ?? receiverLanguage.toUpperCase()}
            {channel === 'sms' ? ' before sending as SMS' : ''}
          </p>
        )}

        {/* SMS mode indicator */}
        {channel === 'sms' && receiverPhone && !text.trim() && (
          <p className="mt-1.5 text-[10px] text-blue-400">
            Sending via SMS to {receiverPhone}
          </p>
        )}
      </div>
    </div>
  );
}
