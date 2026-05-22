'use client';

/**
 * SettingsTabs
 * Tabbed settings UI with:
 *   - Profile: name, email, phone (existing ProfileSettings)
 *   - Account: danger zone (sign out all sessions, account deletion request)
 *   - Developer: API key management + webhooks (admins/owners only)
 * Renders client-side so tabs switch without page reload.
 */

import { useState, useEffect } from 'react';
import { User, Shield, Code2 } from 'lucide-react';
import { ProfileSettings } from './ProfileSettings';
import { AccountSettings } from './AccountSettings';
import { ApiKeyManager } from './ApiKeyManager';
import { WebhookManager } from './WebhookManager';

type Tab = 'profile' | 'account' | 'developer';

export function SettingsTabs() {
  const [active, setActive] = useState<Tab>('profile');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Fetch current user role to decide whether Developer tab is visible
    const token = (typeof window !== 'undefined'
      ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
      : null) || '';

    if (!token) return;
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.user?.orgId) return;
        // Check org role
        fetch('/api/orgs/members/role', {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        })
          .then(r => r.ok ? r.json() : null)
          .then(roleData => {
            const role = roleData?.role ?? 'member';
            setIsAdmin(role === 'admin' || role === 'owner');
          })
          .catch(() => setIsAdmin(false));
      })
      .catch(() => {});
  }, []);

  const TABS: { id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: 'profile',   label: 'Profile',    icon: <User size={16} /> },
    { id: 'account',   label: 'Account',    icon: <Shield size={16} /> },
    { id: 'developer', label: 'Developer',  icon: <Code2 size={16} />, adminOnly: true },
  ];

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id as Tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              active === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {active === 'profile'   && <ProfileSettings />}
      {active === 'account'   && <AccountSettings />}
      {active === 'developer' && isAdmin && (
        <div className="space-y-8">
          <ApiKeyManager />
          <div className="border-t border-gray-100 pt-6">
            <WebhookManager />
          </div>
        </div>
      )}
    </div>
  );
}
