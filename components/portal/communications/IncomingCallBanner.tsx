'use client';

/**
 * IncomingCallBanner
 * Polls /api/calls/incoming every 3 seconds.
 * When an incoming call is detected, shows a modal overlay with:
 *   - Caller name + language direction
 *   - Accept (green) / Decline (red) buttons
 *   - Auto-dismisses when call expires
 * Renders at the portal layout level so it's visible on any page.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Phone, PhoneOff, Video, X } from 'lucide-react';
import { PhoneCallDialog } from './PhoneCallDialog';
import { VideoCallDialog } from './VideoCallDialog';

interface IncomingCall {
  callId: string;
  sourceLanguage: string;
  targetLanguage: string;
  callType: 'audio' | 'video';
  callerName: string;
  callerPhone: string;
  createdAt: number;
  expiresAt: number;
}

// Simple ring animation via CSS string — no external deps
const RING_KEYFRAMES = `
@keyframes ring-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
  50% { transform: scale(1.05); box-shadow: 0 0 0 16px rgba(34, 197, 94, 0); }
}
`;

export function IncomingCallBanner() {
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<IncomingCall | null>(null);
  const [declined, setDeclined] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getToken = () =>
    typeof window !== 'undefined'
      ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || ''
      : '';

  const poll = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/calls/incoming', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok && data.calls?.length > 0) {
        const call: IncomingCall = data.calls[0];
        setIncomingCall(prev => {
          // Only set if it's a new call ID
          if (prev?.callId === call.callId) return prev;
          setDeclined(false);
          setTimeLeft(Math.max(0, Math.round((call.expiresAt - Date.now()) / 1000)));
          return call;
        });
      } else {
        // If no pending call, clear any displayed one (it may have been handled elsewhere)
        setIncomingCall(prev => {
          if (prev && !activeCall) return null;
          return prev;
        });
      }
    } catch { /* ignore network errors */ }
  }, [activeCall]);

  // Poll for incoming calls every 3 seconds
  useEffect(() => {
    poll(); // immediate first poll
    pollRef.current = setInterval(poll, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [poll]);

  // Countdown timer
  useEffect(() => {
    if (!incomingCall || activeCall || declined) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIncomingCall(null); // auto-dismiss when expired
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [incomingCall, activeCall, declined]);

  const handleAccept = async () => {
    if (!incomingCall) return;
    // Mark as answered on server
    const token = getToken();
    try {
      await fetch('/api/calls/incoming', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ callId: incomingCall.callId, action: 'answer' }),
      });
    } catch { /* non-fatal */ }
    // Open the call dialog
    setActiveCall(incomingCall);
    setIncomingCall(null);
  };

  const handleDecline = async () => {
    if (!incomingCall) return;
    const token = getToken();
    setDeclined(true);
    try {
      await fetch('/api/calls/incoming', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ callId: incomingCall.callId, action: 'reject' }),
      });
    } catch { /* non-fatal */ }
    setTimeout(() => {
      setIncomingCall(null);
      setDeclined(false);
    }, 1500);
  };

  const handleEndActiveCall = () => {
    setActiveCall(null);
  };

  const LANG_NAMES: Record<string, string> = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German',
    zh: 'Chinese', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese',
    it: 'Italian', ru: 'Russian', ar: 'Arabic', hi: 'Hindi',
    nl: 'Dutch', pl: 'Polish', tr: 'Turkish', sv: 'Swedish',
    uk: 'Ukrainian', vi: 'Vietnamese', id: 'Indonesian', th: 'Thai',
  };
  const langLabel = (code: string) => LANG_NAMES[code] ?? code.toUpperCase();

  return (
    <>
      <style>{RING_KEYFRAMES}</style>

      {/* Incoming call modal */}
      {incomingCall && !activeCall && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none sm:items-start sm:justify-end sm:p-6">
          <div
            className={`pointer-events-auto w-full max-w-sm mx-4 mb-4 sm:mx-0 sm:mb-0 rounded-2xl shadow-2xl border overflow-hidden transition-all duration-300 ${
              declined ? 'bg-red-50 border-red-200 opacity-50' : 'bg-white border-gray-200'
            }`}
          >
            {/* Top stripe */}
            <div className={`h-1 w-full ${declined ? 'bg-red-400' : 'bg-green-400'}`} />

            <div className="p-5">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
                    {incomingCall.callType === 'video' ? '📹 Incoming video call' : '📞 Incoming call'}
                  </p>
                  <h3 className="text-xl font-bold text-gray-900">
                    {incomingCall.callerName || incomingCall.callerPhone || 'Unknown caller'}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {langLabel(incomingCall.sourceLanguage)} → {langLabel(incomingCall.targetLanguage)}
                  </p>
                </div>
                {/* Avatar */}
                <div
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0 ml-3"
                  style={{ animation: declined ? 'none' : 'ring-pulse 1.2s ease-in-out infinite' }}
                >
                  {(incomingCall.callerName || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              </div>

              {/* Time bar */}
              {!declined && (
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-400">Auto-decline in {timeLeft}s</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-400 rounded-full transition-all duration-1000"
                      style={{ width: `${(timeLeft / 30) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {declined ? (
                <div className="text-center py-2 text-red-600 text-sm font-medium">
                  Call declined
                </div>
              ) : (
                <div className="flex gap-3">
                  {/* Decline */}
                  <button
                    onClick={handleDecline}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 font-semibold transition-colors"
                  >
                    <PhoneOff size={18} />
                    Decline
                  </button>
                  {/* Accept */}
                  <button
                    onClick={handleAccept}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 text-white hover:bg-green-600 font-semibold transition-colors"
                  >
                    {incomingCall.callType === 'video' ? <Video size={18} /> : <Phone size={18} />}
                    Answer
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active call dialogs (after accepting) */}
      {activeCall && activeCall.callType === 'audio' && (
        <PhoneCallDialog
          callId={activeCall.callId}
          contactId=""
          contactName={activeCall.callerName || 'Caller'}
          contactPhone={activeCall.callerPhone || ''}
          sourceLanguage={activeCall.targetLanguage} // receiver's language is the target
          targetLanguage={activeCall.sourceLanguage}
          isOpen={true}
          onEnd={handleEndActiveCall}
          onClose={handleEndActiveCall}
        />
      )}

      {activeCall && activeCall.callType === 'video' && (
        <VideoCallDialog
          callId={activeCall.callId}
          contactId=""
          contactName={activeCall.callerName || 'Caller'}
          sourceLanguage={activeCall.targetLanguage}
          targetLanguage={activeCall.sourceLanguage}
          isOpen={true}
          onEnd={handleEndActiveCall}
          onClose={handleEndActiveCall}
        />
      )}
    </>
  );
}
