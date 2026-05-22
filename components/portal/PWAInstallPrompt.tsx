'use client';

/**
 * PWAInstallPrompt
 * Shows an "Add to Home Screen" banner when the browser fires the
 * beforeinstallprompt event (Chrome, Edge on Android).
 * For iOS Safari: shows a manual instruction banner.
 *
 * Dismissed for 30 days once the user taps "Not now".
 */

import { useState, useEffect } from 'react';
import { X, Download, Share } from 'lucide-react';

const DISMISSED_KEY = 'lifesync_pwa_dismissed';
const DISMISS_DAYS  = 30;

function isDismissed(): boolean {
  try {
    const val = localStorage.getItem(DISMISSED_KEY);
    if (!val) return false;
    const until = parseInt(val, 10);
    return Date.now() < until;
  } catch { return false; }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now() + DISMISS_DAYS * 86_400_000));
  } catch {}
}

export function PWAInstallPrompt() {
  const [promptEvent, setPromptEvent]   = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS]           = useState(false);
  const [visible, setVisible]           = useState(false);
  const [installed, setInstalled]       = useState(false);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }
    if (isDismissed()) return;

    // Chrome/Edge: catch beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari: detect and show manual instruction
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Record<string, unknown>).MSStream;
    const isInStandalone = (navigator as Record<string, unknown>).standalone;
    if (isIOS && !isInStandalone) {
      setShowIOS(true);
      setVisible(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') setVisible(false);
    setPromptEvent(null);
  };

  const hide = () => {
    dismiss();
    setVisible(false);
  };

  if (!visible || installed) return null;

  // ── iOS: manual instructions ───────────────────────────────────────────────
  if (showIOS) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 bg-indigo-600 text-white rounded-2xl shadow-2xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <Share size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install LifeSync</p>
          <p className="text-xs text-indigo-200 mt-0.5">
            Tap <strong>Share</strong> then <strong>"Add to Home Screen"</strong> for the full app experience.
          </p>
        </div>
        <button onClick={hide} className="text-white/60 hover:text-white flex-shrink-0">
          <X size={16} />
        </button>
      </div>
    );
  }

  // ── Chrome/Edge: native install prompt ────────────────────────────────────
  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 flex items-start gap-3">
      <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
        <Download size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">Install LifeSync</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Add to your home screen for the fastest experience — works offline too.
        </p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={install}
            className="flex-1 text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Install
          </button>
          <button
            onClick={hide}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
      <button onClick={hide} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}

// TypeScript: BeforeInstallPromptEvent is not in TS lib
declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}
