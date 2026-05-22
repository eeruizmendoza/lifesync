'use client';

import { useEffect, useState } from 'react';
import { RecordingPlayer } from './RecordingPlayer';
import { TranscriptViewer } from './TranscriptViewer';
import type { Conversation, Recording } from '@/lib/types/calls';
import type { ConversationDetailProps } from '@/lib/types/calls';

export function ConversationDetail({ conversationId }: ConversationDetailProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [convRes, recRes] = await Promise.all([
          fetch(`/api/conversations/${conversationId}`),
          fetch(`/api/conversations/${conversationId}/recordings`),
        ]);

        if (convRes.ok) {
          const convData = await convRes.json();
          setConversation(convData);
        }

        if (recRes.ok) {
          const recData = await recRes.json();
          setRecordings(recData);
          if (recData.length > 0) {
            setSelectedRecording(recData[0]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch conversation:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [conversationId]);

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Loading...</div>;
  }

  if (!conversation) {
    return <div className="p-4 text-center text-red-500">Conversation not found</div>;
  }

  return (
    <div className="grid h-full grid-cols-3 gap-4 p-4 bg-white">
      {/* Recordings list */}
      <div className="border-r border-gray-200 overflow-y-auto">
        <h3 className="mb-3 font-bold text-gray-900 sticky top-0 bg-white pb-2">Recordings</h3>
        <div className="flex flex-col gap-2">
          {recordings.length === 0 ? (
            <p className="text-sm text-gray-500">No recordings</p>
          ) : (
            recordings.map((rec) => (
              <button
                key={rec.id}
                onClick={() => setSelectedRecording(rec)}
                className={`rounded-lg p-3 text-left transition text-sm ${
                  selectedRecording?.id === rec.id
                    ? 'bg-blue-100 border border-blue-300'
                    : 'hover:bg-gray-100'
                }`}
              >
                <p className="font-medium text-gray-900">
                  {new Date(rec.createdAt).toLocaleDateString()}
                </p>
                <p className="text-xs text-gray-500">
                  {Math.floor(rec.durationSeconds / 60)}m {rec.durationSeconds % 60}s
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Recording player + transcript */}
      {selectedRecording ? (
        <div className="col-span-2 overflow-y-auto">
          <RecordingPlayer recording={selectedRecording} />
          <TranscriptViewer recording={selectedRecording} className="mt-4" />
        </div>
      ) : (
        <div className="col-span-2 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p>Select a recording to view</p>
          </div>
        </div>
      )}
    </div>
  );
}
