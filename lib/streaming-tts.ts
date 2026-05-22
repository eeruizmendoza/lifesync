/**
 * Streaming Text-to-Speech Service
 * Phase 13.7: Sentence-based TTS synthesis for ultra-low latency
 * Synthesize in parallel, start playing first sentence while second renders
 */

export interface SynthesisChunk {
  text: string;
  audioBuffer: Buffer | null; // null if not yet synthesized
  duration: number; // Estimated duration in ms
  language: string;
  sentenceNumber: number;
  isSynthesized: boolean;
  synthesisStartTime: number;
  synthesisEndTime: number;
  synthesisTimeMs: number;
  provider: string;
}

export interface StreamingTTSSession {
  callId: string;
  language: string;
  voiceId: string;
  sessionId: string;
  startTime: number;
  chunks: SynthesisChunk[];
  isActive: boolean;
  currentPlayingChunk: number;
  provider: string;
  metricsWindow: Array<{
    chunkNumber: number;
    synthesisTimeMs: number;
    timestamp: number;
  }>;
}

const SENTENCE_PATTERN = /([^.!?\n]+[.!?\n]?)/g;
const ESTIMATED_CHARS_PER_MS = 0.1; // Rough estimate for TTS duration

/**
 * Split text into sentences for parallel synthesis
 */
