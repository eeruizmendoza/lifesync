'use client';

/**
 * FileShareButton
 * Lets users pick a file or photo and send it as an in-app message.
 * Photos are compressed client-side (max 1200px, JPEG 85%) before upload.
 * Files are limited to ~600KB raw.
 */

import { useState, useRef, useCallback } from 'react';
import { Paperclip, Image, Loader2, AlertCircle, X, Send, FileText } from 'lucide-react';

interface FileShareButtonProps {
  receiverUserId: string;
  receiverName: string;
  userLanguage?: string;
  onMessageSent?: () => void;
}

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Compress image using canvas: max 1200px, JPEG at 85% */
async function compressImage(file: File): Promise<{ base64: string; mimeType: string; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else                { width  = Math.round(width  * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64  = dataUrl.split(',')[1];
      resolve({ base64, mimeType: 'image/jpeg', sizeBytes: Math.round(base64.length * 0.75) });
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Read file as base64 */
async function readFileAsBase64(file: File): Promise<{ base64: string; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => {
      const result = e.target?.result as string;
      const base64 = result.split(',')[1] ?? '';
      resolve({ base64, sizeBytes: file.size });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const PHOTO_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic']);

interface PreviewFile {
  name: string;
  mimeType: string;
  base64: string;
  sizeBytes: number;
  previewUrl: string | null; // object URL for images
  isPhoto: boolean;
}

export function FileShareButton({
  receiverUserId,
  receiverName,
  userLanguage = 'en',
  onMessageSent,
}: FileShareButtonProps) {
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const fileInputRef          = useRef<HTMLInputElement>(null);
  const photoInputRef         = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    setError(null);

    const isPhoto = PHOTO_MIMES.has(file.type.toLowerCase());

    try {
      let base64: string;
      let mimeType: string;
      let sizeBytes: number;

      if (isPhoto) {
        ({ base64, mimeType, sizeBytes } = await compressImage(file));
      } else {
        if (file.size > 800 * 1024) {
          setError(`File too large. Max 600KB. Try compressing it first.`);
          return;
        }
        ({ base64, sizeBytes } = await readFileAsBase64(file));
        mimeType = file.type || 'application/octet-stream';
      }

      const previewUrl = isPhoto ? `data:${mimeType};base64,${base64}` : null;

      setPreview({ name: file.name, mimeType, base64, sizeBytes, previewUrl, isPhoto });
    } catch (e) {
      setError(`Could not read file: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }, []);

  const send = useCallback(async () => {
    if (!preview) return;
    setSending(true);
    setError(null);
    try {
      const token = getToken();
      const res = await fetch('/api/files/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverUserId,
          fileBase64: preview.base64,
          fileName:   preview.name,
          mimeType:   preview.mimeType,
          fileSizeBytes: preview.sizeBytes,
          language: userLanguage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send');

      if (preview.previewUrl) URL.revokeObjectURL(preview.previewUrl);
      setPreview(null);
      onMessageSent?.();
    } catch (e) {
      setSending(false);
      setError(e instanceof Error ? e.message : 'Failed to send');
    }
  }, [preview, receiverUserId, userLanguage, onMessageSent]);

  const cancel = () => {
    if (preview?.previewUrl) URL.revokeObjectURL(preview.previewUrl);
    setPreview(null);
    setError(null);
    if (fileInputRef.current)  fileInputRef.current.value  = '';
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  // ── Preview state ──────────────────────────────────────────────────────────
  if (preview) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
          {preview.isPhoto
            ? <Image size={14} className="text-pink-500" />
            : <Paperclip size={14} className="text-gray-500" />}
          <span className="text-xs font-medium text-gray-700 truncate flex-1">
            {preview.name}
          </span>
          <span className="text-[10px] text-gray-400">{formatBytes(preview.sizeBytes)}</span>
          <button onClick={cancel} className="text-gray-400 hover:text-gray-600 ml-1">
            <X size={14} />
          </button>
        </div>
        <div className="p-3 space-y-3">
          {/* Photo preview */}
          {preview.isPhoto && preview.previewUrl && (
            <div className="rounded-lg overflow-hidden border border-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.previewUrl}
                alt={preview.name}
                className="max-h-48 w-auto mx-auto object-contain"
              />
            </div>
          )}
          {/* File icon for non-photo */}
          {!preview.isPhoto && (
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
              <FileText size={20} className="text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-gray-700 font-medium truncate">{preview.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(preview.sizeBytes)} · {preview.mimeType}</p>
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle size={12} />
              {error}
            </div>
          )}
          <button
            onClick={send}
            disabled={sending}
            className="flex items-center gap-1.5 w-full justify-center px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {sending
              ? <Loader2 size={14} className="animate-spin" />
              : <Send size={14} />}
            Send {preview.isPhoto ? 'photo' : 'file'} to {receiverName}
          </button>
        </div>
      </div>
    );
  }

  // ── Idle: buttons to pick file or photo ────────────────────────────────────
  return (
    <div className="flex gap-1.5">
      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={e => handleFileSelect(e.target.files?.[0])}
      />
      <input
        ref={photoInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={e => handleFileSelect(e.target.files?.[0])}
      />

      {/* Photo button */}
      <button
        onClick={() => photoInputRef.current?.click()}
        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-pink-50 border border-pink-200 text-pink-500 hover:bg-pink-100 hover:border-pink-300 transition-all"
        title="Send photo"
      >
        <Image size={16} />
      </button>

      {/* File button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 hover:border-gray-300 transition-all"
        title="Send file"
      >
        <Paperclip size={16} />
      </button>

      {error && (
        <p className="text-[10px] text-red-600 self-center max-w-[160px] leading-tight">{error}</p>
      )}
    </div>
  );
}
