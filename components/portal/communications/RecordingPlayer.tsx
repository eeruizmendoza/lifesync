'use client';

import { useRef, useState } from 'react';
import { Play, Pause, Download } from 'lucide-react';
import type { Recording, RecordingPlayerProps } from '@/lib/types/calls';

export function RecordingPlayer({ recording }: RecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const handlePlayPause = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      try {
        await audioRef.current.play();
      } catch (error) {
        console.error('Failed to play audio:', error);
      }
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="mb-4 font-bold text-gray-900">Recording Playback</h4>

      {/* Audio element (hidden) */}
      <audio
        ref={audioRef}
        src={`/api/recordings/${recording.id}/stream`}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onPlaybackRateChange={(e) => setPlaybackRate(e.currentTarget.playbackRate)}
      />

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Play/pause button */}
        <button
          onClick={handlePlayPause}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 transition flex-shrink-0"
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>

        {/* Progress bar */}
        <div className="flex-1">
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={(e) => {
              if (audioRef.current) {
                audioRef.current.currentTime = parseFloat(e.target.value);
              }
            }}
            className="w-full h-1 bg-gray-200 rounded cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Playback rate selector */}
        <select
          value={playbackRate}
          onChange={(e) => {
            if (audioRef.current) {
              audioRef.current.playbackRate = parseFloat(e.target.value);
            }
          }}
          className="rounded border border-gray-300 px-2 py-1 text-sm bg-white"
        >
          <option value="0.75">0.75x</option>
          <option value="1">1x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
      </div>

      {/* Recording metadata */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm border-t pt-4">
        <div>
          <p className="text-gray-500">Date</p>
          <p className="font-medium text-gray-900">
            {new Date(recording.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Duration</p>
          <p className="font-medium text-gray-900">{formatTime(recording.durationSeconds)}</p>
        </div>
        <div>
          <p className="text-gray-500">Size</p>
          <p className="font-medium text-gray-900">
            {(recording.sizeBytes / 1024 / 1024).toFixed(1)} MB
          </p>
        </div>
      </div>

      {/* Download button */}
      <button className="mt-4 w-full flex items-center justify-center gap-2 rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 transition">
        <Download size={16} />
        Download Encrypted Recording
      </button>
    </div>
  );
}
