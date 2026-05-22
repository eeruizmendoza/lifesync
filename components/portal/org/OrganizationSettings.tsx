'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Mail, Shield, Trash2, Plus, Copy, Check } from 'lucide-react';
import type { Organization, OrgMember, OrgInvite } from '@/lib/database/organizations';

interface OrganizationSettingsProps {
  userId: string;
  orgId: string | null;
}

export function OrganizationSettings({ userId, orgId }: OrganizationSettingsProps) {
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'members' | 'invites' | 'settings'>('members');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Settings form
  const [orgName, setOrgName] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);

  const getToken = () => localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';

  const fetchAll = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const token = getToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const [orgRes, membersRes, invitesRes] = await Promise.all([
        fetch('/api/orgs', { headers, credentials: 'include' }),
        fetch('/api/orgs/members', { headers, credentials: 'include' }),
        fetch('/api/orgs/invites', { headers, credentials: 'include' }),
      ]);

      const orgData = await orgRes.json();
      const membersData = await membersRes.json();
      const invitesData = invitesRes.ok ? await invitesRes.json() : { invites: [] };

      setOrg(orgData.org ?? null);
      setOrgName(orgData.org?.name ?? '');
      setMembers(membersData.members ?? []);
      setInvites(invitesData.invites ?? []);
    } catch {
      setError('Failed to load organization data');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orgs/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to send invite'); return; }
      setInvites(prev => [data.invite, ...prev]);
      setInviteUrl(data.inviteUrl);
      setInviteEmail('');
      setSuccess('Invite created! Share the link below with your teammate.');
    } catch {
      setError('Network error');
    } finally {
      setInviteLoading(false);
    }
  };

  const removeMember = async (targetUserId: string) => {
    try {
      const res = await fetch(`/api/orgs/members?userId=${targetUserId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to remove member'); return; }
      setMembers(prev => prev.filter(m => m.userId !== targetUserId));
    } catch {
      setError('Network error');
    }
  };

  const changeRole = async (targetUserId: string, role: OrgMember['role']) => {
    try {
      const res = await fetch('/api/orgs/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ userId: targetUserId, role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to change role'); return; }
      setMembers(prev => prev.map(m => m.userId === targetUserId ? { ...m, role } : m));
    } catch {
      setError('Network error');
    }
  };

  const saveSettings = async () => {
    setSettingsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orgs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name: orgName }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return; }
      setOrg(data.org);
      setSuccess('Organization updated!');
    } catch {
      setError('Network error');
    } finally {
      setSettingsLoading(false);
    }
  };

  const copyLink = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const myRole = members.find(m => m.userId === userId)?.role ?? null;
  const isAdmin = myRole === 'owner' || myRole === 'admin';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="text-5xl mb-4">🏢</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">No organization yet</h2>
        <p className="text-gray-500 mb-6">Create an organization to start collaborating with your team.</p>
        <CreateOrgCard userId={userId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm flex justify-between">
          <span>✅ {success}</span>
          <button onClick={() => setSuccess(null)}>✕</button>
        </div>
      )}

      {/* Invite link */}
      {inviteUrl && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-blue-800 text-sm font-medium mb-2">Share this invite link:</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="flex-1 text-xs border border-blue-200 rounded-lg px-3 py-2 bg-white text-gray-700 font-mono"
            />
            <button
              onClick={copyLink}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium flex items-center gap-1 hover:bg-blue-700"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {(['members', 'invites', 'settings'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'members' && ` (${members.length})`}
              {t === 'invites' && ` (${invites.length})`}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Members tab */}
          {tab === 'members' && (
            <div className="space-y-3">
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm flex-shrink-0">
                    {(member.name ?? member.email ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{member.name ?? member.email}</p>
                    {member.name && member.email && (
                      <p className="text-xs text-gray-500 truncate">{member.email}</p>
                    )}
                  </div>
                  {isAdmin && member.userId !== userId ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={member.role}
                        onChange={e => changeRole(member.userId, e.target.value as OrgMember['role'])}
                        className="text-xs border border-gray-200 rounded px-2 py-1"
                      >
                        {['viewer', 'member', 'admin'].map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeMember(member.userId)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Remove member"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      member.role === 'owner' ? 'bg-yellow-100 text-yellow-800' :
                      member.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                      member.role === 'member' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {member.role}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Invites tab */}
          {tab === 'invites' && (
            <div className="space-y-4">
              {isAdmin && (
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendInvite()}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as 'admin' | 'member' | 'viewer')}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={sendInvite}
                    disabled={inviteLoading || !inviteEmail.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Plus size={14} />
                    {inviteLoading ? 'Sending…' : 'Invite'}
                  </button>
                </div>
              )}

              {invites.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">No pending invites</p>
              ) : (
                invites.map(invite => (
                  <div key={invite.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Mail size={16} className="text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{invite.email}</p>
                      <p className="text-xs text-gray-500">
                        Expires {new Date(invite.expiresAt).toLocaleDateString()} · {invite.role}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Settings tab */}
          {tab === 'settings' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Slug (URL)</label>
                <p className="text-sm text-gray-400 font-mono">{org?.slug}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Plan</label>
                <p className="text-sm capitalize text-gray-700">{org?.plan}</p>
              </div>
              {isAdmin && (
                <button
                  onClick={saveSettings}
                  disabled={settingsLoading || orgName.trim() === org?.name}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {settingsLoading ? 'Saving…' : 'Save Changes'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateOrgCard({ userId }: { userId: string }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
    try {
      const res = await fetch('/api/orgs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create organization'); return; }
      // Store new token and reload
      if (data.token) localStorage.setItem('auth_token', data.token);
      window.location.reload();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto">
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <input
        type="text"
        placeholder="Your Company Name"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && create()}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 mb-3"
      />
      <button
        onClick={create}
        disabled={loading || !name.trim()}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Creating…' : 'Create Organization'}
      </button>
    </div>
  );
}
