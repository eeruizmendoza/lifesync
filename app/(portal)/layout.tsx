'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Phone,
  CreditCard,
  Building2,
  LogOut,
  Menu,
  X,
  MessageSquare,
  Settings,
  Mic,
  ShieldCheck,
  History,
  Users,
  Cpu,
  Home,
  Globe,
} from 'lucide-react';
import { IncomingCallBanner } from '@/components/portal/communications/IncomingCallBanner';
import { TrialBanner } from '@/components/portal/TrialBanner';
import { InviteButton } from '@/components/portal/InviteButton';
import { NotificationsBell } from '@/components/portal/notifications/NotificationsBell';
import { GlobalSearch } from '@/components/portal/search/GlobalSearch';
import { MobileNav } from '@/components/portal/MobileNav';
import { PWAInstallPrompt } from '@/components/portal/PWAInstallPrompt';

interface User {
  id: string;
  phoneNumber: string;
  name?: string;
  email?: string;
  orgId?: string | null;
  isAdmin?: boolean;
}

const NAV_LINKS = [
  { href: '/home',           label: 'Home',           icon: Home },
  { href: '/communications', label: 'Communications', icon: Phone },
  { href: '/contacts',       label: 'Contacts',       icon: Users },
  { href: '/room',           label: 'Room Mode',      icon: Globe },
  { href: '/calls',          label: 'Call History',   icon: History },
  { href: '/recordings',     label: 'Recordings',     icon: Mic },
  { href: '/organization',   label: 'Organization',   icon: Building2 },
  { href: '/billing',        label: 'Billing & Plan',  icon: CreditCard },
  { href: '/settings',       label: 'Settings',       icon: Settings },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
    if (!token) { router.push('/login'); return; }

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setUser(data.user);
        setLoading(false);
        // Redirect to onboarding if user has no org and is not already there
        if (!data.user?.orgId && !window.location.pathname.includes('/onboarding')) {
          router.push('/onboarding');
        }
      })
      .catch(() => { router.push('/login'); });
  }, [router]);

  // Presence heartbeat — update last_seen_at every 60 seconds
  useEffect(() => {
    const pingPresence = () => {
      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
      if (!token) return;
      fetch('/api/auth/presence', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      }).catch(() => { /* ignore */ });
    };
    pingPresence(); // immediate ping on mount
    const interval = setInterval(pingPresence, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
    await fetch('/api/auth/logout', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : (user?.phoneNumber?.slice(-2) ?? '??');

  return (
    <>
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200
        md:static md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <MessageSquare size={18} className="text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">LifeSync</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto md:hidden text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-gray-100">
          <GlobalSearch />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={18} className={active ? 'text-blue-600' : 'text-gray-400'} />
                {label}
              </Link>
            );
          })}

          {/* Admin links — only shown to super-admins */}
          {user?.isAdmin && (
            <>
              <div className="my-2 border-t border-gray-100" />
              <Link
                href="/admin"
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/admin'
                    ? 'bg-purple-50 text-purple-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <ShieldCheck
                  size={18}
                  className={pathname === '/admin' ? 'text-purple-600' : 'text-gray-400'}
                />
                Admin
              </Link>
              <Link
                href="/admin/models"
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/admin/models'
                    ? 'bg-purple-50 text-purple-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Cpu
                  size={18}
                  className={pathname === '/admin/models' ? 'text-purple-600' : 'text-gray-400'}
                />
                AI Models
              </Link>
            </>
          )}
        </nav>

        {/* Invite button */}
        <div className="px-4 pb-2">
          <InviteButton variant="ghost" className="w-full justify-center text-xs" />
        </div>

        {/* User profile */}
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name ?? 'User'}</p>
              <p className="text-xs text-gray-400 truncate">{user?.phoneNumber ?? user?.email ?? ''}</p>
            </div>
            <NotificationsBell />
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Incoming call notifications — visible on all portal pages */}
      <IncomingCallBanner />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg flex-shrink-0"
          >
            <Menu size={20} />
          </button>
          <span className="text-lg font-bold text-gray-900 flex-shrink-0">LifeSync</span>
          <div className="flex-1" />
          <NotificationsBell />
        </header>

        <main className="flex-1 p-4 md:p-6 max-w-5xl w-full mx-auto pb-20 md:pb-6">
          <TrialBanner />
          {children}
        </main>
      </div>
    </div>

    {/* Mobile bottom navigation (hidden on md+) */}
    <MobileNav />

    {/* PWA install prompt */}
    <PWAInstallPrompt />
    </>
  );
}
