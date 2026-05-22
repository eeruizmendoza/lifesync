'use client';

/**
 * WebhookManager
 * Register, test, enable/disable, and delete webhook endpoints.
 * Shown in Settings → Developer tab alongside ApiKeyManager.
 */

import { useState, useEffect, useCallback } from 'react';
import { Webhook, Plus, Trash2, Check, AlertTriangle, Play, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  isActive: boolean;
  lastTriggeredAt: string | null;
  lastStatusCode: number | null;
  failureCount: number;
  createdAt: string;
  createdBy: string;
  totalDeliveries: number;
  successfulDeliveries: number;
}

const ALL_EVENTS = [
  { id: 'call.completed',  label: 'Call completed',  desc: 'Fired when a call ends' },
  { id: 'call.missed',     label: 'Call missed',     desc: 'Fired when an incoming call is not answered' },
  { id: 'recording.ready', label: 'Recording ready', desc: 'Fired when a recording is uploaded' },
  { id: 'member.joined',   label: 'Member joined',   desc: 'Fired when someone accepts an org invite' },
  { id: 'quota.warning',   label: 'Quota warning',   desc: 'Fired at 80% and 100% of plan limits' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusColor(code: number | null, active: boolean, failures: number): string {
  if (!active) return 'text-gray-400';
  if (failures >= 5) return 'text-red-500';
  if (!code) return 'text-gray-400';
  if (code >= 200 && code < 300) return 'text-green-600';
  if (code >= 400) return 'text-red-500';
  return 'text-amber-500';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WebhookManager() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEndpoints = useCallback(async () => {
    const token = getToken();
    try {
      const res = await fetch('/api/webhooks', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json();
        if (res.status === 400) { setLoading(false); return; }
        throw new Error(d.error ?? 'Failed to load');
      }
      const data = await res.json();
      setEndpoints(data.endpoints ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEndpoints(); }, [fetchEndpoints]);

  const toggleEvent = (id: string) => {
    setNewEvents(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const createEndpoint = async () => {
    if (!newUrl.trim()) return;
    setCreating(true);
    setError(null);
    const token = getToken();
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          url: newUrl.trim(),
          description: newDesc.trim() || undefined,
          events: newEvents,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create'); return; }
      setRevealedSecret(data.secret);
      setShowCreate(false);
      setNewUrl('');
      setNewDesc('');
      setNewEvents([]);
      await fetchEndpoints();
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    const token = getToken();
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ isActive: !current }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to update'); return; }
      setEndpoints(prev => prev.map(e => e.id === id ? { ...e, isActive: !current } : e));
    } catch {
      setError('Network error');
    }
  };

  const deleteEndpoint = async (id: string) => {
    const token = getToken();
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to delete'); return; }
      setEndpoints(prev => prev.filter(e => e.id !== id));
      setDeleteId(null);
    } catch {
      setError('Network error');
    }
  };

  const testEndpoint = async (id: string) => {
    setTestingId(id);
    const token = getToken();
    try {
      const res = await fetch(`/api/webhooks/test/${id}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Test failed'); }
      else { await fetchEndpoints(); }
    } catch {
      setError('Network error');
    } finally {
      setTestingId(null);
    }
  };

  const copySecret = async (secret: string) => {
    await navigator.clipboard.writeText(secret).catch(() => {});
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook size={16} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-800">Webhooks</h3>
          <span className="text-xs text-gray-400">receive real-time events</span>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setRevealedSecret(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={13} />
          Add Endpoint
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs flex justify-between">
          ⚠️ {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Revealed secret banner */}
      {revealedSecret && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 font-medium">
              Save your signing secret — it will never be shown again. Use it to verify the <code>X-LifeSync-Signature</code> header.
            </p>
          </div>
          <div className="flex gap-2">
            <code className="flex-1 text-xs font-mono bg-white border border-amber-200 rounded-lg px-3 py-2 text-gray-800 overflow-x-auto whitespace-nowrap">
              {revealedSecret}
            </code>
            <button
              onClick={() => copySecret(revealedSecret)}
              className="flex items-center gap-1 px-3 py-2 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors"
            >
              {copiedSecret ? <Check size={13} /> : null}
              {copiedSecret ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button onClick={() => setRevealedSecret(null)} className="text-xs text-amber-600 hover:text-amber-800 mt-2">
            I've saved it — dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <p className="text-sm font-medium text-gray-800">New Webhook Endpoint</p>

          <div className="space-y-3">
            <input
              type="url"
              placeholder="https://your-server.com/webhook"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              autoFocus
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Event selection */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Events to receive <span className="text-gray-400">(leave empty for all)</span></p>
            <div className="space-y-2">
              {ALL_EVENTS.map(ev => (
                <label key={ev.id} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={newEvents.includes(ev.id)}
                    onChange={() => toggleEvent(ev.id)}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div>
                    <span className="text-xs font-medium text-gray-800 font-mono">{ev.id}</span>
                    <p className="text-xs text-gray-400">{ev.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={createEndpoint}
              disabled={creating || !newUrl.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Adding…' : 'Add Endpoint'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewUrl(''); setNewDesc(''); setNewEvents([]); }}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Endpoints list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : endpoints.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Webhook size={24} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No webhook endpoints yet</p>
          <p className="text-xs text-gray-400 mt-1">Register an endpoint to receive real-time events</p>
        </div>
      ) : (
        <div className="space-y-2">
          {endpoints.map(ep => (
            <div key={ep.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              {/* Main row */}
              <div className="flex items-start gap-3 p-4">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${ep.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-mono font-semibold text-gray-900 truncate max-w-sm">{ep.url}</p>
                    {ep.failureCount >= 5 && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                        {ep.failureCount} failures
                      </span>
                    )}
                  </div>
                  {ep.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{ep.description}</p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-1.5">
                    <span className="text-xs text-gray-400">
                      {ep.events.length === 0 ? 'All events' : ep.events.map(e => <code key={e} className="bg-gray-100 px-1 rounded text-xs mr-1">{e}</code>)}
                    </span>
                    {ep.lastTriggeredAt && (
                      <span className={`text-xs ${statusColor(ep.lastStatusCode, ep.isActive, ep.failureCount)}`}>
                        Last: {ep.lastStatusCode ?? '—'} • {timeAgo(ep.lastTriggeredAt)}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {ep.successfulDeliveries}/{ep.totalDeliveries} delivered
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Test */}
                  <button
                    onClick={() => testEndpoint(ep.id)}
                    disabled={testingId === ep.id}
                    title="Send test ping"
                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    {testingId === ep.id
                      ? <div className="w-3.5 h-3.5 border border-blue-500 border-t-transparent rounded-full animate-spin" />
                      : <Play size={13} />
                    }
                  </button>
                  {/* Toggle */}
                  <button
                    onClick={() => toggleActive(ep.id, ep.isActive)}
                    title={ep.isActive ? 'Disable' : 'Enable'}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                  >
                    {ep.isActive ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                  </button>
                  {/* Expand */}
                  <button
                    onClick={() => setExpandedId(expandedId === ep.id ? null : ep.id)}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                  >
                    {expandedId === ep.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {/* Delete */}
                  {deleteId === ep.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Delete?</span>
                      <button onClick={() => deleteEndpoint(ep.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Yes</button>
                      <button onClick={() => setDeleteId(null)} className="text-xs text-gray-400 hover:text-gray-600">No</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteId(ep.id)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete endpoint"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === ep.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                  <p className="text-xs text-gray-500">
                    <span className="font-medium">Created</span> {timeAgo(ep.createdAt)} by {ep.createdBy}
                    {' · '}
                    <span className="font-medium">Total delivered</span> {ep.totalDeliveries}
                    {' · '}
                    <span className="font-medium">Success rate</span>{' '}
                    {ep.totalDeliveries > 0
                      ? `${Math.round((ep.successfulDeliveries / ep.totalDeliveries) * 100)}%`
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 font-mono">Endpoint ID: {ep.id}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Docs note */}
      <div className="bg-blue-50 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-semibold mb-1">Verifying signatures</p>
        <p className="font-mono bg-white/60 rounded px-2 py-1.5 mt-1 text-blue-800 break-all">
          HMAC-SHA256(rawBody, secret) === X-LifeSync-Signature
        </p>
        <p className="mt-2 text-blue-600">
          Every delivery includes an <code>X-LifeSync-Signature</code> header. Verify it against the raw request body using your endpoint's signing secret. Your server must return <code>2xx</code> within 10 seconds.
        </p>
      </div>
    </div>
  );
}
