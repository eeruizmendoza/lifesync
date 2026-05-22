'use client';

/**
 * SettingsTabs
 * Tabbed settings UI with:
 *   - Profile: name, email, phone (existing ProfileSettings)
 *   - Account: danger zone (sign out all sessions, account deletion request)
 * Renders client-side so tabs switch without page reload.
 */

import { useState } from 'react';
import { User, Shield } from 'lucide-react';
import { ProfileSettings } from './ProfileSettings';
import { AccountSettings } from './AccountSettings';

type Tab = 'profile' | 'account';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile',  label: 'Profile',  icon: <User size={16} /> },
  { id: 'account',  label: 'Account',  icon: <Shield size={16} /> },
];

export function SettingsTabs() {
  const [active, setActive] = useState<Tab>('profile');

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
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
      {active === 'profile'  && <ProfileSettings />}
      {active === 'account'  && <AccountSettings />}
    </div>
  );
}
