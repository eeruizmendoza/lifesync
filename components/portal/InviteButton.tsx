'use client';

/**
 * InviteButton
 * A portable "Invite a teammate" button that generates a shareable link.
 * Any org member can use it. Shows a copy-link modal.
 *
 * Usage:
 *   <InviteButton />
 *   <InviteButton variant="icon" />
 */

import { useState } from 'react';
import { UserPlus, Copy, Check, X, Loader2, Link } from 'lucide-react';

interface InviteButtonProps {
  variant?: 'default' | 'icon' | 'ghost';
  className?: string;
}

export function InviteButton({ variant = 'default', className = '' }: InviteButtonProps) {
  const [open, setOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('your organization');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getToken = () =>
    typeof window !== 'undefined'
      ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || ''
      : '';

  const generateLink = async () => {
    setLoading(true);
    setError(null);
    setInviteUrl(null);
    try {
      const token = getToken();
      const res = await fetch('/api/orgs/invites/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ role: 'member' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate link');
      setInviteUrl(data.inviteUrl);
      setOrgName(data.orgName ?? 'your organization');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite link');
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    generateLink();
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  };

  const buttonClass = {
    default: `flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors ${className}`,
    ghost: `flex items-center gap-2 px-4 py-2 text-blue-600 text-sm font-medium hover:bg-blue-50 rounded-xl transition-colors ${className}`,
    icon: `p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors ${className}`,
  }[variant];

  return (
    <>
      <button onClick={handleOpen} className={buttonClass} title="Invite a teammate">
        <UserPlus size={variant === 'icon' ? 18 : 15} />
        {variant !== 'icon' && 'Invite teammate'}
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full z-10">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <UserPlus size={18} className="text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Invite a teammate</h2>
                <p className="text-sm text-gray-500">Share this link to add someone to {orgName}</p>
              </div>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-6 gap-2 text-gray-400">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Generating link…</span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-3">
                {error}
              </div>
            )}

            {inviteUrl && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <Link size={14} className="text-gray-400 flex-shrink-0" />
                  <p className="text-sm font-mono text-gray-700 flex-1 min-w-0 truncate">{inviteUrl}</p>
                </div>
                <button
                  onClick={handleCopy}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
                <p className="text-xs text-center text-gray-400">
                  Link expires in 7 days · anyone with the link can join as a member
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
