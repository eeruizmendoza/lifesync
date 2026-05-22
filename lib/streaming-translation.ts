/**
 * Streaming Translation Service
 * Phase 13.7: Batch translations every 50ms, detect sentence boundaries
 * Send batches to client as they're ready for TTS synthesis
 */

export interface TranslationChunk {
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  confidence: number;
  isSentenceEnd: boolean; // Sentence boundary detected
  timestamp: number;
}

export interface TranslationBatch {
  batchId: string;
  callId: string;
  chunks: TranslationChunk[];
  batchTime: number;
  processingTimeMs: number;
  provider: string;
}

export interface StreamingTranslationSession {
  callId: string;
  sourceLang: string;
  targetLang: string;
  sessionId: string;
  startTime: number;
  buffer: string;
  lastBatchTime: number;
  batches: TranslationBatch[];
  isActive: boolean;
  provider: string;
}

const BATCH_WINDOW_MS = 50; // Collect text for 50ms before translating
const SENTENCE_BOUNDARIES = /[.!?\n]/;

/**
 * Detect if text ends with sentence boundary
 */
function isSentenceBoundary(text: string): boolean {
  return SENTENCE_BOUNDARIES.test(text.trim().slice(-1));
}

/**
 * Split text on sentence boundaries
 */
function splitOnBoundaries(text: string): string[] {
  const pattern = /([.!?\n])/;
  return text
    .split(pattern)
    .reduce((acc, chunk, idx, arr) => {
      if (pattern.test(chunk)) {
        // Punctuation
        if (acc.length > 0) {
          acc[acc.length - 1] += chunk;
        }
      } else if (chunk.trim()) {
        acc.push(chunk);
      }
      return acc;
    }, [] as string[]);
}

/**
 * Manager for streaming translation sessions
 */
export class StreamingTranslationManager {
  private sessions: Map<string, StreamingTranslationSession> = new Map();
  private batchCallbacks: Map<string, (batch: TranslationBatch) => void> =
    new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start a new streaming translation session
   */
  startSession(
    callId: string,
    sourceLang: string,
    targetLang: string,
    provider: string
  ): StreamingTranslationSession {
    const sessionId = `trans_${callId}_${Date.now()}`;
    const session: StreamingTranslationSession = {
      callId,
      sourceLang,
      targetLang,
      sessionId,
      startTime: Date.now(),
      buffer: '',
      lastBatchTime: Date.now(),
      batches: [],
      isActive: true,
      provider,
    };

    this.sessions.set(callId, session);
    return session;
  }

  /**
   * Register callback for batch translations
   */
  onBatch(callId: string, callback: (batch: TranslationBatch) => void): void {
    this.batchCallbacks.set(callId, callback);
  }

  /**
   * Add text to buffer, queue batch if needed
   */
  async addText(
    callId: string,
    text: string,
    translateFn: (text: string) => Promise<string>
  ): Promise<void> {
    const session = this.sessions.get(callId);
    if (!session || !session.isActive) {
      return;
    }

    session.buffer += text;

    // Check if we have a sentence boundary or batch window expired
    const timeSinceLastBatch = Date.now() - session.lastBatchTime;
    const hasBoundary = isSentenceBoundary(text);

    if (hasBoundary || timeSinceLastBatch >= BATCH_WINDOW_MS) {
      await this.flushBatch(callId, translateFn);
    } else {
      // Schedule batch flush if not already scheduled
      this.scheduleBatchFlush(callId, translateFn);
    }
  }

