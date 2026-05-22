'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, Phone, Search, Pin, Trash2 } from 'lucide-react';
import { ConversationDetail } from './ConversationDetail';
import type { Conversation, UnifiedInboxProps } from '@/lib/types/calls';

export function UnifiedInbox({ onSelectConversation, selectedConversationId }: UnifiedInboxProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(selectedConversationId || null);
  const [filter, setFilter] = useState<'all' | 'calls' | 'messages' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const res = await fetch(`/api/conversations?filter=${filter}`);
        if (res.ok) {
          const data = await res.json();
          setConversations(data);
        }
      } catch (error) {
        console.error('Failed to fetch conversations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
    const interval = setInterval(fetchConversations, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  const selected = conversations.find((c) => c.id === selectedId);

  const filteredConversations = conversations.filter((conv) =>
    conv.contactName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 bg-white lg:grid-cols-3">
      {/* Conversation list */}
      <div className="border-r border-gray-200 flex flex-col">
        <div className="sticky top-0 border-b border-gray-200 bg-white p-4 z-10">
          <h2 className="mb-3 text-lg font-bold text-gray-900">Communications</h2>

          {/* Search */}
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2">
            <Search size={18} className="text-gray-500" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2">
            {(['all', 'calls', 'messages', 'unread'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                  filter === f
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation items */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">No conversations</div>
          ) : (
            filteredConversations.map((conv) => (
              <ConversationListItem
                key={conv.id}
                conversation={conv}
                isSelected={selectedId === conv.id}
                onClick={() => {
                  setSelectedId(conv.id);
                  onSelectConversation?.(conv.id);
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Conversation detail */}
      {selected ? (
        <div className="col-span-1 lg:col-span-2 flex flex-col overflow-hidden">
          <ConversationDetail conversationId={selected.id} />
        </div>
      ) : (
        <div className="col-span-1 lg:col-span-2 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
            <p>Select a conversation to view</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationListItem({
  conversation,
  isSelected,
  onClick,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}) {
  const unreadCount = conversation.unreadCount;
  const hasNewMessage = unreadCount > 0;
  const lastMessage = conversation.lastMessage || '(No messages)';

  return (
    <button
      onClick={onClick}
      className={`w-full border-b border-gray-100 p-4 text-left transition hover:bg-gray-50 ${
        isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="h-12 w-12 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
          {conversation.contactName.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className={`font-medium text-gray-900 ${hasNewMessage ? 'font-bold' : ''}`}>
              {conversation.contactName}
            </p>
            <span className="text-xs text-gray-500 flex-shrink-0">
              {formatRelativeTime(new Date(conversation.lastActivityAt))}
            </span>
          </div>

          <p className={`truncate text-sm mb-1 ${
            hasNewMessage ? 'font-medium text-gray-900' : 'text-gray-600'
          }`}>
            {conversation.type === 'call' ? '☎️ ' : '💬 '}
            {lastMessage}
          </p>

          {/* Language pair */}
          <p className="text-xs text-gray-500">
            {conversation.sourceLanguage.toUpperCase()} → {conversation.targetLanguage.toUpperCase()}
          </p>
        </div>

        {/* Unread badge */}
        {hasNewMessage && (
          <div className="flex-shrink-0 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
      </div>
    </button>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
