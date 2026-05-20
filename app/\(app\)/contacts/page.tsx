'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
}

export default function ContactsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Contacts</h1>
        <p className="text-gray-600">
          Manage your connections and find people you know
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Search */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-lg shadow p-6">
            <input
              type="text"
              placeholder="Search contacts by name or phone..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Empty State */}
        <div className="md:col-span-2">
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No contacts yet
            </h2>
            <p className="text-gray-600 mb-6">
              Invite your contacts to LifeSync to start communicating
            </p>
            <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg">
              Invite Contacts
            </button>
          </div>
        </div>
      </div>

      {/* Contact Suggestions */}
      <div className="mt-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Suggested Contacts</h2>
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-600 mb-4">
            Import your contacts to see suggestions
          </p>
          <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg">
            Sync Contacts
          </button>
        </div>
      </div>
    </main>
  );
}
