/**
 * Integration Tests: Recording Encryption
 * Phase 5: Recording, Encryption & Storage
 *
 * Tests for:
 * - Key derivation (HKDF-SHA256 uniqueness and consistency)
 * - Round-trip encrypt/decrypt
 * - Key storage encryption
 * - Access control utilities
 * - Recording blob integrity checks
 */

import {
  deriveRecordingKey,
  encryptRecordingKeyForStorage,
  decryptRecordingKeyFromStorage,
  canAccessRecording,
  generateFreshRecordingKey,
  serializeEncryptedKey,
  deserializeEncryptedKey,
  keyToBase64,
  base64ToKey,
} from '@/lib/recording-key-management';

import {
  encryptRecordingForStorage,
  decryptRecordingFromStorage,
  serializeEncryptedRecording,
  deserializeEncryptedRecording,
  verifyRecordingIntegrity,
} from '@/lib/recording-encryption';

// ============================================================================
// Helpers
// ============================================================================

function makeMasterKey(): Uint8Array {
  const buf = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) buf[i] = i;
  return new Uint8Array(buf);
}

function makeAudioBuffer(sizeBytes: number = 1024): Buffer {
  const buf = Buffer.alloc(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) buf[i] = (i * 7 + 13) % 256;
  return buf;
}

// ============================================================================
// Key Derivation
// ============================================================================

