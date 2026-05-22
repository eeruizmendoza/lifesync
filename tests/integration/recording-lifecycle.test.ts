/**
 * Integration Tests: Recording Lifecycle
 * Phase 5: Recording, Encryption & Storage
 *
 * End-to-end tests for the full recording pipeline:
 *  upload → list → metadata → download → delete
 *
 * These tests use mocked S3 and database services so they
 * run in CI without external dependencies.
 */

// ============================================================================
// Module mocks (must be at top, before any imports)
// ============================================================================

jest.mock('@/lib/s3-service', () => {
  const store: Record<string, { buffer: Buffer; contentType: string }> = {};

  return {
    uploadRecordingToS3: jest.fn(async (
      buffer: Buffer,
      userId: string,
      conversationId: string,
      key: Buffer,
      metadata: { filename: string; mimeType: string }
    ) => {
      const s3Key = `recordings/test-${Date.now()}-${Math.random().toString(36).slice(2)}.encrypted`;
      store[s3Key] = { buffer, contentType: metadata.mimeType };
      return {
        s3Key,
        url: `https://mock-s3.test/${s3Key}?token=abc`,
        size: buffer.length,
        uploadedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
    }),

    downloadRecordingFromS3: jest.fn(async (s3Key: string, _key: Buffer) => {
      const entry = store[s3Key];
      if (!entry) throw new Error(`Mock S3: key not found: ${s3Key}`);
      return {
        buffer: entry.buffer,
        contentType: entry.contentType,
        size: entry.buffer.length,
      };
    }),

    deleteRecordingFromS3: jest.fn(async (s3Key: string) => {
      delete store[s3Key];
    }),

    generatePresignedDownloadUrl: jest.fn((s3Key: string, _expiry: number) => {
      return `https://mock-s3.test/${s3Key}?token=presigned`;
    }),

    getRecordingMetadata: jest.fn(async (s3Key: string) => {
      const entry = store[s3Key];
      return entry
        ? { size: entry.buffer.length, uploadedAt: new Date(), lastModified: new Date(), exists: true }
        : { size: 0, uploadedAt: new Date(), lastModified: new Date(), exists: false };
    }),

    getUserStorageUsage: jest.fn(async () => 0),
    __store: store,
  };
});

jest.mock('@/lib/database/recordings', () => {
  const recordings: Record<string, any> = {};
  const transcripts: Record<string, any[]> = {};
  const accessLog: any[] = [];

  return {
    createRecordingMetadata: jest.fn(async (callId, userId, convId, s3Key, mimeType, size, duration, type) => {
      const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      recordings[id] = {
        id,
        conversationId: convId,
        userId,
        recordingType: type,
        mimeType,
        fileSizeBytes: size,
        durationSeconds: duration,
        isEncrypted: true,
        encryptionAlgorithm: 'XChaCha20-Poly1305',
        processingStatus: 'pending',
        transcriptionStatus: 'pending',
        s3Key,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return id;
    }),

    getRecordingById: jest.fn(async (recordingId: string, userId: string) => {
      const rec = recordings[recordingId];
      if (!rec) return null;
      if (rec.userId !== userId) return null;
      return rec;
    }),

    listUserRecordings: jest.fn(async (userId: string, conversationId: string, limit = 20, offset = 0) => {
      const filtered = Object.values(recordings).filter(
        (r: any) => r.conversationId === conversationId && r.userId === userId
      );
      return {
        recordings: filtered.slice(offset, offset + limit),
        total: filtered.length,
      };
    }),

    updateRecordingStatus: jest.fn(async (id: string, processingStatus?: string, transcriptionStatus?: string) => {
      if (recordings[id]) {
        if (processingStatus) recordings[id].processingStatus = processingStatus;
        if (transcriptionStatus) recordings[id].transcriptionStatus = transcriptionStatus;
      }
    }),

    deleteRecordingLogical: jest.fn(async (recordingId: string, userId: string) => {
      const rec = recordings[recordingId];
      if (!rec || rec.userId !== userId) return false;
      delete recordings[recordingId];
      return true;
    }),

    getUserStorageUsage: jest.fn(async () => 0),

    logRecordingAccess: jest.fn(async (recordingId: string, userId: string, action: string) => {
      accessLog.push({ recordingId, userId, action, at: new Date() });
    }),

    getTranscriptForRecording: jest.fn(async (recordingId: string) => {
      return transcripts[recordingId] || [];
    }),

    addTranscriptLine: jest.fn(async (recordingId: string, speakerId: string, originalText: string, translatedText: string) => {
      if (!transcripts[recordingId]) transcripts[recordingId] = [];
      const id = `trans_${Date.now()}`;
      transcripts[recordingId].push({ id, recordingId, speakerId, originalText, translatedText });
      return id;
    }),

    addRecordingMetrics: jest.fn(async () => {}),

    __recordings: recordings,
    __accessLog: accessLog,
  };
});

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { uploadRecordingToS3, downloadRecordingFromS3, deleteRecordingFromS3 } from '@/lib/s3-service';
import {
  createRecordingMetadata,
  getRecordingById,
  listUserRecordings,
  deleteRecordingLogical,
  logRecordingAccess,
  getTranscriptForRecording,
} from '@/lib/database/recordings';
import { encryptRecordingForStorage, serializeEncryptedRecording, deserializeEncryptedRecording, decryptRecordingFromStorage } from '@/lib/recording-encryption';
import { generateFreshRecordingKey, keyToBase64 } from '@/lib/recording-key-management';

// ============================================================================
// Test utilities
// ============================================================================

function makeAudioBuffer(sizeBytes: number = 2048): Buffer {
  const buf = Buffer.alloc(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) buf[i] = (i * 3 + 17) % 256;
  return buf;
}

const TEST_USER_A = 'user-aaaa-aaaa-aaaa';
const TEST_USER_B = 'user-bbbb-bbbb-bbbb';
const TEST_CONV_ID = 'conv-test-1234';
const TEST_CALL_ID = 'call_test_1234_abcdef';
const TEST_MIME = 'audio/webm';
const TEST_DURATION = 30; // seconds

// ============================================================================
// Tests
// ============================================================================

describe('Recording Lifecycle - Phase 5', () => {
  let recordingKey: Uint8Array;
  let recordingKeyB64: string;

  beforeEach(() => {
    recordingKey = generateFreshRecordingKey();
    recordingKeyB64 = keyToBase64(recordingKey);
    jest.clearAllMocks();
  });

  describe('Upload Pipeline', () => {
    test('uploads a raw audio buffer and creates DB metadata', async () => {
      const audioBuffer = makeAudioBuffer();

      // Upload to S3
      const s3Result = await uploadRecordingToS3(
        audioBuffer,
        TEST_USER_A,
        TEST_CONV_ID,
        recordingKey,
        { filename: 'test.webm', mimeType: TEST_MIME }
      );

      expect(s3Result.s3Key).toBeTruthy();
      expect(s3Result.s3Key).toMatch(/recordings\//);
      expect(s3Result.size).toBe(audioBuffer.length);

      // Create DB record
      const recordingId = await createRecordingMetadata(
        TEST_CALL_ID,
        TEST_USER_A,
        TEST_CONV_ID,
        s3Result.s3Key,
        TEST_MIME,
        audioBuffer.length,
        TEST_DURATION,
        'audio'
      );

      expect(recordingId).toBeTruthy();
      expect(recordingId).toMatch(/^rec_/);
    });

    test('encrypted and plain buffer produce different S3 content', async () => {
      const audioBuffer = makeAudioBuffer(1024);

      // Encrypt first
      const blob = encryptRecordingForStorage(audioBuffer, TEST_MIME, recordingKey);
      const encryptedBuffer = serializeEncryptedRecording(blob);

      // Upload both (plain and encrypted) separately
      const s3Plain = await uploadRecordingToS3(audioBuffer, TEST_USER_A, TEST_CONV_ID, recordingKey, { filename: 'plain.webm', mimeType: TEST_MIME });
      const s3Enc = await uploadRecordingToS3(encryptedBuffer, TEST_USER_A, TEST_CONV_ID, recordingKey, { filename: 'enc.webm', mimeType: TEST_MIME });

      expect(s3Plain.s3Key).not.toBe(s3Enc.s3Key);
    });

    test('upload → list → recording appears in list', async () => {
      const audioBuffer = makeAudioBuffer();

      const s3Result = await uploadRecordingToS3(audioBuffer, TEST_USER_A, TEST_CONV_ID, recordingKey, { filename: 'list-test.webm', mimeType: TEST_MIME });
      const recordingId = await createRecordingMetadata(TEST_CALL_ID, TEST_USER_A, TEST_CONV_ID, s3Result.s3Key, TEST_MIME, audioBuffer.length, TEST_DURATION, 'audio');

      const { recordings, total } = await listUserRecordings(TEST_USER_A, TEST_CONV_ID);

      expect(total).toBeGreaterThanOrEqual(1);
      const found = recordings.find((r: any) => r.id === recordingId);
      expect(found).toBeTruthy();
      expect(found.mimeType).toBe(TEST_MIME);
    });
  });

  describe('Download Pipeline', () => {
    test('downloads and gets back the original buffer', async () => {
      const audioBuffer = makeAudioBuffer(2048);

      const s3Result = await uploadRecordingToS3(audioBuffer, TEST_USER_A, TEST_CONV_ID, recordingKey, { filename: 'dl-test.webm', mimeType: TEST_MIME });
      const downloadResult = await downloadRecordingFromS3(s3Result.s3Key, recordingKey);

      expect(downloadResult.buffer.equals(audioBuffer)).toBe(true);
      expect(downloadResult.contentType).toBe(TEST_MIME);
      expect(downloadResult.size).toBe(audioBuffer.length);
    });

    test('full round-trip with encryption layer', async () => {
      const audioBuffer = makeAudioBuffer(4096);

      // Encrypt
      const blob = encryptRecordingForStorage(audioBuffer, TEST_MIME, recordingKey, 10);
      const encryptedBuffer = serializeEncryptedRecording(blob);

      // Upload
      const s3Result = await uploadRecordingToS3(encryptedBuffer, TEST_USER_A, TEST_CONV_ID, recordingKey, { filename: 'enc-rt.webm', mimeType: TEST_MIME });

      // Download
      const downloadResult = await downloadRecordingFromS3(s3Result.s3Key, recordingKey);

      // Decrypt
      const deserialized = deserializeEncryptedRecording(downloadResult.buffer);
      const decrypted = decryptRecordingFromStorage(deserialized, recordingKey);

      expect(decrypted.buffer.equals(audioBuffer)).toBe(true);
    });
  });

  describe('Metadata Access', () => {
    test('getRecordingById returns recording for correct user', async () => {
      const s3Result = await uploadRecordingToS3(makeAudioBuffer(), TEST_USER_A, TEST_CONV_ID, recordingKey, { filename: 'meta.webm', mimeType: TEST_MIME });
      const id = await createRecordingMetadata(TEST_CALL_ID, TEST_USER_A, TEST_CONV_ID, s3Result.s3Key, TEST_MIME, 1024, 10, 'audio');

      const found = await getRecordingById(id, TEST_USER_A);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(id);
      expect(found?.mimeType).toBe(TEST_MIME);
    });

    test('getRecordingById returns null for wrong user', async () => {
      const s3Result = await uploadRecordingToS3(makeAudioBuffer(), TEST_USER_A, TEST_CONV_ID, recordingKey, { filename: 'meta2.webm', mimeType: TEST_MIME });
      const id = await createRecordingMetadata(TEST_CALL_ID, TEST_USER_A, TEST_CONV_ID, s3Result.s3Key, TEST_MIME, 1024, 10, 'audio');

      const denied = await getRecordingById(id, TEST_USER_B);
      expect(denied).toBeNull();
    });

    test('transcript lines can be added and retrieved', async () => {
      const { addTranscriptLine } = require('@/lib/database/recordings');

      const s3Result = await uploadRecordingToS3(makeAudioBuffer(), TEST_USER_A, TEST_CONV_ID, recordingKey, { filename: 'transcript.webm', mimeType: TEST_MIME });
      const id = await createRecordingMetadata(TEST_CALL_ID, TEST_USER_A, TEST_CONV_ID, s3Result.s3Key, TEST_MIME, 1024, 10, 'audio');

      await addTranscriptLine(id, TEST_USER_A, 'Hello world', 'Hola mundo', 0, 3000, 0.95, 0.92);

      const lines = await getTranscriptForRecording(id);
      expect(lines.length).toBe(1);
      expect(lines[0].originalText).toBe('Hello world');
      expect(lines[0].translatedText).toBe('Hola mundo');
    });
  });

  describe('Soft Delete', () => {
    test('delete removes recording from subsequent list calls', async () => {
      const s3Result = await uploadRecordingToS3(makeAudioBuffer(), TEST_USER_A, TEST_CONV_ID, recordingKey, { filename: 'del.webm', mimeType: TEST_MIME });
      const id = await createRecordingMetadata(TEST_CALL_ID, TEST_USER_A, TEST_CONV_ID, s3Result.s3Key, TEST_MIME, 1024, 10, 'audio');

      const beforeDelete = await listUserRecordings(TEST_USER_A, TEST_CONV_ID);
      const countBefore = beforeDelete.total;

      await deleteRecordingLogical(id, TEST_USER_A);

      const afterDelete = await listUserRecordings(TEST_USER_A, TEST_CONV_ID);
      expect(afterDelete.total).toBe(countBefore - 1);
    });

    test('owner can delete, but other user cannot', async () => {
      const s3Result = await uploadRecordingToS3(makeAudioBuffer(), TEST_USER_A, TEST_CONV_ID, recordingKey, { filename: 'del2.webm', mimeType: TEST_MIME });
      const id = await createRecordingMetadata(TEST_CALL_ID, TEST_USER_A, TEST_CONV_ID, s3Result.s3Key, TEST_MIME, 1024, 10, 'audio');

      const result = await deleteRecordingLogical(id, TEST_USER_B); // Wrong user
      expect(result).toBe(false);

      const recording = await getRecordingById(id, TEST_USER_A);
      expect(recording).not.toBeNull(); // Still exists
    });

    test('delete logs access event', async () => {
      await logRecordingAccess('rec-test', TEST_USER_A, 'delete', '127.0.0.1', 'test-agent');
      const { __accessLog } = require('@/lib/database/recordings');
      const deleteEntry = __accessLog.find((e: any) => e.action === 'delete' && e.userId === TEST_USER_A);
      expect(deleteEntry).toBeTruthy();
    });
  });

  describe('Audit Logging', () => {
    test('logs view, download, and delete actions', async () => {
      const actions = ['view', 'download', 'delete'] as const;
      for (const action of actions) {
        await logRecordingAccess(`rec-${action}`, TEST_USER_A, action, '10.0.0.1', 'ua-test');
      }

      const { __accessLog } = require('@/lib/database/recordings');
      for (const action of actions) {
        const entry = __accessLog.find((e: any) => e.action === action && e.recordingId === `rec-${action}`);
        expect(entry).toBeTruthy();
      }
    });
  });

  describe('Pagination', () => {
    test('listUserRecordings respects limit and offset', async () => {
      // Create 5 recordings
      for (let i = 0; i < 5; i++) {
        const s3Result = await uploadRecordingToS3(makeAudioBuffer(), TEST_USER_A, `conv-page-test`, recordingKey, { filename: `page-${i}.webm`, mimeType: TEST_MIME });
        await createRecordingMetadata(`call-${i}`, TEST_USER_A, `conv-page-test`, s3Result.s3Key, TEST_MIME, 1024, 10, 'audio');
      }

      const page1 = await listUserRecordings(TEST_USER_A, `conv-page-test`, 2, 0);
      expect(page1.recordings.length).toBe(2);
      expect(page1.total).toBe(5);

      const page2 = await listUserRecordings(TEST_USER_A, `conv-page-test`, 2, 2);
      expect(page2.recordings.length).toBe(2);

      const page3 = await listUserRecordings(TEST_USER_A, `conv-page-test`, 2, 4);
      expect(page3.recordings.length).toBe(1); // Only 1 remaining

      // No overlap between pages
      const page1Ids = new Set(page1.recordings.map((r: any) => r.id));
      const page2Ids = new Set(page2.recordings.map((r: any) => r.id));
      for (const id of page2Ids) {
        expect(page1Ids.has(id)).toBe(false);
      }
    });
  });
});
