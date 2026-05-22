import { requireAuth } from '@/lib/auth';
import { ContactsList } from '@/components/portal/contacts/ContactsList';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Contacts | LifeSync',
  description: 'Browse and call people on LifeSync',
};

export default async function ContactsPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Contacts</h1>
        <p className="mt-1 text-gray-600">
          Browse people on LifeSync and start a translated call
        </p>
      </div>
      <ContactsList />
    </div>
  );
}
