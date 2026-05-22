'use client';

/**
 * CallDetail
 * Full-page detail view for a single call: metadata, recording player,
 * and transcript side-by-side display.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Phone,
  Video,
  PhoneMissed,
  Clock,
  Globe,
  User,
  Mic,
  FileText,
  Download,
  Languages,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CallInfo {
  id: string;
  type: string;
  userLanguage: string;
  contactLanguage: string;
  languagePair: string;
  durationSeconds: number;
  contactPhone: string;
  contactName: string | null;
  callerName: string | null;
  callerPhone: string;
  callerId: string;
  contactId: string | null;
  createdAt: string;
}

interface Recording {
  id: string;
  type: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
  processingStatus: string;
  transcriptionStatus: string;
  createdAt: string;
}

interface TranscriptLine {
  id: string;
  speakerId: string;
  speakerLabel: string;
  originalText: string;
  originalLanguage: string;
  translatedText: string | null;
  translatedLanguage: string | null;
  startMs: number;
  endMs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function langLabel(code: string): string {
  return LANG_NAMES[code] ?? code.toUpperCase();
}

function formatDuration(s: number): string {
  if (!s || s < 1) return 'No answer';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function msToTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CallDetail({ callId }: { callId: string }) {
  const [call, setCall] = useState<CallInfo | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = getToken();
    try {
      const res = await fetch(`/api/calls/${callId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Failed to load call');
      }
      const data = await res.json();
      setCall(data.call);
      setRecordings(data.recordings ?? []);
      setTranscriptLines(data.transcriptLines ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load call details');
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleDownload = async (recordingId: string, mimeType: string) => {
    const token = getToken();
    try {
      const res = await fetch(
        `/api/recordings/download?recordingId=${recordingId}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' }
      );
      if (!res.ok) { alert('Download failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${recordingId}.${mimeType.split('/')[1] ?? 'webm'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Download failed');
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !call) {
    return (
      <div className="space-y-4">
        <Link href="/calls" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={15} /> Back to Call History
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          ⚠️ {error ?? 'Call not found'}
        </div>
      </div>
    );
  }

  const isMissed = call.durationSeconds === 0;
  const contactLabel = call.contactName ?? call.contactPhone ?? 'Unknown contact';
  const callerLabel = call.callerName ?? call.callerPhone ?? 'Unknown caller';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/calls" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ArrowLeft size={15} />
        Back to Call History
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
            call.type === 'video_call'
              ? 'bg-purple-100 text-purple-600'
              : isMissed
              ? 'bg-red-50 text-red-400'
              : 'bg-blue-100 text-blue-600'
          }`}>
            {call.type === 'video_call' ? (
              <Video size={22} />
            ) : isMissed ? (
              <PhoneMissed size={22} />
            ) : (
              <Phone size={22} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900">
              {call.type === 'video_call' ? 'Video call' : isMissed ? 'Missed call' : 'Phone call'}
            </h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {new Date(call.createdAt).toLocaleString(undefined, {
                weekday: 'long', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>

          {!isMissed && (
            <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-600 flex-shrink-0">
              <Clock size={14} className="text-gray-400" />
              {formatDuration(call.durationSeconds)}
            </div>
          )}
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><User size={11} />Caller</p>
            <p className="text-sm font-medium text-gray-800 truncate">{callerLabel}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><User size={11} />Contact</p>
            <p className="text-sm font-medium text-gray-800 truncate">{contactLabel}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Globe size={11} />My language</p>
            <p className="text-sm font-medium text-gray-800">{langLabel(call.userLanguage)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Languages size={11} />Their language</p>
            <p className="text-sm font-medium text-gray-800">{langLabel(call.contactLanguage)}</p>
          </div>
        </div>
      </div>

      {/* Recordings */}
      {recordings.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <Mic size={15} className="text-blue-500" />
            Recordings
          </h3>
          <div className="space-y-3">
            {recordings.map(rec => (
              <div key={rec.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Mic size={15} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {rec.type.charAt(0).toUpperCase() + rec.type.slice(1)} recording
                  </p>
                  <p className="text-xs text-gray-400">
                    {fmtBytes(rec.fileSizeBytes)} · {formatDuration(rec.durationSeconds)} ·{' '}
                    <span className={`${
                      rec.processingStatus === 'complete' ? 'text-green-600' :
                      rec.processingStatus === 'failed' ? 'text-red-500' :
                      'text-amber-600'
                    }`}>{rec.processingStatus}</span>
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(rec.id, rec.mimeType)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Download size={13} />
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      {transcriptLines.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <FileText size={15} className="text-blue-500" />
              Transcript
              <span className="text-xs text-gray-400 font-normal">
                {transcriptLines.length} line{transcriptLines.length !== 1 ? 's' : ''}
              </span>
            </h3>
            <button
              onClick={() => setShowOriginal(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {showOriginal ? 'Show translated' : 'Show original'}
            </button>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {transcriptLines.map(line => (
              <div key={line.id} className="flex gap-3">
                {/* Timestamp */}
                <span className="text-[11px] text-gray-400 flex-shrink-0 w-10 pt-0.5 font-mono">
                  {msToTime(line.startMs)}
                </span>

                {/* Bubble */}
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-0.5">
                    {line.speakerLabel} · {langLabel(showOriginal ? line.originalLanguage : (line.translatedLanguage ?? line.originalLanguage))}
                  </p>
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {showOriginal ? line.originalText : (line.translatedText ?? line.originalText)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No recording / transcript */}
      {recordings.length === 0 && transcriptLines.length === 0 && !isMissed && (
        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-8 text-center">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-3 shadow-sm">
            <Mic size={20} className="text-gray-300" />
          </div>
          <p className="text-sm text-gray-500">No recording or transcript available for this call.</p>
        </div>
      )}
    </div>
  );
}
