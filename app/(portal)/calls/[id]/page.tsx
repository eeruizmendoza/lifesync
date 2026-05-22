import React from 'react';
import { requireAuth } from '@/lib/auth';
import { CallDetail } from '@/components/portal/communications/CallDetail';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Call Detail | LifeSync',
};

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;

  return (
    <div>
      <CallDetail callId={id} />
    </div>
  );
}
