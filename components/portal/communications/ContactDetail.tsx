'use client';

/**
 * ContactDetail
 * Shows a contact's profile, online status, language, call stats,
 * last 20 shared calls — with quick Call / Video buttons.
 * Phase 37: tags, notes, company metadata editing.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Phone, Video, Clock, Globe, Mail, PhoneMissed,
  Languages, Tag, Plus, X, Save, Check, Building2, FileText, Pin, PinOff,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContactProfile {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  language: string | null;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  tags: string[];
  notes: string | null;
  company: string | null;
  isPinned: boolean;
}

interface CallRecord {
  id: string;
  type: string;
  userLanguage: string;
  contactLanguage: string;
  languagePair: string;
  durationSeconds: number;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', zh: 'Chinese', fr: 'French',
  de: 'German', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
  ar: 'Arabic', ru: 'Russian', hi: 'Hindi', it: 'Italian',
  nl: 'Dutch', sv: 'Swedish', pl: 'Polish', tr: 'Turkish',
  vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', uk: 'Ukrainian',
};

const PREDEFINED_TAGS = [
  'Adjuster', 'Homeowner', 'Contractor', 'Subcontractor',
  'Insurance', 'Supplier', 'Property Manager', 'Other',
];

const TAG_COLORS: Record<string, string> = {
  'Adjuster':        'bg-blue-100 text-blue-700',
  'Homeowner':       'bg-green-100 text-green-700',
  'Contractor':      'bg-orange-100 text-orange-700',
  'Subcontractor':   'bg-amber-100 text-amber-700',
  'Insurance':       'bg-purple-100 text-purple-700',
  'Supplier':        'bg-cyan-100 text-cyan-700',
  'Property Manager':'bg-indigo-100 text-indigo-700',
  'Other':           'bg-gray-100 text-gray-600',
};

function tagColor(tag: string): string {
  return TAG_COLORS[tag] ?? 'bg-gray-100 text-gray-600';
}

function langLabel(code: string | null): string {
  if (!code) return 'Unknown';
  return LANG_NAMES[code] ?? code.toUpperCase();
}

function formatDuration(s: number): string {
  if (!s || s < 1) return 'No answer';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function presenceStatus(lastSeenAt: string | null): { label: string; dot: string } {
  if (!lastSeenAt) return { label: 'Offline', dot: 'bg-gray-300' };
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (diff < 90_000) return { label: 'Online now', dot: 'bg-green-500' };
  if (diff < 4 * 3600_000) return { label: 'Recently active', dot: 'bg-yellow-400' };
  return { label: 'Offline', dot: 'bg-gray-300' };
}

// ─── Metadata Editor ─────────────────────────────────────────────────────────

function MetadataEditor({
  contactId,
  initial,
  onSaved,
}: {
  contactId: string;
  initial: { tags: string[]; notes: string | null; company: string | null };
  onSaved: (updated: { tags: string[]; notes: string | null; company: string | null }) => void;
}) {
  const [tags, setTags] = useState<string[]>(initial.tags ?? []);
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [company, setCompany] = useState(initial.company ?? '');
  const [customTag, setCustomTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);

  const toggleTag = (t: string) => {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const addCustom = () => {
    const trimmed = customTag.trim();
    if (!trimmed || tags.includes(trimmed) || tags.length >= 10) return;
    setTags(prev => [...prev, trimmed]);
    setCustomTag('');
  };

  const save = async () => {
    setSaving(true);
    const token = getToken();
    try {
      const res = await fetch(`/api/users/contacts/${contactId}/metadata`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ tags, notes: notes.trim() || null, company: company.trim() || null }),
      });
      const data = await res.json();
      if (res.ok) {
        onSaved({ tags: data.tags ?? tags, notes: data.notes, company: data.company });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <Tag size={14} className="text-gray-400" />
        Contact Details
      </h3>

      {/* Company */}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
          <Building2 size={12} className="text-gray-400" />
          Company / Organization
        </label>
        <input
          type="text"
          value={company}
          onChange={e => setCompany(e.target.value)}
          placeholder="e.g. State Farm Insurance"
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      </div>

      {/* Tags */}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
          <Tag size={12} className="text-gray-400" />
          Role Tags
        </label>
        {/* Selected tags */}
        <div className="flex flex-wrap gap-1.5 mb-2 min-h-[26px]">
          {tags.map(t => (
            <span key={t} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tagColor(t)}`}>
              {t}
              <button onClick={() => toggleTag(t)} className="ml-0.5 opacity-60 hover:opacity-100">
                <X size={10} />
              </button>
            </span>
          ))}
          {tags.length === 0 && <span className="text-xs text-gray-400">No tags yet</span>}
        </div>
        {/* Tag picker */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {PREDEFINED_TAGS.filter(t => !tags.includes(t)).map(t => (
            <button
              key={t}
              onClick={() => toggleTag(t)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <Plus size={9} />
              {t}
            </button>
          ))}
        </div>
        {/* Custom tag input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customTag}
            onChange={e => setCustomTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustom()}
            placeholder="Custom tag…"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <button
            onClick={addCustom}
            disabled={!customTag.trim()}
            className="px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
          <FileText size={12} className="text-gray-400" />
          Notes
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Claim number, job details, preferences…"
          rows={3}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saved ? <Check size={14} /> : saving ? null : <Save size={14} />}
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ContactDetail({ contactId }: { contactId: string }) {
  const [contact, setContact] = useState<ContactProfile | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = getToken();
    try {
      const res = await fetch(`/api/users/contacts/${contactId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Failed to load contact');
      }
      const data = await res.json();
      setContact({ ...data.contact, tags: data.contact.tags ?? [], notes: data.contact.notes ?? null, company: data.contact.company ?? null, isPinned: data.contact.isPinned ?? false });
      setCalls(data.calls ?? []);
      setTotalCalls(data.totalCalls ?? 0);
      setTotalMinutes(data.totalMinutes ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contact');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div className="space-y-4">
        <Link href="/contacts" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={15} /> Back to Contacts
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          ⚠️ {error ?? 'Contact not found'}
        </div>
      </div>
    );
  }

  const displayName = contact.name ?? contact.phone ?? 'Unknown';
  const initials = contact.name
    ? contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : (contact.phone?.slice(-2) ?? '??');
  const presence = presenceStatus(contact.lastSeenAt);

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/contacts" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ArrowLeft size={15} />
        Back to Contacts
      </Link>

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xl font-bold">
              {initials}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white ${presence.dot}`} />
          </div>

          {/* Name + status */}
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-gray-900 truncate">{displayName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{presence.label}</p>

            {/* Company */}
            {contact.company && (
              <p className="text-sm text-gray-600 mt-1 flex items-center gap-1.5">
                <Building2 size={13} className="text-gray-400" />
                {contact.company}
              </p>
            )}

            {/* Tags */}
            {contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {contact.tags.map(t => (
                  <span key={t} className={`px-2 py-0.5 rounded-full text-xs font-medium ${tagColor(t)}`}>
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-3 mt-3">
              {contact.phone && (
                <span className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Phone size={14} className="text-gray-400" />
                  {contact.phone}
                </span>
              )}
              {contact.email && (
                <span className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Mail size={14} className="text-gray-400" />
                  {contact.email}
                </span>
              )}
              {contact.language && (
                <span className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Languages size={14} className="text-gray-400" />
                  {langLabel(contact.language)}
                </span>
              )}
            </div>

            {/* Notes preview */}
            {contact.notes && (
              <p className="text-sm text-gray-500 mt-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 italic">
                {contact.notes.length > 120 ? contact.notes.slice(0, 117) + '…' : contact.notes}
              </p>
            )}
          </div>

          {/* Quick-call buttons + pin */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/communications?action=call&contactId=${contact.id}`}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Phone size={15} />
              Call
            </Link>
            <Link
              href={`/communications?action=video&contactId=${contact.id}`}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Video size={15} />
              Video
            </Link>
            <button
              onClick={async () => {
                const next = !contact.isPinned;
                setContact(c => c ? { ...c, isPinned: next } : c);
                const token = getToken();
                await fetch(`/api/users/contacts/${contact.id}/pin`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  credentials: 'include',
                  body: JSON.stringify({ pinned: next }),
                }).catch(() => setContact(c => c ? { ...c, isPinned: !next } : c));
              }}
              className={`flex items-center justify-center p-2.5 rounded-xl border transition-colors ${
                contact.isPinned
                  ? 'bg-blue-100 border-blue-200 text-blue-600 hover:bg-blue-200'
                  : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600'
              }`}
              title={contact.isPinned ? 'Unpin contact' : 'Pin to dashboard'}
            >
              {contact.isPinned ? <PinOff size={15} /> : <Pin size={15} />}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-gray-100">
          <div className="text-center p-3 bg-blue-50 rounded-xl">
            <p className="text-2xl font-bold text-blue-700">{totalCalls}</p>
            <p className="text-xs text-blue-500 mt-0.5">Calls together</p>
          </div>
          <div className="text-center p-3 bg-indigo-50 rounded-xl">
            <p className="text-2xl font-bold text-indigo-700">{totalMinutes}</p>
            <p className="text-xs text-indigo-500 mt-0.5">Minutes together</p>
          </div>
        </div>
      </div>

      {/* Metadata editor */}
      <MetadataEditor
        contactId={contactId}
        initial={{ tags: contact.tags, notes: contact.notes, company: contact.company }}
        onSaved={updated => setContact(prev => prev ? { ...prev, ...updated } : prev)}
      />

      {/* Call history with this contact */}
      {calls.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Call History</h3>
            {totalCalls > calls.length && (
              <p className="text-xs text-gray-400 mt-0.5">Showing last {calls.length} of {totalCalls} calls</p>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {calls.map(call => (
              <Link
                key={call.id}
                href={`/calls/${call.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors group"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  call.type === 'video_call'
                    ? 'bg-purple-100 text-purple-600'
                    : call.durationSeconds > 0
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-red-50 text-red-400'
                }`}>
                  {call.type === 'video_call' ? (
                    <Video size={16} />
                  ) : call.durationSeconds > 0 ? (
                    <Phone size={16} />
                  ) : (
                    <PhoneMissed size={16} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {call.type === 'video_call' ? 'Video call' : call.durationSeconds > 0 ? 'Phone call' : 'Missed call'}
                  </p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Globe size={10} />
                    {langLabel(call.userLanguage)} → {langLabel(call.contactLanguage)}
                  </p>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1 text-sm text-gray-600 justify-end">
                    <Clock size={12} className="text-gray-400" />
                    {formatDuration(call.durationSeconds)}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(call.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {totalCalls === 0 && (
        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-8 text-center">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-3 shadow-sm">
            <Phone size={20} className="text-gray-300" />
          </div>
          <p className="text-sm text-gray-500">No calls with this contact yet.</p>
          <p className="text-xs text-gray-400 mt-1">Use the Call or Video button above to get started.</p>
        </div>
      )}
    </div>
  );
}
