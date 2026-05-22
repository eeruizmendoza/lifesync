/**
 * Recording Service
 * Phase 13.4: Audio/video buffer management, frame capture, file handling
 * Manages real-time recording during calls
 */

import { getCallRegistry } from '@/lib/call-state-machine';

export interface RecordingChunk {
  timestamp: number;
  data: Buffer;
  duration: number; // milliseconds
  codec: 'opus' | 'vp8' | 'h264';
  sequence: number;
}

export interface RecordingSession {
  callId: string;
  recordingId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  chunks: RecordingChunk[];
  totalSize: number;
  isActive: boolean;
  callerId: string;
  receiverId: string;
}

/**
 * Recording Service
 * Manages audio/video buffers and chunk collection during calls
 */
export class RecordingService {
  private sessions: Map<string, RecordingSession> = new Map();
  private maxChunksPerSession = 10000; // ~1 hour at 100ms chunks
  private maxSessionSize = 1024 * 1024 * 500; // 500MB max per session

  /**
   * Start recording for a call
   */
  startRecording(callId: string, callerId: string, receiverId: string): RecordingSession {
    if (this.sessions.has(callId)) {
      throw new Error(`Recording already exists for call ${callId}`);
    }

    const recordingId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: RecordingSession = {
      callId,
      recordingId,
      startTime: Date.now(),
      chunks: [],
      totalSize: 0,
      isActive: true,
      callerId,
      receiverId,
    };

    this.sessions.set(callId, session);

    console.log(`🎙️  Recording started: ${recordingId} for call ${callId}`);
    return session;
  }

  /**
   * Add audio chunk to recording
   */
  addAudioChunk(callId: string, data: Buffer, codec: 'opus' | 'vp8' = 'opus', duration: number = 20): void {
    const session = this.sessions.get(callId);
    if (!session) {
      console.warn(`Recording session not found for call ${callId}`);
      return;
    }

    if (!session.isActive) {
      console.warn(`Recording session is not active for call ${callId}`);
      return;
    }

    // Check size limits
    if (session.totalSize + data.length > this.maxSessionSize) {
      console.warn(`Recording size limit reached for call ${callId}, dropping chunk`);
      return;
    }

    if (session.chunks.length >= this.maxChunksPerSession) {
      console.warn(`Recording chunk limit reached for call ${callId}, dropping oldest chunk`);
      const oldest = session.chunks.shift();
      if (oldest) {
        session.totalSize -= oldest.data.length;
      }
    }

    const chunk: RecordingChunk = {
      timestamp: Date.now(),
      data,
      duration,
      codec,
      sequence: session.chunks.length,
    };

    session.chunks.push(chunk);
    session.totalSize += data.length;
  }

  /**
   * Add video chunk to recording
   */
  addVideoChunk(callId: string, data: Buffer, codec: 'vp8' | 'h264' = 'vp8', duration: number = 33): void {
    this.addAudioChunk(callId, data, codec as any, duration);
  }

  /**
   * Get current recording session
   */
  getSession(callId: string): RecordingSession | null {
    return this.sessions.get(callId) || null;
  }

  /**
   * Stop recording and finalize session
   */
  stopRecording(callId: string): RecordingSession | null {
    const session = this.sessions.get(callId);
    if (!session) {
      return null;
    }

    session.isActive = false;
    session.endTime = Date.now();
    session.duration = session.endTime - session.startTime;

    console.log(`🎙️  Recording stopped: ${session.recordingId}`);
    console.log(`   Duration: ${(session.duration / 1000).toFixed(1)}s`);
    console.log(`   Chunks: ${session.chunks.length}`);
    console.log(`   Size: ${(session.totalSize / 1024 / 1024).toFixed(2)}MB`);

    return session;
  }

  /**
   * Get all chunks for a recording session
   */
  getChunks(callId: string): RecordingChunk[] {
    const session = this.sessions.get(callId);
    return session?.chunks || [];
  }

  /**
   * Merge chunks into a single buffer
   */
  mergeChunks(callId: string): Buffer | null {
    const session = this.sessions.get(callId);
    if (!session || session.chunks.length === 0) {
      return null;
    }

    try {
      const buffers = session.chunks.map((chunk) => chunk.data);
      return Buffer.concat(buffers, session.totalSize);
    } catch (error) {
      console.error(`Failed to merge chunks for call ${callId}:`, error);
      return null;
    }
  }

  /**
   * Clear recording session (cleanup)
   */
  clearSession(callId: string): void {
    this.sessions.delete(callId);
    console.log(`🗑️  Recording session cleared: ${callId}`);
  }

  /**
   * Get recording stats
   */
  getStats(callId: string) {
    const session = this.sessions.get(callId);
    if (!session) {
      return null;
    }

    return {
      callId,
      recordingId: session.recordingId,
      isActive: session.isActive,
      duration: session.duration || Date.now() - session.startTime,
      chunkCount: session.chunks.length,
      totalSize: session.totalSize,
      averageChunkSize: session.chunks.length > 0 ? session.totalSize / session.chunks.length : 0,
      startTime: session.startTime,
      endTime: session.endTime,
    };
  }

  /**
   * Get all active recordings
   */
  getActiveSessions(): RecordingSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.isActive);
  }

  /**
   * Get registry stats
   */
  getRegistryStats() {
    const sessions = Array.from(this.sessions.values());
    const active = sessions.filter((s) => s.isActive).length;
    const totalSize = sessions.reduce((sum, s) => sum + s.totalSize, 0);
    const totalChunks = sessions.reduce((sum, s) => sum + s.chunks.length, 0);

    return {
      totalSessions: sessions.length,
      activeSessions: active,
      inactiveSessions: sessions.length - active,
      totalSize,
      totalChunks,
      averageSessionSize: sessions.length > 0 ? totalSize / sessions.length : 0,
    };
  }
}

// Singleton instance
let recordingServiceInstance: RecordingService | null = null;

/**
 * Get global recording service
 */
export function getRecordingService(): RecordingService {
  if (!recordingServiceInstance) {
    recordingServiceInstance = new RecordingService();
  }
  return recordingServiceInstance;
}
