'use client';

/**
 * OrgAnalytics
 * Shows this-month stats, top language pairs, 30-day call sparkline,
 * and a live activity feed — all fetched from /api/orgs/stats and
 * /api/orgs/activity.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Phone,
  Clock,
  Users,
  Mic,
  Globe,
  TrendingUp,
  UserPlus,
  Mail,
  RefreshCw,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrgStats {
  thisMonth: {
    calls: number;
    minutes: number;
    activeMembers: number;
    recordings: number;
  };
  allTime: {
    calls: number;
    minutes: number;
    recordings: number;
  };
  topLanguagePairs: { pair: string; count: number; pct: number }[];
  callsByDay: { day: string; count: number }[];
}

interface ActivityEvent {
  id: string;
  type: 'call' | 'member_joined' | 'invite_sent';
  label: string;
  sublabel: string;
  ts: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{fmtNumber(Number(value))}</p>
        <p className="text-xs font-medium text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Sparkline (pure SVG, no dependencies) ───────────────────────────────────

function Sparkline({ data }: { data: { day: string; count: number }[] }) {
  if (data.length < 2) return null;
  const W = 280;
  const H = 48;
  const maxVal = Math.max(...data.map(d => d.count), 1);
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (d.count / maxVal) * H * 0.9 - H * 0.05;
    return `${x},${y}`;
  });
  const polylinePoints = pts.join(' ');
  const areaPoints = `0,${H} ${pts[0]} ${polylinePoints} ${W},${H}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#sparkGrad)" />
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Activity icon by type ────────────────────────────────────────────────────

const ACTIVITY_META = {
  call: { icon: Phone, bg: 'bg-blue-50', color: 'text-blue-600' },
  member_joined: { icon: UserPlus, bg: 'bg-green-50', color: 'text-green-600' },
  invite_sent: { icon: Mail, bg: 'bg-purple-50', color: 'text-purple-600' },
};

// ─── Main component ───────────────────────────────────────────────────────────

export function OrgAnalytics() {
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    const token = getToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const [statsRes, activityRes] = await Promise.all([
        fetch('/api/orgs/stats', { headers, credentials: 'include' }),
        fetch('/api/orgs/activity', { headers, credentials: 'include' }),
      ]);

      if (!statsRes.ok || !activityRes.ok) {
        if (statsRes.status === 400 || activityRes.status === 400) {
          // No org yet — not an error, just nothing to show
          setStats(null);
          setActivity([]);
          return;
        }
        throw new Error('Failed to load analytics');
      }

      const [statsData, activityData] = await Promise.all([
        statsRes.json(),
        activityRes.json(),
      ]);

      setStats(statsData);
      setActivity(activityData.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
        ⚠️ {error}
      </div>
    );
  }

  // No stats means no org
  if (!stats) return null;

  const { thisMonth, allTime, topLanguagePairs, callsByDay } = stats;
  const monthName = new Date().toLocaleString('default', { month: 'long' });

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Usage Analytics</h2>
          <p className="text-xs text-gray-500 mt-0.5">{monthName} · month to date</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={Phone}
          label="Calls this month"
          value={thisMonth.calls}
          sub={`${allTime.calls} all time`}
          color="bg-blue-500"
        />
        <StatCard
          icon={Clock}
          label="Minutes this month"
          value={thisMonth.minutes}
          sub={`${allTime.minutes} all time`}
          color="bg-indigo-500"
        />
        <StatCard
          icon={Users}
          label="Active members"
          value={thisMonth.activeMembers}
          sub="Made at least 1 call"
          color="bg-green-500"
        />
        <StatCard
          icon={Mic}
          label="Recordings"
          value={thisMonth.recordings}
          sub={`${allTime.recordings} all time`}
          color="bg-rose-500"
        />
      </div>

      {/* Language pairs + sparkline */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Top language pairs */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={15} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800">Top Language Pairs</h3>
            <span className="text-xs text-gray-400 ml-auto">this month</span>
          </div>
          {topLanguagePairs.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No calls this month yet</p>
          ) : (
            <div className="space-y-2.5">
              {topLanguagePairs.map(lp => (
                <div key={lp.pair}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-700 font-medium">{lp.pair}</span>
                    <span className="text-xs text-gray-400">{lp.count} calls · {lp.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${lp.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 30-day sparkline */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800">Call Volume</h3>
            <span className="text-xs text-gray-400 ml-auto">last 30 days</span>
          </div>
          {callsByDay.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No call data yet</p>
          ) : (
            <div>
              <Sparkline data={callsByDay} />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-gray-400">
                  {callsByDay[0]?.day?.slice(5) ?? ''}
                </span>
                <span className="text-[10px] text-gray-400">
                  {callsByDay[callsByDay.length - 1]?.day?.slice(5) ?? 'today'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Recent Activity</h3>
        {activity.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No recent activity</p>
        ) : (
          <ul className="space-y-0 divide-y divide-gray-50">
            {activity.map(event => {
              const meta = ACTIVITY_META[event.type] ?? ACTIVITY_META.call;
              const IconComp = meta.icon;
              return (
                <li key={event.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                    <IconComp size={13} className={meta.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-snug">{event.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{event.sublabel}</p>
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0 mt-0.5">
                    {timeAgo(event.ts)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
