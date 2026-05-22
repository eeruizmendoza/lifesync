'use client';

import { useCallContext } from '@/lib/hooks/useCallContext';
import { useRef, useEffect, useState } from 'react';
import { Copy, ChevronDown, ChevronUp } from 'lucide-react';
import type { RealTimeTranscriptProps } from '@/lib/types/calls';

export function RealTimeTranscript({
  maxHeight = '400px',
  showConfidence = true,
  maxTurns = undefined,
}: RealTimeTranscriptProps) {
  const { state } = useCallContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auto-scroll to latest
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.transcriptTurns]);

  const displayTurns = maxTurns ? state.transcriptTurns.slice(-maxTurns) : state.transcriptTurns;

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-2 overflow-y-auto rounded-lg bg-gray-50 p-3"
      style={{ maxHeight }}
    >
      {displayTurns.length === 0 ? (
        <p className="text-center text-sm text-gray-400">Waiting for first message...</p>
      ) : (
        displayTurns.map((turn) => (
          <TranscriptTurnComponent key={turn.id} turn={turn} showConfidence={showConfidence} />
        ))
      )}
    </div>
  );
}

function TranscriptTurnComponent({
  turn,
  showConfidence,
}: {
  turn: (typeof RealTimeTranscript.prototype)['props']['transcriptTurns'][0];
  showConfidence: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`flex gap-2 rounded-lg p-2 ${
        turn.speaker === 'local'
          ? 'flex-row-reverse bg-blue-50'
          : 'bg-gray-100'
      }`}
    >
      {/* Avatar */}
      <div className="h-7 w-7 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-400 to-purple-500" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Original text (always visible) */}
        <p className="text-sm font-medium text-gray-900">
          <span className="text-xs font-bold text-gray-500 uppercase">
            {turn.speaker === 'local' ? 'You' : 'Contact'}
          </span>
          {' • '}
          {turn.originalText}
        </p>

        {/* Translated text (expandable) */}
        {!expanded && (
          <p className="mt-1 line-clamp-1 text-xs text-gray-600 italic">{turn.translatedText}</p>
        )}

        {expanded && (
          <p className="mt-1 text-xs text-gray-600 italic">{turn.translatedText}</p>
        )}

        {/* Footer */}
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">{formatTime(turn.timestamp)}</span>
            {showConfidence && (
              <span className="text-xs text-gray-400">
                {(turn.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => handleCopy(turn.originalText + ' ' + turn.translatedText)}
              className="rounded p-0.5 hover:bg-white/50"
              title="Copy"
            >
              <Copy size={14} className="text-gray-400 hover:text-gray-600" />
            </button>

            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded p-0.5 hover:bg-white/50"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? (
                <ChevronUp size={14} className="text-gray-400" />
              ) : (
                <ChevronDown size={14} className="text-gray-400" />
              )}
            </button>
          </div>
        </div>

        {copied && <p className="text-xs text-green-600 mt-1">Copied!</p>}
      </div>
    </div>
  );
}
