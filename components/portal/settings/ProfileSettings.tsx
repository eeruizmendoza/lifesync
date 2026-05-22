'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Phone, Save, Check, AlertCircle, Loader2, Globe } from 'lucide-react';

interface UserProfile {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
  orgId: string | null;
  language: string | null;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'zh', label: 'Chinese (Mandarin)' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ru', label: 'Russian' },
  { code: 'hi', label: 'Hindi' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'tr', label: 'Turkish' },
  { code: 'sv', label: 'Swedish' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'id', label: 'Indonesian' },
  { code: 'th', label: 'Thai' },
];

export function ProfileSettings() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const getToken = () =>
    (typeof window !== 'undefined'
      ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
      : null) || '';

  useEffect(() => {
    const token = getToken();
    fetch('/api/auth/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => {
        if (data.ok && data.user) {
          setProfile(data.user);
          setName(data.user.name ?? '');
          setEmail(data.user.email ?? '');
          setLanguage(data.user.language ?? 'en');
        }
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const token = getToken();
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim() || null,
          language: language || 'en',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to update profile');
        return;
      }
      setSuccess(true);
      setProfile(prev => prev ? { ...prev, name: data.user.name, email: data.user.email, language: data.user.language } : prev);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  };

  const isDirty =
    name.trim() !== (profile?.name ?? '') ||
    email.trim() !== (profile?.email ?? '') ||
    language !== (profile?.language ?? 'en');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Avatar / Identity */}
      <div className="flex items-center gap-5">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-md">
          {name
            ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
            : (profile?.phoneNumber?.slice(-2) ?? '??')}
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {profile?.name ?? 'Set your name'}
          </h2>
          <p className="text-sm text-gray-500">{profile?.phoneNumber}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Profile photo coming soon
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        {/* Name */}
        <div className="px-6 py-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <span className="flex items-center gap-2">
              <User size={15} className="text-gray-400" />
              Display Name
            </span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); setSuccess(false); }}
            placeholder="Your full name"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1.5 text-xs text-gray-400">
            Shown to your teammates and in call interfaces
          </p>
        </div>

        {/* Email */}
        <div className="px-6 py-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <span className="flex items-center gap-2">
              <Mail size={15} className="text-gray-400" />
              Email Address
            </span>
          </label>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); setSuccess(false); }}
            placeholder="you@example.com"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1.5 text-xs text-gray-400">
            Used for invite notifications and account recovery
          </p>
        </div>

        {/* Preferred Language */}
        <div className="px-6 py-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <span className="flex items-center gap-2">
              <Globe size={15} className="text-gray-400" />
              Preferred Language
            </span>
          </label>
          <select
            value={language}
            onChange={e => { setLanguage(e.target.value); setError(''); setSuccess(false); }}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-400">
            Your primary language for calls and translations
          </p>
        </div>

        {/* Phone (read-only) */}
        <div className="px-6 py-5 bg-gray-50 rounded-b-2xl">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <span className="flex items-center gap-2">
              <Phone size={15} className="text-gray-400" />
              Phone Number
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={profile?.phoneNumber ?? ''}
              readOnly
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm bg-gray-100 cursor-not-allowed"
            />
            <span className="text-xs text-gray-400 whitespace-nowrap">Used for login</span>
          </div>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <Check size={16} className="flex-shrink-0" />
          Profile updated successfully
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : success ? (
            <Check size={16} />
          ) : (
            <Save size={16} />
          )}
          {saving ? 'Saving…' : success ? 'Saved!' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
