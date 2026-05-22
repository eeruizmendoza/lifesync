import { Dashboard } from '@/components/portal/Dashboard';
import { DashboardWidget } from '@/components/portal/DashboardWidget';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Home | LifeSync',
  description: 'Your LifeSync command center',
};

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Home</h1>
        <p className="mt-1 text-gray-600">Your translation call command center</p>
      </div>

      {/* Onboarding checklist (auto-hides when complete) */}
      <DashboardWidget />

      {/* Main dashboard content */}
      <Dashboard />
    </div>
  );
}
