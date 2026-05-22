/**
 * Recording Announcement Dialog
 * Displays jurisdiction-specific recording notification
 * Plays audio announcement and waits for user acknowledgment
 */

'use client';

import React, { useEffect, useState } from 'react';
import {
  getAnnouncementText,
  detectJurisdiction,
  getRecordingAnnouncementService,
} from '@/lib/recording-announcement-service';

interface RecordingAnnouncementDialogProps {
  open: boolean;
  callId: string;
  targetState?: string; // e.g., 'CA', 'FL'
  targetLanguage?: string; // e.g., 'en', 'es'
  onConsent: () => void; // User accepts recording
  onReject: () => void; // User declines recording
}

/**
 * Dialog that shows recording announcement before call recording starts
 * Plays audio announcement and requires explicit consent
 */
export function RecordingAnnouncementDialog({
  open,
  callId,
  targetState,
  targetLanguage = 'en',
  onConsent,
  onReject,
}: RecordingAnnouncementDialogProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [jurisdiction, setJurisdiction] = useState<string>('one-party-consent');
  const [announcementText, setAnnouncementText] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);

  useEffect(() => {
    if (!open) return;

    // Detect jurisdiction
    const detected = detectJurisdiction(targetState);
    setJurisdiction(detected);

    // Get jurisdiction-specific announcement text
    const text = getAnnouncementText(detected, targetLanguage);
    setAnnouncementText(text);
  }, [open, targetState, targetLanguage]);

  /**
   * Play audio announcement when dialog opens
   */
  const handlePlayAnnouncement = async () => {
    setIsPlaying(true);

    try {
      const service = getRecordingAnnouncementService();

      // Generate and play announcement
      await service.playRecordingAnnouncement(callId, {
        jurisdiction,
        language: targetLanguage,
      });

      // Announcement audio ends, user can now consent
      setIsPlaying(false);
    } catch (error) {
      console.error('Failed to play announcement:', error);
      setIsPlaying(false);
    }
  };

  /**
   * User accepts recording
   */
  const handleConsent = () => {
    setConsentGiven(true);

    // Log consent event
    console.log(`📞 Recording consent given for call ${callId} (${jurisdiction})`);

    onConsent();
  };

  /**
   * User declines recording
   */
  const handleDecline = () => {
    console.log(`📞 Recording consent declined for call ${callId}`);
    onReject();
  };

  // Determine warning severity based on jurisdiction
  const isTwoPartyConsent =
    jurisdiction === 'two-party-consent' ||
    ['CA', 'FL', 'PA', 'IL', 'NY', 'WA', 'HI', 'MD', 'MT', 'NH', 'NJ', 'VA', 'VT'].includes(
      (jurisdiction as string).toUpperCase()
    );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 15.536a6 6 0 00-8.488-8.488"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3c3.3 0 6.4 1.4 8.5 3.5M3 12a9 9 0 0118 0"
                />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {isTwoPartyConsent ? 'All-Party Consent Required' : 'Recording Notice'}
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 px-6 py-4">
          {/* Jurisdiction-specific announcement text */}
          <div className={`rounded-lg p-4 ${isTwoPartyConsent ? 'bg-red-50' : 'bg-blue-50'}`}>
            <p className={`text-sm leading-relaxed ${isTwoPartyConsent ? 'text-red-900' : 'text-blue-900'}`}>
              {announcementText}
            </p>
          </div>

          {/* Audio playback indicator */}
          {isPlaying && (
            <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-3">
              <div className="animate-pulse">
                <div className="h-2 w-2 rounded-full bg-blue-600" />
              </div>
              <span className="text-sm text-gray-700">Playing audio announcement...</span>
            </div>
          )}

          {/* Consent explanation */}
          <div className="space-y-2 border-t border-gray-200 pt-3">
            <p className="text-xs font-semibold uppercase text-gray-600">Your Confirmation</p>
            <p className="text-sm text-gray-600">
              {isTwoPartyConsent
                ? 'By clicking "I Consent", you confirm that you consent to this call being recorded and that the other party has been notified.'
                : 'By clicking "I Agree", you acknowledge that you have been notified that this call is being recorded.'}
            </p>
          </div>

          {/* Privacy & Legal notice */}
          <div className="border-t border-gray-200 pt-3 text-xs text-gray-500">
            <p>
              🔒 Your call will be encrypted end-to-end and stored securely. Recordings are
              automatically deleted after 90 days.
            </p>
          </div>
        </div>

        {/* Footer with buttons */}
        <div className="border-t border-gray-200 px-6 py-4">
          <div className="flex gap-3">
            <button
              onClick={handleDecline}
              disabled={isPlaying}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTwoPartyConsent ? 'Do Not Consent' : 'Decline'}
            </button>

            {!isPlaying && !consentGiven && (
              <button
                onClick={handlePlayAnnouncement}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-100 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                </svg>
                Hear Again
              </button>
            )}

            <button
              onClick={handleConsent}
              disabled={isPlaying}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-white ${
                isTwoPartyConsent
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {isTwoPartyConsent ? 'I Consent' : 'I Agree'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for managing recording announcement dialog state
 */
export function useRecordingAnnouncement() {
  const [open, setOpen] = useState(false);
  const [callId, setCallId] = useState('');
  const [state, setState] = useState<string | undefined>();
  const [language, setLanguage] = useState('en');

  const show = (id: string, targetState?: string, targetLanguage?: string) => {
    setCallId(id);
    setState(targetState);
    setLanguage(targetLanguage || 'en');
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
  };

  return {
    open,
    callId,
    state,
    language,
    show,
    close,
  };
}

export default RecordingAnnouncementDialog;
