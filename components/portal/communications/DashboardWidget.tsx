'use client';

/**
 * DashboardWidget
 * Shown at the top of the Communications page.
 * - New users (0 calls): shows a getting-started checklist
 * - Existing users: shows mini stats (calls this month, languages, contacts)
 */

import { useState, useEffect } from 'react';
import { Users, Phone, Globe, ArrowRight, CheckCircle, Circle, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

interface Stats {
  callsTotal: number;
  contactsTotal: number;
  hasProfile: boolean;
  hasOrg: boolean;
  languagesUsed: string[];
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  it: 'Italian', ru: 'Russian', ar: 'Arabic', hi: 'Hindi',
};

export function DashboardWidget() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
    if (!token) return;

    const headers: HeadersInit = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch('/api/auth/me', { headers, credentials: 'include' }).then(r => r.ok ? r.json() : null),
      fetch('/api/calls/history?limit=1', { headers, credentials: 'include' }).then(r => r.ok ? r.json() : null),
      fetch('/api/users/contacts?limit=1&search=', { headers, credentials: 'include' }).then(r => r.ok ? r.json() : null),
      fetch('/api/orgs', { headers, credentials: 'include' }).then(r => r.ok ? r.json() : null),
    ]).then(([me, calls, contacts, org]) => {
      setStats({
        callsTotal: calls?.total ?? 0,
        contactsTotal: contacts?.total ?? 0,
        hasProfile: !!(me?.user?.name),
        hasOrg: !!(me?.user?.orgId || org?.org),
        languagesUsed: [],
      });
    }).catch(() => { /* ignore */ });
  }, []);

  if (!stats) return null;

  const isNewUser = stats.callsTotal === 0 && stats.contactsTotal === 0;

  // Don't show the widget for established users (already have calls)
  // unless there are still incomplete setup steps
  const incomplete = !stats.hasProfile || !stats.hasOrg;
  if (!isNewUser && !incomplete) return null;

  const steps = [
    {
      id: 'profile',
      label: 'Complete your profile',
      sublabel: 'Add your name so contacts recognize you',
      done: stats.hasProfile,
      href: '/settings',
    },
    {
      id: 'org',
      label: 'Set up your organization',
      sublabel: 'Create or join a team to start collaborating',
      done: stats.hasOrg,
      href: '/organization',
    },
    {
      id: 'invite',
      label: 'Invite a contact',
      sublabel: 'Share LifeSync with someone to call',
      done: stats.contactsTotal > 0,
      href: '/organization',
    },
    {
      id: 'call',
      label: 'Make your first call',
      sublabel: 'Start a translated call from the Contacts tab',
      done: stats.callsTotal > 0,
      href: '/contacts',
    },
  ];

  const completedSteps = steps.filter(s => s.done).length;
  const allDone = completedSteps === steps.length;

  if (allDone) return null;

  return (
    <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-5 mb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">
              {completedSteps === 0 ? 'Get started with LifeSync' : `${completedSteps}/${steps.length} setup steps done`}
            </h3>
            <p className="text-sm text-gray-500">
              {completedSteps === 0
                ? 'Complete these steps to start your first translated call'
                : 'Just a few more steps to finish setup'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Progress ring */}
          <svg width="36" height="36" viewBox="0 0 36 36" className="flex-shrink-0">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15" fill="none"
              stroke="#3b82f6" strokeWidth="3"
              strokeDasharray={`${(completedSteps / steps.length) * 94.25} 94.25`}
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
            />
            <text x="18" y="22" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="600">
              {completedSteps}/{steps.length}
            </text>
          </svg>
          <button
            onClick={() => setCollapsed(v => !v)}
            className="p-1 text-gray-400 hover:text-gray-600"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {/* Steps list */}
      {!collapsed && (
        <div className="space-y-2">
          {steps.map(step => (
            <Link
              key={step.id}
              href={step.done ? '#' : step.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                step.done
                  ? 'opacity-50 cursor-default'
                  : 'bg-white hover:bg-blue-50 shadow-sm hover:shadow cursor-pointer'
              }`}
              onClick={e => step.done && e.preventDefault()}
            >
              {step.done
                ? <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
                : <Circle size={18} className="text-gray-300 flex-shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${step.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {step.label}
                </p>
                {!step.done && (
                  <p className="text-xs text-gray-400">{step.sublabel}</p>
                )}
              </div>
              {!step.done && (
                <ArrowRight size={14} className="text-blue-400 flex-shrink-0" />
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
