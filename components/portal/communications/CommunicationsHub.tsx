'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PhoneCallDialog } from './PhoneCallDialog';
import { VideoCallDialog } from './VideoCallDialog';
import { UnifiedInbox } from './UnifiedInbox';

interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  language: string;
  avatar?: string | null;
  isOnline?: boolean;
}

interface CommunicationsHubProps {
  userId: string;
}

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish (Español)' },
  { code: 'zh', label: 'Chinese (中文)' },
  { code: 'fr', label: 'French (Français)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'it', label: 'Italian (Italiano)' },
  { code: 'pt', label: 'Portuguese (Português)' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'ko', label: 'Korean (한국어)' },
  { code: 'ar', label: 'Arabic (العربية)' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'ru', label: 'Russian (Русский)' },
];

export function CommunicationsHub({ userId }: CommunicationsHubProps) {
  const [activeTab, setActiveTab] = useState<'contacts' | 'calls' | 'messages' | 'emails'>('contacts');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [userLanguage, setUserLanguage] = useState('en');
  const [searchQuery, setSearchQuery] = useState('');

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsTotal, setContactsTotal] = useState(0);

  // Fetch contacts from API
  const fetchContacts = useCallback(async (search: string) => {
    setIsLoadingContacts(true);
    setContactsError(null);
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || ''
        : '';

      const params = new URLSearchParams({ search, limit: '50', offset: '0' });
      const res = await fetch(`/api/users/contacts?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setContacts(data.contacts || []);
      setContactsTotal(data.total || 0);
    } catch (err) {
      setContactsError('Could not load contacts. Check your connection.');
      console.error('Failed to load contacts:', err);
    } finally {
      setIsLoadingContacts(false);
    }
  }, []);

  // Load contacts on mount and when search changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => fetchContacts(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchContacts]);

  const handleStartCall = (contact: Contact, type: 'audio' | 'video') => {
    setSelectedContact(contact);
    setCallType(type);
  };

  const handleEndCall = () => {
    setSelectedContact(null);
    setCallType(null);
  };

  const avatarForContact = (c: Contact) => {
    if (c.avatar) return <img src={c.avatar} alt={c.name} className="w-full h-full object-cover rounded-full" />;
    const initials = c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    return <span className="text-lg font-semibold text-gray-600">{initials}</span>;
  };

  const isCallActive = selectedContact !== null && callType !== null;

  return (
    <div className="space-y-4">
      {/* Language selector */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Your Language</label>
          <select
            value={userLanguage}
            onChange={e => setUserLanguage(e.target.value)}
            className="block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          >
            {SUPPORTED_LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        {isCallActive && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-green-700">
              {callType === 'audio' ? '📞' : '📹'} Call in progress with {selectedContact?.name}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow border-b">
        <div className="flex">
          {(['contacts', 'calls', 'messages', 'emails'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-3 font-medium text-center border-b-2 transition-colors text-sm ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Contacts Tab */}
      {activeTab === 'contacts' && (
        <div className="space-y-3">
          {/* Search */}
          <div className="bg-white rounded-lg shadow p-4">
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            {contactsTotal > 0 && (
              <p className="text-xs text-gray-400 mt-1">{contactsTotal} contact{contactsTotal !== 1 ? 's' : ''} available</p>
            )}
          </div>

          {/* Loading */}
          {isLoadingContacts && (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm text-gray-500">Loading contacts...</p>
            </div>
          )}

          {/* Error */}
          {contactsError && !isLoadingContacts && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <span className="text-red-500 text-lg">⚠️</span>
              <div>
                <p className="text-sm font-medium text-red-700">{contactsError}</p>
                <button
                  onClick={() => fetchContacts(searchQuery)}
                  className="text-xs text-red-600 underline mt-1 hover:no-underline"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoadingContacts && !contactsError && contacts.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <div className="text-5xl mb-4">👥</div>
              <h3 className="font-semibold text-gray-700 mb-1">
                {searchQuery ? 'No contacts found' : 'No contacts yet'}
              </h3>
              <p className="text-sm text-gray-500">
                {searchQuery
                  ? `No results for "${searchQuery}"`
                  : 'When other users join LifeSync, they\'ll appear here.'}
              </p>
            </div>
          )}

          {/* Contact list */}
          {!isLoadingContacts && contacts.length > 0 && (
            <div className="space-y-2">
              {contacts.map(contact => (
                <div
                  key={contact.id}
                  className="bg-white rounded-lg shadow p-4 flex items-center justify-between hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {avatarForContact(contact)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">{contact.name}</h3>
                        {contact.isOnline && (
                          <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                        )}
                      </div>
                      {contact.phone && (
                        <p className="text-xs text-gray-500 truncate">{contact.phone}</p>
                      )}
                      {contact.email && !contact.phone && (
                        <p className="text-xs text-gray-500 truncate">{contact.email}</p>
                      )}
                    </div>
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono flex-shrink-0">
                      {contact.language.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex gap-1 ml-3 flex-shrink-0">
                    <button
                      onClick={() => handleStartCall(contact, 'audio')}
                      disabled={isCallActive}
                      className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Start audio call"
                    >
                      📞
                    </button>
                    <button
                      onClick={() => handleStartCall(contact, 'video')}
                      disabled={isCallActive}
                      className="p-2 rounded-full bg-green-100 text-green-600 hover:bg-green-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Start video call"
                    >
                      📹
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Calls Tab */}
      {activeTab === 'calls' && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-5xl mb-4">📞</div>
          <h3 className="font-semibold text-gray-700 mb-2">Call History</h3>
          <p className="text-sm text-gray-500">
            Your recent translated calls will appear here.
            Go to <strong>Contacts</strong> to start a new call.
          </p>
        </div>
      )}

      {/* Messages Tab */}
      {activeTab === 'messages' && (
        <UnifiedInbox userId={userId} />
      )}

      {/* Emails Tab */}
      {activeTab === 'emails' && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-5xl mb-4">📧</div>
          <h3 className="font-semibold text-gray-700 mb-2">Email Translations</h3>
          <p className="text-sm text-gray-500">
            Connect your email account to translate messages in real-time.
          </p>
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors opacity-60 cursor-not-allowed" disabled>
            Connect Gmail (coming soon)
          </button>
        </div>
      )}

      {/* Active call dialogs — rendered at portal root level */}
      {selectedContact && callType === 'audio' && (
        <PhoneCallDialog
          callId={`call-${selectedContact.id}-${Date.now()}`}
          contactId={selectedContact.id}
          contactName={selectedContact.name}
          contactPhone={selectedContact.phone || ''}
          sourceLanguage={userLanguage}
          targetLanguage={selectedContact.language}
          isOpen={true}
          onEnd={handleEndCall}
          onClose={handleEndCall}
        />
      )}

      {selectedContact && callType === 'video' && (
        <VideoCallDialog
          callId={`call-${selectedContact.id}-${Date.now()}`}
          contactId={selectedContact.id}
          contactName={selectedContact.name}
          sourceLanguage={userLanguage}
          targetLanguage={selectedContact.language}
          isOpen={true}
          onEnd={handleEndCall}
          onClose={handleEndCall}
        />
      )}
    </div>
  );
}
