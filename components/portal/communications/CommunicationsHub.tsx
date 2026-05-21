'use client';

import React, { useState } from 'react';
import { PhoneCallDialog } from './PhoneCallDialog';
import { VideoCallDialog } from './VideoCallDialog';

interface Contact {
  id: string;
  name: string;
  phone?: string;
  language: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  isOnline?: boolean;
}

interface CommunicationsHubProps {
  userId: string;
}

export function CommunicationsHub({ userId }: CommunicationsHubProps) {
  const [activeTab, setActiveTab] = useState<'contacts' | 'calls' | 'messages' | 'emails'>(
    'contacts'
  );
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [userLanguage, setUserLanguage] = useState('es');
  const [searchQuery, setSearchQuery] = useState('');

  // Mock contacts
  const contacts: Contact[] = [
    {
      id: '1',
      name: 'Maria Chen',
      phone: '+86 138 1234 5678',
      language: 'zh',
      avatar: '👩‍🦰',
      lastMessage: '你好!',
      lastMessageTime: new Date(Date.now() - 3600000),
      isOnline: true,
    },
    {
      id: '2',
      name: 'Jean Dupont',
      phone: '+33 6 12 34 56 78',
      language: 'fr',
      avatar: '👨‍🦱',
      lastMessage: 'Bonjour!',
      lastMessageTime: new Date(Date.now() - 7200000),
      isOnline: false,
    },
    {
      id: '3',
      name: 'Ana Garcia',
      phone: '+34 612 345 678',
      language: 'es',
      avatar: '👩‍🦲',
      lastMessage: '¿Cómo estás?',
      lastMessageTime: new Date(Date.now() - 1800000),
      isOnline: true,
    },
  ];

  const filteredContacts = contacts.filter(
    c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone?.includes(searchQuery)
  );

  const handleStartCall = (contact: Contact, type: 'audio' | 'video') => {
    setSelectedContact(contact);
    setCallType(type);
  };

  const handleEndCall = () => {
    setSelectedContact(null);
    setCallType(null);
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);

    if (hours === 0) return 'Just now';
    if (hours === 1) return '1h ago';
    if (hours < 24) return `${hours}h ago`;
    if (hours < 48) return 'Yesterday';
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {/* Language selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Your Language
        </label>
        <select
          value={userLanguage}
          onChange={e => setUserLanguage(e.target.value)}
          className="block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="en">English</option>
          <option value="es">Spanish (Español)</option>
          <option value="zh">Chinese (中文)</option>
          <option value="fr">French (Français)</option>
          <option value="de">German (Deutsch)</option>
          <option value="it">Italian (Italiano)</option>
          <option value="pt">Portuguese (Português)</option>
          <option value="ja">Japanese (日本語)</option>
          <option value="ko">Korean (한국어)</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow border-b">
        <div className="flex gap-0">
          {['contacts', 'calls', 'messages', 'emails'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className={`flex-1 px-4 py-3 font-medium text-center border-b-2 transition-colors ${
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
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="space-y-2">
            {filteredContacts.map(contact => (
              <div
                key={contact.id}
                className="bg-white rounded-lg shadow p-4 flex items-center justify-between hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-2xl">
                    {contact.avatar || '👤'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{contact.name}</h3>
                      {contact.isOnline && (
                        <span className="w-2 h-2 bg-green-500 rounded-full" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{contact.phone}</p>
                    {contact.lastMessage && (
                      <p className="text-xs text-gray-500 mt-1">
                        {contact.lastMessage} · {formatTime(contact.lastMessageTime || new Date())}
                      </p>
                    )}
                  </div>
                  <div className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                    {contact.language.toUpperCase()}
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleStartCall(contact, 'audio')}
                    className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                    title="Start audio call"
                  >
                    📞
                  </button>
                  <button
                    onClick={() => handleStartCall(contact, 'video')}
                    className="p-2 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors"
                    title="Start video call"
                  >
                    📹
                  </button>
                  <button
                    className="p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    title="Send message"
                  >
                    💬
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calls Tab */}
      {activeTab === 'calls' && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-4xl mb-4">📞</div>
          <p className="text-gray-600">
            Select a contact to make a call with real-time translation
          </p>
        </div>
      )}

      {/* Messages Tab */}
      {activeTab === 'messages' && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-4xl mb-4">💬</div>
          <p className="text-gray-600">Messages with real-time translation coming soon</p>
        </div>
      )}

      {/* Emails Tab */}
      {activeTab === 'emails' && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-4xl mb-4">📧</div>
          <p className="text-gray-600">Email translations coming soon</p>
        </div>
      )}

      {/* Active call dialogs */}
      {selectedContact && callType === 'audio' && (
        <PhoneCallDialog
          callId={`call-${selectedContact.id}-${Date.now()}`}
          contactId={selectedContact.id}
          contactName={selectedContact.name}
          contactPhone={selectedContact.phone || ''}
          sourceLanguage={userLanguage}
          targetLanguage={selectedContact.language}
          onEnd={handleEndCall}
        />
      )}

      {selectedContact && callType === 'video' && (
        <VideoCallDialog
          callId={`call-${selectedContact.id}-${Date.now()}`}
          contactId={selectedContact.id}
          contactName={selectedContact.name}
          sourceLanguage={userLanguage}
          targetLanguage={selectedContact.language}
          onEnd={handleEndCall}
        />
      )}
    </div>
  );
}
