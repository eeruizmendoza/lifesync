import React from 'react';
import { requireAuth } from '@/lib/auth';
import { ContactDetail } from '@/components/portal/communications/ContactDetail';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Contact | LifeSync',
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;

  return (
    <div>
      <ContactDetail contactId={id} />
    </div>
  );
}
