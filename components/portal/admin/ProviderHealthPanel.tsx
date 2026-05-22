'use client';

/**
 * ProviderHealthPanel
 * Shown on /admin — polls /api/providers/health every 30s.
 * Displays STT, Translation, and TTS provider health + circuit breaker states.
 */

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, Loader2, Activity } from 'lucide-react';

interface ProviderHealth {
  state: string;
  healthStatus: 'healthy' | 'degraded' | 'failing';
  successRate: string;
  totalRequests: number;
  totalFailures: number;
  avgResponseTimeMs: string;
  lastCheckTime: string;
}

interface HealthData {
  timestamp: string;
  summary: {
    healthy: string[];
    degraded: string[];
    failing: string[];
    totalProviders: number;
  };
  providers: Record<string, ProviderHealth>;
  recentAlerts: Array<{
    providerId: string;
    severity: string;
    message: string;
    timestamp: string;
  }>;
}

function StatusIcon({ status }: { status: 'healthy' | 'degraded' | 'failing' | 'unknown' }) {
  if (status === 'healthy') return <CheckCircle size={16} className="text-green-500" />;
  if (status === 'degraded') return <AlertTriangle size={16} className="text-yellow-500" />;
  if (status === 'failing') return <XCircle size={16} className="text-red-500" />;
  return <Activity size={16} className="text-gray-400" />;
}

function statusColor(status: string) {
  if (status === 'healthy') return 'text-green-700 bg-green-50 border-green-200';
  if (status === 'degraded') return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  if (status === 'failing') return 'text-red-700 bg-red-50 border-red-200';
  return 'text-gray-600 bg-gray-50 border-gray-200';
}

export function ProviderHealthPanel() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const getToken = () =>
    typeof window !== 'undefined'
      ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || ''
      : '';

  const fetchHealth = useCallback(async () => {
    setError(null);
    try {
      const token = getToken();
      const res = await fetch('/api/providers/health', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch provider health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const overallStatus = data
    ? data.summary.failing.length > 0
      ? 'failing'
      : data.summary.degraded.length > 0
      ? 'degraded'
      : 'healthy'
    : 'unknown';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${
            overallStatus === 'healthy' ? 'bg-green-500' :
            overallStatus === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
          } ${overallStatus === 'failing' ? 'animate-pulse' : ''}`} />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">AI Provider Health</h2>
            {lastRefresh && (
              <p className="text-xs text-gray-400">
                Last updated {lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Checking provider health…</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Summary pills */}
          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
              <CheckCircle size={12} />
              {data.summary.healthy.length} healthy
            </span>
            {data.summary.degraded.length > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">
                <AlertTriangle size={12} />
                {data.summary.degraded.length} degraded
              </span>
            )}
            {data.summary.failing.length > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                <XCircle size={12} />
                {data.summary.failing.length} failing
              </span>
            )}
          </div>

          {/* Provider rows */}
          {Object.keys(data.providers).length > 0 ? (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
              {Object.entries(data.providers).map(([name, p]) => (
                <div key={name} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-2.5">
                    <StatusIcon status={p.healthStatus} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{name}</p>
                      <p className="text-xs text-gray-400 font-mono">{p.state}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-xs text-gray-500">Success rate</p>
                      <p className="text-sm font-mono font-medium text-gray-900">{p.successRate}</p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-xs text-gray-500">Avg latency</p>
                      <p className="text-sm font-mono font-medium text-gray-900">{p.avgResponseTimeMs}ms</p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-xs text-gray-500">Requests</p>
                      <p className="text-sm font-mono font-medium text-gray-900">{p.totalRequests.toLocaleString()}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(p.healthStatus)}`}>
                      {p.healthStatus}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400 text-sm">
              No provider data available — providers may not have been initialized yet.
            </div>
          )}

          {/* Recent alerts */}
          {data.recentAlerts.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Recent Alerts</h3>
              <div className="space-y-1.5">
                {data.recentAlerts.slice(0, 5).map((alert, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${
                      alert.severity === 'critical' ? 'bg-red-50 border-red-200 text-red-700' :
                      alert.severity === 'warning'  ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                      'bg-gray-50 border-gray-200 text-gray-600'
                    }`}
                  >
                    <span className="flex-shrink-0 font-medium">{alert.providerId}</span>
                    <span className="flex-1">{alert.message}</span>
                    <span className="text-gray-400 whitespace-nowrap">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
