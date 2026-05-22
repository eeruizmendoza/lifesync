'use client';

/**
 * SummaryCard — Phase 53
 * Displays (or triggers generation of) an AI summary for a call.
 *
 * Props:
 *   callId   — the conversation UUID
 *   existing — pre-loaded summary from the parent (may be null)
 */

import { useState } from 'react';
import {
  Sparkles, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, ListTodo, MessageSquare, Lightbulb, AlertCircle,
} from 'lucide-react';

export interface AISummaryData {
  digest: string;
  topics: string[];
  decisions: string[];
  actionItems: { text: string; owner?: string; deadline?: string }[];
  sentiment: 'positive' | 'neutral' | 'tense';
  keyPhrases: string[];
  generatedAt?: string;
}

interface Props {
  callId: string;
  existing?: AISummaryData | null;
  model?: string | null;
}

const SENTIMENT_CONFIG = {
  positive: { label: 'Positive', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  neutral:  { label: 'Neutral',  color: 'bg-gray-100 text-gray-600',       dot: 'bg-gray-400'   },
  tense:    { label: 'Tense',    color: 'bg-orange-100 text-orange-700',   dot: 'bg-orange-500' },
};

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

export function SummaryCard({ callId, existing, model }: Props) {
  const [summary, setSummary] = useState<AISummaryData | null>(existing ?? null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [currentModel, setCurrentModel] = useState<string | null>(model ?? null);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/calls/${callId}/summarize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Failed to generate summary');
      } else {
        setSummary(data.summary);
        setCurrentModel(data.model ?? null);
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setGenerating(false);
    }
  };

  const sentiment = summary ? SENTIMENT_CONFIG[summary.sentiment] ?? SENTIMENT_CONFIG.neutral : null;

  // ── Empty state: no summary yet ──
  if (!summary) {
    return (
      <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-indigo-100 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles size={17} className="text-indigo-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">AI Summary</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Generate a structured summary of this call — topics, decisions, action items, and sentiment.
            </p>
            {error && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
                <AlertCircle size={12} />
                {error}
              </div>
            )}
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 flex-shrink-0"
          >
            {generating ? (
              <RefreshCw size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    );
  }

  // ── Summary card ──
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Sparkles size={16} className="text-indigo-500" />
          <span className="text-sm font-semibold text-gray-900">AI Summary</span>
          {sentiment && (
            <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${sentiment.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sentiment.dot}`} />
              {sentiment.label}
            </span>
          )}
          {currentModel && (
            <span className="text-[10px] text-gray-400 ml-1">{currentModel}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); generate(); }}
            disabled={generating}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-60"
            title="Regenerate summary"
          >
            <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
          </button>
          {expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
          {/* Digest */}
          <div className="bg-indigo-50 rounded-xl px-4 py-3">
            <p className="text-sm text-indigo-900 leading-relaxed">{summary.digest}</p>
          </div>

          {/* 2-col grid: Topics + Sentiment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Topics */}
            {summary.topics.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <MessageSquare size={13} className="text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Topics</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {summary.topics.map((topic, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Key phrases */}
            {summary.keyPhrases.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb size={13} className="text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Key Phrases</span>
                </div>
                <div className="space-y-1">
                  {summary.keyPhrases.map((phrase, i) => (
                    <p key={i} className="text-xs text-gray-600 italic">"{phrase}"</p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Decisions */}
          {summary.decisions.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Decisions</span>
              </div>
              <ul className="space-y-1">
                {summary.decisions.map((dec, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    {dec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action items */}
          {summary.actionItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <ListTodo size={13} className="text-blue-500" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Action Items</span>
              </div>
              <ul className="space-y-2">
                {summary.actionItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                    <span className="mt-0.5 flex-shrink-0 w-4 h-4 bg-blue-200 text-blue-700 rounded text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800">{item.text}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {item.owner && (
                          <span className="text-[10px] text-gray-500">Owner: <span className="font-medium">{item.owner}</span></span>
                        )}
                        {item.deadline && (
                          <span className="text-[10px] text-gray-500">Due: <span className="font-medium">{item.deadline}</span></span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Generated timestamp */}
          {summary.generatedAt && (
            <p className="text-[10px] text-gray-300 text-right">
              Generated {new Date(summary.generatedAt).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
