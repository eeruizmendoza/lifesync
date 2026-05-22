import React from 'react';
import { requireAuth } from '@/lib/auth';
import { SettingsTabs } from '@/components/portal/settings/SettingsTabs';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Settings | LifeSync',
  description: 'Manage your profile and account settings',
};

export default async function SettingsPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-gray-600">Manage your profile and account preferences</p>
      </div>
      <SettingsTabs />
    </div>
  );
}
