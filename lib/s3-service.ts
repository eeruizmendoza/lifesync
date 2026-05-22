/**
 * S3 Recording Storage Service
 * Handles encrypted upload/download of audio/video recordings
 * Prevents metadata leakage through encrypted filenames
 */

import * as AWS from 'aws-sdk';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import { encryptLargeFile, decryptLargeFile, EncryptedFile } from './encryption-v2';

// Configure S3
const s3Client = new AWS.S3({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const s3 = s3Client;

const BUCKET_NAME = process.env.S3_RECORDINGS_BUCKET || 'lifesync-recordings';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB for multipart upload

export interface S3UploadResult {
  s3Key: string; // Encrypted filename stored in S3
  url: string; // Presigned URL (temporary access)
  size: number;
  uploadedAt: string;
  expiresAt: string; // When presigned URL expires (1 hour)
}

export interface S3DownloadResult {
  buffer: Buffer;
  contentType: string;
  size: number;
}

/**
 * Generate encrypted S3 key to prevent metadata leakage
 *
 * Phase 3 (multi-tenant): prefix with org hash for per-tenant S3 namespace.
 * Pattern: recordings/{orgHash}/{hash}-{uuid}.encrypted
 *   where orgHash = first 8 chars of SHA-256(orgId) — opaque, no PII in S3
 *
 * Single-tenant fallback: recordings/{hash}-{uuid}.encrypted
 */
function generateEncryptedS3Key(userId: string, conversationId: string, orgId?: string | null): string {
  const hash = createHash('sha256')
    .update(`${userId}:${conversationId}`)
    .digest('hex')
    .substring(0, 16);

  const filename = `${hash}-${uuid()}`;

  if (orgId) {
    const orgHash = createHash('sha256').update(orgId).digest('hex').substring(0, 8);
    return `recordings/${orgHash}/${filename}.encrypted`;
  }

  return `recordings/${filename}.encrypted`;
}

/**
 * Upload encrypted recording to S3
 *
 * @param fileBuffer - Raw audio/video file buffer
 * @param userId - Owner's user ID
 * @param conversationId - Conversation ID
 * @param encryptionKey - User's encryption key for the conversation
 * @param metadata - File metadata (filename, mimeType)
 * @returns S3 key and presigned URL
 */
export async function uploadRecordingToS3(
  fileBuffer: Buffer,
  userId: string,
  conversationId: string,
  encryptionKey: Uint8Array,
  metadata: {
    filename: string;
    mimeType: string;
  },
  orgId?: string | null
): Promise<S3UploadResult> {
  try {
    // Encrypt file in chunks
    const encryptedFile = encryptLargeFile(fileBuffer, encryptionKey, metadata, CHUNK_SIZE);

    // Convert encrypted file structure to JSON
    const encryptedContent = JSON.stringify(encryptedFile);
    const encryptedBuffer = Buffer.from(encryptedContent, 'utf-8');

    // Phase 3: per-tenant S3 namespace
    const s3Key = generateEncryptedS3Key(userId, conversationId, orgId);

    // Upload to S3
    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: encryptedBuffer,
      ContentType: 'application/octet-stream', // Always opaque to S3
      ServerSideEncryption: 'AES256', // S3-side encryption (additional layer)
      StorageClass: 'INTELLIGENT_TIERING', // Auto-optimize storage costs
      Metadata: {
        // Store encrypted metadata as S3 object tags
        'user-id': userId.substring(0, 8), // First 8 chars only
        'conversation-id': conversationId.substring(0, 8),
        'encrypted': 'true',
      },
    };

    // Perform upload
    const uploadResult = await s3.upload(params).promise();

    // Generate presigned URL (1 hour expiration)
    const presignedUrl = s3.getSignedUrl('getObject', {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Expires: 3600, // 1 hour
    });

    return {
      s3Key: s3Key,
      url: presignedUrl,
      size: encryptedBuffer.length,
      uploadedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  } catch (error) {
    console.error('Failed to upload recording to S3:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`S3 upload failed: ${errorMessage}`);
  }
}

/**
 * Download encrypted recording from S3
 * Decrypts automatically
 *
 * @param s3Key - S3 object key from database
 * @param encryptionKey - User's encryption key for the conversation
 * @returns Decrypted file buffer and metadata
 */
export async function downloadRecordingFromS3(
  s3Key: string,
  encryptionKey: Uint8Array
): Promise<S3DownloadResult> {
  try {
    // Download from S3
    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
    };

    const downloadResult = await s3.getObject(params).promise();

    if (!downloadResult.Body) {
      throw new Error('No body returned from S3');
    }

    // Convert body to buffer
    let encryptedBuffer: Buffer;
    if (Buffer.isBuffer(downloadResult.Body)) {
      encryptedBuffer = downloadResult.Body;
    } else if (downloadResult.Body instanceof Uint8Array) {
      encryptedBuffer = Buffer.from(downloadResult.Body);
    } else {
      // Assume it's a string or can be converted to string
      encryptedBuffer = Buffer.from(String(downloadResult.Body));
    }

    // Parse encrypted file structure
    const encryptedFileJson = encryptedBuffer.toString('utf-8');
    const encryptedFile: EncryptedFile = JSON.parse(encryptedFileJson);

    // Decrypt file chunks
    const decryptedBuffer = decryptLargeFile(encryptedFile, encryptionKey);

    return {
      buffer: decryptedBuffer,
      contentType: encryptedFile.metadata.mimeType,
      size: decryptedBuffer.length,
    };
  } catch (error) {
    console.error('Failed to download recording from S3:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`S3 download failed: ${errorMessage}`);
  }
}

/**
 * Delete recording from S3
 * Called when user deletes conversation or call
 *
 * @param s3Key - S3 object key
 */
export async function deleteRecordingFromS3(s3Key: string): Promise<void> {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
    };

    await s3.deleteObject(params).promise();
    console.log(`Deleted recording from S3: ${s3Key}`);
  } catch (error) {
    console.error('Failed to delete recording from S3:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`S3 deletion failed: ${errorMessage}`);
  }
}

/**
 * Generate presigned download URL
 * Allows user to share recording with contact (temporary access)
 *
 * @param s3Key - S3 object key
 * @param expirationSeconds - URL expiration time (default 24 hours)
 * @returns Presigned URL
 */
export function generatePresignedDownloadUrl(
  s3Key: string,
  expirationSeconds: number = 86400 // 24 hours default
): string {
  return s3.getSignedUrl('getObject', {
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Expires: expirationSeconds,
  });
}

/**
 * Generate presigned upload URL
 * For direct browser upload (reduces server bandwidth)
 *
 * @param userId - User uploading
 * @param conversationId - Target conversation
 * @param contentType - File MIME type
 * @returns Presigned POST URL and form fields
 */
export async function generatePresignedUploadUrl(
  userId: string,
  conversationId: string,
  contentType: string,
  orgId?: string | null
): Promise<{
  url: string;
  fields: Record<string, string>;
}> {
  const s3Key = generateEncryptedS3Key(userId, conversationId, orgId);

  return new Promise((resolve, reject) => {
    s3.createPresignedPost(
      {
        Bucket: BUCKET_NAME,
        Fields: {
          key: s3Key,
          'Content-Type': contentType,
        },
        Expires: 3600, // 1 hour
        Conditions: [
          ['content-length-range', 0, 2 * 1024 * 1024 * 1024], // 2GB max
          ['eq', '$Content-Type', contentType],
        ],
      },
      (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            url: data.url,
            fields: data.fields,
          });
        }
      }
    );
  });
}

