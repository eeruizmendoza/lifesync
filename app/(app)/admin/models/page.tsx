'use client';

/**
 * AI Model Management Dashboard
 * Displays current model status, metrics, benchmarks, and allows manual comparison
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

export default function ModelsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<any>(null);
  const [benchmarking, setBenchmarking] = useState<'stt' | 'translation' | 'tts' | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareForm, setCompareForm] = useState({
    type: 'stt',
    currentModel: '',
    newModel: '',
    language: 'en',
  });

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  async function fetchStatus() {
    try {
      const response = await fetch('/api/models/status');
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();
      setStatusData(data);
    } catch (error) {
      console.error('Status fetch failed:', error);
    } finally {
      setLoading(false);
    }
  }

  async function triggerBenchmark(type: 'stt' | 'translation' | 'tts') {
    setBenchmarking(type);
    try {
      const response = await fetch(`/api/models/benchmark?type=${type}&action=benchmark`, {
        method: 'GET',
      });
      if (!response.ok) throw new Error('Benchmark failed');
      const data = await response.json();
      // Refresh status after benchmark
      await fetchStatus();
    } catch (error) {
      console.error('Benchmark failed:', error);
    } finally {
      setBenchmarking(null);
    }
  }

  async function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    setComparing(true);
    try {
      const response = await fetch('/api/models/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(compareForm),
      });
      if (!response.ok) throw new Error('Comparison failed');
      const data = await response.json();
      alert(data.message);
      // Refresh status
      await fetchStatus();
      // Reset form
      setCompareForm({
        type: 'stt',
        currentModel: '',
        newModel: '',
        language: 'en',
      });
    } catch (error) {
      console.error('Comparison failed:', error);
      alert('Comparison failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setComparing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!statusData) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto text-center text-red-600">
          Failed to load model status
        </div>
      </div>
    );
  }

  const { models, recentBenchmarks, activeFallbacks, timestamp } = statusData;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">AI Model Management</h1>
          <p className="text-gray-600">
            Last updated: {new Date(timestamp).toLocaleString()}
          </p>
        </div>

        {/* Model Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {(['stt', 'translation', 'tts'] as const).map((type) => {
            const config = models[type].config;
            const metrics = models[type].metrics;
            const title =
              type === 'stt'
                ? 'Speech-to-Text'
                : type === 'translation'
                  ? 'Translation'
                  : 'Text-to-Speech';

            return (
              <div key={type} className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>

                <div className="space-y-3 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Active Model</p>
                    <p className="font-mono font-semibold text-gray-900">
                      {config?.activeModel || 'N/A'}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-600">Fallback</p>
                    <p className="font-mono text-sm text-gray-700">
                      {config?.fallbackModel || 'N/A'}
                    </p>
                  </div>

                  {metrics && (
                    <>
                      <div>
                        <p className="text-sm text-gray-600">Latency (p95)</p>
                        <p className="font-semibold text-gray-900">{metrics.latency_p95}ms</p>
                      </div>

                      <div>
                        <p className="text-sm text-gray-600">Error Rate</p>
                        <p className="font-semibold text-gray-900">
                          {(metrics.error_rate * 100).toFixed(2)}%
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-gray-600">Quality Score</p>
                        <p className="font-semibold text-gray-900">
                          {metrics.quality_score.toFixed(2)}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-gray-600">Cost Today</p>
                        <p className="font-semibold text-gray-900">
                          ${metrics.total_cost_today.toFixed(2)}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-gray-600">Requests (last hour)</p>
                        <p className="font-semibold text-gray-900">{metrics.requests_last_hour}</p>
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={() => triggerBenchmark(type)}
                  disabled={benchmarking === type}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded font-medium transition"
                >
                  {benchmarking === type ? 'Benchmarking...' : 'Run Benchmark'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Active Fallbacks */}
        {activeFallbacks.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-yellow-900 mb-4">
              ⚠️ Active Fallbacks
            </h3>
            <div className="space-y-2">
              {activeFallbacks.map((fb: Fallback, idx: number) => (
                <div key={idx} className="text-sm text-yellow-800">
                  <strong>{fb.primary_model}</strong> → <strong>{fb.fallback_model}</strong>
                  <br />
                  <span className="text-xs text-yellow-700">
                    Reason: {fb.reason} ({new Date(fb.fallback_time).toLocaleString()})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manual Model Comparison */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Manual Model Comparison
          </h3>
          <form onSubmit={handleCompare} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={compareForm.type}
                  onChange={(e) =>
                    setCompareForm({ ...compareForm, type: e.target.value as any })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded font-medium text-gray-900"
                >
                  <option value="stt">Speech-to-Text</option>
                  <option value="translation">Translation</option>
                  <option value="tts">Text-to-Speech</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Model
                </label>
                <input
                  type="text"
                  value={compareForm.currentModel}
                  onChange={(e) =>
                    setCompareForm({ ...compareForm, currentModel: e.target.value })
                  }
                  placeholder="e.g., whisper-v3"
                  className="w-full px-3 py-2 border border-gray-300 rounded font-medium text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Model
                </label>
                <input
                  type="text"
                  value={compareForm.newModel}
                  onChange={(e) =>
                    setCompareForm({ ...compareForm, newModel: e.target.value })
                  }
                  placeholder="e.g., deepgram-nova-2"
                  className="w-full px-3 py-2 border border-gray-300 rounded font-medium text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Language
                </label>
                <input
                  type="text"
                  value={compareForm.language}
                  onChange={(e) =>
                    setCompareForm({ ...compareForm, language: e.target.value })
                  }
                  placeholder="en, es, zh, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded font-medium text-gray-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={comparing || !compareForm.currentModel || !compareForm.newModel}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded font-medium transition"
            >
              {comparing ? 'Comparing...' : 'Compare Models'}
            </button>
          </form>
        </div>

        {/* Recent Benchmarks */}
        {recentBenchmarks.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Recent Benchmarks</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">Type</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">
                      Current
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">New</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">
                      Improvement
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">
                      Confidence
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">Recommend</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentBenchmarks.map((benchmark: BenchmarkResult, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-mono text-gray-900">
                        {benchmark.model_type.toUpperCase()}
                      </td>
                      <td className="px-6 py-3 font-mono text-gray-700">
                        {benchmark.current_model}
                      </td>
                      <td className="px-6 py-3 font-mono text-gray-700">
                        {benchmark.new_model}
                      </td>
                      <td className="px-6 py-3 font-semibold text-green-600">
                        +{(benchmark.improvement * 100).toFixed(1)}%
                      </td>
                      <td className="px-6 py-3 text-gray-700">
                        {(benchmark.confidence * 100).toFixed(0)}%
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            benchmark.should_switch
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {benchmark.should_switch ? 'YES' : 'NO'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-600 text-xs">
                        {new Date(benchmark.recommended_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
