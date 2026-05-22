import React from 'react';
import { requireAuth } from '@/lib/auth';
import { RecordingsList } from '@/components/portal/recordings/RecordingsList';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Recordings | LifeSync',
  description: 'View, download, and manage your encrypted call recordings',
};

export default async function RecordingsPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Recordings</h1>
        <p className="mt-1 text-gray-600">
          Your encrypted call recordings — stored with XChaCha20-Poly1305 encryption
        </p>
      </div>
      <RecordingsList />
    </div>
  );
}
