'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Phone, Video, Search, Users, Globe, Mail, AlertCircle, Loader2, Tag, Pin, PinOff } from 'lucide-react';
import Link from 'next/link';

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  avatar: string | null;
  language: string;
  isOnline: boolean;
  isRecent?: boolean;
  lastSeenAt?: number | null;
  tags?: string[];
  company?: string | null;
  isPinned?: boolean;
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese',
  ko: 'Korean', ar: 'Arabic', ru: 'Russian', hi: 'Hindi',
  nl: 'Dutch', pl: 'Polish', tr: 'Turkish', sv: 'Swedish',
};

const PREDEFINED_TAGS = [
  'Adjuster', 'Homeowner', 'Contractor', 'Subcontractor',
  'Insurance', 'Supplier', 'Property Manager', 'Other',
];

// Tag color: background class for chips
const TAG_COLORS: Record<string, string> = {
  Adjuster:         'bg-blue-100 text-blue-700',
  Homeowner:        'bg-green-100 text-green-700',
  Contractor:       'bg-orange-100 text-orange-700',
  Subcontractor:    'bg-amber-100 text-amber-700',
  Insurance:        'bg-purple-100 text-purple-700',
  Supplier:         'bg-teal-100 text-teal-700',
  'Property Manager': 'bg-indigo-100 text-indigo-700',
  Other:            'bg-gray-100 text-gray-600',
};

// Active filter pill color (darker / filled)
const TAG_ACTIVE_COLORS: Record<string, string> = {
  Adjuster:         'bg-blue-600 text-white',
  Homeowner:        'bg-green-600 text-white',
  Contractor:       'bg-orange-600 text-white',
  Subcontractor:    'bg-amber-500 text-white',
  Insurance:        'bg-purple-600 text-white',
  Supplier:         'bg-teal-600 text-white',
  'Property Manager': 'bg-indigo-600 text-white',
  Other:            'bg-gray-600 text-white',
};

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'from-blue-400 to-blue-600',
  'from-purple-400 to-purple-600',
  'from-green-400 to-green-600',
  'from-orange-400 to-orange-600',
  'from-pink-400 to-pink-600',
  'from-teal-400 to-teal-600',
  'from-indigo-400 to-indigo-600',
  'from-rose-400 to-rose-600',
];

