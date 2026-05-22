'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Mic,
  Video,
  Monitor,
  Clock,
  HardDrive,
  Download,
  Trash2,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';

interface Recording {
  id: string;
  conversationId: string;
  recordingType: 'audio' | 'video' | 'screen_share';
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
  processingStatus: 'pending' | 'processing' | 'complete' | 'failed';
  transcriptionStatus: 'pending' | 'processing' | 'complete' | 'failed';
  isEncrypted: boolean;
  createdAt: string;
}

const TYPE_ICONS = {
  audio: Mic,
  video: Video,
  screen_share: Monitor,
};

const TYPE_COLORS = {
  audio: 'bg-blue-100 text-blue-600',
  video: 'bg-purple-100 text-purple-600',
  screen_share: 'bg-green-100 text-green-600',
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  const styles: Record<string, string> = {
    complete: 'bg-green-50 text-green-700 border-green-200',
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    processing: 'bg-blue-50 text-blue-700 border-blue-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
  };
  const icons: Record<string, React.ReactNode> = {
    complete: <CheckCircle size={11} />,
    pending: <Clock size={11} />,
    processing: <RefreshCw size={11} className="animate-spin" />,
    failed: <XCircle size={11} />,
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${styles[status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {icons[status]}
      {label}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const PAGE_SIZE = 20;

export function RecordingsList() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const getToken = () =>
    (typeof window !== 'undefined'
      ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
      : null) || '';

  const load = useCallback(async (currentPage: number) => {
    setLoading(true);
    setError('');
    try {
      const token = getToken();
      const offset = currentPage * PAGE_SIZE;
      const res = await fetch(`/api/recordings?limit=${PAGE_SIZE}&offset=${offset}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load recordings');
      const data = await res.json();
      setRecordings(data.recordings ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  const handleDownload = async (id: string) => {
    setDownloading(prev => ({ ...prev, [id]: true }));
    try {
      const token = getToken();
      const res = await fetch(`/api/recordings/download?recordingId=${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${id}.encrypted`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this recording? It will be permanently removed after 30 days.')) return;
    setDeleting(prev => ({ ...prev, [id]: true }));
    try {
      const token = getToken();
      const res = await fetch(`/api/recordings/${id}/delete`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
      // Remove from local list
      setRecordings(prev => prev.filter(r => r.id !== id));
      setTotal(prev => prev - 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(prev => ({ ...prev, [id]: false }));
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700">
        <AlertCircle size={20} className="flex-shrink-0" />
        <div>
          <p className="font-medium">Failed to load recordings</p>
          <p className="text-sm text-red-600">{error}</p>
        </div>
        <button
          onClick={() => load(page)}
          className="ml-auto flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 transition-colors"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <Mic size={24} className="text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No recordings yet</h3>
        <p className="text-gray-500 text-sm max-w-xs mx-auto">
          Start a call and enable recording — your encrypted recordings will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {total} recording{total !== 1 ? 's' : ''} total
        </p>
        <button
          onClick={() => load(page)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-600 w-10">Type</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Duration</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Size</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Processing</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Transcript</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recordings.map(rec => {
                const TypeIcon = TYPE_ICONS[rec.recordingType] ?? Mic;
                return (
                  <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${TYPE_COLORS[rec.recordingType] ?? 'bg-gray-100 text-gray-500'}`}>
                        <TypeIcon size={15} />
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-gray-900">
                        {new Date(rec.createdAt).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(rec.createdAt).toLocaleTimeString(undefined, {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Clock size={13} className="text-gray-400" />
                        {formatDuration(rec.durationSeconds)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <HardDrive size={13} className="text-gray-400" />
                        {formatBytes(rec.fileSizeBytes)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={rec.processingStatus} label={rec.processingStatus} />
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={rec.transcriptionStatus} label={rec.transcriptionStatus} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownload(rec.id)}
                          disabled={downloading[rec.id]}
                          title="Download encrypted recording"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {downloading[rec.id]
                            ? <Loader2 size={15} className="animate-spin" />
                            : <Download size={15} />}
                        </button>
                        <button
                          onClick={() => handleDelete(rec.id)}
                          disabled={deleting[rec.id]}
                          title="Delete recording"
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deleting[rec.id]
                            ? <Loader2 size={15} className="animate-spin" />
                            : <Trash2 size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-sm text-gray-500">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-40 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
