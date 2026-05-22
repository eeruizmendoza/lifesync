'use client';

/**
 * Dashboard — Phase 52 mobile-first home screen redesign
 *
 * Layout:
 *   1. Greeting header (time-of-day + name)
 *   2. Room Mode hero CTA
 *   3. Quick-action row (Call / Chat / Video / More)
 *   4. Stats strip (calls · minutes · unread · online)
 *   5. Pinned contacts horizontal scroll
 *   6. Unified recent activity (calls + messages interleaved)
 *   7. Follow-up notes grid (CRM)
 *   8. Empty state for new users
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Phone, Video, PhoneMissed, Clock, Globe, Users, NotebookPen,
  ArrowRight, Loader2, Zap, RefreshCw, ChevronRight, Pin,
  MessageSquare, Mic, FileText, Image, Voicemail,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  callsThisMonth: number;
  minutesThisMonth: number;
  totalCalls: number;
  totalMinutes: number;
  onlineContacts: number;
  unreadMessages: number;
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

interface RecentMessage {
  id: string;
  channel: string;
  content: string | null;
  direction: string;
  mediaType: string | null;
  mediaName: string | null;
  senderName: string | null;
  senderId: string | null;
  receiverName: string | null;
  receiverId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface DashboardData {
  userName: string | null;
  stats: Stats;
  recentCalls: RecentCall[];
  annotatedCalls: RecentCall[];
  onlineContacts: OnlineContact[];
  pinnedContacts: OnlineContact[];
  recentMessages: RecentMessage[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(name: string | null): string {
  const h = new Date().getHours();
  const first = name?.split(' ')[0] ?? null;
  const suffix = first ? `, ${first}` : '';
  if (h < 12) return `Good morning${suffix} 👋`;
  if (h < 17) return `Good afternoon${suffix} 👋`;
  return `Good evening${suffix} 👋`;
}

function formatDuration(s: number): string {
  if (!s || s < 1) return 'Missed';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 2) return 'Yesterday';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

const AVATAR_COLORS = [
  'from-indigo-400 to-indigo-600', 'from-violet-400 to-violet-600',
  'from-sky-400 to-sky-600', 'from-emerald-400 to-emerald-600',
  'from-orange-400 to-orange-500', 'from-pink-400 to-pink-600',
];
function avatarColor(id: string) {
  const n = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return (Date.now() - new Date(lastSeenAt).getTime()) / 1000 < 90;
}

function ChannelIcon({ channel }: { channel: string }) {
  const cls = 'flex-shrink-0';
  if (channel === 'in_app_chat') return <MessageSquare size={14} className={cls} />;
  if (channel === 'voice_message') return <Voicemail size={14} className={cls} />;
  if (channel === 'photo') return <Image size={14} className={cls} />;
  if (channel === 'file') return <FileText size={14} className={cls} />;
  return <MessageSquare size={14} className={cls} />;
}

function channelLabel(channel: string): string {
  if (channel === 'in_app_chat') return 'Chat';
  if (channel === 'voice_message') return 'Voice message';
  if (channel === 'photo') return 'Photo';
  if (channel === 'file') return 'File';
  return 'Message';
}

// ─── Activity Feed (merged calls + messages) ──────────────────────────────────

interface ActivityItem {
  id: string;
  kind: 'call' | 'message';
  createdAt: string;
  call?: RecentCall;
  message?: RecentMessage;
  userId?: string | null; // contact user id for link
}

function mergeActivity(calls: RecentCall[], messages: RecentMessage[]): ActivityItem[] {
  const items: ActivityItem[] = [
    ...calls.map(c => ({
      id: `call-${c.id}`,
      kind: 'call' as const,
      createdAt: c.createdAt,
      call: c,
      userId: c.contactId,
    })),
    ...messages.map(m => ({
      id: `msg-${m.id}`,
      kind: 'message' as const,
      createdAt: m.createdAt,
      message: m,
      userId: m.direction === 'inbound' ? m.senderId : m.receiverId,
    })),
  ];
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ icon, value, label, color }: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color: string;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${color}`}>
      <div className="opacity-80">{icon}</div>
      <div>
        <p className="text-base font-bold leading-none">{value}</p>
        <p className="text-[10px] opacity-70 mt-0.5 leading-none">{label}</p>
      </div>
    </div>
  );
}

function PinnedContactChip({ contact }: { contact: OnlineContact }) {
  const online = isOnline(contact.lastSeenAt);
  return (
    <Link
      href={`/contacts/${contact.id}`}
      className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16 group"
    >
      <div className="relative">
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${avatarColor(contact.id)} flex items-center justify-center text-white text-sm font-bold shadow-sm group-hover:shadow-md transition-shadow`}>
          {getInitials(contact.name)}
        </div>
        {online && (
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
        )}
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center">
          <Pin size={7} className="text-white" />
        </span>
      </div>
      <span className="text-[10px] font-medium text-gray-600 text-center leading-tight truncate w-full">
        {contact.name.split(' ')[0]}
      </span>
    </Link>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  if (item.kind === 'call' && item.call) {
    const { call } = item;
    const missed = call.durationSeconds === 0;
    const isVideo = call.type === 'video_call';
    return (
      <Link
        href={`/calls/${call.id}`}
        className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors group"
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isVideo ? 'bg-violet-100 text-violet-600'
          : missed ? 'bg-red-50 text-red-400'
          : 'bg-blue-100 text-blue-600'
        }`}>
          {isVideo ? <Video size={15} /> : missed ? <PhoneMissed size={15} /> : <Phone size={15} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {call.contactName ?? call.contactPhone ?? 'Unknown'}
          </p>
          <p className="text-xs text-gray-400">
            {isVideo ? 'Video call' : missed ? 'Missed call' : `Call · ${formatDuration(call.durationSeconds)}`}
            {call.languagePair ? ` · ${call.languagePair.replace('_', '→')}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-gray-400">{relativeTime(call.createdAt)}</span>
          <ArrowRight size={12} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
        </div>
      </Link>
    );
  }

  if (item.kind === 'message' && item.message) {
    const { message: msg } = item;
    const contactName = msg.direction === 'inbound'
      ? (msg.senderName ?? 'Unknown')
      : (msg.receiverName ?? 'Unknown');
    const contactId = item.userId;
    const href = contactId ? `/contacts/${contactId}` : '/communications';
    return (
      <Link
        href={href}
        className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors group"
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          !msg.isRead && msg.direction === 'inbound'
            ? 'bg-indigo-100 text-indigo-600'
            : 'bg-gray-100 text-gray-500'
        }`}>
          <ChannelIcon channel={msg.channel} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-gray-900 truncate">{contactName}</p>
            {!msg.isRead && msg.direction === 'inbound' && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-gray-400 truncate">
            {msg.direction === 'outbound' ? 'You: ' : ''}
            {msg.content
              ? msg.content.slice(0, 60) + (msg.content.length > 60 ? '…' : '')
              : msg.mediaName
              ? msg.mediaName
              : channelLabel(msg.channel)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-gray-400">{relativeTime(msg.createdAt)}</span>
          <ArrowRight size={12} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
        </div>
      </Link>
    );
  }

  return null;
}

// ─── Main Dashboard component ─────────────────────────────────────────────────

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
        <Loader2 size={28} className="animate-spin text-indigo-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm flex items-center justify-between">
        <span>{error ?? 'Dashboard unavailable'}</span>
        <button onClick={load} className="text-xs font-medium hover:underline ml-4 flex items-center gap-1">
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  const { userName, stats, recentCalls, annotatedCalls, onlineContacts, pinnedContacts, recentMessages } = data;
  const activity = mergeActivity(recentCalls, recentMessages ?? []);
  const hasActivity = stats.totalCalls > 0 || (recentMessages?.length ?? 0) > 0;

  return (
    <div className="space-y-5">

      {/* ── Greeting header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">
            {getGreeting(userName)}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={load}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors mt-0.5"
          title="Refresh"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* ── Room Mode hero ── */}
      <Link href="/room" className="block">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-5 shadow-lg hover:shadow-xl transition-shadow active:scale-[0.99] transition-transform">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-16 translate-x-16" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-12 -translate-x-8" />

          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                  <Globe size={16} className="text-white" />
                </div>
                <span className="text-xs font-semibold text-indigo-200 uppercase tracking-wide">Room Mode</span>
              </div>
              <h2 className="text-xl font-bold text-white leading-tight">Start a multilingual<br />session</h2>
              <p className="text-xs text-indigo-200 mt-1.5">
                Up to 4 languages · Real-time translation · No setup
              </p>
            </div>
            <div className="flex-shrink-0 ml-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <ArrowRight size={22} className="text-white" />
              </div>
            </div>
          </div>
        </div>
      </Link>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-4 gap-2.5">
        <Link
          href="/communications"
          className="flex flex-col items-center gap-1.5 py-3 bg-white border border-gray-200 rounded-xl hover:border-blue-200 hover:bg-blue-50 transition-all active:scale-95"
        >
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
            <Phone size={17} className="text-blue-600" />
          </div>
          <span className="text-[11px] font-medium text-gray-600">Call</span>
        </Link>
        <Link
          href="/contacts"
          className="flex flex-col items-center gap-1.5 py-3 bg-white border border-gray-200 rounded-xl hover:border-indigo-200 hover:bg-indigo-50 transition-all active:scale-95"
        >
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
            <MessageSquare size={17} className="text-indigo-600" />
          </div>
          <span className="text-[11px] font-medium text-gray-600">Chat</span>
        </Link>
        <Link
          href="/communications"
          className="flex flex-col items-center gap-1.5 py-3 bg-white border border-gray-200 rounded-xl hover:border-purple-200 hover:bg-purple-50 transition-all active:scale-95"
        >
          <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
            <Video size={17} className="text-purple-600" />
          </div>
          <span className="text-[11px] font-medium text-gray-600">Video</span>
        </Link>
        <Link
          href="/contacts"
          className="flex flex-col items-center gap-1.5 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all active:scale-95"
        >
          <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center">
            <Users size={17} className="text-gray-600" />
          </div>
          <span className="text-[11px] font-medium text-gray-600">Contacts</span>
        </Link>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-4 gap-2">
        <StatChip
          icon={<Phone size={14} className="text-blue-600" />}
          value={stats.callsThisMonth}
          label="calls"
          color="bg-blue-50 text-blue-700"
        />
        <StatChip
          icon={<Clock size={14} className="text-violet-600" />}
          value={stats.minutesThisMonth}
          label="minutes"
          color="bg-violet-50 text-violet-700"
        />
        <StatChip
          icon={<MessageSquare size={14} className="text-indigo-600" />}
          value={stats.unreadMessages}
          label="unread"
          color={stats.unreadMessages > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-50 text-gray-500'}
        />
        <StatChip
          icon={<Zap size={14} className={stats.onlineContacts > 0 ? 'text-emerald-600' : 'text-gray-400'} />}
          value={stats.onlineContacts}
          label="online"
          color={stats.onlineContacts > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}
        />
      </div>

      {/* ── Pinned contacts (horizontal scroll) ── */}
      {pinnedContacts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <Pin size={11} className="text-amber-500" />
              Pinned
            </h2>
            <Link href="/contacts" className="text-[11px] text-indigo-600 hover:underline flex items-center gap-0.5">
              All <ChevronRight size={11} />
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
            {pinnedContacts.map(contact => (
              <PinnedContactChip key={contact.id} contact={contact} />
            ))}
          </div>
        </div>
      )}

      {/* ── Online now (only shown if > 0 and no pinned) ── */}
      {onlineContacts.length > 0 && pinnedContacts.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Online now
            </h2>
            <Link href="/contacts" className="text-[11px] text-indigo-600 hover:underline flex items-center gap-0.5">
              All <ChevronRight size={11} />
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
            {onlineContacts.map(contact => (
              <Link
                key={contact.id}
                href={`/contacts/${contact.id}`}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 w-14"
              >
                <div className="relative">
                  <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${avatarColor(contact.id)} flex items-center justify-center text-white text-xs font-bold`}>
                    {getInitials(contact.name)}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                </div>
                <span className="text-[10px] font-medium text-gray-600 truncate w-full text-center">
                  {contact.name.split(' ')[0]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Unified recent activity ── */}
      {hasActivity && activity.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
            <Link href="/calls" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              All history <ChevronRight size={11} />
            </Link>
          </div>
          <div className="divide-y divide-gray-50 px-1">
            {activity.map(item => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* ── CRM follow-up notes ── */}
      {annotatedCalls.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <NotebookPen size={14} className="text-amber-500" />
              Follow-ups
              <span className="text-xs font-normal text-gray-400">
                {annotatedCalls.length} note{annotatedCalls.length !== 1 ? 's' : ''}
              </span>
            </h2>
            <Link href="/calls" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              View all <ChevronRight size={11} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
            {annotatedCalls.map(call => (
              <Link
                key={call.id}
                href={`/calls/${call.id}`}
                className="block p-3.5 rounded-xl border border-amber-100 bg-amber-50 hover:bg-amber-50/80 hover:border-amber-200 transition-all group"
              >
                <div className="flex items-center justify-between mb-1.5">
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
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-gray-400">
                    {call.languagePair ? call.languagePair.replace('_', '→') : '—'} · {formatDuration(call.durationSeconds)}
                  </span>
                  <ArrowRight size={10} className="ml-auto text-amber-400 group-hover:text-amber-600 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state for brand-new users ── */}
      {!hasActivity && (
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100 p-8 text-center">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Globe size={28} className="text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Welcome to LifeSync</h3>
          <p className="text-sm text-gray-500 max-w-xs mx-auto mb-5">
            Break language barriers with real-time translation on every channel.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              href="/room"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
            >
              <Globe size={15} />
              Try Room Mode
            </Link>
            <Link
              href="/contacts"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Users size={15} />
              Find contacts
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}
