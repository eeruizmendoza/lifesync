'use client';

import { useCallContext } from '@/lib/hooks/useCallContext';
import { useEffect, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from 'lucide-react';
import { CallTimer } from './CallTimer';
import { RealTimeTranscript } from './RealTimeTranscript';
import { RecordingAnnouncementDialog, useRecordingAnnouncement } from './RecordingAnnouncementDialog';
import type { PhoneCallDialogProps } from '@/lib/types/calls';

export function PhoneCallDialog({
  contactId,
  contactName,
  contactPhone,
  sourceLanguage,
  targetLanguage,
  isOpen,
  onClose,
  onEnd,
}: PhoneCallDialogProps) {
  const { state, initiateCall, answerCall, rejectCall, endCall, mute, unmute } = useCallContext();
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);

  // Recording announcement
  const announcement = useRecordingAnnouncement();
  const [userState, setUserState] = useState<string | undefined>();
  const [announcementShown, setAnnouncementShown] = useState(false);

  // Get user's state for jurisdiction detection
  useEffect(() => {
    const detectUserState = async () => {
      try {
        // Try to get from browser geolocation
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              // In production, convert lat/long to state using reverse geolocation service
              // For now, default to undefined (will use default announcement)
              console.log('User location:', position.coords);
            },
            (error) => {
              console.warn('Geolocation not available:', error);
            }
          );
        }
      } catch (error) {
        console.warn('Failed to detect user state:', error);
      }
    };

    detectUserState();
  }, []);

  // Initiate call on open
  useEffect(() => {
    if (isOpen && state.callState === 'idle') {
      initiateCall(contactId, sourceLanguage, targetLanguage);
    }
  }, [isOpen, state.callState, contactId, sourceLanguage, targetLanguage, initiateCall]);

  // Show recording announcement when call transitions to ringing/connecting
  useEffect(() => {
    if (
      isOpen &&
      state.callId &&
      (state.callState === 'ringing' || state.callState === 'connecting') &&
      !announcementShown
    ) {
      setAnnouncementShown(true);
      // Delay announcement to allow call to connect
      const timer = setTimeout(() => {
        announcement.show(state.callId ?? '', userState, sourceLanguage);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [
    isOpen,
    state.callState,
    state.callId,
    announcementShown,
    userState,
    sourceLanguage,
    announcement,
  ]);

  // Handle mute toggle
  const toggleMute = () => {
    if (isMuted) {
      unmute();
    } else {
      mute();
    }
    setIsMuted(!isMuted);
  };

  if (!isOpen) return null;

  const handleRecordingConsent = () => {
    // User consented to recording - close announcement and continue with call
    console.log(`✅ Recording consent given for call ${state.callId}`);
    announcement.close();
  };

  const handleRecordingDecline = () => {
    // User declined recording - reject call
    console.log(`❌ Recording consent declined for call ${state.callId}`);
    rejectCall();
    announcement.close();
    (onClose ?? onEnd)?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      {/* Recording Announcement Dialog */}
      <RecordingAnnouncementDialog
        open={announcement.open}
        callId={announcement.callId}
        targetState={userState}
        targetLanguage={sourceLanguage}
        onConsent={handleRecordingConsent}
        onReject={handleRecordingDecline}
      />

      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-3xl font-bold">
            {contactName.charAt(0)}
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{contactName}</h2>
          <p className="mt-1 text-sm text-gray-500">{contactPhone}</p>
          <p className="mt-2 text-xs text-gray-400">
            {sourceLanguage.toUpperCase()} ↔ {targetLanguage.toUpperCase()}
          </p>
        </div>

        {/* State indicator */}
        <div className="mt-6 text-center">
          {state.callState === 'ringing' && (
            <p className="animate-pulse text-sm font-medium text-gray-600">Calling...</p>
          )}
          {state.callState === 'connecting' && (
            <p className="animate-pulse text-sm font-medium text-gray-600">Connecting...</p>
          )}
          {state.callState === 'connected' && (
            <>
              <div className="flex items-center justify-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse"></div>
                <span className="text-xs font-semibold text-red-600 uppercase">Recording</span>
              </div>
              <CallTimer className="flex justify-center text-green-600 font-bold text-lg mt-2" />
            </>
          )}
          {state.callState === 'hold' && (
            <p className="text-sm font-medium text-yellow-600">On hold</p>
          )}
          {state.callState === 'failed' && (
            <p className="text-sm font-medium text-red-600">{state.error || 'Call failed'}</p>
          )}
        </div>

        {/* Transcript area */}
        {state.callState === 'connected' && state.transcriptTurns.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold text-gray-500 uppercase">Live transcript</p>
            <RealTimeTranscript maxHeight="200px" maxTurns={5} showConfidence={false} />
          </div>
        )}

        {/* Controls */}
        <div className="mt-8 flex justify-center gap-4">
          {state.callState === 'ringing' && (
            <>
              <button
                onClick={() => {
                  rejectCall();
                  (onClose ?? onEnd)?.();
                }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition shadow-lg"
                title="Reject"
              >
                <PhoneOff size={24} />
              </button>
              <button
                onClick={() => answerCall(state.callId!)}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 transition shadow-lg"
                title="Answer"
              >
                <Phone size={24} />
              </button>
            </>
          )}

          {(state.callState === 'connecting' || state.callState === 'connected') && (
            <>
              <button
                onClick={toggleMute}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition shadow-lg text-white ${
                  isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>

              <div className="flex items-center gap-2 px-3 rounded-full bg-gray-100">
                <Volume2 size={18} className="text-gray-600" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(+e.target.value)}
                  className="w-16 h-1 cursor-pointer"
                  title="Volume"
                />
              </div>

              <button
                onClick={() => {
                  endCall();
                  (onClose ?? onEnd)?.();
                }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition shadow-lg"
                title="End call"
              >
                <PhoneOff size={24} />
              </button>
            </>
          )}

          {state.callState === 'failed' && (
            <button
              onClick={() => {
                (onClose ?? onEnd)?.();
              }}
              className="flex h-12 px-6 items-center justify-center rounded-full bg-gray-500 text-white hover:bg-gray-600 transition font-medium"
            >
              Close
            </button>
          )}
        </div>

        {/* Language info */}
        {state.callState === 'connected' && (
          <p className="mt-6 text-center text-xs text-gray-400">
            You speak {sourceLanguage.toUpperCase()} • Contact speaks {targetLanguage.toUpperCase()}
          </p>
        )}
      </div>
    </div>
  );
}