function avatarColor(id: string): string {
  const n = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

export function ContactsList() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [offset, setOffset] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 24;

  const getToken = () =>
    (typeof window !== 'undefined'
      ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
      : null) ?? '';

  const fetchContacts = useCallback(async (q: string, tag: string, off: number, append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const params = new URLSearchParams({ search: q, limit: String(LIMIT), offset: String(off) });
      if (tag) params.set('tag', tag);
      const res = await fetch(`/api/users/contacts?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to load contacts');
      const data = await res.json();
      if (append) {
        setContacts(prev => [...prev, ...(data.contacts ?? [])]);
      } else {
        setContacts(data.contacts ?? []);
      }
      setTotal(data.total ?? 0);
    } catch {
      setError('Could not load contacts. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchContacts('', '', 0, false); }, [fetchContacts]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      fetchContacts(search, selectedTag, 0, false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, selectedTag, fetchContacts]);

  const loadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    fetchContacts(search, selectedTag, newOffset, true);
  };

  const handleTagSelect = (tag: string) => {
    const next = selectedTag === tag ? '' : tag;
    setSelectedTag(next);
    setOffset(0);
  };

  const togglePin = async (contactId: string, currentlyPinned: boolean) => {
    const token = getToken();
    try {
      await fetch(`/api/users/contacts/${contactId}/pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pinned: !currentlyPinned }),
      });
      // Optimistic update
      setContacts(prev =>
        prev.map(c => c.id === contactId ? { ...c, isPinned: !currentlyPinned } : c)
          .sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0);
          })
      );
    } catch { /* non-fatal */ }
  };

  const hasMore = contacts.length < total;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, phone, or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        />
      </div>

      {/* Tag filter strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        {/* All pill */}
        <button
          onClick={() => handleTagSelect('')}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            selectedTag === ''
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Users size={11} />
          All
        </button>
        {PREDEFINED_TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => handleTagSelect(tag)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              selectedTag === tag
                ? TAG_ACTIVE_COLORS[tag] ?? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Tag size={10} />
            {tag}
          </button>
        ))}
      </div>

      {/* Count */}
      {!loading && !error && (
        <p className="text-sm text-gray-500">
          {total === 0
            ? selectedTag
              ? `No contacts tagged "${selectedTag}"`
              : 'No contacts found'
            : `${total} contact${total !== 1 ? 's' : ''}${selectedTag ? ` tagged "${selectedTag}"` : ' on LifeSync'}`}
        </p>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-100">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => fetchContacts(search, selectedTag, 0, false)}
            className="ml-auto text-xs text-red-600 font-medium hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && contacts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
            <Users size={28} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              {search
                ? 'No contacts match your search'
                : selectedTag
                  ? `No contacts tagged "${selectedTag}"`
                  : 'No contacts yet'}
            </h3>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              {search
                ? 'Try a different name, email, or phone number.'
                : selectedTag
                  ? 'Open a contact and add this tag in the detail view.'
                  : 'Invite teammates from your Organization settings to start communicating.'}
            </p>
          </div>
          {!search && !selectedTag && (
            <Link
              href="/organization"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              Go to Organization
            </Link>
          )}
          {selectedTag && (
            <button
              onClick={() => setSelectedTag('')}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Contacts grid */}
      {!loading && !error && contacts.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {contacts.map(contact => (
              <div
                key={contact.id}
                className={`bg-white rounded-xl border p-4 hover:shadow-sm transition-all ${
                  contact.isPinned
                    ? 'border-blue-200 bg-blue-50/30 hover:border-blue-300'
                    : 'border-gray-100 hover:border-blue-200'
                }`}
              >
                {/* Clickable name/avatar area → contact detail */}
                <Link href={`/contacts/${contact.id}`} className="block -mx-1 px-1 -mt-1 pt-1 rounded-lg hover:bg-gray-50 transition-colors mb-1">
                  <div className="flex items-start gap-3">
                    {/* Avatar with presence dot */}
                    <div className="relative flex-shrink-0">
                      <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${avatarColor(contact.id)} flex items-center justify-center text-white text-sm font-semibold`}>
                        {getInitials(contact.name)}
                      </div>
                      {contact.isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-white" title="Online" />
                      )}
                      {!contact.isOnline && contact.isRecent && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-yellow-400 border-2 border-white" title="Recently active" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name */}
                      <p className="font-semibold text-gray-900 truncate text-sm">{contact.name}</p>

                      {/* Company (if set) */}
                      {contact.company && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{contact.company}</p>
                      )}

                      {/* Phone or email */}
                      {!contact.company && contact.phone ? (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{contact.phone}</p>
                      ) : !contact.company && contact.email ? (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{contact.email}</p>
                      ) : null}

                      {/* Language tag + presence label */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Globe size={11} className="text-gray-400" />
                          <span className="text-xs text-gray-400">
                            {LANGUAGE_LABELS[contact.language] ?? contact.language.toUpperCase()}
                          </span>
                        </div>
                        {contact.isOnline && (
                          <span className="text-xs text-green-600 font-medium">● Online</span>
                        )}
                        {!contact.isOnline && contact.isRecent && (
                          <span className="text-xs text-yellow-600">Recently active</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tag chips (top 3) */}
                  {contact.tags && contact.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {contact.tags.slice(0, 3).map(tag => (
                        <span
                          key={tag}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            TAG_COLORS[tag] ?? 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {tag}
                        </span>
                      ))}
                      {contact.tags.length > 3 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
                          +{contact.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </Link>

                {/* Actions */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                  <Link
                    href="/communications"
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    title={`Call ${contact.name}`}
                  >
                    <Phone size={13} />
                    Call
                  </Link>
                  <Link
                    href="/communications"
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
                    title={`Video call ${contact.name}`}
                  >
                    <Video size={13} />
                    Video
                  </Link>
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center justify-center px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                      title={`Email ${contact.name}`}
                    >
                      <Mail size={13} />
                    </a>
                  )}
                  <button
                    onClick={() => togglePin(contact.id, !!contact.isPinned)}
                    className={`flex items-center justify-center px-2.5 py-1.5 rounded-lg transition-colors ${
                      contact.isPinned
                        ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                    }`}
                    title={contact.isPinned ? 'Unpin contact' : 'Pin contact'}
                  >
                    {contact.isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <><Loader2 size={15} className="animate-spin" /> Loading…</>
                ) : (
                  `Load more (${total - contacts.length} remaining)`
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
