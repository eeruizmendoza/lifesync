'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
}

export default function InboxPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated by verifying token in cookie
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) {
          router.push('/login');
          return;
        }
        const data = await response.json();
        setUser(data.user);
      } catch (error) {
        console.error('Auth check failed:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">LifeSync</h1>
          <nav className="flex items-center gap-6">
            <button className="text-gray-700 hover:text-gray-900">Inbox</button>
            <button className="text-gray-700 hover:text-gray-900">Feed</button>
            <button className="text-gray-700 hover:text-gray-900">Contacts</button>
            <button className="text-gray-700 hover:text-gray-900">Settings</button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-3 gap-6">
          {/* Sidebar */}
          <aside className="col-span-1 space-y-4">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Welcome!</h2>
              {user && (
                <div>
                  <p className="text-gray-700">{user.name || user.phoneNumber}</p>
                  <p className="text-sm text-gray-500">{user.email}</p>
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 text-sm mb-2">
                🚀 Getting Started
              </h3>
              <ul className="text-sm text-blue-800 space-y-2">
                <li>✓ Verify your phone number</li>
                <li>• Connect Gmail account</li>
                <li>• Import iPhone messages</li>
                <li>• Invite contacts</li>
              </ul>
            </div>
          </aside>

          {/* Content Area */}
          <div className="col-span-2">
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Inbox Empty
              </h2>
              <p className="text-gray-600 mb-6">
                Start by connecting your email and importing your messages
              </p>
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg">
                Connect Gmail
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
