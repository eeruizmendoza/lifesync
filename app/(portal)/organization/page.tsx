import React from 'react';
import { requireAuth } from '@/lib/auth';
import { OrganizationSettings } from '@/components/portal/org/OrganizationSettings';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Organization | LifeSync',
  description: 'Manage your organization, members, and invites',
};

export default async function OrganizationPage() {
  const user = await requireAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Organization</h1>
        <p className="mt-1 text-gray-600">Manage your team, roles, and invitations</p>
      </div>
      <OrganizationSettings userId={user.id} orgId={user.orgId ?? null} />
    </div>
  );
}
