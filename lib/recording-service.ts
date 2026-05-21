/**
 * Call Recording Service
 * Handles audio/video recording during calls
 * Encrypts and stores recordings securely
 */

import { encryptWithXChaCha20, decryptWithXChaCha20 } from './encryption-v2';

// Types
export interface RecordingSession {
  recordingId: string;
  callId: string;
  userId: string;
  startTime: number;
  isActive: boolean;
  audioChunks: Buffer[];
  videoChunks?: Buffer[];
  metadata: {
    sourceLanguage: string;
    targetLanguage: string;
    duration: number;
    participants: string[];
  };
}

export interface RecordingMetadata {
  recordingId: string;
  callId: string;
  userId: string;
  startTime: number;
  duration: number;
  sourceLanguage: string;
  targetLanguage: string;
  size: number; // bytes
  isEncrypted: boolean;
  encryptionAlgorithm: string;
  contentType: 'audio' | 'video';
}

export interface EncryptedRecording {
  metadata: RecordingMetadata;
  encryptedData: Buffer;
  encryptionKey?: Uint8Array; // Not stored, only in memory during session
}

// ============================================================================
// RECORDING SERVICE
// ============================================================================

class RecordingService {
  private activeSessions: Map<string, RecordingSession> = new Map();
  private maxRecordingSize = 2 * 1024 * 1024 * 1024; // 2GB

  /**
   * Start recording session
   */
  startRecording(
    callId: string,
    userId: string,
    sourceLanguage: string,
    targetLanguage: string,
    participants: string[]
  ): RecordingSession {
    const recordingId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session: RecordingSession = {
      recordingId,
      callId,
      userId,
      startTime: Date.now(),
      isActive: true,
      audioChunks: [],
      videoChunks: [],
      metadata: {
        sourceLanguage,
        targetLanguage,
        duration: 0,
        participants,
      },
    };

    this.activeSessions.set(recordingId, session);

    console.log(`🎙️  Recording started: ${recordingId}`);
    console.log(`   Call: ${callId}`);
    console.log(`   Participants: ${participants.join(', ')}`);

    return session;
  }

  /**
   * Add audio chunk to recording
   */
  addAudioChunk(recordingId: string, chunk: Buffer): void {
    const session = this.activeSessions.get(recordingId);
    if (!session) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    if (!session.isActive) {
      throw new Error(`Recording is not active: ${recordingId}`);
    }

    // Check size limit
    const currentSize = session.audioChunks.reduce((sum, c) => sum + c.length, 0);
    if (currentSize + chunk.length > this.maxRecordingSize) {
      console.warn(`Recording size limit reached: ${recordingId}`);
      return;
    }

    session.audioChunks.push(chunk);
  }

  /**
   * Add video chunk to recording
   */
  addVideoChunk(recordingId: string, chunk: Buffer): void {
    const session = this.activeSessions.get(recordingId);
    if (!session) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    if (!session.isActive) {
      throw new Error(`Recording is not active: ${recordingId}`);
    }

    if (!session.videoChunks) {
      session.videoChunks = [];
    }

    // Check size limit
    const totalSize =
      session.audioChunks.reduce((sum, c) => sum + c.length, 0) +
      session.videoChunks.reduce((sum, c) => sum + c.length, 0);

    if (totalSize + chunk.length > this.maxRecordingSize) {
      console.warn(`Recording size limit reached: ${recordingId}`);
      return;
    }

    session.videoChunks.push(chunk);
  }

  /**
   * Finalize recording and prepare for storage
   */
  async finalizeRecording(
    recordingId: string,
    encryptionKey: Uint8Array
  ): Promise<EncryptedRecording> {
    const session = this.activeSessions.get(recordingId);
    if (!session) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    session.isActive = false;
    session.metadata.duration = Date.now() - session.startTime;

    // Determine if audio or video
    const contentType = session.videoChunks && session.videoChunks.length > 0 ? 'video' : 'audio';

    // Combine chunks
    const chunks = contentType === 'video'
      ? [...(session.videoChunks || []), ...session.audioChunks]
      : session.audioChunks;

    const recordingData = Buffer.concat(chunks);

    // Encrypt
    const encryptionResult = encryptWithXChaCha20(recordingData, encryptionKey);

    // Serialize encryption result to Buffer
    const encryptedData = Buffer.from(JSON.stringify(encryptionResult), 'utf-8');

    const metadata: RecordingMetadata = {
      recordingId: session.recordingId,
      callId: session.callId,
      userId: session.userId,
      startTime: session.startTime,
      duration: session.metadata.duration,
      sourceLanguage: session.metadata.sourceLanguage,
      targetLanguage: session.metadata.targetLanguage,
      size: recordingData.length,
      isEncrypted: true,
      encryptionAlgorithm: 'XChaCha20-Poly1305',
      contentType,
    };

    console.log(`✅ Recording finalized: ${recordingId}`);
    console.log(`   Duration: ${(metadata.duration / 1000).toFixed(1)}s`);
    console.log(`   Size: ${(metadata.size / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Type: ${contentType}`);

    // Keep metadata but remove raw data from memory
    this.activeSessions.delete(recordingId);

    return {
      metadata,
      encryptedData,
      // encryptionKey is not returned - only kept in memory during active session
    };
  }

