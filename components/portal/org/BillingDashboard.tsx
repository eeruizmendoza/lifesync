'use client';

import { useEffect, useState, useCallback } from 'react';
import { CreditCard, Zap, Users, HardDrive, Phone, ExternalLink } from 'lucide-react';
import type { Organization, PlanLimits } from '@/lib/database/organizations';

interface BillingDashboardProps {
  userId: string;
  orgId: string | null;
}

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$299',
    description: 'For small teams getting started',
    features: ['10 users', '50 GB storage', '500 calls/month', 'Analytics'],
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$599',
    description: 'For growing businesses',
    features: ['50 users', '200 GB storage', '2,000 calls/month', 'API access', 'Priority support'],
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$999',
    description: 'Unlimited scale',
    features: ['Unlimited users', 'Unlimited storage', 'Unlimited calls', 'SSO', 'Custom domain', 'SLA'],
    highlight: false,
  },
];

export function BillingDashboard({ userId, orgId }: BillingDashboardProps) {
  const [org, setOrg] = useState<Organization | null>(null);
  const [quotas, setQuotas] = useState<{ withinLimits: boolean; violations: string[] } | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOrg = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
    try {
      const res = await fetch('/api/orgs', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      const data = await res.json();
      setOrg(data.org ?? null);
      setQuotas(data.quotas ?? null);
      setMemberCount(data.memberCount ?? 0);
    } catch {
      setError('Failed to load organization details');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchOrg(); }, [fetchOrg]);

  const handleUpgrade = async (plan: string) => {
    setActionLoading(plan);
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? 'Failed to start checkout');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setActionLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setActionLoading('portal');
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? 'Failed to open billing portal');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setActionLoading(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 0) return 'Unlimited';
    if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(0)} TB`;
    return `${(bytes / 1e9).toFixed(0)} GB`;
  };

  const pct = (used: number, max: number) =>
    max <= 0 ? 0 : Math.min(100, Math.round((used / max) * 100));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
        <p className="text-yellow-800 font-medium mb-4">You don't have an organization yet.</p>
        <a href="/portal/organization" className="text-blue-600 underline text-sm">
          Create or join an organization
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {/* Current plan */}
      {org && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Current Plan</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              org.plan === 'trial' ? 'bg-gray-100 text-gray-700' :
              org.plan === 'starter' ? 'bg-blue-100 text-blue-700' :
              org.plan === 'pro' ? 'bg-purple-100 text-purple-700' :
              'bg-gold-100 bg-yellow-100 text-yellow-800'
            }`}>
              {org.plan.charAt(0).toUpperCase() + org.plan.slice(1)}
            </span>
          </div>

          {/* Usage bars */}
          <div className="space-y-4">
            <UsageBar
              icon={<Phone size={16} />}
              label="Calls this month"
              used={org.callsThisMonth}
              max={org.maxCallsPerMonth}
              unit="calls"
              formatValue={(v) => v.toLocaleString()}
              formatMax={(m) => m < 0 ? '∞' : m.toLocaleString()}
            />
            <UsageBar
              icon={<HardDrive size={16} />}
              label="Storage used"
              used={org.storageUsedBytes}
              max={org.maxStorageBytes}
              formatValue={(v) => formatBytes(v)}
              formatMax={(m) => formatBytes(m)}
            />
            <UsageBar
              icon={<Users size={16} />}
              label="Team seats"
              used={memberCount}
              max={org.maxUsers}
              unit="users"
              formatValue={(v) => v.toString()}
              formatMax={(m) => m < 0 ? '∞' : m.toString()}
            />
          </div>

          {quotas && !quotas.withinLimits && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
              {quotas.violations.map((v, i) => (
                <p key={i} className="text-red-700 text-sm">⚠️ {v}</p>
              ))}
            </div>
          )}

          {org.stripeCustomerId && (
            <button
              onClick={handleManageBilling}
              disabled={actionLoading === 'portal'}
              className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
            >
              <ExternalLink size={14} />
              {actionLoading === 'portal' ? 'Opening billing portal…' : 'Manage billing & invoices'}
            </button>
          )}
        </div>
      )}

      {/* Plan selection */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Plans</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {PLANS.map(plan => {
            const isCurrent = org?.plan === plan.id;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-5 flex flex-col ${
                  plan.highlight
                    ? 'border-blue-500 shadow-md'
                    : 'border-gray-200'
                }`}
              >
                {plan.highlight && (
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {plan.price}<span className="text-sm font-normal text-gray-500">/mo</span>
                </p>
                <p className="text-sm text-gray-500 mt-1 mb-4">{plan.description}</p>
                <ul className="space-y-1.5 flex-1 mb-4">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="text-green-500 flex-shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !isCurrent && handleUpgrade(plan.id)}
                  disabled={isCurrent || !!actionLoading}
                  className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-colors ${
                    isCurrent
                      ? 'bg-gray-100 text-gray-500 cursor-default'
                      : plan.highlight
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'border border-blue-600 text-blue-600 hover:bg-blue-50'
                  } disabled:opacity-50`}
                >
                  {isCurrent ? 'Current plan' :
                    actionLoading === plan.id ? 'Redirecting…' : 'Upgrade'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UsageBar({
  icon, label, used, max, formatValue, formatMax,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  max: number;
  unit?: string;
  formatValue: (v: number) => string;
  formatMax: (m: number) => string;
}) {
  const percentage = max < 0 ? 0 : Math.min(100, Math.round((used / max) * 100));
  const isWarning = percentage >= 80;
  const isCritical = percentage >= 95;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          {icon}
          {label}
        </div>
        <span className="text-sm text-gray-500">
          {formatValue(used)} / {formatMax(max)}
        </span>
      </div>
      {max >= 0 && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isCritical ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-blue-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}