describe('Recording Key Management - Phase 5', () => {
  const masterKey = makeMasterKey();
  const recordingId = 'rec_test_123abc';
  const conversationId = 'conv-abc-def-456';

  describe('Key Derivation (HKDF-SHA256)', () => {
    test('derives a 32-byte key', () => {
      const key = deriveRecordingKey(masterKey, recordingId, conversationId);
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    test('produces the same key for the same inputs (deterministic)', () => {
      const key1 = deriveRecordingKey(masterKey, recordingId, conversationId);
      const key2 = deriveRecordingKey(masterKey, recordingId, conversationId);
      expect(Buffer.from(key1).toString('hex')).toBe(Buffer.from(key2).toString('hex'));
    });

    test('produces different keys for different recordingIds', () => {
      const key1 = deriveRecordingKey(masterKey, 'rec-aaa', conversationId);
      const key2 = deriveRecordingKey(masterKey, 'rec-bbb', conversationId);
      expect(Buffer.from(key1).toString('hex')).not.toBe(Buffer.from(key2).toString('hex'));
    });

    test('produces different keys for different conversationIds', () => {
      const key1 = deriveRecordingKey(masterKey, recordingId, 'conv-aaa');
      const key2 = deriveRecordingKey(masterKey, recordingId, 'conv-bbb');
      expect(Buffer.from(key1).toString('hex')).not.toBe(Buffer.from(key2).toString('hex'));
    });

    test('produces different keys for different master keys', () => {
      const mk1 = makeMasterKey();
      const mk2 = new Uint8Array(32).fill(0xff);
      const key1 = deriveRecordingKey(mk1, recordingId, conversationId);
      const key2 = deriveRecordingKey(mk2, recordingId, conversationId);
      expect(Buffer.from(key1).toString('hex')).not.toBe(Buffer.from(key2).toString('hex'));
    });

    test('keys are unpredictable (high entropy)', () => {
      const key = deriveRecordingKey(masterKey, recordingId, conversationId);
      // Not all zeros or all same byte
      const allSame = key.every((b) => b === key[0]);
      const allZero = key.every((b) => b === 0);
      expect(allSame).toBe(false);
      expect(allZero).toBe(false);
    });
  });

  describe('Key Storage Encryption', () => {
    beforeEach(() => {
      process.env.ENCRYPTION_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    });

    test('encrypts a key and returns EncryptionResult', () => {
      const recordingKey = generateFreshRecordingKey();
      const encrypted = encryptRecordingKeyForStorage(recordingKey);
      expect(encrypted.version).toBeDefined();
      expect(encrypted.algorithm).toBeDefined();
      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.nonce).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();
    });

    test('round-trips encrypt → decrypt correctly', () => {
      const originalKey = generateFreshRecordingKey();
      const encrypted = encryptRecordingKeyForStorage(originalKey);
      const decrypted = decryptRecordingKeyFromStorage(encrypted);
      expect(Buffer.from(decrypted).toString('hex')).toBe(Buffer.from(originalKey).toString('hex'));
    });

    test('serialized encrypted key survives JSON stringify/parse', () => {
      const key = generateFreshRecordingKey();
      const encrypted = encryptRecordingKeyForStorage(key);
      const serialized = serializeEncryptedKey(encrypted);
      const deserialized = deserializeEncryptedKey(serialized);
      const decrypted = decryptRecordingKeyFromStorage(deserialized);
      expect(Buffer.from(decrypted).toString('hex')).toBe(Buffer.from(key).toString('hex'));
    });

    test('throws if ENCRYPTION_MASTER_KEY is missing', () => {
      const savedKey = process.env.ENCRYPTION_MASTER_KEY;
      delete process.env.ENCRYPTION_MASTER_KEY;
      const key = generateFreshRecordingKey();
      expect(() => encryptRecordingKeyForStorage(key)).toThrow();
      process.env.ENCRYPTION_MASTER_KEY = savedKey;
    });

    test('different keys encrypt to different ciphertext', () => {
      const key1 = generateFreshRecordingKey();
      const key2 = generateFreshRecordingKey();
      const enc1 = encryptRecordingKeyForStorage(key1);
      const enc2 = encryptRecordingKeyForStorage(key2);
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    });
  });

  describe('Key Serialization Utilities', () => {
    test('keyToBase64 / base64ToKey round-trip', () => {
      const key = generateFreshRecordingKey();
      const b64 = keyToBase64(key);
      const back = base64ToKey(b64);
      expect(Buffer.from(back).toString('hex')).toBe(Buffer.from(key).toString('hex'));
    });

    test('base64ToKey throws for wrong length', () => {
      const shortKey = Buffer.from('too-short').toString('base64');
      expect(() => base64ToKey(shortKey)).toThrow(/Invalid key length/);
    });
  });

  describe('Access Control', () => {
    test('allows caller access', () => {
      expect(canAccessRecording('user-A', 'user-A', 'user-B')).toBe(true);
    });

    test('allows receiver access', () => {
      expect(canAccessRecording('user-B', 'user-A', 'user-B')).toBe(true);
    });

    test('blocks third-party access', () => {
      expect(canAccessRecording('user-C', 'user-A', 'user-B')).toBe(false);
    });

    test('blocks empty userId', () => {
      expect(canAccessRecording('', 'user-A', 'user-B')).toBe(false);
    });
  });
});

// ============================================================================
// Recording Encryption (Audio/Video)
// ============================================================================

describe('Recording Encryption Layer - Phase 5', () => {
  const recordingKey = new Uint8Array(32).fill(0x42); // Fixed key for tests
  const mimeType = 'audio/webm';

  describe('Encrypt / Decrypt Round-Trip', () => {
    test('encrypts a small buffer and decrypts it back', () => {
      const original = makeAudioBuffer(512);
      const blob = encryptRecordingForStorage(original, mimeType, recordingKey);
      const result = decryptRecordingFromStorage(blob, recordingKey);

      expect(result.buffer.equals(original)).toBe(true);
      expect(result.mimeType).toBe(mimeType);
      expect(result.originalSize).toBe(original.length);
    });

    test('encrypts a 1MB buffer and decrypts correctly', () => {
      const original = makeAudioBuffer(1 * 1024 * 1024);
      const blob = encryptRecordingForStorage(original, mimeType, recordingKey, 10);
      const result = decryptRecordingFromStorage(blob, recordingKey);

      expect(result.buffer.length).toBe(original.length);
      expect(result.buffer.equals(original)).toBe(true);
    });

    test('encrypts a 3MB buffer (multi-chunk) and decrypts correctly', () => {
      const original = makeAudioBuffer(3 * 1024 * 1024);
      const blob = encryptRecordingForStorage(original, mimeType, recordingKey, 30);
      const result = decryptRecordingFromStorage(blob, recordingKey);

      expect(result.buffer.equals(original)).toBe(true);
      expect(blob.encryptedFile.chunkCount).toBeGreaterThan(1);
    });

    test('wrong key fails to decrypt (throws)', () => {
      const original = makeAudioBuffer(512);
      const blob = encryptRecordingForStorage(original, mimeType, recordingKey);

      const wrongKey = new Uint8Array(32).fill(0xff);
      expect(() => decryptRecordingFromStorage(blob, wrongKey)).toThrow();
    });

    test('preserves mimeType through round-trip', () => {
      const videoMime = 'video/mp4';
      const original = makeAudioBuffer(256);
      const blob = encryptRecordingForStorage(original, videoMime, recordingKey);
      const result = decryptRecordingFromStorage(blob, recordingKey);
      expect(result.mimeType).toBe(videoMime);
    });

    test('encrypted output is different from plaintext', () => {
      const original = makeAudioBuffer(512);
      const blob = encryptRecordingForStorage(original, mimeType, recordingKey);
      const serialized = serializeEncryptedRecording(blob);

      // Verify the serialized blob doesn't trivially contain the raw bytes
      // (we check the JSON structure, not raw bytes)
      expect(serialized.toString()).not.toContain(original.toString('base64').substring(0, 20));
    });

    test('two encryptions of the same plaintext produce different ciphertext (nonce randomness)', () => {
      const original = makeAudioBuffer(256);
      const blob1 = encryptRecordingForStorage(original, mimeType, recordingKey);
      const blob2 = encryptRecordingForStorage(original, mimeType, recordingKey);

      const chunk1Nonce = blob1.encryptedFile.chunks[0]?.nonce;
      const chunk2Nonce = blob2.encryptedFile.chunks[0]?.nonce;
      expect(chunk1Nonce).not.toBe(chunk2Nonce);
    });
  });

  describe('Serialization / Deserialization', () => {
    test('serialize and deserialize a blob', () => {
      const original = makeAudioBuffer(512);
      const blob = encryptRecordingForStorage(original, mimeType, recordingKey);
      const serialized = serializeEncryptedRecording(blob);
      const deserialized = deserializeEncryptedRecording(serialized);
      const result = decryptRecordingFromStorage(deserialized, recordingKey);

      expect(result.buffer.equals(original)).toBe(true);
    });

    test('serialized blob is valid JSON', () => {
      const blob = encryptRecordingForStorage(makeAudioBuffer(256), mimeType, recordingKey);
      const serialized = serializeEncryptedRecording(blob);
      expect(() => JSON.parse(serialized.toString())).not.toThrow();
    });
  });

  describe('Integrity Verification', () => {
    test('valid blob passes integrity check', () => {
      const original = makeAudioBuffer(512);
      const blob = encryptRecordingForStorage(original, mimeType, recordingKey);
      const { valid } = verifyRecordingIntegrity(blob);
      expect(valid).toBe(true);
    });

    test('missing encryptedFile fails integrity check', () => {
      const { valid, reason } = verifyRecordingIntegrity({ encryptedFile: null as any, metadata: null as any });
      expect(valid).toBe(false);
      expect(reason).toContain('encryptedFile');
    });

    test('chunk count mismatch fails integrity check', () => {
      const blob = encryptRecordingForStorage(makeAudioBuffer(512), mimeType, recordingKey);
      blob.encryptedFile.chunkCount = 999; // Tamper with chunk count
      const { valid, reason } = verifyRecordingIntegrity(blob);
      expect(valid).toBe(false);
      expect(reason).toContain('Chunk count mismatch');
    });

    test('metadata includes required fields', () => {
      const blob = encryptRecordingForStorage(makeAudioBuffer(512), mimeType, recordingKey, 5);
      expect(blob.metadata.algorithm).toBe('XChaCha20-Poly1305');
      expect(blob.metadata.keyDerivation).toBe('HKDF-SHA256');
      expect(blob.metadata.originalSize).toBeGreaterThan(0);
      expect(blob.metadata.mimeType).toBe(mimeType);
      expect(blob.metadata.durationSeconds).toBe(5);
      expect(blob.metadata.encryptedAt).toBeTruthy();
    });
  });

  describe('Key Validation', () => {
    test('throws for key shorter than 32 bytes', () => {
      const shortKey = new Uint8Array(16);
      expect(() => encryptRecordingForStorage(makeAudioBuffer(256), mimeType, shortKey)).toThrow(/32 bytes/);
    });

    test('throws for key longer than 32 bytes', () => {
      const longKey = new Uint8Array(64);
      expect(() => encryptRecordingForStorage(makeAudioBuffer(256), mimeType, longKey)).toThrow(/32 bytes/);
    });
  });
});
