'use client';

/**
 * ContactTimeline
 * Unified chronological feed of every interaction with a contact:
 * calls, video, in-app chat, SMS, voice messages, files, photos, email,
 * and room session transcripts — all in one scroll with translation toggle.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Phone, Video, MessageSquare, Smartphone, Mic2, Mail,
  Paperclip, Image, Users2, ChevronDown, Loader2,
  AlertCircle, ArrowUpRight, ArrowDownLeft, Clock,
  Globe, FileText, RefreshCw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineItem {
  id: string;
  kind: string;
  channel: string;
  icon: string;
  direction: 'outbound' | 'inbound';
  createdAt: string;
  content: string | null;
  translatedContent: string | null;
  durationSeconds: number | null;
  language: string | null;
  contactLanguage: string | null;
  languagePair: string | null;
  status: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaName: string | null;
  mediaSizeBytes: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', zh: 'Chinese', fr: 'French',
  de: 'German', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  ar: 'Arabic', ru: 'Russian', hi: 'Hindi', it: 'Italian',
  nl: 'Dutch', sv: 'Swedish', pl: 'Polish', tr: 'Turkish',
  vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', uk: 'Ukrainian',
};

const CHANNEL_LABELS: Record<string, string> = {
  call:          'Voice Call',
  video:         'Video Call',
  in_app_chat:   'Chat',
  sms:           'SMS',
  voice_message: 'Voice Message',
  email:         'Email',
  file:          'File',
  photo:         'Photo',
  room_session:  'Room Session',
};

const CHANNEL_COLORS: Record<string, string> = {
  call:          'bg-green-50 border-green-200 text-green-700',
  video:         'bg-blue-50 border-blue-200 text-blue-700',
  in_app_chat:   'bg-violet-50 border-violet-200 text-violet-700',
  sms:           'bg-cyan-50 border-cyan-200 text-cyan-700',
  voice_message: 'bg-orange-50 border-orange-200 text-orange-700',
  email:         'bg-red-50 border-red-200 text-red-700',
  file:          'bg-gray-50 border-gray-200 text-gray-700',
  photo:         'bg-pink-50 border-pink-200 text-pink-700',
  room_session:  'bg-amber-50 border-amber-200 text-amber-700',
};

const ALL_FILTERS = [
  { value: '',             label: 'All' },
  { value: 'call',         label: 'Calls' },
  { value: 'video',        label: 'Video' },
  { value: 'in_app_chat',  label: 'Chat' },
  { value: 'sms',          label: 'SMS' },
  { value: 'voice_message',label: 'Voice' },
  { value: 'email',        label: 'Email' },
  { value: 'file',         label: 'Files' },
  { value: 'photo',        label: 'Photos' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

function langLabel(code: string | null): string {
  if (!code) return '';
  return LANG_NAMES[code] ?? code.toUpperCase();
}

function formatDuration(s: number | null): string {
  if (!s || s < 1) return 'No answer';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  const hr  = Math.floor(diff / 3_600_000);
  const day = Math.floor(diff / 86_400_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ─── Channel Icon ─────────────────────────────────────────────────────────────

function ChannelIcon({ kind, size = 16 }: { kind: string; size?: number }) {
  const props = { size, className: 'flex-shrink-0' };
  switch (kind) {
    case 'call':          return <Phone {...props} />;
    case 'video':         return <Video {...props} />;
    case 'in_app_chat':   return <MessageSquare {...props} />;
    case 'sms':           return <Smartphone {...props} />;
    case 'voice_message': return <Mic2 {...props} />;
    case 'email':         return <Mail {...props} />;
    case 'file':          return <Paperclip {...props} />;
    case 'photo':         return <Image {...props} />;
    case 'room_session':  return <Users2 {...props} />;
    default:              return <MessageSquare {...props} />;
  }
}

// ─── Timeline Card ────────────────────────────────────────────────────────────

function TimelineCard({
  item,
  showTranslation,
}: {
  item: TimelineItem;
  showTranslation: boolean;
}) {
  const colorClass = CHANNEL_COLORS[item.kind] ?? 'bg-gray-50 border-gray-200 text-gray-700';
  const isOut      = item.direction === 'outbound';

  const displayText = showTranslation && item.translatedContent
    ? item.translatedContent
    : item.content;

  return (
    <div className="flex gap-3 group">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${colorClass}`}>
          <ChannelIcon kind={item.kind} size={14} />
        </div>
        <div className="w-px flex-1 bg-gray-100 mt-1" />
      </div>

      {/* Card body */}
      <div className="pb-5 flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colorClass}`}>
            {CHANNEL_LABELS[item.kind] ?? item.kind}
          </span>

          {/* Direction badge */}
          <span className={`flex items-center gap-1 text-xs ${isOut ? 'text-blue-600' : 'text-emerald-600'}`}>
            {isOut
              ? <ArrowUpRight size={12} />
              : <ArrowDownLeft size={12} />}
            {isOut ? 'You' : 'Them'}
          </span>

          {/* Call-specific: duration + lang pair */}
          {(item.kind === 'call' || item.kind === 'video') && (
            <>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock size={11} />
                {formatDuration(item.durationSeconds)}
              </span>
              {item.languagePair && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Globe size={11} />
                  {item.languagePair.replace('-', ' ↔ ')}
                </span>
              )}
              {/* Link to call detail */}
              <Link
                href={`/calls/${item.id}`}
                className="ml-auto text-xs text-blue-500 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
              >
                Details
                <ArrowUpRight size={10} />
              </Link>
            </>
          )}

          {/* Media info */}
          {item.mediaName && (
            <span className="flex items-center gap-1 text-xs text-gray-500 truncate max-w-[180px]">
              <FileText size={11} />
              {item.mediaName}
              {item.mediaSizeBytes ? ` · ${formatFileSize(item.mediaSizeBytes)}` : ''}
            </span>
          )}

          {/* Timestamp */}
          <span
            className="text-xs text-gray-400 ml-auto flex-shrink-0"
            title={formatFullDate(item.createdAt)}
          >
            {formatTimeAgo(item.createdAt)}
          </span>
        </div>

        {/* Message content */}
        {displayText && (
          <p className="text-sm text-gray-800 leading-relaxed bg-white rounded-lg px-3 py-2 border border-gray-100 shadow-sm">
            {displayText}
          </p>
        )}

        {/* Translation badge */}
        {item.translatedContent && item.content && item.translatedContent !== item.content && (
          <div className="mt-1">
            <span className="text-[10px] text-gray-400">
              {showTranslation ? `Translated from ${langLabel(item.language)}` : `Original · ${langLabel(item.language)}`}
            </span>
          </div>
        )}

        {/* Photo preview placeholder */}
        {item.kind === 'photo' && item.mediaUrl && (
          <div className="mt-2 w-32 h-24 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 border border-gray-200 text-xs">
            📷 Photo
          </div>
        )}

        {/* File download link */}
        {item.kind === 'file' && item.mediaUrl && (
          <a
            href={item.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-2.5 py-1"
          >
            <Paperclip size={11} />
            {item.mediaName ?? 'Download file'}
          </a>
        )}

        {/* Voice message player */}
        {item.kind === 'voice_message' && (
          <div className="mt-2">
            {item.mediaUrl ? (
              <audio
                src={item.mediaUrl}
                controls
                className="w-full h-8 max-w-xs"
                style={{ accentColor: '#f97316' }}
              />
            ) : (
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                <Mic2 size={14} className="text-orange-500" />
                <div className="flex-1 h-1.5 bg-orange-200 rounded-full" />
                <span className="text-xs text-orange-600">{formatDuration(item.durationSeconds)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ContactTimeline({
  contactId,
  refreshKey,
}: {
  contactId: string;
  refreshKey?: number;
}) {
  const [items, setItems]               = useState<TimelineItem[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [offset, setOffset]             = useState(0);
  const [hasMore, setHasMore]           = useState(false);
  const [channel, setChannel]           = useState('');
  const [showTranslation, setShowTranslation] = useState(true);

  const LIMIT = 20;

  const fetchTimeline = useCallback(async (newOffset: number, newChannel: string, replace: boolean) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    setError(null);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        limit:  String(LIMIT),
        offset: String(newOffset),
      });
      if (newChannel) params.set('channel', newChannel);

      const res = await fetch(
        `/api/users/contacts/${contactId}/timeline?${params}`,
        { headers: { authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load timeline');

      if (replace) {
        setItems(data.items);
      } else {
        setItems(prev => [...prev, ...data.items]);
      }
      setTotal(data.total);
      setHasMore(data.hasMore);
      setOffset(newOffset + data.items.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [contactId]);

  // Initial load + refresh when refreshKey changes (e.g. after sending a message)
  useEffect(() => {
    setOffset(0);
    fetchTimeline(0, channel, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, channel, fetchTimeline, refreshKey]);

  const handleChannelChange = (ch: string) => {
    setChannel(ch);
    setOffset(0);
  };

  const loadMore = () => {
    fetchTimeline(offset, channel, false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-900">
          Timeline
          {total > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-500">
              {total} interaction{total !== 1 ? 's' : ''}
            </span>
          )}
        </h3>

        {/* Translation toggle */}
        <button
          onClick={() => setShowTranslation(p => !p)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
            showTranslation
              ? 'bg-violet-50 border-violet-200 text-violet-700 font-medium'
              : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          <Globe size={12} />
          {showTranslation ? 'Showing translation' : 'Show translation'}
        </button>
      </div>

      {/* Channel filter strip */}
      <div className="flex gap-1.5 flex-wrap">
        {ALL_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => handleChannelChange(f.value)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
              channel === f.value
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading timeline…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => fetchTimeline(0, channel, true)} className="ml-auto text-red-500 hover:text-red-700">
            <RefreshCw size={14} />
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <MessageSquare size={24} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-600">No interactions yet</p>
          <p className="text-xs text-gray-400 mt-1">
            {channel ? `No ${CHANNEL_LABELS[channel] ?? channel} history` : 'Start a call or send a message'}
          </p>
        </div>
      ) : (
        <div className="relative">
          {items.map(item => (
            <TimelineCard
              key={`${item.kind}-${item.id}`}
              item={item}
              showTranslation={showTranslation}
            />
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 bg-white transition-all disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ChevronDown size={14} />
                )}
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
