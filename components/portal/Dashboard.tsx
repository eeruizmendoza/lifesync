'use client';

/**
 * Dashboard
 * Portal home command center: quick stats, recent calls,
 * online contacts, and CRM follow-up reminders.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Phone,
  Video,
  PhoneMissed,
  Clock,
  Globe,
  Users,
  NotebookPen,
  ArrowRight,
  Loader2,
  TrendingUp,
  Zap,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stats {
  callsThisMonth: number;
  minutesThisMonth: number;
  totalCalls: number;
  totalMinutes: number;
  onlineContacts: number;
}

interface RecentCall {
  id: string;
  type: string;
  contactName: string | null;
  contactPhone: string | null;
  contactId: string | null;
  durationSeconds: number;
  languagePair: string;
  hasNotes: boolean;
  notesPreview: string | null;
  createdAt: string;
}

interface OnlineContact {
  id: string;
  name: string;
  lastSeenAt: string | null;
  language: string;
}

interface DashboardData {
  stats: Stats;
  recentCalls: RecentCall[];
  annotatedCalls: RecentCall[];
  onlineContacts: OnlineContact[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', zh: 'Chinese', fr: 'French',
  de: 'German', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  ar: 'Arabic', ru: 'Russian', hi: 'Hindi', it: 'Italian',
};
function langLabel(code: string) { return LANG_NAMES[code] ?? code.toUpperCase(); }

function formatDuration(s: number): string {
  if (!s || s < 1) return 'No answer';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

const AVATAR_COLORS = [
  'from-blue-400 to-blue-600', 'from-purple-400 to-purple-600',
  'from-green-400 to-green-600', 'from-orange-400 to-orange-600',
  'from-pink-400 to-pink-600', 'from-teal-400 to-teal-600',
];
function avatarColor(id: string) {
  const n = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${getToken()}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setError('Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">
        {error ?? 'Dashboard unavailable'}
        <button onClick={load} className="ml-4 text-xs font-medium hover:underline">Retry</button>
      </div>
    );
  }

  const { stats, recentCalls, annotatedCalls, onlineContacts } = data;
  const hasActivity = stats.totalCalls > 0;

  return (
    <div className="space-y-6">

      {/* Quick stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Phone size={14} className="text-blue-500" />
            <p className="text-xs text-gray-400 font-medium">This month</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.callsThisMonth}</p>
          <p className="text-xs text-gray-400 mt-0.5">calls</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-blue-500" />
            <p className="text-xs text-gray-400 font-medium">This month</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.minutesThisMonth}</p>
          <p className="text-xs text-gray-400 mt-0.5">minutes</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-purple-500" />
            <p className="text-xs text-gray-400 font-medium">All time</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.totalCalls}</p>
          <p className="text-xs text-gray-400 mt-0.5">calls</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={14} className={stats.onlineContacts > 0 ? 'text-green-500' : 'text-gray-400'} />
            <p className="text-xs text-gray-400 font-medium">Right now</p>
          </div>
          <p className={`text-2xl font-bold ${stats.onlineContacts > 0 ? 'text-green-600' : 'text-gray-900'}`}>
            {stats.onlineContacts}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">online</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/communications"
          className="flex items-center justify-center gap-2 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
        >
          <Phone size={16} />
          New Call
        </Link>
        <Link
          href="/contacts"
          className="flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          <Users size={16} className="text-gray-500" />
          Contacts
        </Link>
        <Link
          href="/calls"
          className="flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          <Clock size={16} className="text-gray-500" />
          Call History
        </Link>
        <Link
          href="/recordings"
          className="flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          <Globe size={16} className="text-gray-500" />
          Recordings
        </Link>
      </div>

      {/* Two-column section: Recent calls + Online now */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent calls (2/3 width) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Phone size={15} className="text-blue-500" />
              Recent Calls
            </h2>
            <Link
              href="/calls"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              View all <ChevronRight size={12} />
            </Link>
          </div>

          {recentCalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                <Phone size={20} className="text-blue-300" />
              </div>
              <p className="text-sm text-gray-500">No calls yet</p>
              <Link
                href="/communications"
                className="text-xs text-blue-600 font-medium hover:underline"
              >
                Start your first call →
              </Link>
            </div>
          ) : (
            <div className="space-y-1">
              {recentCalls.map(call => (
                <Link
                  key={call.id}
                  href={`/calls/${call.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    call.type === 'video_call'
                      ? 'bg-purple-100 text-purple-600'
                      : call.durationSeconds > 0
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-red-50 text-red-400'
                  }`}>
                    {call.type === 'video_call' ? <Video size={14} /> :
                     call.durationSeconds > 0 ? <Phone size={14} /> : <PhoneMissed size={14} />}
                  </div>

                  {/* Contact + language */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {call.contactName ?? call.contactPhone ?? 'Unknown'}
                      </span>
                      {call.hasNotes && (
                        <NotebookPen size={11} className="text-blue-400 flex-shrink-0" title="Has notes" />
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {call.languagePair ? call.languagePair.replace('_', '→') : '—'} · {formatDuration(call.durationSeconds)}
                    </p>
                  </div>

                  {/* Time + arrow */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400">{relativeTime(call.createdAt)}</span>
                    <ArrowRight size={13} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Online now (1/3 width) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Online Now
            </h2>
            <Link
              href="/contacts"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              All <ChevronRight size={12} />
            </Link>
          </div>

          {onlineContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center">
                <Users size={18} className="text-gray-300" />
              </div>
              <p className="text-xs text-gray-400">No one online right now</p>
            </div>
          ) : (
            <div className="space-y-2">
              {onlineContacts.map(contact => (
                <Link
                  key={contact.id}
                  href={`/contacts/${contact.id}`}
                  className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                  <div className="relative flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarColor(contact.id)} flex items-center justify-center text-white text-xs font-semibold`}>
                      {getInitials(contact.name)}
                    </div>
                    <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-500 border border-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{contact.name}</p>
                    <p className="text-[10px] text-gray-400">{langLabel(contact.language)}</p>
                  </div>
                  <Link
                    href="/communications"
                    onClick={e => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                    title={`Call ${contact.name}`}
                  >
                    <Phone size={11} />
                  </Link>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CRM Follow-ups (calls with notes) */}
      {annotatedCalls.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <NotebookPen size={15} className="text-amber-500" />
              Follow-up Notes
              <span className="text-xs text-gray-400 font-normal">{annotatedCalls.length} call{annotatedCalls.length !== 1 ? 's' : ''} with notes</span>
            </h2>
            <Link href="/calls" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {annotatedCalls.map(call => (
              <Link
                key={call.id}
                href={`/calls/${call.id}`}
                className="block p-4 rounded-xl border border-amber-100 bg-amber-50 hover:border-amber-200 hover:bg-amber-50/80 transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-800 truncate">
                    {call.contactName ?? call.contactPhone ?? 'Unknown'}
                  </span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
                    {relativeTime(call.createdAt)}
                  </span>
                </div>
                {call.notesPreview && (
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                    {call.notesPreview}{call.notesPreview.length >= 80 ? '…' : ''}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-gray-400">
                    {call.languagePair ? call.languagePair.replace('_', '→') : '—'} · {formatDuration(call.durationSeconds)}
                  </span>
                  <ArrowRight size={11} className="ml-auto text-amber-400 group-hover:text-amber-600 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for brand new users */}
      {!hasActivity && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-8 text-center">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Globe size={28} className="text-blue-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Welcome to LifeSync</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mb-5">
            Make your first translated call to break language barriers instantly.
          </p>
          <Link
            href="/contacts"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Users size={16} />
            Find a contact to call
          </Link>
        </div>
      )}

      {/* Refresh button (bottom right corner) */}
      <div className="flex justify-end">
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>
    </div>
  );
}
