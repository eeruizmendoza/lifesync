/**
 * LifeSync Encryption/Decryption
 * AES-256-GCM for post content and sensitive data
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits for authentication tag
const SALT_LENGTH = 16; // 128 bits for key derivation

/**
 * Derive an encryption key from a master key and salt
 * Uses PBKDF2 with SHA-256
 */
function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
}

/**
 * Encrypt data using AES-256-GCM
 * Returns: salt + iv + ciphertext + authTag (all base64 encoded as single string)
 */
export function encryptContent(plaintext: string, userEncryptionKey: string): string {
  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive encryption key from master key and salt
    const key = deriveKey(userEncryptionKey, salt);

    // Create cipher and encrypt
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine: salt (16) + iv (16) + authTag (16) + ciphertext
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);

    // Return as base64 string
    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt content');
  }
}

/**
 * Decrypt data using AES-256-GCM
 * Expects: base64 string containing salt + iv + authTag + ciphertext
 */
export function decryptContent(encryptedData: string, userEncryptionKey: string): string {
  try {
    // Decode base64
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract components
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    // Derive key using the same salt
    const key = deriveKey(userEncryptionKey, salt);

    // Create decipher and decrypt
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt content');
  }
}

/**
 * Generate a user-specific encryption key
 * In production, this would be derived from the user's password or a secure key management system
 * For now, we use JWT_SECRET + userId to create a deterministic key per user
 * @deprecated Use getUserEncryptionKeyFromDatabase() for user-controlled keys
 */
export function getUserEncryptionKey(userId: string): string {
  const jwtSecret = process.env.JWT_SECRET || 'dev-secret-key';
  // Create a deterministic key for this user
  const hmac = crypto.createHmac('sha256', jwtSecret);
  hmac.update(userId);
  return hmac.digest('hex');
}

/**
 * Decrypt the stored encryption key using the master key
 */
function decryptStoredEncryptionKey(encryptedKeyBase64: string): Buffer {
  try {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey) {
      throw new Error('ENCRYPTION_MASTER_KEY not configured');
    }

    // Decode from base64
    const combined = Buffer.from(encryptedKeyBase64, 'base64');

    // Extract components (iv: 16 bytes, authTag: 16 bytes, ciphertext: rest)
    const iv = combined.slice(0, 16);
    const authTag = combined.slice(16, 32);
    const ciphertext = combined.slice(32);

    // Create decipher and decrypt
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(masterKey, 'hex'),
      iv
    );
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt stored encryption key:', error);
    throw new Error('Failed to decrypt user encryption key');
  }
}

/**
 * Get user's encryption key from database
 * If user has set password-based encryption, decrypt and return their stored key
 * Otherwise fall back to deterministic key (for backward compatibility)
 */
export async function getUserEncryptionKeyFromDatabase(
  userId: string,
  database?: any
): Promise<string> {
  try {
    // If database connection not provided, import it
    const { query } = database || await import('./db');

    // Query user's encryption key info
    const result = await query(
      `SELECT encryption_key_encrypted, encryption_enabled
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!result.rows[0]) {
      // User not found, fall back to deterministic key
      return getUserEncryptionKey(userId);
    }

    const user = result.rows[0];

    // If user has enabled password-based encryption, use stored key
    if (user.encryption_enabled && user.encryption_key_encrypted) {
      const decryptedKeyBuffer = decryptStoredEncryptionKey(
        user.encryption_key_encrypted
      );
      return decryptedKeyBuffer.toString('hex');
    }

    // Fall back to deterministic key
    return getUserEncryptionKey(userId);
  } catch (error) {
    console.error('Error getting user encryption key:', error);
    // Fall back to deterministic key on error
    return getUserEncryptionKey(userId);
  }
}

/**
 * Hash content for search indexing (optional)
 * Returns a hash that can be used for full-text search without decrypting
 */
export function hashForSearch(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}