/**
 * Get S3 object metadata without downloading
 * Used for checking existence, size, upload time
 *
 * @param s3Key - S3 object key
 * @returns Metadata object
 */
export async function getRecordingMetadata(
  s3Key: string
): Promise<{
  size: number;
  uploadedAt: Date;
  lastModified: Date;
  exists: boolean;
}> {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
    };

    const result = await s3.headObject(params).promise();

    return {
      size: result.ContentLength || 0,
      uploadedAt: result.Metadata?.['uploaded-at']
        ? new Date(result.Metadata['uploaded-at'])
        : new Date(),
      lastModified: result.LastModified || new Date(),
      exists: true,
    };
  } catch (error: any) {
    if (error.code === 'NotFound') {
      return {
        size: 0,
        uploadedAt: new Date(),
        lastModified: new Date(),
        exists: false,
      };
    }
    throw error;
  }
}

/**
 * List all recordings for a user (for cleanup/audit)
 * Only returns encrypted keys (no user/conversation info exposed)
 *
 * @param userId - User to list recordings for
 * @returns Array of S3 keys
 */
export async function listUserRecordings(userId: string): Promise<string[]> {
  try {
    // Get first 8 chars of hash for this user (all recordings contain this)
    const userHash = createHash('sha256')
      .update(userId)
      .digest('hex')
      .substring(0, 8);

    // Note: S3 doesn't support true prefix search on object metadata
    // This is why we hash user ID into the filename
    // For production, consider using DynamoDB index instead

    const params = {
      Bucket: BUCKET_NAME,
      Prefix: `recordings/${userHash}`,
    };

    const result = await s3.listObjectsV2(params).promise();

    return (result.Contents || [])
      .filter(obj => obj.Key?.endsWith('.encrypted'))
      .map(obj => obj.Key || '')
      .filter(Boolean);
  } catch (error) {
    console.error('Failed to list user recordings:', error);
    throw error;
  }
}

/**
 * Calculate storage usage for a user
 * Used for quota enforcement
 *
 * @param userId - User to calculate usage for
 * @param quotaBytes - Storage quota (default 10GB)
 * @returns Usage stats
 */
export async function getUserStorageUsage(
  userId: string,
  quotaBytes: number = 10 * 1024 * 1024 * 1024 // 10GB default
): Promise<{
  usedBytes: number;
  quotaBytes: number;
  percentUsed: number;
  remaining: number;
  recordingCount: number;
}> {
  try {
    const keys = await listUserRecordings(userId);

    let totalSize = 0;

    // Get size of each recording
    for (const key of keys) {
      try {
        const metadata = await getRecordingMetadata(key);
        totalSize += metadata.size;
      } catch (error) {
        console.error(`Error getting metadata for ${key}:`, error);
      }
    }

    const percentUsed = (totalSize / quotaBytes) * 100;

    return {
      usedBytes: totalSize,
      quotaBytes,
      percentUsed,
      remaining: Math.max(0, quotaBytes - totalSize),
      recordingCount: keys.length,
    };
  } catch (error) {
    console.error('Failed to calculate storage usage:', error);
    throw error;
  }
}

/**
 * Health check for S3 connectivity
 */
export async function checkS3Health(): Promise<boolean> {
  try {
    await s3.headBucket({ Bucket: BUCKET_NAME }).promise();
    return true;
  } catch (error) {
    console.error('S3 health check failed:', error);
    return false;
  }
}
