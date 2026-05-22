/**
 * Streaming Transcription Service
 * Phase 13.7: Manage partial hypotheses from speech-to-text providers
 * Stream results to client as they arrive, final hypothesis replaces partial
 */

export interface TranscriptionHypothesis {
  text: string;
  isFinal: boolean;
  language: string;
  confidence: number;
  timestamp: number;
  sequenceNumber: number;
  durationMs: number;
  wordTimings?: Array<{
    word: string;
    startMs: number;
    endMs: number;
    confidence: number;
  }>;
}

export interface StreamingTranscriptionSession {
  callId: string;
  language: string;
  streamId: string;
  startTime: number;
  hypotheses: TranscriptionHypothesis[];
  currentPartialText: string;
  finalText: string;
  isActive: boolean;
  provider: string;
  metricsWindow: Array<{
    hypothesisTime: number;
    latencyMs: number;
  }>;
}

/**
 * Manager for streaming transcription sessions
 */
export class StreamingTranscriptionManager {
  private sessions: Map<string, StreamingTranscriptionSession> = new Map();
  private hypothesisCallbacks: Map<
    string,
    (hypothesis: TranscriptionHypothesis) => void
  > = new Map();

  /**
   * Start a new streaming transcription session
   */
  startSession(
    callId: string,
    language: string,
    provider: string
  ): StreamingTranscriptionSession {
    const streamId = `stream_${callId}_${Date.now()}`;
    const session: StreamingTranscriptionSession = {
      callId,
      language,
      streamId,
      startTime: Date.now(),
      hypotheses: [],
      currentPartialText: '',
      finalText: '',
      isActive: true,
      provider,
      metricsWindow: [],
    };

    this.sessions.set(callId, session);
    return session;
  }

  /**
   * Register callback for hypothesis updates
   */
  onHypothesis(
    callId: string,
    callback: (hypothesis: TranscriptionHypothesis) => void
  ): void {
    this.hypothesisCallbacks.set(callId, callback);
  }

  /**
   * Add partial hypothesis to session
   */
  addPartialHypothesis(
    callId: string,
    text: string,
    language: string,
    confidence: number
  ): TranscriptionHypothesis | null {
    const session = this.sessions.get(callId);
    if (!session || !session.isActive) {
      return null;
    }

    const hypothesis: TranscriptionHypothesis = {
      text,
      isFinal: false,
      language,
      confidence,
      timestamp: Date.now(),
      sequenceNumber: session.hypotheses.length,
      durationMs: Date.now() - session.startTime,
    };

    session.hypotheses.push(hypothesis);
    session.currentPartialText = text;

    // Record latency
    const latencyMs = Date.now() - session.startTime;
    session.metricsWindow.push({
      hypothesisTime: Date.now(),
      latencyMs,
    });

    // Keep metrics window bounded to last 100 hypotheses
    if (session.metricsWindow.length > 100) {
      session.metricsWindow.shift();
    }

    // Invoke callback
    const callback = this.hypothesisCallbacks.get(callId);
    if (callback) {
      callback(hypothesis);
    }

    return hypothesis;
  }

  /**
   * Add final hypothesis to session (replaces partial)
   */
  addFinalHypothesis(
    callId: string,
    text: string,
    language: string,
    confidence: number,
    wordTimings?: TranscriptionHypothesis['wordTimings']
  ): TranscriptionHypothesis | null {
    const session = this.sessions.get(callId);
    if (!session || !session.isActive) {
      return null;
    }

    const hypothesis: TranscriptionHypothesis = {
      text,
      isFinal: true,
      language,
      confidence,
      timestamp: Date.now(),
      sequenceNumber: session.hypotheses.length,
      durationMs: Date.now() - session.startTime,
      wordTimings,
    };

    session.hypotheses.push(hypothesis);
    session.finalText += (session.finalText ? ' ' : '') + text;
    session.currentPartialText = ''; // Clear partial when final arrives

    // Invoke callback
    const callback = this.hypothesisCallbacks.get(callId);
    if (callback) {
      callback(hypothesis);
    }

    return hypothesis;
  }

  /**
   * Get session by call ID
   */
  getSession(callId: string): StreamingTranscriptionSession | null {
    return this.sessions.get(callId) || null;
  }

  /**
   * Get current state (partial + final text)
   */
  getCurrentText(callId: string): { partial: string; final: string } | null {
    const session = this.sessions.get(callId);
    if (!session) {
      return null;
    }

    return {
      partial: session.currentPartialText,
      final: session.finalText,
    };
  }

  /**
   * Calculate latency statistics
   */
  getLatencyStats(callId: string): {
    avgLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    p95LatencyMs: number;
  } | null {
    const session = this.sessions.get(callId);
    if (!session || session.metricsWindow.length === 0) {
      return null;
    }

    const latencies = session.metricsWindow.map((m) => m.latencyMs).sort((a, b) => a - b);

    return {
      avgLatencyMs:
        latencies.reduce((a, b) => a + b, 0) / latencies.length,
      minLatencyMs: latencies[0],
      maxLatencyMs: latencies[latencies.length - 1],
      p95LatencyMs: latencies[Math.floor(latencies.length * 0.95)],
    };
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
   * Clean up session
   */
  clearSession(callId: string): void {
    this.sessions.delete(callId);
    this.hypothesisCallbacks.delete(callId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): StreamingTranscriptionSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.isActive);
  }

  /**
   * Get session statistics
   */
  getStats(callId: string): {
    totalHypotheses: number;
    finalHypotheses: number;
    partialHypotheses: number;
    averageConfidence: number;
    sessionDurationMs: number;
  } | null {
    const session = this.sessions.get(callId);
    if (!session) {
      return null;
    }

    const finalCount = session.hypotheses.filter((h) => h.isFinal).length;
    const partialCount = session.hypotheses.length - finalCount;

    return {
      totalHypotheses: session.hypotheses.length,
      finalHypotheses: finalCount,
      partialHypotheses: partialCount,
      averageConfidence:
        session.hypotheses.length > 0
          ? session.hypotheses.reduce((sum, h) => sum + h.confidence, 0) /
            session.hypotheses.length
          : 0,
      sessionDurationMs: Date.now() - session.startTime,
    };
  }
}

/**
 * Singleton instance
 */
let instance: StreamingTranscriptionManager | null = null;

export function getStreamingTranscriptionManager(): StreamingTranscriptionManager {
  if (!instance) {
    instance = new StreamingTranscriptionManager();
  }
  return instance;
}
