'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Phone,
  Video,
  Clock,
  Globe,
  User,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  PhoneMissed,
  ChevronRight as ArrowRight,
} from 'lucide-react';

interface CallRecord {
  id: string;
  type: 'phone_call' | 'video_call';
  userLanguage: string;
  contactLanguage: string;
  languagePair: string;
  durationSeconds: number;
  contactPhone: string | null;
  contactName: string | null;
  createdAt: string;
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', zh: 'Chinese', fr: 'French',
  de: 'German', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  ar: 'Arabic', ru: 'Russian', hi: 'Hindi', it: 'Italian',
};

function langLabel(code: string): string {
  return LANG_NAMES[code] ?? code.toUpperCase();
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return 'No answer';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const PAGE_SIZE = 20;

export function CallHistory() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'phone_call' | 'video_call'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const getToken = () =>
    (typeof window !== 'undefined'
      ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
      : null) || '';

  const load = useCallback(async (currentPage: number, currentFilter: string) => {
    setLoading(true);
    setError('');
    try {
      const token = getToken();
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(currentPage * PAGE_SIZE),
        ...(currentFilter !== 'all' ? { type: currentFilter } : {}),
      });
      const res = await fetch(`/api/calls/history?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCalls(data.calls ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page, filter); }, [load, page, filter]);

  const handleFilter = (f: 'all' | 'phone_call' | 'video_call') => {
    setFilter(f);
    setPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Compute stats from current page of calls
  const totalMinutes = Math.floor(
    calls.reduce((acc, c) => acc + (c.durationSeconds ?? 0), 0) / 60
  );
  const answeredCalls = calls.filter(c => c.durationSeconds > 0).length;
  const missedCalls = calls.filter(c => c.durationSeconds === 0).length;
  // Most-used language pair across loaded calls
  const pairCounts: Record<string, number> = {};
  calls.forEach(c => {
    if (c.languagePair) pairCounts[c.languagePair] = (pairCounts[c.languagePair] ?? 0) + 1;
  });
  const topPair = Object.entries(pairCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return (
    <div className="space-y-4">
      {/* Mini stats (only when data loaded and > 0 calls) */}
      {!loading && total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{total}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total calls</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{totalMinutes}</p>
            <p className="text-xs text-gray-500 mt-0.5">Minutes (this page)</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
            {topPair ? (
              <>
                <p className="text-sm font-bold text-gray-900 font-mono">{topPair.replace('_', '→')}</p>
                <p className="text-xs text-gray-500 mt-0.5">Top language pair</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-gray-900">{missedCalls}</p>
                <p className="text-xs text-gray-500 mt-0.5">Missed</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {(['all', 'phone_call', 'video_call'] as const).map(f => (
          <button
            key={f}
            onClick={() => handleFilter(f)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-xl transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? <Phone size={14} /> : f === 'phone_call' ? <Phone size={14} /> : <Video size={14} />}
            {f === 'all' ? 'All calls' : f === 'phone_call' ? 'Phone' : 'Video'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-gray-500">{total} call{total !== 1 ? 's' : ''}</span>
          <button
            onClick={() => load(page, filter)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
        </div>
      ) : calls.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Phone size={24} className="text-blue-300" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No calls yet</h3>
          <p className="text-gray-500 text-sm max-w-xs mx-auto mb-4">
            Your translated call history will appear here. Start by going to Contacts and calling someone.
          </p>
          <a
            href="/contacts"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Globe size={15} />
            Go to Contacts
          </a>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {calls.map(call => (
              <Link
                key={call.id}
                href={`/calls/${call.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors group"
              >
                {/* Type icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  call.type === 'video_call'
                    ? 'bg-purple-100 text-purple-600'
                    : call.durationSeconds > 0
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-red-50 text-red-400'
                }`}>
                  {call.type === 'video_call' ? (
                    <Video size={18} />
                  ) : call.durationSeconds > 0 ? (
                    <Phone size={18} />
                  ) : (
                    <PhoneMissed size={18} />
                  )}
                </div>

                {/* Contact info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm truncate">
                      {call.contactName ?? call.contactPhone ?? 'Unknown contact'}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {call.type === 'video_call' ? 'Video' : 'Phone'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Globe size={11} />
                      {langLabel(call.userLanguage)} → {langLabel(call.contactLanguage)}
                    </span>
                  </div>
                </div>

                {/* Duration + arrow */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-sm text-gray-600 justify-end">
                      <Clock size={13} className="text-gray-400" />
                      {formatDuration(call.durationSeconds)}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(call.createdAt).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric',
                      })}{' '}
                      {new Date(call.createdAt).toLocaleTimeString(undefined, {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <ArrowRight size={15} className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-sm text-gray-500">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
