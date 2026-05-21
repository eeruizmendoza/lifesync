'use client';

import React, { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface PhoneCallDialogProps {
  callId: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  sourceLanguage: string; // Caller's language
  targetLanguage: string; // Receiver's language
  isIncoming?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onEnd?: () => void;
}

interface CallMetrics {
  totalLatencyMs: number;
  transcriptionLatencyMs: number;
  translationLatencyMs: number;
  synthesisLatencyMs: number;
  audioQualityScore: number;
  transcriptionConfidence: number;
  translationConfidence: number;
}

export function PhoneCallDialog({
  callId,
  contactId,
  contactName,
  contactPhone,
  sourceLanguage,
  targetLanguage,
  isIncoming = false,
  onAccept,
  onReject,
  onEnd,
}: PhoneCallDialogProps) {
  const [callState, setCallState] = useState<'ringing' | 'connected' | 'ended'>(
    isIncoming ? 'ringing' : 'ringing'
  );
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [metrics, setMetrics] = useState<CallMetrics | null>(null);
  const [transcripts, setTranscripts] = useState<
    Array<{ speaker: string; language: string; text: string; timestamp: number }>
  >([]);
  const [audioLevel, setAudioLevel] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  // Timer for call duration
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Format time MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get language names
  const languageName = (code: string) => {
    const names: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      zh: 'Chinese',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      ru: 'Russian',
      ja: 'Japanese',
      ko: 'Korean',
    };
    return names[code] || code.toUpperCase();
  };

  // Animate audio level
  const animateAudioLevel = () => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(average / 255);
    }
    animationRef.current = requestAnimationFrame(animateAudioLevel);
  };

  // Start audio analysis
  const startAudioAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      source.connect(analyser);
      analyserRef.current = analyser;
      audioContextRef.current = audioContext;

      animateAudioLevel();
    } catch (error) {
      console.error('Failed to access microphone:', error);
    }
  };

  useEffect(() => {
    if (callState === 'connected' && !analyserRef.current) {
      startAudioAnalysis();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [callState]);

  // Handle accept
  const handleAccept = () => {
    setCallState('connected');
    onAccept?.();
  };

  // Handle reject/hang up
  const handleEnd = () => {
    setCallState('ended');
    onEnd?.();

    if (timerRef.current) clearInterval(timerRef.current);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  if (callState === 'ended') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4">Call Ended</h2>
          <div className="space-y-2 mb-6 text-gray-600">
            <p>
              <span className="font-semibold">Contact:</span> {contactName}
            </p>
            <p>
              <span className="font-semibold">Duration:</span> {formatTime(duration)}
            </p>
            {metrics && (
              <>
                <p>
                  <span className="font-semibold">Avg Latency:</span>{' '}
                  {metrics.totalLatencyMs.toFixed(0)}ms
                </p>
                <p>
                  <span className="font-semibold">Quality:</span>{' '}
                  {(metrics.audioQualityScore * 100).toFixed(0)}%
                </p>
              </>
            )}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (callState === 'ringing') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-20 h-20 rounded-full bg-gray-200 mx-auto mb-4 flex items-center justify-center text-3xl">
              👤
            </div>
            <h2 className="text-2xl font-bold">{contactName}</h2>
            <p className="text-gray-600">{contactPhone}</p>
            <div className="mt-2 flex justify-center gap-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                {languageName(sourceLanguage)}
              </span>
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                {languageName(targetLanguage)}
              </span>
            </div>
          </div>

          <p className="text-center text-gray-600 mb-6">
            {isIncoming ? 'Incoming call...' : 'Calling...'}
          </p>

          <div className="flex gap-4 justify-center">
            {isIncoming && (
              <button
                onClick={handleAccept}
                className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-full hover:bg-green-700 transition-colors"
              >
                <span>📞</span> Accept
              </button>
            )}
            <button
              onClick={handleEnd}
              className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-full hover:bg-red-700 transition-colors"
            >
              <span>✕</span> {isIncoming ? 'Decline' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Connected state
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg overflow-hidden max-w-md w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">{contactName}</h2>
              <p className="text-blue-100">{contactPhone}</p>
            </div>
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-4xl">
              👤
            </div>
          </div>

          {/* Languages */}
          <div className="flex justify-center gap-2 mb-4">
            <span className="px-3 py-1 bg-white/20 text-white rounded-full text-sm">
              {languageName(sourceLanguage)}
            </span>
            <span className="text-white/60">→</span>
            <span className="px-3 py-1 bg-white/20 text-white rounded-full text-sm">
              {languageName(targetLanguage)}
            </span>
          </div>

          {/* Timer */}
          <div className="text-center text-3xl font-mono font-bold">
            {formatTime(duration)}
          </div>
        </div>

        {/* Transcripts */}
        {transcripts.length > 0 && (
          <div className="border-b max-h-40 overflow-y-auto bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Live Transcript
            </h3>
            <div className="space-y-2 text-sm">
              {transcripts.slice(-5).map((t, i) => (
                <div key={i} className="text-gray-600">
                  <span className="font-semibold">
                    {t.speaker} ({languageName(t.language)}):
                  </span>
                  <p className="text-gray-700">{t.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metrics */}
        {metrics && (
          <div className="border-b bg-gray-50 p-4 text-xs text-gray-600 space-y-1">
            <div className="flex justify-between">
              <span>Latency:</span>
              <span>{metrics.totalLatencyMs.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between">
              <span>Quality:</span>
              <span>{(metrics.audioQualityScore * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Confidence:</span>
              <span>{(metrics.transcriptionConfidence * 100).toFixed(0)}%</span>
            </div>
          </div>
        )}

        {/* Audio Level */}
        <div className="bg-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Audio Level</span>
            <div className="flex-1 bg-gray-300 rounded-full h-2 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all"
                style={{ width: `${audioLevel * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 space-y-3">
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-3 rounded-full transition-colors ${
                isMuted
                  ? 'bg-red-100 text-red-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🎤'}
            </button>

            <button
              onClick={() => setSpeakerOn(!speakerOn)}
              className={`p-3 rounded-full transition-colors ${
                speakerOn
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={speakerOn ? 'Mute speaker' : 'Unmute speaker'}
            >
              {speakerOn ? '🔊' : '🔈'}
            </button>

            <button
              onClick={handleEnd}
              className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
              title="End call"
            >
              ☎️
            </button>
          </div>

          <button
            onClick={handleEnd}
            className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors font-semibold"
          >
            End Call
          </button>
        </div>
      </div>
    </div>
  );
}

export default PhoneCallDialog;
