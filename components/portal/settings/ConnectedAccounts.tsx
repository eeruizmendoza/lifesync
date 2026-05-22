'use client';

/**
 * ConnectedAccounts — Phase 56
 * Manage connected Gmail and Outlook email accounts.
 * Shows connection status, last sync time, and disconnect option.
 */

import { useState, useEffect, useCallback } from 'react';
import { Mail, Unlink, RefreshCw, CheckCircle2, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

interface Account {
  id: string;
  provider: 'gmail' | 'outlook';
  email: string;
  displayName: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  connectedAt: string;
}

interface ProviderInfo {
  configured: boolean;
  authUrl: string;
}

interface AccountsData {
  accounts: Account[];
  providers: {
    gmail: ProviderInfo;
    outlook: ProviderInfo;
  };
}

const PROVIDER_LABELS: Record<string, { name: string; color: string; bg: string }> = {
  gmail:   { name: 'Gmail',   color: 'text-red-600',  bg: 'bg-red-50  border-red-100'  },
  outlook: { name: 'Outlook', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
};

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ConnectedAccounts() {
  const [data, setData]           = useState<AccountsData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [disconnecting, setDisc]  = useState<string | null>(null);
  const [syncing, setSyncing]     = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const token = getToken();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/email/accounts', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load accounts');
      setData(await res.json());
    } catch {
      setError('Could not load connected accounts');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Handle ?success= or ?error= from OAuth redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const err = params.get('error');
    if (success) {
      setSyncResult(`${success === 'gmail' ? 'Gmail' : 'Outlook'} connected successfully!`);
      load();
    } else if (err) {
      setError(`Connection failed: ${err}`);
    }
  }, [load]);

  const disconnect = async (accountId: string) => {
    setDisc(accountId);
    try {
      await fetch(`/api/email/accounts?accountId=${accountId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      await load();
    } catch {
      setError('Failed to disconnect account');
    } finally {
      setDisc(null);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/jobs/sync-emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.ok) {
        setSyncResult(`Synced: ${data.totalImported} new email${data.totalImported !== 1 ? 's' : ''} imported`);
        await load();
      }
    } catch {
      setError('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-gray-400 text-sm">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  const connected  = data?.accounts.filter(a => a.isActive) ?? [];
  const providers  = data?.providers ?? { gmail: { configured: false, authUrl: '' }, outlook: { configured: false, authUrl: '' } };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Connected Accounts</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Connect your email accounts to read and send translated emails from LifeSync.
          </p>
        </div>
        {connected.length > 0 && (
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>

      {/* Status messages */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      {syncResult && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
          <CheckCircle2 size={14} />
          {syncResult}
        </div>
      )}

      {/* Connected accounts list */}
      {connected.length > 0 && (
        <div className="space-y-3">
          {connected.map(account => {
            const meta = PROVIDER_LABELS[account.provider] ?? PROVIDER_LABELS.gmail;
            return (
              <div
                key={account.id}
                className={`flex items-center gap-3 p-4 rounded-xl border ${meta.bg}`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.bg}`}>
                  <Mail size={17} className={meta.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {account.displayName ?? account.email}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {meta.name} · {account.email}
                  </p>
                  {account.lastSyncedAt && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Last synced: {relativeTime(account.lastSyncedAt)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => disconnect(account.id)}
                  disabled={disconnecting === account.id}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {disconnecting === account.id
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Unlink size={12} />}
                  Disconnect
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Connect new account */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {connected.length > 0 ? 'Add another account' : 'Connect an account'}
        </p>

        {/* Gmail */}
        <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
              <Mail size={17} className="text-red-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Gmail</p>
              <p className="text-xs text-gray-500">
                {providers.gmail.configured
                  ? 'Read & send translated emails from your Gmail inbox'
                  : 'GOOGLE_CLIENT_ID not configured'}
              </p>
            </div>
          </div>
          {providers.gmail.configured ? (
            <a
              href={`${providers.gmail.authUrl}?token=${token}`}
              className="flex items-center gap-1.5 text-xs font-medium bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors"
            >
              <ExternalLink size={11} />
              Connect
            </a>
          ) : (
            <span className="text-xs text-gray-400">Not configured</span>
          )}
        </div>

        {/* Outlook */}
        <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Mail size={17} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Outlook / Microsoft 365</p>
              <p className="text-xs text-gray-500">
                {providers.outlook.configured
                  ? 'Read & send translated emails from your Outlook inbox'
                  : 'MICROSOFT_CLIENT_ID not configured'}
              </p>
            </div>
          </div>
          {providers.outlook.configured ? (
            <a
              href={`${providers.outlook.authUrl}?token=${token}`}
              className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ExternalLink size={11} />
              Connect
            </a>
          ) : (
            <span className="text-xs text-gray-400">Not configured</span>
          )}
        </div>
      </div>
    </div>
  );
}
