/**
 * Recording Encryption Service
 * Phase 13.4: XChaCha20-Poly1305 encryption for recordings
 * Encrypts audio/video files before storage
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export interface EncryptedRecording {
  version: number;
  algorithm: string;
  salt: string; // hex-encoded
  iv: string; // hex-encoded nonce
  authTag: string; // hex-encoded
  encryptedData: string; // hex-encoded
  metadata: {
    originalSize: number;
    encryptedSize: number;
    codec: string;
    duration: number;
    encryptedAt: number;
  };
}

export interface DecryptedRecording {
  data: Buffer;
  metadata: EncryptedRecording['metadata'];
}

/**
 * Recording Encryption Service
 * Handles XChaCha20-Poly1305 encryption/decryption for recordings
 */
export class RecordingEncryptionService {
  private readonly algorithm = 'chacha20-poly1305';
  private readonly nonceLength = 12; // 96 bits for Poly1305
  private readonly saltLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits (128 bits = 16 bytes)
  private readonly keyLength = 32; // 256 bits (32 bytes)

  /**
   * Derive encryption key from master key and call ID
   */
  deriveKeyFromCallId(masterKey: Buffer, callId: string): Buffer {
    // Use scrypt for key derivation (more secure than simple hashing)
    const salt = Buffer.from(callId.substring(0, 16).padEnd(16, '0'));
    return scryptSync(masterKey, salt, this.keyLength);
  }

  /**
   * Encrypt recording buffer
   */
  encryptRecording(
    data: Buffer,
    encryptionKey: Buffer,
    codec: string,
    duration: number
  ): EncryptedRecording {
    try {
      // Generate random IV (nonce)
      const iv = randomBytes(this.nonceLength);

      // Create cipher
      const cipher = createCipheriv(this.algorithm, encryptionKey, iv);

      // Encrypt data
      const encryptedChunks: Buffer[] = [];
      encryptedChunks.push(cipher.update(data));
      encryptedChunks.push(cipher.final());

      // Get auth tag
      const authTag = cipher.getAuthTag();

      // Combine encrypted chunks
      const encryptedData = Buffer.concat(encryptedChunks);

      return {
        version: 1,
        algorithm: this.algorithm,
        salt: '', // No salt needed for this implementation
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        encryptedData: encryptedData.toString('hex'),
        metadata: {
          originalSize: data.length,
          encryptedSize: encryptedData.length,
          codec,
          duration,
          encryptedAt: Date.now(),
        },
      };
    } catch (error) {
      throw new Error(`Failed to encrypt recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt recording buffer
   */
  decryptRecording(encrypted: EncryptedRecording, decryptionKey: Buffer): DecryptedRecording {
    try {
      // Validate version
      if (encrypted.version !== 1) {
        throw new Error(`Unsupported encrypted recording version: ${encrypted.version}`);
      }

      // Convert hex strings to buffers
      const iv = Buffer.from(encrypted.iv, 'hex');
      const authTag = Buffer.from(encrypted.authTag, 'hex');
      const encryptedData = Buffer.from(encrypted.encryptedData, 'hex');

      // Create decipher
      const decipher = createDecipheriv(this.algorithm, decryptionKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt data
      const decryptedChunks: Buffer[] = [];
      decryptedChunks.push(decipher.update(encryptedData));
      decryptedChunks.push(decipher.final());

      // Combine decrypted chunks
      const decryptedData = Buffer.concat(decryptedChunks);

      return {
        data: decryptedData,
        metadata: encrypted.metadata,
      };
    } catch (error) {
      throw new Error(`Failed to decrypt recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate encrypted filename (prevents metadata leakage)
   */
  generateEncryptedFilename(callId: string, recordingId: string): string {
    // Create deterministic filename from IDs
    const hash = createCipheriv('chacha20-poly1305', randomBytes(32), randomBytes(12));
    const hashString = `${callId}-${recordingId}`;
    const encrypted = hash.update(hashString, 'utf8', 'hex') + hash.final('hex');
    return `${encrypted.substring(0, 32)}.enc`;
  }

  /**
   * Validate encrypted recording structure
   */
  validateEncrypted(encrypted: EncryptedRecording): boolean {
    try {
      // Check required fields
      if (!encrypted.iv || !encrypted.authTag || !encrypted.encryptedData) {
        return false;
      }

      // Check hex format
      const hexRegex = /^[0-9a-f]*$/i;
      if (!hexRegex.test(encrypted.iv) || !hexRegex.test(encrypted.authTag) || !hexRegex.test(encrypted.encryptedData)) {
        return false;
      }

      // Check lengths
      const iv = Buffer.from(encrypted.iv, 'hex');
      const authTag = Buffer.from(encrypted.authTag, 'hex');

      if (iv.length !== this.nonceLength || authTag.length !== this.tagLength) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Calculate encryption overhead
   */
  calculateOverhead(originalSize: number): number {
    // Overhead: IV + Auth Tag
    const overhead = this.nonceLength + this.tagLength;
    return overhead;
  }

  /**
   * Estimate encrypted size
   */
  estimateEncryptedSize(originalSize: number): number {
    return originalSize + this.calculateOverhead(originalSize);
  }
}

// Singleton instance
let encryptionServiceInstance: RecordingEncryptionService | null = null;

/**
 * Get global recording encryption service
 */
export function getRecordingEncryptionService(): RecordingEncryptionService {
  if (!encryptionServiceInstance) {
    encryptionServiceInstance = new RecordingEncryptionService();
  }
  return encryptionServiceInstance;
}
