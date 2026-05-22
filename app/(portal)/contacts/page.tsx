import { requireAuth } from '@/lib/auth';
import { ContactsPageTabs } from '@/components/portal/contacts/ContactsPageTabs';
import { InviteButton } from '@/components/portal/InviteButton';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Contacts | LifeSync',
  description: 'Browse platform users and manage your external contact book',
};

export default async function ContactsPage() {
  const user = await requireAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Contacts</h1>
          <p className="mt-1 text-gray-600">
            Platform users you can call and your external contact book
          </p>
        </div>
        <InviteButton />
      </div>
      <ContactsPageTabs hasOrg={!!user?.orgId} />
    </div>
  );
}
