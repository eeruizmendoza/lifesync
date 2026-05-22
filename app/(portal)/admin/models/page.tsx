import { requireAuth } from '@/lib/auth';
import { checkSuperAdmin } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { AdminModelsPanel } from '@/components/portal/admin/AdminModelsPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AI Models | LifeSync Admin',
  description: 'Monitor and benchmark AI model performance',
};

export default async function AdminModelsPage() {
  const user = await requireAuth();

  if (!checkSuperAdmin(user.phoneNumber)) {
    redirect('/communications');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">AI Model Management</h1>
        <p className="mt-1 text-gray-600">
          Monitor model health, benchmarks, and performance metrics
        </p>
      </div>
      <AdminModelsPanel />
    </div>
  );
}
