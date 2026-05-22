'use client';

import { useCallContext } from '@/lib/hooks/useCallContext';
import { useRef, useEffect, useState } from 'react';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Share2 } from 'lucide-react';
import { CallTimer } from './CallTimer';
import { CaptionOverlay } from './CaptionOverlay';
import type { VideoCallDialogProps } from '@/lib/types/calls';

export function VideoCallDialog({
  contactId,
  contactName,
  sourceLanguage,
  targetLanguage,
  isOpen,
  onClose,
  onEnd,
}: VideoCallDialogProps) {
  const { state, endCall } = useCallContext();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [layout, setLayout] = useState<'pip' | 'side-by-side'>('pip');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);

  // Attach MediaStream to video elements
  useEffect(() => {
    if (localVideoRef.current && state.localStream) {
      localVideoRef.current.srcObject = state.localStream;
    }
  }, [state.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && state.remoteStream) {
      remoteVideoRef.current.srcObject = state.remoteStream;
    }
  }, [state.remoteStream]);

  if (!isOpen || state.callState === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      {/* Main video area */}
      <div className="flex-1 relative bg-black">
        {layout === 'pip' && (
          <>
            {/* Remote video (main) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />

            {/* Local video (picture-in-picture) */}
            <div className="absolute bottom-6 right-6 h-32 w-32 overflow-hidden rounded-lg border-2 border-white shadow-lg bg-black">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            </div>
          </>
        )}

        {layout === 'side-by-side' && (
          <div className="flex h-full">
            <div className="flex-1 bg-black">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="h-full w-full object-cover"
              />
            </div>
            <div className="w-1/3 bg-black">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        )}

        {/* Caption overlay */}
        <CaptionOverlay position="bottom" />
      </div>

      {/* Header with contact info */}
      <div className="border-t border-gray-700 bg-gray-800/90 px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{contactName}</h3>
            <CallTimer variant="minimal" className="text-sm text-gray-300" />
          </div>
          <button
            onClick={() => setLayout(layout === 'pip' ? 'side-by-side' : 'pip')}
            className="text-sm text-gray-300 hover:text-white px-3 py-1 rounded hover:bg-gray-700"
          >
            ⊞ Layout
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="border-t border-gray-700 bg-gray-800 px-4 py-4">
        <div className="flex justify-center gap-4">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition text-white ${
              isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button
            onClick={() => setIsCameraOn(!isCameraOn)}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition text-white ${
              isCameraOn ? 'bg-blue-500 hover:bg-blue-600' : 'bg-red-500 hover:bg-red-600'
            }`}
            title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          <button className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-600 text-white hover:bg-gray-700 transition" title="Share screen">
            <Share2 size={20} />
          </button>

          <button
            onClick={() => {
              endCall();
              (onClose ?? onEnd)?.();
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition"
            title="End call"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
