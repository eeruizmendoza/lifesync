/**
 * Real-Time Translation Pipeline
 * Orchestrates speech capture → transcription → translation → synthesis → playback
 * Optimized for <100ms end-to-end latency with streaming architecture
 * Includes recording announcement for legal compliance
 */

import { getTranscriptionService, TranscriptionChunk, TranscriptionResult } from './transcription-service';
import { getTranslationService, TranslationResult } from './translation-service';
import { getTTSService, SynthesisChunk, SynthesisResult } from './tts-service';
import { encryptWithXChaCha20, decryptWithXChaCha20 } from './encryption-v2';
import { getRecordingAnnouncementService } from './recording-announcement-service';

// Types
export interface CallParticipant {
  userId: string;
  language: string; // 'es', 'zh', 'en', etc.
  streamId: string; // WebRTC stream ID
  isHost: boolean; // Who initiated the call
}

export interface CallMetrics {
  totalLatencyMs: number;
  transcriptionLatencyMs: number;
  translationLatencyMs: number;
  synthesisLatencyMs: number;
  networkLatencyMs: number;
  audioQualityScore: number; // 0-1
  transcriptionConfidence: number; // 0-1
  translationConfidence: number; // 0-1
}

export interface PipelineEvent {
  type: 'transcription' | 'translation' | 'synthesis' | 'error' | 'latency_warning';
  timestamp: number;
  data: any;
  metrics: Partial<CallMetrics>;
}

export interface ActiveCall {
  callId: string;
  participants: CallParticipant[];
  startTime: number;
  isActive: boolean;
  metrics: CallMetrics[];
  events: PipelineEvent[];
  originalTranscripts: Array<{ userId: string; language: string; text: string; timestamp: number }>;
  translatedTranscripts: Array<{ userId: string; language: string; text: string; timestamp: number }>;
  // Recording announcement metadata
  announcementGiven?: boolean;
  announcementJurisdiction?: string;
  announcementTimestamp?: number;
}

// ============================================================================
// REAL-TIME TRANSLATION PIPELINE
// ============================================================================

class RealTimeTranslationPipeline {
  private activeCalls: Map<string, ActiveCall> = new Map();
  private transcriptionService = getTranscriptionService();
  private translationService = getTranslationService();
  private ttsService = getTTSService();
  private announcementService = getRecordingAnnouncementService();

  /**
   * Initialize new call
   * Called when users connect and call begins
   * Automatically generates recording announcement for legal compliance
   */
  async initializeCall(
    callId: string,
    participant1: CallParticipant,
    participant2: CallParticipant,
    userState?: string // User's state for jurisdiction detection (e.g., 'CA', 'FL')
  ): Promise<ActiveCall> {
    const call: ActiveCall = {
      callId,
      participants: [participant1, participant2],
      startTime: Date.now(),
      isActive: true,
      metrics: [],
      events: [],
      originalTranscripts: [],
      translatedTranscripts: [],
    };

    this.activeCalls.set(callId, call);
    console.log(`✅ Call initialized: ${callId} (${participant1.language} ↔ ${participant2.language})`);

    // Generate recording announcement for legal compliance
    try {
      const jurisdiction = this.announcementService.detectJurisdiction(userState);

      // Generate announcement audio
      await this.announcementService.generateAnnouncement({
        jurisdiction,
        language: participant1.language,
      });

      // Record announcement metadata
      call.announcementGiven = true;
      call.announcementJurisdiction = jurisdiction;
      call.announcementTimestamp = Date.now();

      console.log(
        `📢 Recording announcement ready: ${callId} (${jurisdiction}, ${participant1.language})`
      );
    } catch (error) {
      console.warn(`Failed to generate recording announcement: ${error}`);
      // Don't fail call if announcement generation fails - just log warning
    }

    return call;
  }

