import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function PortalNotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
        <Compass size={28} className="text-gray-400" />
      </div>
      <div>
        <h2 className="text-4xl font-bold text-gray-900">404</h2>
        <p className="text-gray-500 mt-1">Page not found</p>
      </div>
      <p className="text-sm text-gray-400 max-w-xs">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        href="/communications"
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
      >
        Back to Communications
      </Link>
    </div>
  );
}
