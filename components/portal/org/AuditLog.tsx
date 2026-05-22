'use client';

/**
 * AuditLog
 * Displays the org security audit log — shown in the Organization page for admins/owners.
 * Shows last 50 events with pagination, event type icons, and actor names.
 */

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Key, Webhook, UserPlus, UserMinus, Settings, CreditCard, FileText, RefreshCw, ChevronDown } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditEvent {
  id: string;
  actorId: string | null;
  actorName: string | null;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: diff > 86_400_000 * 365 ? 'numeric' : undefined });
}

const EVENT_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  'api_key.created':      { icon: <Key size={13} />,       label: 'API key created',       color: 'bg-blue-50 text-blue-700' },
  'api_key.revoked':      { icon: <Key size={13} />,       label: 'API key revoked',       color: 'bg-red-50 text-red-600' },
  'webhook.created':      { icon: <Webhook size={13} />,   label: 'Webhook added',         color: 'bg-purple-50 text-purple-700' },
  'webhook.deleted':      { icon: <Webhook size={13} />,   label: 'Webhook removed',       color: 'bg-red-50 text-red-600' },
  'webhook.toggled':      { icon: <Webhook size={13} />,   label: 'Webhook toggled',       color: 'bg-gray-100 text-gray-600' },
  'webhook.tested':       { icon: <Webhook size={13} />,   label: 'Webhook tested',        color: 'bg-gray-100 text-gray-600' },
  'member.invited':       { icon: <UserPlus size={13} />,  label: 'Member invited',        color: 'bg-green-50 text-green-700' },
  'member.joined':        { icon: <UserPlus size={13} />,  label: 'Member joined',         color: 'bg-green-50 text-green-700' },
  'member.removed':       { icon: <UserMinus size={13} />, label: 'Member removed',        color: 'bg-red-50 text-red-600' },
  'member.role_changed':  { icon: <UserPlus size={13} />,  label: 'Role changed',          color: 'bg-amber-50 text-amber-700' },
  'org.settings_updated': { icon: <Settings size={13} />,  label: 'Org settings updated',  color: 'bg-gray-100 text-gray-600' },
  'org.plan_changed':     { icon: <CreditCard size={13} />,label: 'Plan changed',          color: 'bg-amber-50 text-amber-700' },
  'recording.accessed':   { icon: <FileText size={13} />,  label: 'Recording accessed',    color: 'bg-gray-100 text-gray-600' },
  'recording.deleted':    { icon: <FileText size={13} />,  label: 'Recording deleted',     color: 'bg-red-50 text-red-600' },
  'org.created':          { icon: <ShieldCheck size={13} />,label: 'Org created',           color: 'bg-green-50 text-green-700' },
};

function eventMeta(type: string) {
  return EVENT_META[type] ?? { icon: <ShieldCheck size={13} />, label: type.replace('.', ' '), color: 'bg-gray-100 text-gray-600' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const LIMIT = 20;

  const fetchEvents = useCallback(async (off: number, append = false) => {
    const token = getToken();
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/orgs/audit-log?limit=${LIMIT}&offset=${off}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json();
        // 403 = not admin — hide component
        if (res.status === 403) { setLoading(false); return; }
        throw new Error(d.error ?? 'Failed to load');
      }
      const data = await res.json();
      setTotal(data.total ?? 0);
      setEvents(prev => append ? [...prev, ...(data.events ?? [])] : (data.events ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { fetchEvents(0); }, [fetchEvents]);

  const loadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    fetchEvents(newOffset, true);
  };

  const refresh = () => {
    setOffset(0);
    fetchEvents(0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-800">Security Audit Log</h3>
          {total > 0 && <span className="text-xs text-gray-400">{total} events</span>}
        </div>
        <button
          onClick={refresh}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs">
          ⚠️ {error}
        </div>
      )}

      {events.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <ShieldCheck size={22} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No audit events yet</p>
          <p className="text-xs text-gray-400 mt-1">Security events will appear here as they happen</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {events.map(ev => {
            const meta = eventMeta(ev.eventType);
            return (
              <div key={ev.id} className="flex items-start gap-3 px-3 py-2.5 bg-white rounded-lg hover:bg-gray-50 transition-colors">
                <span className={`mt-0.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${meta.color}`}>
                  {meta.icon}
                  {meta.label}
                </span>
                <div className="flex-1 min-w-0">
                  {ev.targetName && (
                    <span className="text-xs text-gray-700 font-mono truncate block max-w-xs">
                      {ev.targetName.length > 60 ? ev.targetName.slice(0, 57) + '…' : ev.targetName}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    by {ev.actorName ?? 'System'} · {formatTime(ev.createdAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {events.length < total && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="flex items-center gap-1.5 mx-auto text-xs text-gray-500 hover:text-gray-700 py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          {loadingMore
            ? <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            : <ChevronDown size={13} />
          }
          Load more ({total - events.length} remaining)
        </button>
      )}
    </div>
  );
}
