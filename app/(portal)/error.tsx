'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Portal Error]', error);
  }, [error]);

  const isAuthError =
    error.message?.includes('authorization') ||
    error.message?.includes('authenticated') ||
    error.message?.includes('token');

  if (isAuthError) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
          <AlertTriangle size={28} className="text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Session expired</h2>
        <p className="text-gray-500 text-sm max-w-sm">
          Your session has expired. Please sign in again to continue.
        </p>
        <Link
          href="/login"
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
        <AlertTriangle size={28} className="text-red-400" />
      </div>
      <h2 className="text-xl font-bold text-gray-900">Something went wrong</h2>
      <p className="text-gray-500 text-sm max-w-sm">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      {error.digest && (
        <p className="text-xs text-gray-400 font-mono">Error ID: {error.digest}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors"
        >
          <RefreshCw size={15} />
          Try again
        </button>
        <Link
          href="/communications"
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          <Home size={15} />
          Go home
        </Link>
      </div>
    </div>
  );
}
