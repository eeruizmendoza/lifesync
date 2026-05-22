'use client';

import { useEffect, useState } from 'react';
import { FileText, Share2, Download } from 'lucide-react';
import type { Recording, TranscriptTurn, TranscriptViewerProps } from '@/lib/types/calls';

export function TranscriptViewer({ recording, className = '' }: TranscriptViewerProps) {
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<'original' | 'translated'>('original');

  useEffect(() => {
    const fetchTranscript = async () => {
      try {
        const res = await fetch(`/api/recordings/${recording.id}/transcript`);
        if (res.ok) {
          const data = await res.json();
          setTranscript(data.turns || []);
        }
      } catch (error) {
        console.error('Failed to fetch transcript:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTranscript();
  }, [recording.id]);

  const filteredTurns = transcript.filter((turn) => {
    const text = selectedLanguage === 'original' ? turn.originalText : turn.translatedText;
    return text.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    return `${mins}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading transcript...</div>;

  return (
    <div className={className}>
      <h4 className="mb-4 font-bold text-gray-900">Transcript</h4>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
        <input
          type="text"
          placeholder="Search transcript..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value as 'original' | 'translated')}
          className="rounded border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          <option value="original">Original Language</option>
          <option value="translated">Translated Language</option>
        </select>
      </div>

      {/* Transcript turns */}
      <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
        {filteredTurns.length === 0 ? (
          <p className="text-center text-gray-500 text-sm">No transcript available</p>
        ) : (
          filteredTurns.map((turn, idx) => (
            <div key={idx} className="mb-4 border-b border-gray-200 pb-4 last:border-b-0">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="font-medium text-gray-900 text-sm">
                  {turn.speaker === 'local' ? 'You' : 'Contact'}
                </span>
                <span className="text-xs text-gray-500">{formatTime(turn.timestamp)}</span>
                <span className="ml-auto text-xs text-gray-500">{(turn.confidence * 100).toFixed(0)}%</span>
              </div>

              <p className="text-gray-900 text-sm">
                {selectedLanguage === 'original' ? turn.originalText : turn.translatedText}
              </p>

              {selectedLanguage === 'original' && (
                <p className="mt-1 text-xs text-gray-600 italic">{turn.translatedText}</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Export buttons */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button className="flex-1 flex items-center justify-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 transition">
          <FileText size={16} />
          Export PDF
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 transition">
          <Download size={16} />
          Export CSV
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 transition">
          <Share2 size={16} />
          Share
        </button>
      </div>
    </div>
  );
}
