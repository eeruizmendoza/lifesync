'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Users, Zap, Check, ArrowRight, MessageSquare } from 'lucide-react';

interface OnboardingWizardProps {
  userId: string;
}

type Step = 'welcome' | 'create' | 'invite' | 'done';

const PLANS = [
  { id: 'trial', name: 'Free Trial', price: '$0', desc: '3 users · 100 calls/mo · 10 GB', highlight: false },
  { id: 'starter', name: 'Starter', price: '$299/mo', desc: '10 users · 500 calls/mo · 50 GB', highlight: true },
  { id: 'pro', name: 'Pro', price: '$599/mo', desc: '50 users · 2,000 calls/mo · 200 GB', highlight: false },
];

export function OnboardingWizard({ userId }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [orgName, setOrgName] = useState('');
  const [selectedPlan] = useState('trial'); // always start with trial
  const [inviteEmails, setInviteEmails] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);

  const getToken = () => localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';

  // ── Step 1: Create org ────────────────────────────────────────────────────
  const createOrg = async () => {
    if (!orgName.trim()) { setError('Organization name is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/orgs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name: orgName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create organization'); return; }
      // Save new token (now includes orgId)
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
        setNewToken(data.token);
      }
      setOrgId(data.org.id);
      setStep('invite');
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Send invites (optional) ──────────────────────────────────────
  const sendInvites = async () => {
    const emails = inviteEmails
      .split(/[\n,;]+/)
      .map(e => e.trim())
      .filter(e => e.includes('@'));

    if (emails.length === 0) { setStep('done'); return; }

    setLoading(true);
    setError('');
    try {
      const token = newToken ?? getToken();
      await Promise.allSettled(
        emails.map(email =>
          fetch('/api/orgs/invites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ email, role: 'member' }),
          })
        )
      );
      setStep('done');
    } catch {
      // Non-fatal — proceed anyway
      setStep('done');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Enter portal ──────────────────────────────────────────────────
  const enterPortal = () => {
    router.push('/communications');
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-lg">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {(['welcome', 'create', 'invite', 'done'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full transition-all ${
              s === step ? 'bg-blue-600 scale-125' :
              ['welcome', 'create', 'invite', 'done'].indexOf(step) > i ? 'bg-blue-300' : 'bg-gray-200'
            }`} />
            {i < 3 && <div className={`w-8 h-0.5 ${
              ['welcome', 'create', 'invite', 'done'].indexOf(step) > i ? 'bg-blue-200' : 'bg-gray-200'
            }`} />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-xl p-8">

        {/* ── Welcome ── */}
        {step === 'welcome' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <MessageSquare size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to LifeSync</h1>
            <p className="text-gray-500 mb-8 leading-relaxed">
              Break language barriers in every conversation. Let's set up your organization in under 2 minutes.
            </p>
            <div className="space-y-3 text-left mb-8">
              {[
                { icon: '🌍', title: 'Real-time translation', desc: 'Calls in any language, instantly translated' },
                { icon: '🔐', title: 'End-to-end encrypted', desc: 'Every recording stored with XChaCha20-Poly1305' },
                { icon: '👥', title: 'Multi-tenant teams', desc: 'Invite teammates with role-based access control' },
              ].map(item => (
                <div key={item.title} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{item.title}</p>
                    <p className="text-gray-500 text-xs">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setStep('create')}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Get started <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* ── Create org ── */}
        {step === 'create' && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Building2 size={20} className="text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Name your organization</h2>
                <p className="text-sm text-gray-500">This is how your team will be identified in LifeSync</p>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
                {error}
              </div>
            )}

            <input
              type="text"
              placeholder="e.g. Acme Corp, My Agency, Startup Name"
              value={orgName}
              onChange={e => { setOrgName(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && createOrg()}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-900 text-lg placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            />

            <p className="text-xs text-gray-400 mb-6">
              Start with the free trial — no credit card needed. Upgrade any time.
            </p>

            <button
              onClick={createOrg}
              disabled={loading || !orgName.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <>Create organization <ArrowRight size={18} /></>
              )}
            </button>
          </div>
        )}

        {/* ── Invite teammates ── */}
        {step === 'invite' && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Users size={20} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Invite your team</h2>
                <p className="text-sm text-gray-500">Optional — you can always invite people later</p>
              </div>
            </div>

            <textarea
              placeholder={"alice@company.com\nbob@company.com\n\nOne email per line, or comma-separated"}
              value={inviteEmails}
              onChange={e => setInviteEmails(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-900 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4 resize-none"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setStep('done')}
                className="flex-1 py-3 border border-gray-300 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                Skip for now
              </button>
              <button
                onClick={sendInvites}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
              >
                {loading ? (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>Send invites <ArrowRight size={16} /></>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check size={28} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">You're all set! 🎉</h2>
            <p className="text-gray-500 mb-2">
              <strong className="text-gray-700">{orgName}</strong> is ready to go.
            </p>
            <p className="text-sm text-gray-400 mb-8">
              Start making translated calls, invite teammates, or explore your portal.
            </p>

            <button
              onClick={enterPortal}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Zap size={18} />
              Enter your portal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
