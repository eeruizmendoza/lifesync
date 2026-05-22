'use client';

/**
 * RoomMode
 * Full-screen multi-language real-time translation for conference rooms.
 *
 * How it works:
 * 1. User configures up to 4 "seats" — each with a language
 * 2. Any seat's speaker taps their tile and speaks
 * 3. Browser Web Speech API transcribes in real-time
 * 4. Backend translates to all other seat languages
 * 5. Translation displayed (and optionally spoken aloud via TTS)
 * 6. At end, full session saved to messages table
 *
 * Browser compatibility: Chrome, Edge (Web Speech API required)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Mic, MicOff, Volume2, VolumeX, X, Plus, Check,
  Globe, ChevronDown, Save, Loader2, AlertCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Seat {
  id: number;
  lang: string;
  label: string;
}

interface Turn {
  seatId: number;
  lang: string;
  original: string;
  translations: Record<string, string>; // lang → translated text
  timestamp: number;
}

// ─── Language List ────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en', label: 'English',    flag: '🇺🇸', bcp47: 'en-US' },
  { code: 'es', label: 'Spanish',    flag: '🇲🇽', bcp47: 'es-MX' },
  { code: 'zh', label: 'Chinese',    flag: '🇨🇳', bcp47: 'zh-CN' },
  { code: 'fr', label: 'French',     flag: '🇫🇷', bcp47: 'fr-FR' },
  { code: 'de', label: 'German',     flag: '🇩🇪', bcp47: 'de-DE' },
  { code: 'ja', label: 'Japanese',   flag: '🇯🇵', bcp47: 'ja-JP' },
  { code: 'ko', label: 'Korean',     flag: '🇰🇷', bcp47: 'ko-KR' },
  { code: 'pt', label: 'Portuguese', flag: '🇧🇷', bcp47: 'pt-BR' },
  { code: 'ar', label: 'Arabic',     flag: '🇸🇦', bcp47: 'ar-SA' },
  { code: 'ru', label: 'Russian',    flag: '🇷🇺', bcp47: 'ru-RU' },
  { code: 'hi', label: 'Hindi',      flag: '🇮🇳', bcp47: 'hi-IN' },
  { code: 'it', label: 'Italian',    flag: '🇮🇹', bcp47: 'it-IT' },
  { code: 'nl', label: 'Dutch',      flag: '🇳🇱', bcp47: 'nl-NL' },
  { code: 'sv', label: 'Swedish',    flag: '🇸🇪', bcp47: 'sv-SE' },
  { code: 'pl', label: 'Polish',     flag: '🇵🇱', bcp47: 'pl-PL' },
  { code: 'tr', label: 'Turkish',    flag: '🇹🇷', bcp47: 'tr-TR' },
  { code: 'vi', label: 'Vietnamese', flag: '🇻🇳', bcp47: 'vi-VN' },
  { code: 'th', label: 'Thai',       flag: '🇹🇭', bcp47: 'th-TH' },
  { code: 'id', label: 'Indonesian', flag: '🇮🇩', bcp47: 'id-ID' },
  { code: 'uk', label: 'Ukrainian',  flag: '🇺🇦', bcp47: 'uk-UA' },
];

const LANG_MAP = Object.fromEntries(LANGUAGES.map(l => [l.code, l]));

const MAX_SEATS = 4;

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

// ─── Seat Language Picker ─────────────────────────────────────────────────────

function LangPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const lang = LANG_MAP[value] ?? LANGUAGES[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-gray-400 disabled:opacity-50 transition-all"
      >
        <span>{lang.flag}</span>
        <span>{lang.label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-44 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => { onChange(l.code); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${value === l.code ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
              {value === l.code && <Check size={12} className="ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main RoomMode Component ──────────────────────────────────────────────────

export function RoomMode() {
  const [seats, setSeats]               = useState<Seat[]>([
    { id: 1, lang: 'en', label: 'Seat 1' },
    { id: 2, lang: 'es', label: 'Seat 2' },
  ]);
  const [activeSeatId, setActiveSeatId] = useState<number | null>(null);
  const [turns, setTurns]               = useState<Turn[]>([]);
  const [interimText, setInterimText]   = useState('');
  const [ttsEnabled, setTtsEnabled]     = useState(true);
  const [isRunning, setIsRunning]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const startTime = useRef<number>(Date.now());

  const recognitionRef  = useRef<SpeechRecognition | null>(null);
  const translatingRef  = useRef(false);

  // Check speech support
  useEffect(() => {
    const supported = !!(window.SpeechRecognition || (window as Record<string, unknown>).webkitSpeechRecognition);
    setSpeechSupported(supported);
  }, []);

  // Translate text to all other seat languages
  const translateToAll = useCallback(async (text: string, sourceLang: string): Promise<Record<string, string>> => {
    const token = getToken();
    const otherLangs = seats
      .map(s => s.lang)
      .filter(l => l !== sourceLang);

    const results: Record<string, string> = { [sourceLang]: text };

    await Promise.all(otherLangs.map(async (targetLang) => {
      try {
        const res = await fetch('/api/room/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text, sourceLang, targetLang }),
        });
        if (res.ok) {
          const data = await res.json();
          results[targetLang] = data.translatedText ?? text;
        } else {
          results[targetLang] = text;
        }
      } catch {
        results[targetLang] = text;
      }
    }));

    return results;
  }, [seats]);

  // Speak translated text via TTS
  const speakText = useCallback((text: string, lang: string) => {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = LANG_MAP[lang]?.bcp47 ?? lang;
    utter.rate = 0.95;
    window.speechSynthesis.speak(utter);
  }, [ttsEnabled]);

  // Start listening for a seat
  const startListening = useCallback((seat: Seat) => {
    if (!speechSupported) return;

    // Stop any existing recognition
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();

    const SpeechRecognition = window.SpeechRecognition || (window as Record<string, unknown>).webkitSpeechRecognition as typeof window.SpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = LANG_MAP[seat.lang]?.bcp47 ?? seat.lang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final   = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }
      setInterimText(interim || final);

      if (final && !translatingRef.current) {
        translatingRef.current = true;
        setInterimText('');
        try {
          const translations = await translateToAll(final, seat.lang);
          const turn: Turn = {
            seatId: seat.id,
            lang:   seat.lang,
            original: final,
            translations,
            timestamp: Date.now(),
          };
          setTurns(prev => [...prev, turn]);

          // Speak in all other seat languages
          if (ttsEnabled) {
            const otherLangs = seats.filter(s => s.lang !== seat.lang);
            for (const s of otherLangs) {
              const translated = translations[s.lang];
              if (translated && translated !== final) {
                speakText(translated, s.lang);
                break; // speak first other language only
              }
            }
          }
        } finally {
          translatingRef.current = false;
          setActiveSeatId(null);
        }
      }
    };

    recognition.onend = () => {
      if (activeSeatId === seat.id) setActiveSeatId(null);
      setInterimText('');
    };

    recognition.onerror = () => {
      setActiveSeatId(null);
      setInterimText('');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setActiveSeatId(seat.id);
    setIsRunning(true);
    startTime.current = startTime.current || Date.now();
  }, [speechSupported, translateToAll, speakText, ttsEnabled, seats, activeSeatId]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setActiveSeatId(null);
    setInterimText('');
  }, []);

  const addSeat = () => {
    if (seats.length >= MAX_SEATS) return;
    const usedLangs = new Set(seats.map(s => s.lang));
    const next = LANGUAGES.find(l => !usedLangs.has(l.code)) ?? LANGUAGES[0];
    setSeats(prev => [
      ...prev,
      { id: Date.now(), lang: next.code, label: `Seat ${prev.length + 1}` },
    ]);
  };

  const removeSeat = (id: number) => {
    if (seats.length <= 2) return;
    setSeats(prev => prev.filter(s => s.id !== id));
  };

  const updateSeatLang = (id: number, lang: string) => {
    setSeats(prev => prev.map(s => s.id === id ? { ...s, lang } : s));
  };

  const saveSession = async () => {
    if (turns.length === 0) return;
    setSaving(true);
    setSessionError(null);
    try {
      const token = getToken();
      const durationSeconds = Math.round((Date.now() - startTime.current) / 1000);
      const transcript = turns.map(t => ({
        seat: t.seatId,
        lang: t.lang,
        original: t.original,
        translated: Object.entries(t.translations)
          .filter(([l]) => l !== t.lang)
          .map(([l, text]) => `${l.toUpperCase()}: ${text}`)
          .join(' | '),
        timestamp: t.timestamp,
      }));

      await fetch('/api/room/save-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          durationSeconds,
          languages: [...new Set(seats.map(s => s.lang))],
          turnCount: turns.length,
          transcript,
        }),
      });
      setSaved(true);
    } catch {
      setSessionError('Failed to save session');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const hasTranscript = turns.length > 0 || interimText;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
            <Globe size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold">Room Mode</h1>
            <p className="text-xs text-gray-400">Real-time translation for everyone in the room</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* TTS toggle */}
          <button
            onClick={() => setTtsEnabled(p => !p)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
              ttsEnabled
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : 'bg-gray-800 border-gray-700 text-gray-400'
            }`}
          >
            {ttsEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
            {ttsEnabled ? 'TTS on' : 'TTS off'}
          </button>

          {/* Save session */}
          {hasTranscript && !saved && (
            <button
              onClick={saveSession}
              disabled={saving || turns.length === 0}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-all"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save session
            </button>
          )}
          {saved && (
            <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/40 text-green-400">
              <Check size={12} /> Saved
            </span>
          )}

          <Link
            href="/home"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-all"
          >
            <X size={12} />
            Exit
          </Link>
        </div>
      </div>

      {/* Browser support warning */}
      {!speechSupported && (
        <div className="mx-6 mt-4 flex items-center gap-2 bg-yellow-500/20 border border-yellow-500/40 rounded-xl px-4 py-3 text-sm text-yellow-300">
          <AlertCircle size={16} />
          Room Mode requires a speech recognition capable browser (Chrome, Edge). Your browser may not support this feature.
        </div>
      )}

      {/* Seat grid */}
      <div className={`flex-1 grid gap-4 p-6 ${seats.length <= 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
        {seats.map(seat => {
          const isActive   = activeSeatId === seat.id;
          const lang       = LANG_MAP[seat.lang] ?? LANGUAGES[0];
          const lastTurn   = [...turns].reverse().find(t => t.seatId === seat.id);
          const otherTurns = [...turns].reverse().filter(t => t.seatId !== seat.id).slice(0, 1);

          return (
            <div
              key={seat.id}
              className={`relative flex flex-col rounded-3xl border transition-all ${
                isActive
                  ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_40px_rgba(245,158,11,0.2)]'
                  : 'border-gray-800 bg-gray-900'
              }`}
            >
              {/* Seat header */}
              <div className="flex items-center justify-between p-4 pb-2">
                <LangPicker
                  value={seat.lang}
                  onChange={code => updateSeatLang(seat.id, code)}
                  disabled={isActive}
                />
                {seats.length > 2 && (
                  <button
                    onClick={() => removeSeat(seat.id)}
                    className="text-gray-600 hover:text-gray-400 p-1 rounded-lg hover:bg-gray-800 transition-all"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Main content area */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-48">
                {/* Interim text while speaking */}
                {isActive && interimText && (
                  <p className="text-xl text-center text-amber-300 font-medium mb-4 animate-pulse">
                    {interimText}
                  </p>
                )}

                {/* Last turn from this seat */}
                {!isActive && lastTurn && (
                  <div className="text-center mb-4">
                    <p className="text-xl text-white font-medium">
                      {lastTurn.original}
                    </p>
                    <p className="text-sm text-gray-400 mt-1 text-center">
                      {lang.flag} {lang.label}
                    </p>
                  </div>
                )}

                {/* Translations from OTHER seats for THIS seat's language */}
                {!isActive && otherTurns.map(t => {
                  const translated = t.translations[seat.lang] ?? t.original;
                  return (
                    <div key={t.timestamp} className="text-center mt-2">
                      <p className="text-lg text-gray-200">
                        {translated}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        ← translated from {LANG_MAP[t.lang]?.flag} {LANG_MAP[t.lang]?.label}
                      </p>
                    </div>
                  );
                })}

                {/* Tap to speak button */}
                <button
                  onClick={isActive ? stopListening : () => startListening(seat)}
                  disabled={!speechSupported || (activeSeatId !== null && activeSeatId !== seat.id)}
                  className={`mt-4 flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.5)] animate-pulse'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 disabled:opacity-30'
                  }`}
                >
                  {isActive ? (
                    <>
                      <MicOff size={16} />
                      Stop speaking
                    </>
                  ) : (
                    <>
                      <Mic size={16} />
                      Tap to speak
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {/* Add seat button */}
        {seats.length < MAX_SEATS && (
          <button
            onClick={addSeat}
            className="flex flex-col items-center justify-center min-h-48 rounded-3xl border-2 border-dashed border-gray-800 text-gray-600 hover:border-gray-700 hover:text-gray-500 transition-all group"
          >
            <Plus size={24} className="group-hover:scale-110 transition-transform" />
            <span className="text-sm mt-2">Add language</span>
          </button>
        )}
      </div>

      {/* Session transcript */}
      {turns.length > 0 && (
        <div className="border-t border-gray-800 bg-gray-900 max-h-48 overflow-y-auto">
          <div className="px-6 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Session Transcript ({turns.length} turns)
            </p>
            <div className="space-y-2">
              {[...turns].reverse().slice(0, 20).map((turn, i) => (
                <div key={i} className="text-sm">
                  <span className="text-gray-400">
                    {LANG_MAP[turn.lang]?.flag} {LANG_MAP[turn.lang]?.label}:
                  </span>{' '}
                  <span className="text-white">{turn.original}</span>
                  {Object.entries(turn.translations)
                    .filter(([l]) => l !== turn.lang)
                    .slice(0, 2)
                    .map(([l, text]) => (
                      <div key={l} className="pl-4 text-xs text-gray-500">
                        → {LANG_MAP[l]?.flag} {text}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {sessionError && (
        <div className="px-6 py-2 text-sm text-red-400 bg-red-900/20 border-t border-red-800">
          {sessionError}
        </div>
      )}
    </div>
  );
}
