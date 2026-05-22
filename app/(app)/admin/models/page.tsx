import { redirect } from 'next/navigation';

// AI model monitoring moved to the portal admin section
export default function LegacyAdminModelsPage() {
  redirect('/admin/models');
}
