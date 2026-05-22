'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Play, AlertTriangle, Cpu } from 'lucide-react';

interface ModelConfig {
  type: string;
  activeModel: string;
  previousModel: string;
  fallbackModel: string;
  lastSwitchedAt: string;
  improvementPercent: number;
  enabled: boolean;
}

interface ModelMetrics {
  model_type: string;
  model_name: string;
  latency_ms: number;
  latency_p95: number;
  latency_p99: number;
  error_rate: number;
  success_rate: number;
  quality_score: number;
  cost_per_unit: number;
  total_cost_today: number;
  requests_total: number;
  requests_last_hour: number;
  requests_last_minute: number;
  measured_at: string;
}

interface BenchmarkResult {
  model_type: string;
  current_model: string;
  new_model: string;
  improvement: number;
  should_switch: boolean;
  confidence: number;
  recommended_at: string;
}

interface Fallback {
  primary_model: string;
  fallback_model: string;
  reason: string;
  fallback_time: string;
  restored_at: string | null;
}

const MODEL_LABELS: Record<string, string> = {
  stt: 'Speech-to-Text',
  translation: 'Translation',
  tts: 'Text-to-Speech',
};

export function AdminModelsPanel() {
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [benchmarking, setBenchmarking] = useState<'stt' | 'translation' | 'tts' | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareForm, setCompareForm] = useState({ type: 'stt', currentModel: '', newModel: '', language: 'en' });
  const [compareResult, setCompareResult] = useState<string | null>(null);

  const getToken = () =>
    typeof window !== 'undefined'
      ? (localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '')
      : '';

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/models/status', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch model status');
      setStatusData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 30_000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const triggerBenchmark = async (type: 'stt' | 'translation' | 'tts') => {
    setBenchmarking(type);
    try {
      await fetch(`/api/models/benchmark?type=${type}&action=benchmark`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      await fetchStatus();
    } catch { /* ignore */ }
    finally { setBenchmarking(null); }
  };

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    setComparing(true);
    setCompareResult(null);
    try {
      const res = await fetch('/api/models/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(compareForm),
      });
      const data = await res.json();
      setCompareResult(data.message ?? (res.ok ? 'Done' : 'Failed'));
      await fetchStatus();
      setCompareForm({ type: 'stt', currentModel: '', newModel: '', language: 'en' });
    } catch (err) {
      setCompareResult('Error: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setComparing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
    </div>
  );

  if (error || !statusData) return (
    <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-100">
      <AlertTriangle size={18} className="text-red-500" />
      <p className="text-sm text-red-700">{error ?? 'No data available'}</p>
      <button onClick={fetchStatus} className="ml-auto text-xs text-red-600 hover:underline">Retry</button>
    </div>
  );

  const { models, recentBenchmarks, activeFallbacks, timestamp } = statusData;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Last updated: {new Date(timestamp).toLocaleString()}</p>
        <button
          onClick={fetchStatus}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Active fallbacks warning */}
      {activeFallbacks?.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <AlertTriangle size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-yellow-900">Active Fallbacks</p>
            {activeFallbacks.map((fb: Fallback, i: number) => (
              <p key={i} className="text-xs text-yellow-800 mt-1">
                <strong>{fb.primary_model}</strong> → <strong>{fb.fallback_model}</strong>
                {' '}— {fb.reason} ({new Date(fb.fallback_time).toLocaleString()})
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Model cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['stt', 'translation', 'tts'] as const).map(type => {
          const config: ModelConfig | null = models?.[type]?.config ?? null;
          const metrics: ModelMetrics | null = models?.[type]?.metrics ?? null;
          return (
            <div key={type} className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Cpu size={16} className="text-blue-500" />
                <h3 className="font-semibold text-gray-900">{MODEL_LABELS[type]}</h3>
              </div>

              <dl className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Active Model</dt>
                  <dd className="font-mono font-semibold text-gray-900 truncate max-w-[120px]">{config?.activeModel ?? 'N/A'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Fallback</dt>
                  <dd className="font-mono text-gray-700 truncate max-w-[120px]">{config?.fallbackModel ?? 'N/A'}</dd>
                </div>
                {metrics && <>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Latency p95</dt>
                    <dd className="font-semibold text-gray-900">{metrics.latency_p95}ms</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Error Rate</dt>
                    <dd className="font-semibold text-gray-900">{(metrics.error_rate * 100).toFixed(2)}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Quality Score</dt>
                    <dd className="font-semibold text-gray-900">{metrics.quality_score.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Cost Today</dt>
                    <dd className="font-semibold text-gray-900">${metrics.total_cost_today.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Req/hr</dt>
                    <dd className="font-semibold text-gray-900">{metrics.requests_last_hour}</dd>
                  </div>
                </>}
              </dl>

              <button
                onClick={() => triggerBenchmark(type)}
                disabled={benchmarking === type}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {benchmarking === type
                  ? <><div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Benchmarking…</>
                  : <><Play size={13} />Run Benchmark</>
                }
              </button>
            </div>
          );
        })}
      </div>

      {/* Manual comparison */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Manual Model Comparison</h3>
        <form onSubmit={handleCompare} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={compareForm.type}
                onChange={e => setCompareForm({ ...compareForm, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900"
              >
                <option value="stt">Speech-to-Text</option>
                <option value="translation">Translation</option>
                <option value="tts">Text-to-Speech</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Current Model</label>
              <input
                type="text"
                value={compareForm.currentModel}
                onChange={e => setCompareForm({ ...compareForm, currentModel: e.target.value })}
                placeholder="e.g., whisper-v3"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">New Model</label>
              <input
                type="text"
                value={compareForm.newModel}
                onChange={e => setCompareForm({ ...compareForm, newModel: e.target.value })}
                placeholder="e.g., deepgram-nova-2"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Language</label>
              <input
                type="text"
                value={compareForm.language}
                onChange={e => setCompareForm({ ...compareForm, language: e.target.value })}
                placeholder="en, es, zh…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900"
              />
            </div>
          </div>

          {compareResult && (
            <p className="text-sm px-3 py-2 bg-gray-50 rounded-lg text-gray-700">{compareResult}</p>
          )}

          <button
            type="submit"
            disabled={comparing || !compareForm.currentModel || !compareForm.newModel}
            className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {comparing ? 'Comparing…' : 'Compare Models'}
          </button>
        </form>
      </div>

      {/* Recent benchmarks */}
      {recentBenchmarks?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Recent Benchmarks</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Type', 'Current', 'New', 'Improvement', 'Confidence', 'Switch?', 'Date'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentBenchmarks.map((b: BenchmarkResult, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-900">{b.model_type.toUpperCase()}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{b.current_model}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{b.new_model}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-green-600">+{(b.improvement * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-xs text-gray-700">{(b.confidence * 100).toFixed(0)}%</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${b.should_switch ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {b.should_switch ? 'YES' : 'NO'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{new Date(b.recommended_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
