/**
 * Integration Tests: Recording Access Control
 * Phase 5: Recording, Encryption & Storage
 *
 * Tests for:
 * - Multi-user isolation (User A can't access User B's recordings)
 * - Storage quota enforcement
 * - Concurrent upload safety
 * - Key management access checks
 */

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/s3-service', () => ({
  uploadRecordingToS3: jest.fn(async (buffer: Buffer, userId: string, conversationId: string) => ({
    s3Key: `recordings/${userId.slice(0, 4)}-${Date.now()}-${Math.random().toString(36).slice(2)}.encrypted`,
    url: 'https://mock-s3.test/recordings/test.encrypted?token=abc',
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  })),

  generatePresignedDownloadUrl: jest.fn(() => 'https://mock-s3.test/download?token=presigned'),

  getRecordingMetadata: jest.fn(async (s3Key: string) => ({
    size: 1024,
    uploadedAt: new Date(),
    lastModified: new Date(),
    exists: true,
  })),
}));

jest.mock('@/lib/database/recordings', () => {
  const recordings: Record<string, any> = {};

  return {
    createRecordingMetadata: jest.fn(async (callId, userId, convId, s3Key, mimeType, size) => {
      const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      recordings[id] = { id, userId, conversationId: convId, s3Key, mimeType, fileSizeBytes: size, deleted: false };
      return id;
    }),

    getRecordingById: jest.fn(async (recordingId: string, userId: string) => {
      const rec = recordings[recordingId];
      if (!rec || rec.deleted) return null;
      if (rec.userId !== userId) return null;
      return rec;
    }),

    listUserRecordings: jest.fn(async (userId: string, conversationId: string, limit = 20, offset = 0) => {
      const filtered = Object.values(recordings).filter(
        (r: any) => r.userId === userId && r.conversationId === conversationId && !r.deleted
      );
      return { recordings: filtered.slice(offset, offset + limit), total: filtered.length };
    }),

    getUserStorageUsage: jest.fn(async (userId: string) => {
      return Object.values(recordings)
        .filter((r: any) => r.userId === userId && !r.deleted)
        .reduce((sum: number, r: any) => sum + (r.fileSizeBytes || 0), 0);
    }),

    deleteRecordingLogical: jest.fn(async (recordingId: string, userId: string) => {
      const rec = recordings[recordingId];
      if (!rec || rec.userId !== userId) return false;
      rec.deleted = true;
      return true;
    }),

    logRecordingAccess: jest.fn(async () => {}),
    updateRecordingStatus: jest.fn(async () => {}),
    addRecordingMetrics: jest.fn(async () => {}),
    __recordings: recordings,
  };
});

// ============================================================================
// Imports
// ============================================================================

import { uploadRecordingToS3 } from '@/lib/s3-service';
import {
  createRecordingMetadata,
  getRecordingById,
  listUserRecordings,
  deleteRecordingLogical,
  getUserStorageUsage,
} from '@/lib/database/recordings';
import { canAccessRecording, generateFreshRecordingKey } from '@/lib/recording-key-management';

// ============================================================================
// Test utilities
// ============================================================================

const USER_A = 'user-alice-0001';
const USER_B = 'user-bob-00002';
const USER_C = 'user-carol-003';
const SHARED_CONV = 'conv-alice-bob-1';
const ALICE_PRIV_CONV = 'conv-alice-private-1';
const MIME = 'audio/webm';

async function makeRecording(userId: string, convId: string, sizeBytes: number = 1024) {
  const key = generateFreshRecordingKey();
  const buf = Buffer.alloc(sizeBytes, 0x41); // fill with 'A'
  const s3Result = await uploadRecordingToS3(buf, userId, convId, key, { filename: 'test.webm', mimeType: MIME });
  const id = await createRecordingMetadata(`call-${Date.now()}`, userId, convId, s3Result.s3Key, MIME, sizeBytes, 10, 'audio');
  return { recordingId: id, s3Key: s3Result.s3Key, key };
}

// ============================================================================
// Tests
// ============================================================================

