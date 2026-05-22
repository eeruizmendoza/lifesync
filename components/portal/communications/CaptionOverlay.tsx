'use client';

import { useCallContext } from '@/lib/hooks/useCallContext';
import { useEffect, useState } from 'react';
import type { CaptionOverlayProps } from '@/lib/types/calls';

export function CaptionOverlay({ position = 'bottom', fadeOutMs = 4000 }: CaptionOverlayProps) {
  const { state } = useCallContext();
  const [visibleCaption, setVisibleCaption] = useState<'local' | 'remote' | null>(null);
  const [fadeOut, setFadeOut] = useState(false);

  // Get latest turns for each speaker
  const latestRemoteTurn = [...state.transcriptTurns]
    .reverse()
    .find((t) => t.speaker === 'remote');
  const latestLocalTurn = [...state.transcriptTurns]
    .reverse()
    .find((t) => t.speaker === 'local');

  // Auto-fade out captions
  useEffect(() => {
    if (!latestRemoteTurn && !latestLocalTurn) {
      setVisibleCaption(null);
      return;
    }

    // Show whichever is more recent
    const remoteMostRecent = latestRemoteTurn?.timestamp || 0;
    const localMostRecent = latestLocalTurn?.timestamp || 0;

    if (remoteMostRecent > localMostRecent) {
      setVisibleCaption('remote');
    } else {
      setVisibleCaption('local');
    }

    setFadeOut(false);

    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, fadeOutMs);

    return () => clearTimeout(fadeTimer);
  }, [latestRemoteTurn, latestLocalTurn, fadeOutMs]);

  if (!state.localStream) return null;

  const positionClasses = {
    top: 'top-8',
    bottom: 'bottom-32',
    center: 'top-1/2 -translate-y-1/2',
  };

  const caption =
    visibleCaption === 'remote' ? latestRemoteTurn : visibleCaption === 'local' ? latestLocalTurn : null;

  if (!caption) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 ${positionClasses[position]} flex flex-col gap-3 px-4 transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Main caption */}
      <div className="mx-auto max-w-3xl rounded-lg bg-black/70 px-4 py-3 backdrop-blur-sm">
        <p className="text-center text-lg font-medium text-white">{caption.translatedText}</p>
        <p className="mt-1 text-center text-sm text-gray-300">{caption.originalText}</p>
      </div>

      {/* Confidence and provider info */}
      <div className="mx-auto flex gap-3 text-xs text-gray-400">
        <span>Confidence: {(caption.confidence * 100).toFixed(0)}%</span>
        <span>•</span>
        <span>{caption.transcriptionProvider}</span>
        <span>•</span>
        <span>{caption.translationProvider}</span>
      </div>
    </div>
  );
}
