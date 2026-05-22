import { requireAuth } from '@/lib/auth';
import { RoomMode } from '@/components/portal/room/RoomMode';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Room Mode | LifeSync',
  description: 'Real-time translation for every language in the room',
};

export default async function RoomPage() {
  await requireAuth();
  return <RoomMode />;
}
