/**
 * Recording Encryption — Audio/Video Specialization
 * Phase 5: Recording, Encryption & Storage
 *
 * Wraps encryption-v2 with recording-specific metadata and integrity checks.
 *
 * Encryption scheme:
 *   XChaCha20-Poly1305 (authenticated)
 *   Key: per-recording 32-byte key (from recording-key-management.ts)
 *   Nonce: 24-byte random per chunk
 *   Auth tag: 16-byte Poly1305 MAC per chunk
 *   Chunking: 1MB chunks for large file support
 */

import {
  encryptLargeFile,
  decryptLargeFile,
  EncryptedFile,
} from './encryption-v2';

export interface RecordingEncryptionMetadata {
  originalSize: number;
  encryptedSize: number;
  chunkCount: number;
  algorithm: 'XChaCha20-Poly1305';
  keyDerivation: 'HKDF-SHA256';
  mimeType: string;
  durationSeconds?: number;
  encryptedAt: string; // ISO timestamp
}

export interface EncryptedRecordingBlob {
  encryptedFile: EncryptedFile; // Chunk-encrypted structure
  metadata: RecordingEncryptionMetadata;
}

const CHUNK_SIZE_BYTES = 1 * 1024 * 1024; // 1MB chunks

// ============================================================================
// ENCRYPT
// ============================================================================

/**
 * Encrypt a raw audio/video buffer for secure storage.
 *
 * The result is a self-contained blob that can be:
 *  1. JSON-serialized and uploaded to S3
 *  2. Stored in the database (not recommended for large files)
 *
 * @param audioBuffer    - Raw audio/video bytes
 * @param mimeType       - MIME type (e.g., 'audio/webm', 'video/mp4')
 * @param recordingKey   - 32-byte per-recording encryption key
 * @param durationSec    - Optional duration for metadata
 * @returns Encrypted blob ready for storage
 */
export function encryptRecordingForStorage(
  audioBuffer: Buffer,
  mimeType: string,
  recordingKey: Uint8Array,
  durationSec?: number
): EncryptedRecordingBlob {
  if (recordingKey.length !== 32) {
    throw new Error('Recording key must be 32 bytes');
  }

  const originalSize = audioBuffer.length;

  // Encrypt in 1MB chunks using XChaCha20-Poly1305
  const encryptedFile = encryptLargeFile(
    audioBuffer,
    recordingKey,
    {
      filename: `recording-${Date.now()}`,
      mimeType,
    },
    CHUNK_SIZE_BYTES
  );

  // Estimate encrypted size (each chunk adds ~40 bytes overhead: nonce + auth tag)
  const overheadPerChunk = 40;
  const encryptedSize = originalSize + encryptedFile.chunkCount * overheadPerChunk;

  const metadata: RecordingEncryptionMetadata = {
    originalSize,
    encryptedSize,
    chunkCount: encryptedFile.chunkCount,
    algorithm: 'XChaCha20-Poly1305',
    keyDerivation: 'HKDF-SHA256',
    mimeType,
    durationSeconds: durationSec,
    encryptedAt: new Date().toISOString(),
  };

  return { encryptedFile, metadata };
}

/**
 * Serialize an encrypted recording blob to a Buffer for S3 upload.
 * The serialized format is JSON (the same format encryptLargeFile produces).
 */
export function serializeEncryptedRecording(blob: EncryptedRecordingBlob): Buffer {
  return Buffer.from(JSON.stringify(blob), 'utf-8');
}

/**
 * Deserialize an encrypted recording blob from a Buffer read from S3.
 */
export function deserializeEncryptedRecording(buffer: Buffer): EncryptedRecordingBlob {
  return JSON.parse(buffer.toString('utf-8')) as EncryptedRecordingBlob;
}

// ============================================================================
// DECRYPT
// ============================================================================

/**
 * Decrypt an encrypted recording blob back to raw audio/video bytes.
 *
 * @param blob         - Encrypted recording blob (from deserializeEncryptedRecording)
 * @param recordingKey - 32-byte per-recording encryption key
 * @returns Decrypted raw audio/video buffer + MIME type
 */
export function decryptRecordingFromStorage(
  blob: EncryptedRecordingBlob,
  recordingKey: Uint8Array
): { buffer: Buffer; mimeType: string; originalSize: number } {
  if (recordingKey.length !== 32) {
    throw new Error('Recording key must be 32 bytes');
  }

  const decryptedBuffer = decryptLargeFile(blob.encryptedFile, recordingKey);

  return {
    buffer: decryptedBuffer,
    mimeType: blob.metadata.mimeType,
    originalSize: blob.metadata.originalSize,
  };
}

/**
 * Verify encrypted recording integrity without decrypting.
 * Checks that the blob has all required fields and chunk count matches.
 *
 * @returns { valid: boolean; reason?: string }
 */
export function verifyRecordingIntegrity(
  blob: EncryptedRecordingBlob
): { valid: boolean; reason?: string } {
  if (!blob.encryptedFile) {
    return { valid: false, reason: 'Missing encryptedFile' };
  }

  if (!blob.metadata) {
    return { valid: false, reason: 'Missing metadata' };
  }

  if (blob.encryptedFile.chunkCount !== blob.encryptedFile.chunks.length) {
    return {
      valid: false,
      reason: `Chunk count mismatch: expected ${blob.encryptedFile.chunkCount}, found ${blob.encryptedFile.chunks.length}`,
    };
  }

  if (!blob.metadata.originalSize || blob.metadata.originalSize <= 0) {
    return { valid: false, reason: 'Invalid originalSize' };
  }

  if (!blob.metadata.mimeType) {
    return { valid: false, reason: 'Missing mimeType' };
  }

  if (blob.metadata.algorithm !== 'XChaCha20-Poly1305') {
    return { valid: false, reason: `Unknown algorithm: ${blob.metadata.algorithm}` };
  }

  return { valid: true };
}