function splitIntoSentences(text: string): string[] {
  const matches = text.match(SENTENCE_PATTERN) || [];
  return matches
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Estimate TTS duration based on text length
 */
function estimateDuration(text: string): number {
  return Math.max(text.length * ESTIMATED_CHARS_PER_MS, 100);
}

/**
 * Manager for streaming TTS sessions
 */
export class StreamingTTSManager {
  private sessions: Map<string, StreamingTTSSession> = new Map();
  private synthesisCallbacks: Map<
    string,
    (chunk: SynthesisChunk, index: number) => void
  > = new Map();
  private playbackCallbacks: Map<
    string,
    (chunkIndex: number) => void
  > = new Map();

  /**
   * Start a new streaming TTS session
   */
  startSession(
    callId: string,
    language: string,
    voiceId: string,
    provider: string
  ): StreamingTTSSession {
    const sessionId = `tts_${callId}_${Date.now()}`;
    const session: StreamingTTSSession = {
      callId,
      language,
      voiceId,
      sessionId,
      startTime: Date.now(),
      chunks: [],
      isActive: true,
      currentPlayingChunk: 0,
      provider,
      metricsWindow: [],
    };

    this.sessions.set(callId, session);
    return session;
  }

  /**
   * Register callback for completed synthesis chunks
   */
  onSynthesisComplete(
    callId: string,
    callback: (chunk: SynthesisChunk, index: number) => void
  ): void {
    this.synthesisCallbacks.set(callId, callback);
  }

  /**
   * Register callback for playback start
   */
  onPlaybackStart(
    callId: string,
    callback: (chunkIndex: number) => void
  ): void {
    this.playbackCallbacks.set(callId, callback);
  }

  /**
   * Add text for synthesis, split into sentences
   */
  async synthesizeText(
    callId: string,
    text: string,
    synthesizeFn: (
      text: string,
      language: string,
      voiceId: string
    ) => Promise<Buffer>
  ): Promise<void> {
    const session = this.sessions.get(callId);
    if (!session || !session.isActive) {
      return;
    }

    // Split into sentences
    const sentences = splitIntoSentences(text);

    // Create chunks (not yet synthesized)
    const newChunks: SynthesisChunk[] = sentences.map((sentence, idx) => ({
      text: sentence,
      audioBuffer: null,
      duration: estimateDuration(sentence),
      language: session.language,
      sentenceNumber: session.chunks.length + idx,
      isSynthesized: false,
      synthesisStartTime: 0,
      synthesisEndTime: 0,
      synthesisTimeMs: 0,
      provider: session.provider,
    }));

    session.chunks.push(...newChunks);

    // Start synthesis in parallel
    const synthesisPromises = newChunks.map((chunk, idx) =>
      this.synthesizeChunk(
        callId,
        chunk,
        session.chunks.length - newChunks.length + idx,
        synthesizeFn,
        session
      )
    );

    // Don't await - synthesize in background
    Promise.all(synthesisPromises).catch((error) => {
      console.error(`TTS synthesis failed for ${callId}:`, error);
    });
  }

  /**
   * Synthesize single chunk in background
   */
  private async synthesizeChunk(
    callId: string,
    chunk: SynthesisChunk,
    chunkIndex: number,
    synthesizeFn: (
      text: string,
      language: string,
      voiceId: string
    ) => Promise<Buffer>,
    session: StreamingTTSSession
  ): Promise<void> {
    const startTime = Date.now();
    chunk.synthesisStartTime = startTime;

    try {
      const audioBuffer = await synthesizeFn(
        chunk.text,
        session.language,
        session.voiceId
      );

      // Update chunk with synthesized audio
      chunk.audioBuffer = audioBuffer;
      chunk.isSynthesized = true;
      chunk.synthesisEndTime = Date.now();
      chunk.synthesisTimeMs = chunk.synthesisEndTime - chunk.synthesisStartTime;

      // Record metrics
      session.metricsWindow.push({
        chunkNumber: chunk.sentenceNumber,
        synthesisTimeMs: chunk.synthesisTimeMs,
        timestamp: Date.now(),
      });

      // Keep metrics bounded
      if (session.metricsWindow.length > 100) {
        session.metricsWindow.shift();
      }

      // Invoke callback
      const callback = this.synthesisCallbacks.get(callId);
      if (callback) {
        callback(chunk, chunkIndex);
      }

      // Check if this chunk should start playing
      this.checkPlayback(callId, chunkIndex);
    } catch (error) {
      console.error(
        `Failed to synthesize chunk ${chunk.sentenceNumber} for ${callId}:`,
        error
      );
      chunk.isSynthesized = false;
    }
  }

  /**
   * Check if chunk is ready to play (previous chunk finished)
   */
  private checkPlayback(callId: string, chunkIndex: number): void {
    const session = this.sessions.get(callId);
    if (!session) {
      return;
    }

    // Can play if this is first chunk or previous chunk is done
    if (chunkIndex === 0 || chunkIndex === session.currentPlayingChunk) {
      const chunk = session.chunks[chunkIndex];
      if (chunk && chunk.isSynthesized) {
        session.currentPlayingChunk = chunkIndex + 1;

        const callback = this.playbackCallbacks.get(callId);
        if (callback) {
          callback(chunkIndex);
        }
      }
    }
  }

  /**
   * Get chunk by index
   */
  getChunk(callId: string, index: number): SynthesisChunk | null {
    const session = this.sessions.get(callId);
    if (!session || index < 0 || index >= session.chunks.length) {
      return null;
    }
    return session.chunks[index];
  }

  /**
   * Get all synthesized chunks
   */
  getSynthesizedChunks(callId: string): SynthesisChunk[] {
    const session = this.sessions.get(callId);
    if (!session) {
      return [];
    }
    return session.chunks.filter((c) => c.isSynthesized);
  }

  /**
   * Get chunks ready for playback (synthesized and before current playing)
   */
  getPlaybackQueue(callId: string): SynthesisChunk[] {
    const session = this.sessions.get(callId);
    if (!session) {
      return [];
    }
    return session.chunks.filter(
      (c, idx) => c.isSynthesized && idx < session.currentPlayingChunk
    );
  }

  /**
   * Get session by call ID
   */
  getSession(callId: string): StreamingTTSSession | null {
    return this.sessions.get(callId) || null;
  }

  /**
   * End streaming session
   */
  endSession(callId: string): void {
    const session = this.sessions.get(callId);
    if (session) {
      session.isActive = false;
    }
  }

  /**
   * Clear session
   */
  clearSession(callId: string): void {
    this.endSession(callId);
    this.sessions.delete(callId);
    this.synthesisCallbacks.delete(callId);
    this.playbackCallbacks.delete(callId);
  }

  /**
   * Get synthesis statistics
   */
  getStats(callId: string): {
    totalChunks: number;
    synthesizedChunks: number;
    pendingChunks: number;
    averageSynthesisTimeMs: number;
    p95SynthesisTimeMs: number;
    totalAudioDurationMs: number;
    sessionDurationMs: number;
  } | null {
    const session = this.sessions.get(callId);
    if (!session) {
      return null;
    }

    const synthesized = session.chunks.filter((c) => c.isSynthesized).length;
    const pending = session.chunks.length - synthesized;
    const synthesizationTimes = session.metricsWindow.map(
      (m) => m.synthesisTimeMs
    );
    const sortedTimes = synthesizationTimes.sort((a, b) => a - b);

    return {
      totalChunks: session.chunks.length,
      synthesizedChunks: synthesized,
      pendingChunks: pending,
      averageSynthesisTimeMs:
        synthesizationTimes.length > 0
          ? synthesizationTimes.reduce((a, b) => a + b, 0) /
            synthesizationTimes.length
          : 0,
      p95SynthesisTimeMs:
        sortedTimes.length > 0
          ? sortedTimes[Math.floor(sortedTimes.length * 0.95)]
          : 0,
      totalAudioDurationMs: session.chunks.reduce(
        (sum, c) => sum + c.duration,
        0
      ),
      sessionDurationMs: Date.now() - session.startTime,
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): StreamingTTSSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.isActive);
  }
}

/**
 * Singleton instance
 */
let instance: StreamingTTSManager | null = null;

export function getStreamingTTSManager(): StreamingTTSManager {
  if (!instance) {
    instance = new StreamingTTSManager();
  }
  return instance;
}
