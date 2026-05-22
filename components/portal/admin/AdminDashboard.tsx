'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Users,
  Phone,
  HardDrive,
  TrendingUp,
  Shield,
  ShieldOff,
  ChevronDown,
  Search,
  RefreshCw,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlatformStats {
  totalOrgs: number;
  activeOrgs: number;
  suspendedOrgs: number;
  totalUsers: number;
  trialOrgs: number;
  starterOrgs: number;
  proOrgs: number;
  enterpriseOrgs: number;
  totalCallsThisMonth: number;
  totalStorageBytes: number;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: 'trial' | 'starter' | 'pro' | 'enterprise';
  isActive: boolean;
  isSuspended: boolean;
  suspensionReason: string | null;
  memberCount: number;
  callsThisMonth: number;
  maxCallsPerMonth: number;
  storageUsedBytes: number;
  maxStorageBytes: number;
  stripeCustomerId: string | null;
  createdAt: string;
  ownerPhone: string | null;
  ownerName: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  trial:      'bg-gray-100 text-gray-600',
  starter:    'bg-blue-100 text-blue-700',
  pro:        'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

const PLANS = ['trial', 'starter', 'pro', 'enterprise'] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function UsageMini({ used, max, label }: { used: number; max: number; label: string }) {
  if (!max) return <span className="text-gray-400 text-xs">—</span>;
  const pct = Math.min((used / max) * 100, 100);
  const color = pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-blue-500';
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-gray-500">{label}: {used}/{max}</div>
      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<Record<string, boolean>>({});

  const getToken = () =>
    (typeof window !== 'undefined'
      ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
      : null) || '';

  const authHeaders = useCallback(() => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  // Load stats
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/admin/stats', { headers: authHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStats(data.stats);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [authHeaders]);

  // Load orgs
  const loadOrgs = useCallback(async (currentPage: number, currentSearch: string) => {
    setLoading(true);
    setError('');
    try {
      const offset = currentPage * PAGE_SIZE;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        ...(currentSearch ? { search: currentSearch } : {}),
      });
      const res = await fetch(`/api/admin/orgs?${params}`, { headers: authHeaders(), credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setOrgs(data.orgs ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadOrgs(page, search); }, [loadOrgs, page, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput);
  };

  const adminAction = async (orgId: string, action: string, extra: Record<string, string> = {}) => {
    setUpdating(prev => ({ ...prev, [orgId]: true }));
    try {
      const res = await fetch('/api/admin/orgs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify({ orgId, action, ...extra }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Action failed');
      // Refresh both
      await Promise.all([loadStats(), loadOrgs(page, search)]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setUpdating(prev => ({ ...prev, [orgId]: false }));
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-8">
      {/* Platform Stats */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Platform Overview</h2>
        {statsLoading ? (
          <div className="flex items-center gap-2 text-gray-400 py-4">
            <Loader2 size={16} className="animate-spin" />
            Loading stats…
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard icon={Building2} label="Total Orgs" value={stats.totalOrgs} sub={`${stats.activeOrgs} active`} color="blue" />
            <StatCard icon={Users} label="Total Users" value={stats.totalUsers} color="purple" />
            <StatCard icon={Phone} label="Calls This Month" value={stats.totalCallsThisMonth.toLocaleString()} color="green" />
            <StatCard icon={HardDrive} label="Storage Used" value={formatBytes(stats.totalStorageBytes)} color="amber" />
            <StatCard icon={AlertTriangle} label="Suspended" value={stats.suspendedOrgs} color="red" />
          </div>
        ) : null}

        {/* Plan breakdown */}
        {stats && (
          <div className="mt-4 grid grid-cols-4 gap-3">
            {[
              { plan: 'trial', count: stats.trialOrgs },
              { plan: 'starter', count: stats.starterOrgs },
              { plan: 'pro', count: stats.proOrgs },
              { plan: 'enterprise', count: stats.enterpriseOrgs },
            ].map(({ plan, count }) => (
              <div key={plan} className={`rounded-xl px-4 py-3 flex items-center justify-between ${PLAN_COLORS[plan]}`}>
                <span className="text-sm font-medium capitalize">{plan}</span>
                <span className="text-xl font-bold">{count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Org list */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Organizations {total > 0 && <span className="text-gray-400 font-normal text-sm">({total})</span>}
          </h2>
          <div className="flex items-center gap-2">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Search orgs…"
                  className="pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48"
                />
              </div>
              <button type="submit" className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                Search
              </button>
            </form>
            <button
              onClick={() => Promise.all([loadStats(), loadOrgs(page, search)])}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-4">
            <AlertTriangle size={16} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <Building2 size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No organizations found</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Organization</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Plan</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Members</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Usage</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Owner</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orgs.map(org => (
                    <tr key={org.id} className={`hover:bg-gray-50 transition-colors ${org.isSuspended ? 'opacity-60' : ''}`}>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-gray-900">{org.name}</div>
                        <div className="text-xs text-gray-400">{org.slug}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(org.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${PLAN_COLORS[org.plan]}`}>
                          {org.plan}
                        </span>
                        {org.stripeCustomerId && (
                          <div className="text-xs text-gray-400 mt-1">Stripe ✓</div>
                        )}
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-gray-700">
                          <Users size={13} className="text-gray-400" />
                          {org.memberCount}
                        </div>
                      </td>

                      <td className="px-5 py-3.5 space-y-1">
                        <UsageMini used={org.callsThisMonth} max={org.maxCallsPerMonth} label="Calls" />
                        <UsageMini used={org.storageUsedBytes} max={org.maxStorageBytes} label="Storage" />
                      </td>

                      <td className="px-5 py-3.5">
                        {org.isSuspended ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium">
                              <XCircle size={11} />
                              Suspended
                            </span>
                            {org.suspensionReason && (
                              <div className="text-xs text-gray-400 mt-1 max-w-[140px] truncate" title={org.suspensionReason}>
                                {org.suspensionReason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">
                            <CheckCircle size={11} />
                            Active
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="text-sm text-gray-700">{org.ownerName ?? '—'}</div>
                        <div className="text-xs text-gray-400">{org.ownerPhone ?? '—'}</div>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          {updating[org.id] ? (
                            <Loader2 size={16} className="animate-spin text-blue-500" />
                          ) : (
                            <>
                              {/* Plan selector */}
                              <div className="relative">
                                <select
                                  value={org.plan}
                                  onChange={e => adminAction(org.id, 'set_plan', { plan: e.target.value })}
                                  className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 pr-6 appearance-none bg-white focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                >
                                  {PLANS.map(p => (
                                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                                  ))}
                                </select>
                                <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                              </div>

                              {/* Suspend/Unsuspend */}
                              {org.isSuspended ? (
                                <button
                                  onClick={() => adminAction(org.id, 'unsuspend')}
                                  title="Unsuspend"
                                  className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                >
                                  <Shield size={15} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    const reason = prompt('Suspension reason (optional):');
                                    if (reason !== null) adminAction(org.id, 'suspend', { reason: reason || 'Suspended by admin' });
                                  }}
                                  title="Suspend"
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <ShieldOff size={15} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-sm text-gray-500">
                  Page {page + 1} of {totalPages} · {total} orgs
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
      </section>

      {/* Revenue breakdown */}
      {stats && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Snapshot</h2>
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">MRR (estimated)</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${(
                    stats.starterOrgs * 299 +
                    stats.proOrgs * 599 +
                    stats.enterpriseOrgs * 999
                  ).toLocaleString()}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">excluding trials</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Paying Orgs</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.starterOrgs + stats.proOrgs + stats.enterpriseOrgs}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">of {stats.totalOrgs} total</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Trial Conversion</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.totalOrgs > 0
                    ? Math.round(((stats.totalOrgs - stats.trialOrgs) / stats.totalOrgs) * 100)
                    : 0}%
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{stats.totalOrgs - stats.trialOrgs} converted</p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
