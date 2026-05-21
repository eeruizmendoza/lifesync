import React from 'react';
import { requireAuth } from '@/lib/auth';
import { CommunicationsHub } from '@/components/portal/communications/CommunicationsHub';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Communications | LifeSync',
  description: 'Real-time translation calls, messages, and emails',
};

export default async function CommunicationsPage() {
  // Require authentication
  const user = await requireAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Communications</h1>
        <p className="mt-1 text-gray-600">
          Connect with anyone, anywhere, in any language with real-time translation
        </p>
      </div>

      <CommunicationsHub userId={user.id} />
    </div>
  );
}
