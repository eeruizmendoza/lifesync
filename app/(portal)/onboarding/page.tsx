import React from 'react';
import { OnboardingWizard } from '@/components/portal/org/OnboardingWizard';
import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getUserOrganization } from '@/lib/database/organizations';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Get Started | LifeSync',
  description: 'Set up your organization to start using LifeSync',
};

export default async function OnboardingPage() {
  const user = await requireAuth();

  // If user already has an org, skip onboarding
  if (user.orgId) {
    redirect('/communications');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center px-4 py-12">
      <OnboardingWizard userId={user.id} />
    </div>
  );
}
