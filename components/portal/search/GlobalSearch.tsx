'use client';

/**
 * GlobalSearch
 * Cmd+K (Mac) / Ctrl+K (Windows) opens a spotlight-style search modal.
 * Searches contacts, call history, and recording transcripts simultaneously.
 * Results link directly to the relevant page.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  X,
  Phone,
  Video,
  Mic,
  User,
  Clock,
  Globe,
  Loader2,
  ArrowUpRight,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContactResult {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  language: string | null;
}

interface CallResult {
  id: string;
  type: string;
  languagePair: string;
  durationSeconds: number;
  contactName: string | null;
  contactPhone: string | null;
  createdAt: string;
}

interface RecordingResult {
  id: string;
  type: string;
  durationSeconds: number;
  snippet: string | null;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

function formatDuration(s: number): string {
  if (!s || s < 1) return 'No answer';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', zh: 'Chinese', fr: 'French',
  de: 'German', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  ar: 'Arabic', ru: 'Russian', hi: 'Hindi', it: 'Italian',
};

function langLabel(code: string): string {
  return LANG_NAMES[code] ?? code.toUpperCase();
}

// ─── SearchTrigger (the visible button in the navbar) ─────────────────────────

export function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-400 hover:border-gray-300 hover:bg-white hover:text-gray-600 transition-all w-48"
    >
      <Search size={14} />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="text-[10px] border border-gray-200 rounded px-1 py-0.5 font-mono bg-white text-gray-400">
        ⌘K
      </kbd>
    </button>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [calls, setCalls] = useState<CallResult[]>([]);
  const [recordings, setRecordings] = useState<RecordingResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasResults = contacts.length > 0 || calls.length > 0 || recordings.length > 0;

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setContacts([]);
      setCalls([]);
      setRecordings([]);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setContacts([]);
      setCalls([]);
      setRecordings([]);
      return;
    }
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      setContacts(data.contacts ?? []);
      setCalls(data.calls ?? []);
      setRecordings(data.recordings ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 200);
  };

  if (!open) {
    return <SearchTrigger onOpen={() => setOpen(true)} />;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed top-[15vh] left-1/2 -translate-x-1/2 w-full max-w-xl z-50 px-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
            {loading ? (
              <Loader2 size={17} className="text-blue-500 animate-spin flex-shrink-0" />
            ) : (
              <Search size={17} className="text-gray-400 flex-shrink-0" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="Search contacts, calls, transcripts…"
              className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
            />
            {query && (
              <button onClick={() => { setQuery(''); setContacts([]); setCalls([]); setRecordings([]); }}>
                <X size={15} className="text-gray-400 hover:text-gray-600" />
              </button>
            )}
            <kbd className="text-[10px] border border-gray-200 rounded px-1 py-0.5 font-mono bg-gray-50 text-gray-400 flex-shrink-0">
              Esc
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {query.length < 2 && (
              <div className="px-4 py-10 text-center">
                <Search size={32} className="text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Start typing to search across your workspace</p>
                <p className="text-xs text-gray-300 mt-1">Contacts, calls, and transcripts</p>
              </div>
            )}

            {query.length >= 2 && !loading && !hasResults && (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-400">No results for <strong className="text-gray-600">"{query}"</strong></p>
              </div>
            )}

            {contacts.length > 0 && (
              <section>
                <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Contacts</p>
                {contacts.map(c => (
                  <Link
                    key={c.id}
                    href={`/contacts/${c.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name ?? c.phone ?? c.email}</p>
                      {c.phone && c.name && <p className="text-xs text-gray-400 truncate">{c.phone}</p>}
                      {c.language && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Globe size={10} /> {langLabel(c.language)}
                        </p>
                      )}
                    </div>
                    <ArrowUpRight size={13} className="text-gray-300 group-hover:text-blue-400 flex-shrink-0" />
                  </Link>
                ))}
              </section>
            )}

            {calls.length > 0 && (
              <section>
                <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Calls</p>
                {calls.map(c => (
                  <Link
                    key={c.id}
                    href={`/calls/${c.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors group"
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      c.type === 'video_call' ? 'bg-purple-100' : 'bg-blue-100'
                    }`}>
                      {c.type === 'video_call'
                        ? <Video size={14} className="text-purple-600" />
                        : <Phone size={14} className="text-blue-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {c.contactName ?? c.contactPhone ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-400 flex items-center gap-2">
                        <span className="flex items-center gap-0.5">
                          <Globe size={10} />{c.languagePair.replace('_', '→') || 'Unknown pair'}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Clock size={10} />{formatDuration(c.durationSeconds)}
                        </span>
                      </p>
                    </div>
                    <ArrowUpRight size={13} className="text-gray-300 group-hover:text-blue-400 flex-shrink-0" />
                  </Link>
                ))}
              </section>
            )}

            {recordings.length > 0 && (
              <section className="pb-2">
                <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Recordings</p>
                {recordings.map(r => (
                  <Link
                    key={r.id}
                    href={`/recordings`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
                      <Mic size={14} className="text-rose-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {r.type.charAt(0).toUpperCase() + r.type.slice(1)} recording
                      </p>
                      {r.snippet && (
                        <p className="text-xs text-gray-400 truncate italic">"{r.snippet}…"</p>
                      )}
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={10} />{formatDuration(r.durationSeconds)}
                      </p>
                    </div>
                    <ArrowUpRight size={13} className="text-gray-300 group-hover:text-blue-400 flex-shrink-0" />
                  </Link>
                ))}
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
