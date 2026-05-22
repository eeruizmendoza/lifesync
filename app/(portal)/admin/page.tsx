import React from 'react';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { checkSuperAdmin } from '@/lib/admin-auth';
import { AdminDashboard } from '@/components/portal/admin/AdminDashboard';
import { ProviderHealthPanel } from '@/components/portal/admin/ProviderHealthPanel';
import { Shield } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin | LifeSync',
  description: 'Super-admin dashboard — platform management',
};

export default async function AdminPage() {
  const user = await requireAuth();

  const isAdmin = checkSuperAdmin(user.phoneNumber);

  if (!isAdmin) {
    // If SUPER_ADMIN_PHONES is not set at all, show a helpful message rather than a blank 403
    const adminPhones = process.env.SUPER_ADMIN_PHONES ?? '';
    if (!adminPhones) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
            <Shield size={28} className="text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Not Configured</h1>
          <p className="text-gray-500 max-w-md">
            Set the <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">SUPER_ADMIN_PHONES</code> environment
            variable in Vercel to enable the admin dashboard.
          </p>
          <p className="text-sm text-gray-400">
            Example: <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">+15105551234</code>
          </p>
        </div>
      );
    }
    redirect('/communications');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
          <Shield size={20} className="text-purple-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin</h1>
          <p className="text-gray-500 text-sm">Super-admin dashboard · platform management</p>
        </div>
      </div>
      <AdminDashboard />
      <ProviderHealthPanel />
    </div>
  );
}
