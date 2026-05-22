'use client';

import { useCallContext } from '@/lib/hooks/useCallContext';

interface CallTimerProps {
  className?: string;
  variant?: 'default' | 'minimal';
}

export function CallTimer({ className = '', variant = 'default' }: CallTimerProps) {
  const { state } = useCallContext();

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (state.callState !== 'connected') {
    return null;
  }

  const timeString = formatTime(state.callDurationMs);

  if (variant === 'minimal') {
    return <span className={className}>{timeString}</span>;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
      <span className="text-sm font-medium text-gray-600">{timeString}</span>
    </div>
  );
}