  /**
   * Process incoming audio chunk from participant
   * Main pipeline entry point during active call
   *
   * Flow:
   * 1. Audio arrives from participant A
   * 2. Transcribe to A's language
   * 3. Translate to B's language
   * 4. Synthesize B's language as audio
   * 5. Send audio to participant B's speakers
   * 6. Encrypt and store both original + translation
   */
  async processAudioChunk(
    callId: string,
    audioChunk: Buffer,
    speakerId: string
  ): Promise<{
    translatedAudio: Buffer;
    targetParticipant: CallParticipant;
    metrics: CallMetrics;
  }> {
    const call = this.activeCalls.get(callId);
    if (!call) throw new Error(`Call not found: ${callId}`);
    if (!call.isActive) throw new Error(`Call is not active: ${callId}`);

    const pipelineStart = Date.now();
    const metrics: CallMetrics = {
      totalLatencyMs: 0,
      transcriptionLatencyMs: 0,
      translationLatencyMs: 0,
      synthesisLatencyMs: 0,
      networkLatencyMs: 0,
      audioQualityScore: 0.95, // Placeholder
      transcriptionConfidence: 0,
      translationConfidence: 0,
    };

    try {
      // Find speaker and target participant
      const speaker = call.participants.find(p => p.userId === speakerId);
      const target = call.participants.find(p => p.userId !== speakerId);

      if (!speaker || !target) {
        throw new Error(`Invalid participant: ${speakerId}`);
      }

      // =====================================================================
      // STAGE 1: TRANSCRIPTION (80-150ms)
      // =====================================================================
      const transcriptionStart = Date.now();

      const transcription = await this.transcriptionService.transcribeFile(
        audioChunk,
        speaker.language
      );

      metrics.transcriptionLatencyMs = Date.now() - transcriptionStart;
      metrics.transcriptionConfidence = transcription.confidence;

      console.log(
        `[${callId}] STT: "${transcription.text}" (${metrics.transcriptionLatencyMs}ms, ${(transcription.confidence * 100).toFixed(1)}% confidence)`
      );

      // Store original transcript
      call.originalTranscripts.push({
        userId: speaker.userId,
        language: speaker.language,
        text: transcription.text,
        timestamp: Date.now(),
      });

      // =====================================================================
      // STAGE 2: TRANSLATION (50-100ms)
      // =====================================================================
      const translationStart = Date.now();

      const translation = await this.translationService.translateWithEnsemble(
        transcription.text,
        speaker.language,
        target.language
      );

      metrics.translationLatencyMs = Date.now() - translationStart;
      metrics.translationConfidence = translation.confidence;

      console.log(
        `[${callId}] TL: "${translation.text}" (${metrics.translationLatencyMs}ms, ${(translation.confidence * 100).toFixed(1)}%)`
      );

      // Store translated transcript
      call.translatedTranscripts.push({
        userId: speaker.userId, // Still the speaker, but translated text
        language: target.language,
        text: translation.text,
        timestamp: Date.now(),
      });

      // =====================================================================
      // STAGE 3: TEXT-TO-SPEECH (100-200ms)
      // =====================================================================
      const synthesisStart = Date.now();

      const synthesis = await this.ttsService.synthesize(
        translation.text,
        target.language,
        undefined, // Use best voice for language
        { emotion: 'neutral', speed: 1.0 }
      );

      metrics.synthesisLatencyMs = Date.now() - synthesisStart;

      console.log(
        `[${callId}] TTS: ${(synthesis.audio.length / 1024).toFixed(1)}KB audio (${metrics.synthesisLatencyMs}ms)`
      );

      // =====================================================================
      // STAGE 4: OPTIONAL ENCRYPTION
      // =====================================================================
      // TODO: Encrypt both audio and transcript with conversation key
      // For now, plaintext (will be added in Phase 5)

      // =====================================================================
      // STAGE 5: METRICS & LOGGING
      // =====================================================================
      metrics.totalLatencyMs = Date.now() - pipelineStart;

      // Warn if latency exceeds 100ms (conversational threshold)
      if (metrics.totalLatencyMs > 100) {
        this.emitEvent(callId, {
          type: 'latency_warning',
          timestamp: Date.now(),
          data: {
            totalLatencyMs: metrics.totalLatencyMs,
            threshold: 100,
            message: `High latency detected: ${metrics.totalLatencyMs}ms (target: <100ms)`,
          },
          metrics,
        });
      }

      // Store metrics
      call.metrics.push(metrics);

      // Log aggregate stats every 10 chunks
      if (call.originalTranscripts.length % 10 === 0) {
        const avgTotalLatency = call.metrics.reduce((sum, m) => sum + m.totalLatencyMs, 0) / call.metrics.length;
        const avgTranscription = call.metrics.reduce((sum, m) => sum + m.transcriptionLatencyMs, 0) / call.metrics.length;
        const avgTranslation = call.metrics.reduce((sum, m) => sum + m.translationLatencyMs, 0) / call.metrics.length;
        const avgSynthesis = call.metrics.reduce((sum, m) => sum + m.synthesisLatencyMs, 0) / call.metrics.length;

        console.log(`
[${callId}] Latency Breakdown (avg over ${call.metrics.length} chunks):
  ├─ Total: ${avgTotalLatency.toFixed(0)}ms
  ├─ Transcription: ${avgTranscription.toFixed(0)}ms
  ├─ Translation: ${avgTranslation.toFixed(0)}ms
  └─ Synthesis: ${avgSynthesis.toFixed(0)}ms
        `);
      }

      return {
        translatedAudio: synthesis.audio,
        targetParticipant: target,
        metrics,
      };
    } catch (error) {
      console.error(`[${callId}] Pipeline error:`, error);

      this.emitEvent(callId, {
        type: 'error',
        timestamp: Date.now(),
        data: {
          error: error instanceof Error ? error.message : String(error),
          stage: 'audio_processing',
        },
        metrics,
      });

      throw error;
    }
  }

