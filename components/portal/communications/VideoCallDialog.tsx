'use client';

import React, { useState, useEffect, useRef } from 'react';

interface VideoCallDialogProps {
  callId: string;
  contactId: string;
  contactName: string;
  sourceLanguage: string;
  targetLanguage: string;
  isIncoming?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onEnd?: () => void;
}

export function VideoCallDialog({
  callId,
  contactId,
  contactName,
  sourceLanguage,
  targetLanguage,
  isIncoming = false,
  onAccept,
  onReject,
  onEnd,
}: VideoCallDialogProps) {
  const [callState, setCallState] = useState<'ringing' | 'connected' | 'ended'>(
    isIncoming ? 'ringing' : 'ringing'
  );
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

      // Start local video
      if (cameraOn) {
        startLocalVideo();
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState, cameraOn]);

  const startLocalVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Failed to access camera:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const languageName = (code: string) => {
    const names: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      zh: 'Chinese',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      ru: 'Russian',
      ja: 'Japanese',
      ko: 'Korean',
    };
    return names[code] || code.toUpperCase();
  };

  const handleAccept = () => {
    setCallState('connected');
    onAccept?.();
  };

  const handleEnd = () => {
    setCallState('ended');
    onEnd?.();
    if (timerRef.current) clearInterval(timerRef.current);

    // Stop all tracks
    if (localVideoRef.current?.srcObject) {
      const tracks = (localVideoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
  };

  if (callState === 'ended') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4">Video Call Ended</h2>
          <div className="space-y-2 mb-6 text-gray-600">
            <p>
              <span className="font-semibold">Contact:</span> {contactName}
            </p>
            <p>
              <span className="font-semibold">Duration:</span> {formatTime(duration)}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (callState === 'ringing') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-20 h-20 rounded-full bg-gray-200 mx-auto mb-4 flex items-center justify-center text-3xl">
              👤
            </div>
            <h2 className="text-2xl font-bold">{contactName}</h2>
            <div className="mt-2 flex justify-center gap-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                {languageName(sourceLanguage)}
              </span>
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                {languageName(targetLanguage)}
              </span>
            </div>
          </div>

          <p className="text-center text-gray-600 mb-6">
            {isIncoming ? 'Incoming video call...' : 'Calling...'}
          </p>

          <div className="flex gap-4 justify-center">
            {isIncoming && (
              <button
                onClick={handleAccept}
                className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-full hover:bg-green-700 transition-colors"
              >
                <span>📹</span> Accept
              </button>
            )}
            <button
              onClick={handleEnd}
              className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-full hover:bg-red-700 transition-colors"
            >
              <span>✕</span> {isIncoming ? 'Decline' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Connected state - show video
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Main video area */}
      <div className="flex-1 relative bg-black">
        {/* Remote video (large) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        >
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center text-white">
            <div className="text-center">
              <div className="text-5xl mb-4">👤</div>
              <p>{contactName}</p>
              <p className="text-gray-400">{formatTime(duration)}</p>
            </div>
          </div>
        </video>

        {/* Local video (picture-in-picture) */}
        <div className="absolute bottom-4 right-4 w-32 h-40 bg-gray-900 rounded-lg overflow-hidden border-2 border-white shadow-lg">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          >
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center text-white text-xs">
              Your Camera
            </div>
          </video>
        </div>

        {/* Top info bar */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/50 to-transparent p-4">
          <div className="flex justify-between items-center">
            <div className="text-white">
              <h2 className="text-xl font-bold">{contactName}</h2>
              <div className="flex gap-2 mt-1">
                <span className="px-2 py-1 bg-blue-600/80 rounded text-xs">
                  {languageName(sourceLanguage)}
                </span>
                <span className="px-2 py-1 bg-green-600/80 rounded text-xs">
                  {languageName(targetLanguage)}
                </span>
              </div>
            </div>
            <div className="text-white text-3xl font-mono font-bold">
              {formatTime(duration)}
            </div>
          </div>
        </div>
      </div>

      {/* Control bar */}
      <div className="bg-gray-900 border-t border-gray-700 p-4">
        <div className="flex justify-center gap-4">
          {/* Mute audio */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-4 rounded-full transition-colors ${
              isMuted
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🎤'}
          </button>

          {/* Camera toggle */}
          <button
            onClick={() => setCameraOn(!cameraOn)}
            className={`p-4 rounded-full transition-colors ${
              cameraOn
                ? 'bg-gray-700 text-white hover:bg-gray-600'
                : 'bg-red-600 text-white'
            }`}
            title={cameraOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {cameraOn ? '📹' : '🎥'}
          </button>

          {/* Screen share */}
          <button
            onClick={() => setIsScreenSharing(!isScreenSharing)}
            className={`p-4 rounded-full transition-colors ${
              isScreenSharing
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          >
            💻
          </button>

          {/* End call */}
          <button
            onClick={handleEnd}
            className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
            title="End call"
          >
            📞
          </button>
        </div>

        <div className="mt-3 text-center text-gray-400 text-sm">
          {isScreenSharing && <span>Sharing screen</span>}
          {isMuted && <span className="text-yellow-400">Muted</span>}
        </div>
      </div>
    </div>
  );
}

export default VideoCallDialog;
