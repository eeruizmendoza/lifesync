import React from 'react';
import { requireAuth } from '@/lib/auth';
import { OrganizationSettings } from '@/components/portal/org/OrganizationSettings';
import { OrgAnalytics } from '@/components/portal/org/OrgAnalytics';
import { AuditLog } from '@/components/portal/org/AuditLog';

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

      {/* Analytics dashboard — only rendered when org exists (component self-hides otherwise) */}
      <OrgAnalytics />

      <OrganizationSettings userId={user.id} orgId={user.orgId ?? null} />

      {/* Security audit log — only visible to admins/owners (component self-hides on 403) */}
      <AuditLog />
    </div>
  );
}
