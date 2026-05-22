'use client';

import React from 'react';

/**
 * NotificationsBell
 * Bell icon with unread badge. Click opens a dropdown list of notifications.
 * Polls for new notifications every 30 seconds.
 * Marks all as read when dropdown opened.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bell,
  Phone,
  UserPlus,
  AlertTriangle,
  Info,
  Check,
  CheckCheck,
  ExternalLink,
  X,
  UserX,
  MessageSquare,
  ListTodo,
} from 'lucide-react';
import Link from 'next/link';

interface NotificationItem {
  id: string;
  type: string; // missed_call | member_joined | quota_warning | system | dormant_contact | unread_digest | ai_action_item | follow_up
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
  missed_call:      { icon: Phone,         bg: 'bg-red-50',     color: 'text-red-500'    },
  member_joined:    { icon: UserPlus,      bg: 'bg-green-50',   color: 'text-green-600'  },
  quota_warning:    { icon: AlertTriangle, bg: 'bg-amber-50',   color: 'text-amber-500'  },
  system:           { icon: Info,          bg: 'bg-blue-50',    color: 'text-blue-500'   },
  // Phase 54 types
  dormant_contact:  { icon: UserX,         bg: 'bg-orange-50',  color: 'text-orange-500' },
  unread_digest:    { icon: MessageSquare, bg: 'bg-indigo-50',  color: 'text-indigo-600' },
  ai_action_item:   { icon: ListTodo,      bg: 'bg-violet-50',  color: 'text-violet-600' },
  follow_up:        { icon: AlertTriangle, bg: 'bg-amber-50',   color: 'text-amber-500'  },
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = getToken();
      const res = await fetch('/api/notifications?limit=15', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      /* ignore */
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    fetchNotifications(true);
    const interval = setInterval(() => fetchNotifications(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleOpen = async () => {
    setOpen(prev => !prev);
    if (!open) {
      await fetchNotifications();
      // Mark all as read after short delay
      if (unreadCount > 0) {
        setTimeout(async () => {
          try {
            const token = getToken();
            await fetch('/api/notifications', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              credentials: 'include',
              body: JSON.stringify({ all: true }),
            });
            setUnreadCount(0);
            setItems(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
          } catch { /* ignore */ }
        }, 1500);
      }
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-900 text-sm">Notifications</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <span className="text-xs text-gray-400">{unreadCount} unread</span>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Bell size={18} className="text-gray-300" />
                </div>
                <p className="text-sm text-gray-500">No notifications yet</p>
                <p className="text-xs text-gray-400 mt-1">Missed calls and events will appear here</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {items.map(item => {
                  const meta = TYPE_ICONS[item.type] ?? TYPE_ICONS.system;
                  const IconComp = meta.icon;
                  const isUnread = !item.readAt;

                  const content = (
                    <div className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${isUnread ? 'bg-blue-50/30' : ''}`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                        <IconComp size={14} className={meta.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {item.title}
                        </p>
                        {item.body && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-snug">{item.body}</p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-1">{timeAgo(item.createdAt)}</p>
                      </div>
                      {isUnread && (
                        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                  );

                  return (
                    <li key={item.id}>
                      {item.link ? (
                        <Link href={item.link} onClick={() => setOpen(false)}>
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
              <Link
                href="/calls"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:underline"
              >
                <ExternalLink size={11} />
                View call history
              </Link>
              {unreadCount > 0 && (
                <button
                  onClick={async () => {
                    const token = getToken();
                    await fetch('/api/notifications', {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                      },
                      credentials: 'include',
                      body: JSON.stringify({ all: true }),
                    }).catch(() => {});
                    setUnreadCount(0);
                    setItems(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
                  }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <CheckCheck size={11} />
                  Mark all read
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
