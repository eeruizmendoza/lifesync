'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  params: Promise<{ token: string }>;
}

export default function InvitePage({ params }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'accepting' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    params.then(p => setToken(p.token));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    setStatus('loading');
    // Check if we have an auth token
    const authToken = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
    if (!authToken) {
      // Not logged in — redirect to login, come back after
      router.push(`/login?redirect=/invite/${token}`);
    } else {
      setStatus('accepting');
    }
  }, [token, router]);

  const acceptInvite = async () => {
    const authToken = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
    try {
      const res = await fetch('/api/orgs/invites/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Failed to accept invite');
        return;
      }
      // Store new token with orgId
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
      }
      setStatus('success');
      setMessage(`Welcome to ${data.org?.name ?? 'the organization'}!`);
      setTimeout(() => router.push('/portal/communications'), 2000);
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="text-5xl mb-4">✉️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Organization Invite</h1>

        {status === 'loading' && (
          <p className="text-gray-500">Checking your invite...</p>
        )}

        {status === 'accepting' && (
          <>
            <p className="text-gray-600 mb-6">You have been invited to join an organization on LifeSync.</p>
            <button
              onClick={acceptInvite}
              className="w-full py-3 px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Accept Invite
            </button>
          </>
        )}

        {status === 'success' && (
          <div>
            <p className="text-green-600 font-semibold text-lg mb-2">✅ {message}</p>
            <p className="text-gray-500 text-sm">Redirecting to your portal...</p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <p className="text-red-600 font-semibold mb-4">⚠️ {message}</p>
            <button
              onClick={() => router.push('/')}
              className="text-blue-600 underline text-sm"
            >
              Go home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
