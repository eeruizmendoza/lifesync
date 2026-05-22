import { Dashboard } from '@/components/portal/Dashboard';
import { DashboardWidget } from '@/components/portal/communications/DashboardWidget';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Home | LifeSync',
  description: 'Your LifeSync command center',
};

export default function HomePage() {
  return (
    <div className="space-y-5">
      {/* Onboarding checklist (auto-hides when all steps complete) */}
      <DashboardWidget />

      {/* Main dashboard — greeting + Room Mode CTA + activity feed */}
      <Dashboard />
    </div>
  );
}
