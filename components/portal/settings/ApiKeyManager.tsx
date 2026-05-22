'use client';

/**
 * ApiKeyManager
 * Create, view, and revoke API keys for developer integrations.
 * Shows in the Organization or Settings page for admins/owners.
 */

import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff, AlertTriangle, RefreshCw } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyDays, setNewKeyDays] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    const token = getToken();
    try {
      const res = await fetch('/api/keys', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json();
        if (res.status === 400) { setLoading(false); return; } // no org
        throw new Error(d.error ?? 'Failed to load');
      }
      const data = await res.json();
      setKeys(data.keys ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    const token = getToken();
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          name: newKeyName.trim(),
          expiresInDays: newKeyDays ? parseInt(newKeyDays, 10) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create key'); return; }

      // Show the new key once
      setRevealedKey(data.key);
      setShowCreate(false);
      setNewKeyName('');
      setNewKeyDays('');
      await fetchKeys();
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    const token = getToken();
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to revoke'); return; }
      setKeys(prev => prev.filter(k => k.id !== id));
      setRevokeId(null);
    } catch {
      setError('Network error');
    }
  };

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key).catch(() => {});
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key size={16} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-800">API Keys</h3>
          <span className="text-xs text-gray-400">for developer integrations</span>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setRevealedKey(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={13} />
          New Key
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs flex justify-between">
          ⚠️ {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Revealed key banner — shown once after creation */}
      {revealedKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 font-medium">
              Copy your API key now — it will never be shown again.
            </p>
          </div>
          <div className="flex gap-2">
            <code className="flex-1 text-xs font-mono bg-white border border-amber-200 rounded-lg px-3 py-2 text-gray-800 overflow-x-auto whitespace-nowrap">
              {revealedKey}
            </code>
            <button
              onClick={() => copyKey(revealedKey)}
              className="flex items-center gap-1 px-3 py-2 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors"
            >
              {copiedKey ? <Check size={13} /> : <Copy size={13} />}
              {copiedKey ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setRevealedKey(null)}
            className="text-xs text-amber-600 hover:text-amber-800 mt-2"
          >
            I've saved it — dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-800">New API Key</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Key name (e.g. Production server)"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createKey()}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              autoFocus
            />
            <select
              value={newKeyDays}
              onChange={e => setNewKeyDays(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-2 bg-white"
            >
              <option value="">No expiry</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createKey}
              disabled={creating || !newKeyName.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating…' : 'Create Key'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewKeyName(''); }}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Keys list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Key size={24} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No API keys yet</p>
          <p className="text-xs text-gray-400 mt-1">Create a key to integrate LifeSync with your apps</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id} className="flex items-start gap-3 p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors">
              <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <Key size={15} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{k.name}</p>
                <code className="text-xs text-gray-500 font-mono">{k.prefix}•••••••••••••••••••</code>
                <div className="flex flex-wrap gap-3 mt-1.5">
                  <span className="text-xs text-gray-400">Created {timeAgo(k.createdAt)} by {k.createdBy}</span>
                  {k.lastUsedAt && (
                    <span className="text-xs text-green-600">Last used {timeAgo(k.lastUsedAt)}</span>
                  )}
                  {k.expiresAt && (
                    <span className={`text-xs ${new Date(k.expiresAt) < new Date() ? 'text-red-500' : 'text-amber-600'}`}>
                      Expires {new Date(k.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              {revokeId === k.id ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-500">Revoke?</span>
                  <button
                    onClick={() => revokeKey(k.id)}
                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                  >Yes</button>
                  <button
                    onClick={() => setRevokeId(null)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >No</button>
                </div>
              ) : (
                <button
                  onClick={() => setRevokeId(k.id)}
                  className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                  title="Revoke key"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Docs note */}
      <div className="bg-blue-50 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-semibold mb-1">Using your API key</p>
        <p className="font-mono bg-white/60 rounded px-2 py-1.5 mt-1 text-blue-800 break-all">
          Authorization: Bearer ls_live_…
        </p>
        <p className="mt-2 text-blue-600">
          Include your key in the <code>Authorization</code> header to authenticate API requests programmatically.
          Admin role required to create keys.
        </p>
      </div>
    </div>
  );
}
