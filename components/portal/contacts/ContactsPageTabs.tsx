'use client';

/**
 * ContactsPageTabs
 * Tabbed container: "Platform Users" vs "External Contacts"
 */

import { useState } from 'react';
import { Users, UserSquare2 } from 'lucide-react';
import { ContactsList } from './ContactsList';
import { ExternalContactsList } from './ExternalContactsList';

export function ContactsPageTabs({ hasOrg }: { hasOrg: boolean }) {
  const [tab, setTab] = useState<'platform' | 'external'>('platform');

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('platform')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            tab === 'platform'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users size={15} />
          Platform Users
        </button>
        <button
          onClick={() => setTab('external')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            tab === 'external'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <UserSquare2 size={15} />
          External Contacts
        </button>
      </div>

      {/* Tab content */}
      {tab === 'platform' ? (
        <ContactsList />
      ) : (
        <ExternalContactsList hasOrg={hasOrg} />
      )}
    </div>
  );
}