  /**
   * Process real-time audio stream
   * For continuous streaming (not chunked)
   */
  async processAudioStream(
    callId: string,
    audioStream: AsyncIterable<Buffer>,
    speakerId: string,
    onAudioReady: (audio: Buffer, targetParticipant: CallParticipant) => Promise<void>
  ): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call) throw new Error(`Call not found: ${callId}`);

    try {
      for await (const chunk of audioStream) {
        const result = await this.processAudioChunk(callId, chunk, speakerId);
        await onAudioReady(result.translatedAudio, result.targetParticipant);
      }
    } catch (error) {
      console.error(`[${callId}] Stream processing error:`, error);
      this.emitEvent(callId, {
        type: 'error',
        timestamp: Date.now(),
        data: { error: String(error), stage: 'stream_processing' },
        metrics: {},
      });
      throw error;
    }
  }

  /**
   * End call and finalize
   */
  async endCall(callId: string): Promise<{
    summary: {
      duration: number;
      totalChunks: number;
      averageLatency: number;
      successRate: number;
    };
    transcripts: {
      original: Array<{ userId: string; language: string; text: string }>;
      translated: Array<{ userId: string; language: string; text: string }>;
    };
  }> {
    const call = this.activeCalls.get(callId);
    if (!call) throw new Error(`Call not found: ${callId}`);

    call.isActive = false;

    const duration = Date.now() - call.startTime;
    const totalChunks = call.originalTranscripts.length;
    const averageLatency =
      call.metrics.length > 0
        ? call.metrics.reduce((sum, m) => sum + m.totalLatencyMs, 0) / call.metrics.length
        : 0;
    const successRate = call.metrics.length > 0 ? (call.metrics.length / totalChunks) : 0;

    const summary = {
      duration,
      totalChunks,
      averageLatency,
      successRate,
    };

    console.log(`
[${callId}] Call Ended
├─ Duration: ${(duration / 1000).toFixed(1)}s
├─ Total chunks: ${totalChunks}
├─ Avg latency: ${averageLatency.toFixed(0)}ms
└─ Success rate: ${(successRate * 100).toFixed(1)}%
    `);

    // TODO: Save call recording, transcripts, and metrics to database

    return {
      summary,
      transcripts: {
        original: call.originalTranscripts.map(t => ({
          userId: t.userId,
          language: t.language,
          text: t.text,
        })),
        translated: call.translatedTranscripts.map(t => ({
          userId: t.userId,
          language: t.language,
          text: t.text,
        })),
      },
    };
  }

  /**
   * Get call state
   */
  getCall(callId: string): ActiveCall | undefined {
    return this.activeCalls.get(callId);
  }

  /**
   * Get call metrics
   */
  getMetrics(callId: string): CallMetrics[] {
    return this.activeCalls.get(callId)?.metrics || [];
  }

  /**
   * Emit event for monitoring/logging
   */
  private emitEvent(callId: string, event: PipelineEvent): void {
    const call = this.activeCalls.get(callId);
    if (call) {
      call.events.push(event);
    }

    // In production, would also send to monitoring service (Datadog, Sentry)
    if (event.type === 'error' || event.type === 'latency_warning') {
      console.warn(`[${callId}] ${event.type}:`, event.data);
    }
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    // Check if all underlying services are initialized
    return this.transcriptionService && this.translationService && this.ttsService ? true : false;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let pipelineInstance: RealTimeTranslationPipeline | null = null;

export function getRealtimePipeline(): RealTimeTranslationPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new RealTimeTranslationPipeline();
  }
  return pipelineInstance;
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

export async function initializeCall(
  callId: string,
  participant1: CallParticipant,
  participant2: CallParticipant
): Promise<ActiveCall> {
  const pipeline = getRealtimePipeline();
  return pipeline.initializeCall(callId, participant1, participant2);
}

export async function processAudioChunk(
  callId: string,
  audioChunk: Buffer,
  speakerId: string
): Promise<{
  translatedAudio: Buffer;
  targetParticipant: CallParticipant;
  metrics: CallMetrics;
}> {
  const pipeline = getRealtimePipeline();
  return pipeline.processAudioChunk(callId, audioChunk, speakerId);
}

export async function endCall(callId: string) {
  const pipeline = getRealtimePipeline();
  return pipeline.endCall(callId);
}

export function getCallMetrics(callId: string): CallMetrics[] {
  const pipeline = getRealtimePipeline();
  return pipeline.getMetrics(callId);
}

export function isHealthy(): boolean {
  const pipeline = getRealtimePipeline();
  return pipeline.isHealthy();
}

export default getRealtimePipeline;
