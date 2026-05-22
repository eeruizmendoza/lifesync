'use client';

/**
 * MobileNav
 * Bottom tab navigation bar — visible only on mobile (< md breakpoint).
 * Shows the 5 most important tabs: Home, Communications, Contacts, Room, More.
 * Mirrors the desktop sidebar but optimized for thumb-reach.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Phone, Users, Globe, Menu } from 'lucide-react';
import { useState } from 'react';

const PRIMARY_TABS = [
  { href: '/home',           label: 'Home',    icon: Home  },
  { href: '/communications', label: 'Call',    icon: Phone },
  { href: '/contacts',       label: 'People',  icon: Users },
  { href: '/room',           label: 'Room',    icon: Globe },
];

export function MobileNav() {
  const pathname  = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white/95 backdrop-blur-sm border-t border-gray-200 safe-area-bottom">
        <div className="flex items-stretch h-16">
          {PRIMARY_TABS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active
                    ? 'text-indigo-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                <span className={`text-[10px] font-medium leading-none ${active ? 'text-indigo-600' : 'text-gray-400'}`}>
                  {label}
                </span>
                {active && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-indigo-600 rounded-full" />
                )}
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              menuOpen ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Menu size={22} strokeWidth={menuOpen ? 2.2 : 1.8} />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </nav>

      {/* More menu drawer */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-30 md:hidden bg-black/20 backdrop-blur-[1px]"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed bottom-16 left-0 right-0 z-40 md:hidden bg-white border-t border-gray-200 rounded-t-2xl shadow-2xl pb-4">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-4" />
            <div className="grid grid-cols-4 gap-y-1 px-4">
              {[
                { href: '/calls',        label: 'History',   emoji: '📋' },
                { href: '/recordings',   label: 'Recordings',emoji: '🎙️' },
                { href: '/organization', label: 'Org',       emoji: '🏢' },
                { href: '/billing',      label: 'Billing',   emoji: '💳' },
                { href: '/settings',     label: 'Settings',  emoji: '⚙️' },
              ].map(({ href, label, emoji }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl text-center transition-colors ${
                      active ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="text-2xl">{emoji}</span>
                    <span className="text-[10px] font-medium">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Bottom safe-area spacer so content isn't under the tab bar */}
      <div className="h-16 md:hidden flex-shrink-0" />
    </>
  );
}