  /**
   * Schedule batch flush after timeout
   */
  private scheduleBatchFlush(
    callId: string,
    translateFn: (text: string) => Promise<string>
  ): void {
    // Cancel previous timer if exists
    const existingTimer = this.batchTimers.get(callId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new flush
    const timer = setTimeout(() => {
      this.flushBatch(callId, translateFn).catch((error) => {
        console.error(`Failed to flush translation batch for ${callId}:`, error);
      });
    }, BATCH_WINDOW_MS);

    this.batchTimers.set(callId, timer);
  }

  /**
   * Flush buffer as translation batch
   */
  private async flushBatch(
    callId: string,
    translateFn: (text: string) => Promise<string>
  ): Promise<void> {
    const session = this.sessions.get(callId);
    if (!session || session.buffer.trim().length === 0) {
      return;
    }

    const startTime = Date.now();
    const bufferText = session.buffer;

    // Clear timer
    const timer = this.batchTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(callId);
    }

    try {
      // Translate the buffered text
      const translatedText = await translateFn(bufferText);

      // Split into chunks on sentence boundaries
      const chunks = this.createChunks(
        bufferText,
        translatedText,
        session.sourceLang,
        session.targetLang
      );

      // Create batch
      const batch: TranslationBatch = {
        batchId: `batch_${callId}_${Date.now()}`,
        callId,
        chunks,
        batchTime: Date.now(),
        processingTimeMs: Date.now() - startTime,
        provider: session.provider,
      };

      session.batches.push(batch);
      session.buffer = '';
      session.lastBatchTime = Date.now();

      // Invoke callback
      const callback = this.batchCallbacks.get(callId);
      if (callback) {
        callback(batch);
      }
    } catch (error) {
      console.error(
        `Translation failed for batch in session ${callId}:`,
        error
      );
      // Keep buffer for retry
    }
  }

  /**
   * Create chunks from original and translated text
   */
  private createChunks(
    originalText: string,
    translatedText: string,
    sourceLang: string,
    targetLang: string
  ): TranslationChunk[] {
    const originalChunks = splitOnBoundaries(originalText);
    const translatedChunks = splitOnBoundaries(translatedText);

    const chunks: TranslationChunk[] = [];

    // Match chunks as best as possible
    const maxChunks = Math.max(originalChunks.length, translatedChunks.length);
    for (let i = 0; i < maxChunks; i++) {
      const orig = originalChunks[i] || '';
      const trans = translatedChunks[i] || originalChunks[i] || '';

      if (orig.trim().length === 0) continue;

      chunks.push({
        originalText: orig,
        translatedText: trans,
        sourceLang,
        targetLang,
        confidence: 0.85, // Default confidence
        isSentenceEnd: isSentenceBoundary(orig),
        timestamp: Date.now(),
      });
    }

    return chunks;
  }

  /**
   * Get session by call ID
   */
  getSession(callId: string): StreamingTranslationSession | null {
    return this.sessions.get(callId) || null;
  }

  /**
   * Get current buffer content
   */
  getBufferContent(callId: string): string | null {
    const session = this.sessions.get(callId);
    return session ? session.buffer : null;
  }

  /**
   * End streaming session
   */
  endSession(callId: string): void {
    const session = this.sessions.get(callId);
    if (session) {
      session.isActive = false;
    }

    // Cancel pending timer
    const timer = this.batchTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(callId);
    }
  }

  /**
   * Clear session
   */
  clearSession(callId: string): void {
    this.endSession(callId);
    this.sessions.delete(callId);
    this.batchCallbacks.delete(callId);
  }

  /**
   * Get session statistics
   */
  getStats(callId: string): {
    totalBatches: number;
    totalChunks: number;
    averageProcessingTimeMs: number;
    sessionDurationMs: number;
    bufferSize: number;
  } | null {
    const session = this.sessions.get(callId);
    if (!session) {
      return null;
    }

    const totalChunks = session.batches.reduce(
      (sum, b) => sum + b.chunks.length,
      0
    );
    const avgProcessingTime =
      session.batches.length > 0
        ? session.batches.reduce((sum, b) => sum + b.processingTimeMs, 0) /
          session.batches.length
        : 0;

    return {
      totalBatches: session.batches.length,
      totalChunks,
      averageProcessingTimeMs: avgProcessingTime,
      sessionDurationMs: Date.now() - session.startTime,
      bufferSize: session.buffer.length,
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): StreamingTranslationSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.isActive);
  }
}

/**
 * Singleton instance
 */
let instance: StreamingTranslationManager | null = null;

export function getStreamingTranslationManager(): StreamingTranslationManager {
  if (!instance) {
    instance = new StreamingTranslationManager();
  }
  return instance;
}