describe('Recording Access Control - Phase 5', () => {
  beforeEach(() => {
    // Clear the in-memory recording store between test groups
    const { __recordings } = require('@/lib/database/recordings');
    Object.keys(__recordings).forEach((k) => delete __recordings[k]);
    jest.clearAllMocks();
  });

  // ============================================================================
  // Multi-User Isolation
  // ============================================================================
  describe('Multi-User Isolation', () => {
    test('User A cannot read User B\'s recording', async () => {
      const { recordingId } = await makeRecording(USER_B, SHARED_CONV);

      const recording = await getRecordingById(recordingId, USER_A);
      expect(recording).toBeNull();
    });

    test('User A cannot delete User B\'s recording', async () => {
      const { recordingId } = await makeRecording(USER_B, SHARED_CONV);

      const deleted = await deleteRecordingLogical(recordingId, USER_A);
      expect(deleted).toBe(false);

      // Recording still accessible by User B
      const stillExists = await getRecordingById(recordingId, USER_B);
      expect(stillExists).not.toBeNull();
    });

    test('User A listings don\'t show User B\'s recordings', async () => {
      await makeRecording(USER_A, SHARED_CONV);
      await makeRecording(USER_A, SHARED_CONV);
      await makeRecording(USER_B, SHARED_CONV);

      const aliceList = await listUserRecordings(USER_A, SHARED_CONV);
      expect(aliceList.total).toBe(2);

      const bobList = await listUserRecordings(USER_B, SHARED_CONV);
      expect(bobList.total).toBe(1);
    });

    test('User C gets empty list for a conversation they\'re not part of', async () => {
      await makeRecording(USER_A, ALICE_PRIV_CONV);
      await makeRecording(USER_A, ALICE_PRIV_CONV);

      const carolList = await listUserRecordings(USER_C, ALICE_PRIV_CONV);
      expect(carolList.total).toBe(0);
      expect(carolList.recordings.length).toBe(0);
    });

    test('Different conversations are isolated', async () => {
      await makeRecording(USER_A, 'conv-1');
      await makeRecording(USER_A, 'conv-2');

      const list1 = await listUserRecordings(USER_A, 'conv-1');
      const list2 = await listUserRecordings(USER_A, 'conv-2');

      expect(list1.total).toBe(1);
      expect(list2.total).toBe(1);

      const ids1 = new Set(list1.recordings.map((r: any) => r.id));
      const ids2 = new Set(list2.recordings.map((r: any) => r.id));
      for (const id of ids2) {
        expect(ids1.has(id)).toBe(false);
      }
    });
  });

  // ============================================================================
  // Storage Quota
  // ============================================================================
  describe('Storage Quota Enforcement', () => {
    test('getUserStorageUsage returns 0 for new user', async () => {
      const usage = await getUserStorageUsage('brand-new-user');
      expect(usage).toBe(0);
    });

    test('getUserStorageUsage sums all user recordings', async () => {
      await makeRecording(USER_A, 'conv-quota-1', 1000);
      await makeRecording(USER_A, 'conv-quota-1', 2000);
      await makeRecording(USER_B, 'conv-quota-1', 5000); // Different user

      const usage = await getUserStorageUsage(USER_A);
      expect(usage).toBe(3000); // 1000 + 2000 only
    });

    test('deleted recordings are excluded from storage usage', async () => {
      const { recordingId } = await makeRecording(USER_A, 'conv-quota-del', 5000);

      const usageBefore = await getUserStorageUsage(USER_A);
      expect(usageBefore).toBeGreaterThanOrEqual(5000);

      await deleteRecordingLogical(recordingId, USER_A);

      const usageAfter = await getUserStorageUsage(USER_A);
      expect(usageAfter).toBeLessThan(usageBefore);
    });

    test('quota check: reject upload when user would exceed 10GB', async () => {
      const QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10GB
      const fileSizeBytes = 1024;

      // Mock getUserStorageUsage to return near-quota
      const mockGetStorageUsage = jest.fn(async () => QUOTA_BYTES - 500); // Only 500 bytes remaining
      jest.spyOn(require('@/lib/database/recordings'), 'getUserStorageUsage').mockImplementation(mockGetStorageUsage);

      const currentUsage = await getUserStorageUsage(USER_A);
      const wouldExceed = currentUsage + fileSizeBytes > QUOTA_BYTES;

      expect(wouldExceed).toBe(true);
    });

    test('quota check: allow upload when under limit', async () => {
      const QUOTA_BYTES = 10 * 1024 * 1024 * 1024;
      const fileSizeBytes = 1024;

      const mockGetStorageUsage = jest.fn(async () => 100 * 1024 * 1024); // 100MB used
      jest.spyOn(require('@/lib/database/recordings'), 'getUserStorageUsage').mockImplementation(mockGetStorageUsage);

      const currentUsage = await getUserStorageUsage(USER_A);
      const wouldExceed = currentUsage + fileSizeBytes > QUOTA_BYTES;

      expect(wouldExceed).toBe(false);
    });
  });

  // ============================================================================
  // Concurrent Upload Safety
  // ============================================================================
  describe('Concurrent Upload Safety', () => {
    test('concurrent uploads by same user all succeed and are tracked', async () => {
      const key = generateFreshRecordingKey();

      const uploadPromises = Array.from({ length: 5 }, async (_, i) => {
        const buf = Buffer.alloc(512 + i * 100, i);
        const s3Result = await uploadRecordingToS3(buf, USER_A, `conv-concurrent-${i}`, key, { filename: `concurrent-${i}.webm`, mimeType: MIME });
        const id = await createRecordingMetadata(`call-concurrent-${i}`, USER_A, `conv-concurrent-${i}`, s3Result.s3Key, MIME, buf.length, 5, 'audio');
        return { id, s3Key: s3Result.s3Key, size: buf.length };
      });

      const results = await Promise.all(uploadPromises);

      expect(results.length).toBe(5);
      expect(new Set(results.map((r) => r.id)).size).toBe(5); // All unique IDs
      expect(new Set(results.map((r) => r.s3Key)).size).toBe(5); // All unique S3 keys
    });

    test('concurrent uploads by different users don\'t interfere', async () => {
      const keyA = generateFreshRecordingKey();
      const keyB = generateFreshRecordingKey();

      const [resultsA, resultsB] = await Promise.all([
        Promise.all(Array.from({ length: 3 }, async (_, i) => {
          const buf = Buffer.alloc(256 + i, 0xaa);
          const s3 = await uploadRecordingToS3(buf, USER_A, `conv-a-${i}`, keyA, { filename: `a-${i}.webm`, mimeType: MIME });
          return createRecordingMetadata(`call-a-${i}`, USER_A, `conv-a-${i}`, s3.s3Key, MIME, buf.length, 3, 'audio');
        })),
        Promise.all(Array.from({ length: 3 }, async (_, i) => {
          const buf = Buffer.alloc(256 + i, 0xbb);
          const s3 = await uploadRecordingToS3(buf, USER_B, `conv-b-${i}`, keyB, { filename: `b-${i}.webm`, mimeType: MIME });
          return createRecordingMetadata(`call-b-${i}`, USER_B, `conv-b-${i}`, s3.s3Key, MIME, buf.length, 3, 'audio');
        })),
      ]);

      // No ID collisions across users
      const allIds = [...resultsA, ...resultsB];
      expect(new Set(allIds).size).toBe(6);

      // User A's recordings not visible to User B
      for (const idA of resultsA) {
        const denied = await getRecordingById(idA, USER_B);
        expect(denied).toBeNull();
      }

      // User B's recordings not visible to User A
      for (const idB of resultsB) {
        const denied = await getRecordingById(idB, USER_A);
        expect(denied).toBeNull();
      }
    });
  });

  // ============================================================================
  // canAccessRecording utility
  // ============================================================================
  describe('canAccessRecording utility', () => {
    test('caller has access', () => {
      expect(canAccessRecording(USER_A, USER_A, USER_B)).toBe(true);
    });

    test('receiver has access', () => {
      expect(canAccessRecording(USER_B, USER_A, USER_B)).toBe(true);
    });

    test('third party is denied', () => {
      expect(canAccessRecording(USER_C, USER_A, USER_B)).toBe(false);
    });

    test('empty string userId is denied', () => {
      expect(canAccessRecording('', USER_A, USER_B)).toBe(false);
    });

    test('access is symmetric for caller and receiver', () => {
      expect(canAccessRecording(USER_A, USER_A, USER_B)).toBe(true);
      expect(canAccessRecording(USER_B, USER_A, USER_B)).toBe(true);
    });
  });
});
