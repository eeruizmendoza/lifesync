'use client';

/**
 * MemberDirectory
 * Shows a searchable grid of all org members with activity stats:
 * role badge, presence dot, total calls/minutes, joined date, last active.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  Phone,
  Clock,
  Search,
  Loader2,
  AlertCircle,
  Crown,
  Shield,
  User,
  Eye,
} from 'lucide-react';

interface MemberStat {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
  isRecent: boolean;
  totalCalls: number;
  totalMinutes: number;
}

// Role badge config
const ROLE_CONFIG: Record<string, { label: string; color: string; icon: JSX.Element }> = {
  owner: {
    label: 'Owner',
    color: 'bg-amber-100 text-amber-700',
    icon: <Crown size={11} />,
  },
  admin: {
    label: 'Admin',
    color: 'bg-purple-100 text-purple-700',
    icon: <Shield size={11} />,
  },
  member: {
    label: 'Member',
    color: 'bg-blue-100 text-blue-700',
    icon: <User size={11} />,
  },
  viewer: {
    label: 'Viewer',
    color: 'bg-gray-100 text-gray-500',
    icon: <Eye size={11} />,
  },
};

const AVATAR_COLORS = [
  'from-blue-400 to-blue-600',
  'from-purple-400 to-purple-600',
  'from-green-400 to-green-600',
  'from-orange-400 to-orange-600',
  'from-pink-400 to-pink-600',
  'from-teal-400 to-teal-600',
  'from-indigo-400 to-indigo-600',
  'from-rose-400 to-rose-600',
];

function avatarColor(id: string): string {
  const n = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatJoined(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

export function MemberDirectory() {
  const [members, setMembers] = useState<MemberStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orgs/members/stats', {
        headers: { Authorization: `Bearer ${getToken()}` },
        credentials: 'include',
      });
      if (res.status === 400 || res.status === 403) {
        // Not in an org — hide silently
        setMembers([]);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMembers(data.members ?? []);
    } catch {
      setError('Could not load team directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? members.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.email ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : members;

  // Hide if no org or failed silently
  if (!loading && !error && members.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Users size={16} className="text-blue-500" />
            Team Directory
          </h2>
          {!loading && (
            <p className="text-xs text-gray-400 mt-0.5">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Search */}
        {!loading && members.length > 4 && (
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-40"
            />
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={22} className="animate-spin text-blue-400" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-100 text-sm text-red-700">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs font-medium hover:underline">Retry</button>
        </div>
      )}

      {/* Member grid */}
      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(member => {
            const role = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.member;
            return (
              <div
                key={member.userId}
                className="flex flex-col gap-3 p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all"
              >
                {/* Top: avatar + name + role */}
                <div className="flex items-start gap-3">
                  <div className="relative flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColor(member.userId)} flex items-center justify-center text-white text-sm font-semibold`}>
                      {getInitials(member.name)}
                    </div>
                    {member.isOnline && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />
                    )}
                    {!member.isOnline && member.isRecent && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-yellow-400 border-2 border-white" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{member.name}</p>
                    {member.email && (
                      <p className="text-xs text-gray-400 truncate">{member.email}</p>
                    )}
                    <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${role.color}`}>
                      {role.icon}
                      {role.label}
                    </span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50">
                  <div className="flex items-center gap-1.5">
                    <Phone size={12} className="text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{member.totalCalls}</p>
                      <p className="text-[10px] text-gray-400">calls</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className="text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{member.totalMinutes}</p>
                      <p className="text-[10px] text-gray-400">minutes</p>
                    </div>
                  </div>
                </div>

                {/* Footer: last active + joined */}
                <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-gray-50">
                  <span>
                    {member.isOnline
                      ? <span className="text-green-600 font-medium">● Online now</span>
                      : <>Active {relativeTime(member.lastSeenAt)}</>
                    }
                  </span>
                  <span>Joined {formatJoined(member.joinedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty search result */}
      {!loading && !error && filtered.length === 0 && members.length > 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          No members match "<span className="font-medium text-gray-600">{search}</span>"
        </div>
      )}
    </div>
  );
}
