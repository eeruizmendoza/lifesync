'use client';

/**
 * ContactDetail
 * Shows a contact's profile, online status, language, call stats,
 * and the last 20 shared calls — with quick Call / Video buttons.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Phone,
  Video,
  Clock,
  Globe,
  Mail,
  PhoneMissed,
  Languages,
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

// ─── Component ───────────────────────────────────────────────────────────────

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
      setContact(data.contact);
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
          </div>

          {/* Quick-call buttons */}
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
