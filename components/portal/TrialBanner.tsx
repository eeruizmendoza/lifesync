'use client';

/**
 * TrialBanner
 * Shown at the top of the portal main content area when the user's org is on the free trial.
 * Polls /api/orgs on mount, dismisses once user is on a paid plan or closes the banner.
 */

import { useEffect, useState } from 'react';
import { Zap, X } from 'lucide-react';
import Link from 'next/link';

export function TrialBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Respect manual dismiss for this session
    if (sessionStorage.getItem('trial_banner_dismissed')) return;

    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
    if (!token) return;

    fetch('/api/orgs', {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.org?.plan === 'trial') setShow(true);
      })
      .catch(() => { /* ignore */ });
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem('trial_banner_dismissed', '1');
    setDismissed(true);
  };

  if (!show || dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2.5 flex items-center justify-between gap-3 text-sm rounded-xl mb-4">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Zap size={15} className="flex-shrink-0" />
        <span className="truncate">
          You're on the <strong>Free Trial</strong> — limited to 3 users and 100 calls/month.
        </span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <Link
          href="/billing"
          className="bg-white text-blue-600 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-blue-50 transition-colors"
        >
          Upgrade now
        </Link>
        <button
          onClick={handleDismiss}
          className="text-white/70 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
