import React from 'react';
import { requireAuth } from '@/lib/auth';
import { BillingDashboard } from '@/components/portal/org/BillingDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Billing & Plan | LifeSync',
  description: 'Manage your subscription, plan, and billing details',
};

export default async function BillingPage() {
  const user = await requireAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Billing & Plan</h1>
        <p className="mt-1 text-gray-600">Manage your subscription and usage</p>
      </div>
      <BillingDashboard userId={user.id} orgId={user.orgId ?? null} />
    </div>
  );
}
