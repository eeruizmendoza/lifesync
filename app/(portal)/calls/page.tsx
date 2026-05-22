import React from 'react';
import { requireAuth } from '@/lib/auth';
import { CallHistory } from '@/components/portal/communications/CallHistory';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Call History | LifeSync',
  description: 'View your past translated calls',
};

export default async function CallsPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Call History</h1>
        <p className="mt-1 text-gray-600">
          Your past phone and video calls with real-time translation
        </p>
      </div>
      <CallHistory />
    </div>
  );
}
