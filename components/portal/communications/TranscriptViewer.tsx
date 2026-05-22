'use client';

import { useEffect, useState, useCallback } from 'react';
import { FileText, Share2, Download, Copy, Check } from 'lucide-react';
import type { TranscriptTurn, TranscriptViewerProps } from '@/lib/types/calls';

export function TranscriptViewer({ recording, className = '' }: TranscriptViewerProps) {
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<'original' | 'translated'>('original');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchTranscript = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
        const res = await fetch(`/api/recordings/metadata?recordingId=${recording.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setTranscript(data.transcripts || []);
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
    const text = selectedLanguage === 'original'
      ? (turn.originalText || '')
      : (turn.translatedText || '');
    return text.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    return `${mins}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  // Build plain-text representation of the transcript
  const buildPlainText = useCallback(() => {
    const header = `Transcript — Recording ${recording.id}\n${new Date().toLocaleString()}\n\n`;
    const body = filteredTurns
      .map((t) => {
        const speaker = t.speaker === 'local' ? 'You' : 'Contact';
        const time = formatTime(t.timestamp);
        const text = selectedLanguage === 'original' ? t.originalText : t.translatedText;
        return `[${time}] ${speaker}: ${text || ''}`;
      })
      .join('\n');
    return header + body;
  }, [filteredTurns, recording.id, selectedLanguage]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildPlainText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = buildPlainText();
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [buildPlainText]);

  const handleDownloadText = useCallback(() => {
    const text = buildPlainText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${recording.id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [buildPlainText, recording.id]);

  const handleDownloadCSV = useCallback(() => {
    const header = 'Time,Speaker,Original,Translated,Confidence\n';
    const rows = filteredTurns.map((t) => {
      const escape = (s: string = '') => `"${s.replace(/"/g, '""')}"`;
      return [
        formatTime(t.timestamp),
        t.speaker === 'local' ? 'You' : 'Contact',
        escape(t.originalText),
        escape(t.translatedText),
        ((t.confidence || 0) * 100).toFixed(0) + '%',
      ].join(',');
    });
    const csv = header + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${recording.id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [filteredTurns, recording.id]);

  if (loading) {
    return (
      <div className={`${className} flex items-center gap-2 text-sm text-gray-500`}>
        <span className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-transparent rounded-full" />
        Loading transcript...
      </div>
    );
  }

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
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value as 'original' | 'translated')}
          className="rounded border border-gray-300 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="original">Original Language</option>
          <option value="translated">Translated Language</option>
        </select>
      </div>

      {/* Transcript turns */}
      <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
        {filteredTurns.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-8">
            {transcript.length === 0
              ? 'No transcript available for this recording.'
              : `No results for "${searchTerm}"`}
          </p>
        ) : (
          filteredTurns.map((turn, idx) => (
            <div key={idx} className="mb-4 border-b border-gray-200 pb-4 last:border-b-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`font-medium text-sm ${turn.speaker === 'local' ? 'text-blue-700' : 'text-gray-900'}`}>
                  {turn.speaker === 'local' ? 'You' : 'Contact'}
                </span>
                <span className="text-xs text-gray-400">{formatTime(turn.timestamp)}</span>
                {turn.confidence > 0 && (
                  <span className="ml-auto text-xs text-gray-400">
                    {(turn.confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>

              <p className="text-gray-900 text-sm leading-relaxed">
                {selectedLanguage === 'original' ? turn.originalText : turn.translatedText}
              </p>

              {selectedLanguage === 'original' && turn.translatedText && (
                <p className="mt-1 text-xs text-gray-500 italic">{turn.translatedText}</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Export buttons */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={handleCopy}
          disabled={transcript.length === 0}
          className="flex-1 flex items-center justify-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy Text'}
        </button>
        <button
          onClick={handleDownloadText}
          disabled={transcript.length === 0}
          className="flex-1 flex items-center justify-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <FileText size={16} />
          Download .txt
        </button>
        <button
          onClick={handleDownloadCSV}
          disabled={transcript.length === 0}
          className="flex-1 flex items-center justify-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>
    </div>
  );
}
