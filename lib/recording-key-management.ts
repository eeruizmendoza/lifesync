/**
 * Recording Key Management
 * Phase 5: Recording, Encryption & Storage
 *
 * Provides per-recording key derivation and secure key storage.
 * Keys are NEVER stored in plaintext — always encrypted with the
 * server master key before being written to the database.
 *
 * Key hierarchy:
 *   ENCRYPTION_MASTER_KEY (env var)
 *     └─ encryptRecordingKeyForStorage
 *         └─ Per-recording XChaCha20-Poly1305 key (32 bytes)
 *
 * Key derivation:
 *   userMasterKey + recordingId + conversationId
 *     ──── HKDF-SHA256 ────► 32-byte recording key
 */

import * as crypto from 'crypto';
import {
  encryptWithXChaCha20,
  decryptWithXChaCha20,
  EncryptionResult,
} from './encryption-v2';

// ============================================================================
// KEY DERIVATION
// ============================================================================

/**
 * Derive a unique 32-byte encryption key for a specific recording.
 * Uses HKDF-SHA256 so each recording gets a distinct key even for
 * the same user, preventing cross-recording key reuse.
 *
 * @param userMasterKey - User's master encryption key (32 bytes)
 * @param recordingId   - The recording's unique ID
 * @param conversationId - The conversation this recording belongs to
 * @returns 32-byte Uint8Array key for XChaCha20-Poly1305
 */
export function deriveRecordingKey(
  userMasterKey: Uint8Array,
  recordingId: string,
  conversationId: string
): Uint8Array {
  // Build a deterministic context string that binds the key to this specific
  // recording. If any component changes, the derived key is completely different.
  const context = `recording:${recordingId}:${conversationId}`;
  const contextBuffer = Buffer.from(context, 'utf-8');

  const derived = crypto.hkdfSync(
    'sha256',
    userMasterKey,
    Buffer.alloc(32, 0), // static salt (context provides entropy)
    contextBuffer,
    32
  );

  return new Uint8Array(derived);
}

// ============================================================================
// KEY STORAGE ENCRYPTION / DECRYPTION
// ============================================================================

/**
 * Encrypt a per-recording key for safe database storage.
 * Uses the server's ENCRYPTION_MASTER_KEY so the key material
 * at rest is never readable without server access.
 *
 * @param recordingKey - The 32-byte per-recording key to encrypt
 * @returns EncryptionResult (JSON-serializable) to store in DB
 */
export function encryptRecordingKeyForStorage(
  recordingKey: Uint8Array
): EncryptionResult {
  const masterKeyHex = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKeyHex) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
  }

  const masterKey = Buffer.from(masterKeyHex, 'hex');

  if (masterKey.length !== 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be 32 bytes (64 hex chars)');
  }

  return encryptWithXChaCha20(Buffer.from(recordingKey), masterKey);
}

/**
 * Decrypt a per-recording key retrieved from the database.
 *
 * @param encryptedKey - The EncryptionResult stored in DB
 * @returns 32-byte Uint8Array recording key
 */
export function decryptRecordingKeyFromStorage(
  encryptedKey: EncryptionResult
): Uint8Array {
  const masterKeyHex = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKeyHex) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
  }

  const masterKey = Buffer.from(masterKeyHex, 'hex');

  if (masterKey.length !== 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be 32 bytes (64 hex chars)');
  }

  const decrypted = decryptWithXChaCha20(encryptedKey, masterKey);

  // decryptWithXChaCha20 returns a UTF-8 string; convert back to bytes
  return new Uint8Array(Buffer.from(decrypted, 'utf-8'));
}

// ============================================================================
// ACCESS CONTROL
// ============================================================================

/**
 * Check whether a user is allowed to access a specific recording.
 * A user may access if they are:
 *  - The original uploader (caller)
 *  - The other participant (receiver)
 *
 * This function is a lightweight in-process check — the definitive
 * database-level access check is in getRecordingById().
 *
 * @param userId       - User requesting access
 * @param callerId     - ID of the call's initiating participant
 * @param receiverId   - ID of the call's receiving participant
 * @returns true if access is permitted
 */
export function canAccessRecording(
  userId: string,
  callerId: string,
  receiverId: string
): boolean {
  return userId === callerId || userId === receiverId;
}

// ============================================================================
// KEY UTILITIES
// ============================================================================

/**
 * Generate a fresh random 32-byte recording key.
 * Use this when no pre-existing user master key is available
 * (e.g., for server-side generated recordings).
 */
export function generateFreshRecordingKey(): Uint8Array {
  return new Uint8Array(crypto.randomBytes(32));
}

/**
 * Serialize an EncryptionResult to a compact JSON string for DB storage.
 */
export function serializeEncryptedKey(encrypted: EncryptionResult): string {
  return JSON.stringify(encrypted);
}

/**
 * Deserialize an EncryptionResult from a DB-stored JSON string.
 */
export function deserializeEncryptedKey(serialized: string): EncryptionResult {
  return JSON.parse(serialized) as EncryptionResult;
}

/**
 * Convert a Uint8Array key to base64 for client transmission.
 */
export function keyToBase64(key: Uint8Array): string {
  return Buffer.from(key).toString('base64');
}

/**
 * Convert a base64 key string back to Uint8Array.
 * Validates length (must be exactly 32 bytes).
 */
export function base64ToKey(b64: string): Uint8Array {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== 32) {
    throw new Error(`Invalid key length: expected 32 bytes, got ${buf.length}`);
  }
  return new Uint8Array(buf);
}
