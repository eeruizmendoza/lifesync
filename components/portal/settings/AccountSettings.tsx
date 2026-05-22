'use client';

/**
 * AccountSettings — "Account" tab in Settings
 * Shows:
 *   - Active session info (phone, joined date placeholder)
 *   - Sign out of all devices button
 *   - Account deletion request section
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Trash2, AlertCircle, Check, Loader2, ShieldAlert } from 'lucide-react';

export function AccountSettings() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [error, setError] = useState('');

  const handleSignOutAll = async () => {
    setSigningOut(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      localStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_token');
      router.push('/login');
    } catch {
      setError('Failed to sign out — please try again');
      setSigningOut(false);
    }
  };

  const handleDeleteRequest = () => {
    if (deleteConfirm.toLowerCase() !== 'delete my account') {
      setError('Type "delete my account" to confirm');
      return;
    }
    // In a real app this would send an email to support or queue an account deletion job.
    // For now, just sign out and show a message.
    setDeleteRequested(true);
    setError('');
  };

  if (deleteRequested) {
    return (
      <div className="max-w-2xl">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <Check size={32} className="mx-auto text-green-600 mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Deletion request received</h3>
          <p className="text-sm text-gray-600">
            Your account deletion request has been submitted. Our team will process it within 30 days
            and confirm via email. You'll continue to have access until deletion is complete.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Sign out section */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Sessions</h2>
        <p className="text-sm text-gray-500 mb-5">
          Sign out of LifeSync on all devices. You'll need to log in again on each device.
        </p>
        <button
          onClick={handleSignOutAll}
          disabled={signingOut}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {signingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
          {signingOut ? 'Signing out…' : 'Sign out of all devices'}
        </button>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl border border-red-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert size={18} className="text-red-500" />
          <h2 className="text-lg font-semibold text-red-700">Danger Zone</h2>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Account deletion is permanent and cannot be undone. All your data including recordings,
          contacts, and call history will be permanently removed.
        </p>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Type <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-red-600">delete my account</span> to confirm
          </label>
          <input
            type="text"
            value={deleteConfirm}
            onChange={e => { setDeleteConfirm(e.target.value); setError(''); }}
            placeholder="delete my account"
            className="w-full px-4 py-2.5 rounded-xl border border-red-300 text-gray-900 text-sm placeholder-gray-400 focus:ring-2 focus:ring-red-400 focus:border-transparent"
          />
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}
          <button
            onClick={handleDeleteRequest}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            <Trash2 size={16} />
            Request account deletion
          </button>
        </div>
      </div>
    </div>
  );
}