  /**
   * Get recording session
   */
  getRecording(recordingId: string): RecordingSession | undefined {
    return this.activeSessions.get(recordingId);
  }

  /**
   * Get recording stats
   */
  getRecordingStats(recordingId: string): {
    duration: number;
    audioSize: number;
    videoSize: number;
    totalSize: number;
  } | null {
    const session = this.activeSessions.get(recordingId);
    if (!session) return null;

    const audioSize = session.audioChunks.reduce((sum, c) => sum + c.length, 0);
    const videoSize = session.videoChunks?.reduce((sum, c) => sum + c.length, 0) || 0;

    return {
      duration: Date.now() - session.startTime,
      audioSize,
      videoSize,
      totalSize: audioSize + videoSize,
    };
  }

  /**
   * Decrypt recording for playback
   */
  async decryptRecording(
    encryptedRecording: EncryptedRecording,
    encryptionKey: Uint8Array
  ): Promise<Buffer> {
    try {
      // Parse the encrypted data back from Buffer to EncryptionResult
      const encryptionResult = JSON.parse(encryptedRecording.encryptedData.toString('utf-8'));

      const decrypted = decryptWithXChaCha20(
        encryptionResult,
        encryptionKey
      );

      console.log(`✅ Recording decrypted: ${encryptedRecording.metadata.recordingId}`);

      return Buffer.from(decrypted, 'utf-8');
    } catch (error) {
      console.error('Failed to decrypt recording:', error);
      throw new Error('Failed to decrypt recording - invalid key or corrupted data');
    }
  }

  /**
   * Delete recording from memory (finalized recordings are not stored locally)
   */
  deleteRecording(recordingId: string): void {
    const session = this.activeSessions.get(recordingId);
    if (session) {
      session.isActive = false;
      session.audioChunks = [];
      session.videoChunks = [];
      this.activeSessions.delete(recordingId);

      console.log(`🗑️  Recording deleted: ${recordingId}`);
    }
  }

  /**
   * Get all active recordings
   */
  getActiveRecordings(): RecordingSession[] {
    return Array.from(this.activeSessions.values()).filter(s => s.isActive);
  }

  /**
   * Storage estimates
   */
  getStorageStats(): {
    totalSessions: number;
    activeSessions: number;
    estimatedSize: number;
  } {
    const sessions = this.getActiveRecordings();
    const totalSize = sessions.reduce((sum, session) => {
      const audioSize = session.audioChunks.reduce((s, c) => s + c.length, 0);
      const videoSize = session.videoChunks?.reduce((s, c) => s + c.length, 0) || 0;
      return sum + audioSize + videoSize;
    }, 0);

    return {
      totalSessions: this.activeSessions.size,
      activeSessions: sessions.length,
      estimatedSize: totalSize,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let recordingServiceInstance: RecordingService | null = null;

export function getRecordingService(): RecordingService {
  if (!recordingServiceInstance) {
    recordingServiceInstance = new RecordingService();
  }
  return recordingServiceInstance;
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

export function startRecording(
  callId: string,
  userId: string,
  sourceLanguage: string,
  targetLanguage: string,
  participants: string[]
): RecordingSession {
  const service = getRecordingService();
  return service.startRecording(callId, userId, sourceLanguage, targetLanguage, participants);
}

export function addAudioChunk(recordingId: string, chunk: Buffer): void {
  const service = getRecordingService();
  return service.addAudioChunk(recordingId, chunk);
}

export function addVideoChunk(recordingId: string, chunk: Buffer): void {
  const service = getRecordingService();
  return service.addVideoChunk(recordingId, chunk);
}

export async function finalizeRecording(
  recordingId: string,
  encryptionKey: Uint8Array
): Promise<EncryptedRecording> {
  const service = getRecordingService();
  return service.finalizeRecording(recordingId, encryptionKey);
}

export async function decryptRecording(
  encryptedRecording: EncryptedRecording,
  encryptionKey: Uint8Array
): Promise<Buffer> {
  const service = getRecordingService();
  return service.decryptRecording(encryptedRecording, encryptionKey);
}

export default getRecordingService;
