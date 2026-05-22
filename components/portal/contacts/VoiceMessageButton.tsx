'use client';

/**
 * VoiceMessageButton
 * Inline mic button for recording and sending voice messages.
 * Uses browser MediaRecorder API to capture WebM/Opus audio.
 * Max recording: 60 seconds (hard cap).
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Send, Loader2, AlertCircle, X } from 'lucide-react';

interface VoiceMessageButtonProps {
  receiverUserId: string;
  receiverName: string;
  userLanguage?: string;
  receiverLanguage?: string;
  onMessageSent?: () => void;
}

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

type RecordingState = 'idle' | 'recording' | 'preview' | 'sending';

export function VoiceMessageButton({
  receiverUserId,
  receiverName,
  userLanguage = 'en',
  receiverLanguage = 'en',
  onMessageSent,
}: VoiceMessageButtonProps) {
  const [state, setState]               = useState<RecordingState>('idle');
  const [duration, setDuration]         = useState(0);
  const [audioBlob, setAudioBlob]       = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl]         = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_DURATION     = 60;

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [audioUrl]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 16000 });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url  = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setState('preview');
        // Stop mic
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(100); // collect data every 100ms
      mediaRecorderRef.current = recorder;
      setState('recording');
      setDuration(0);

      // Timer
      timerRef.current = setInterval(() => {
        setDuration(prev => {
          const next = prev + 1;
          if (next >= MAX_DURATION) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      setError('Microphone access denied. Please allow microphone access in your browser settings.');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    stopRecording();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setState('idle');
    setError(null);
  }, [stopRecording, audioUrl]);

  const sendVoiceMessage = useCallback(async () => {
    if (!audioBlob) return;
    setState('sending');
    setError(null);
    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array  = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);

      const token = getToken();
      const res = await fetch('/api/voice-messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverUserId,
          audioBase64:    base64,
          mimeType:       audioBlob.type || 'audio/webm;codecs=opus',
          durationSeconds:duration,
          language:       userLanguage,
          targetLanguage: receiverLanguage,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send');

      // Clean up
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(null);
      setAudioUrl(null);
      setDuration(0);
      setState('idle');
      onMessageSent?.();
    } catch (e) {
      setState('preview');
      setError(e instanceof Error ? e.message : 'Failed to send');
    }
  }, [audioBlob, audioUrl, duration, receiverUserId, userLanguage, receiverLanguage, onMessageSent]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ── Idle: just show mic button ─────────────────────────────────────────────
  if (state === 'idle') {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={startRecording}
          className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-orange-50 border border-orange-200 text-orange-500 hover:bg-orange-100 hover:border-orange-300 transition-all"
          title={`Send voice message to ${receiverName}`}
        >
          <Mic size={16} />
        </button>
        {error && (
          <p className="text-[10px] text-red-600 max-w-[160px] leading-tight">{error}</p>
        )}
      </div>
    );
  }

  // ── Recording ──────────────────────────────────────────────────────────────
  if (state === 'recording') {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <span className="text-sm font-mono text-red-700 w-10">{formatDuration(duration)}</span>
        <div className="flex-1 text-xs text-red-600">Recording…</div>
        <button
          onClick={cancel}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          title="Cancel"
        >
          <X size={14} />
        </button>
        <button
          onClick={stopRecording}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 transition-all"
        >
          <Square size={11} fill="currentColor" />
          Stop
        </button>
      </div>
    );
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  if (state === 'preview') {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Mic size={14} className="text-orange-500 flex-shrink-0" />
          <span className="text-xs font-medium text-orange-700">
            Voice message · {formatDuration(duration)}
          </span>
          <button
            onClick={cancel}
            className="ml-auto p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Discard"
          >
            <X size={14} />
          </button>
        </div>
        {audioUrl && (
          <audio
            src={audioUrl}
            controls
            className="w-full h-8"
            style={{ accentColor: '#f97316' }}
          />
        )}
        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle size={12} />
            {error}
          </div>
        )}
        <button
          onClick={sendVoiceMessage}
          className="flex items-center gap-1.5 w-full justify-center px-3 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-all"
        >
          <Send size={14} />
          Send voice message
        </button>
      </div>
    );
  }

  // ── Sending ────────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
      <Loader2 size={14} className="text-orange-500 animate-spin" />
      <span className="text-sm text-orange-700">Sending voice message…</span>
    </div>
  );
}
