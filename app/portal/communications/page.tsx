import { redirect } from 'next/navigation';

// Legacy URL — redirect to the portal page
export default function LegacyCommunicationsPage() {
  redirect('/communications');
}
