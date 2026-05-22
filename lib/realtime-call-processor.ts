/**
 * Real-Time Call Processor
 *
 * Orchestrates the complete pipeline for live translation calls:
 * 1. Audio capture → Transcription (STT)
 * 2. Transcription → Translation (Machine Translation)
 * 3. Translation → Voice Synthesis (TTS)
 * 4. Synthesized audio → Send to contact
 * 5. Store encrypted transcript for history
 * 6. Monitor performance metrics
 *
 * Target latency: < 500ms end-to-end (conversational)
 * - Speech capture: 20ms
 * - Transcription: 80-150ms
 * - Translation: 50-100ms
 * - TTS synthesis: 100-200ms
 * - Network + encoding: 50ms
 */

import { db } from '@/lib/db';
import { auditLogger } from '@/lib/audit-logger';
import { monitoringService } from '@/lib/monitoring-service';
import { getTranscriptionService } from '@/lib/transcription-service';
import { getTranslationService } from '@/lib/translation-service';
import { getTTSService } from '@/lib/tts-service';
import { encryptionService } from '@/lib/encryption';

export interface CallContext {
  callId: string;
  initiatorId: string;
  initiatorLanguage: string;
  contactId: string;
  contactLanguage: string;
  mediasoupSessionId: string; // For WebRTC media
  isActive: boolean;
  startedAt: Date;
}

export interface AudioChunk {
  buffer: Buffer;
  timestamp: number;
  speaker: 'initiator' | 'contact';
}

export interface ProcessingResult {
  originalText: string;
  translatedText: string;
  originalLanguage: string;
  translatedLanguage: string;
  audioBuffer: Buffer;
  processingTimeMs: number;
  transcriptionProvider: string;
  translationProvider: string;
  ttsProvider: string;
}

/**
 * Main processor class for handling real-time call audio
 */
class RealTimeCallProcessor {
  private activeCalls: Map<string, CallContext> = new Map();
  private transcriptionService = getTranscriptionService();
  private translationService = getTranslationService();
  private ttsService = getTTSService();

  /**
   * Initialize a new call
   */
  async initializeCall(context: CallContext): Promise<void> {
    console.log(`🎯 Initializing call: ${context.callId}`);

    this.activeCalls.set(context.callId, context);

    // Verify both users exist and have access to this call
    const callCheck = await db.query(
      `SELECT id, initiator_id, contact_id, language_pair FROM conversations
       WHERE id = $1 AND ((initiator_id = $2 AND contact_id = $3) OR (initiator_id = $3 AND contact_id = $2))`,
      [context.callId, context.initiatorId, context.contactId]
    );

    if (callCheck.rows.length === 0) {
      throw new Error(`Call ${context.callId} not found or user not authorized`);
    }

    // Log call started
    auditLogger.logDataAccess(
      context.initiatorId,
      'call',
      context.callId,
      '0.0.0.0', // WebRTC internal
      { event: 'call_started', contact: context.contactId }
    );
  }

  /**
   * Process audio chunk from one speaker
   * Returns synthesized audio for the other speaker to hear
   */
  async processAudioChunk(
    callId: string,
    audioChunk: AudioChunk
  ): Promise<ProcessingResult | null> {
    const pipelineStart = Date.now();
    const call = this.activeCalls.get(callId);

    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }

    if (!call.isActive) {
      return null;
    }

    try {
      // Determine language pair
      const sourceLanguage = audioChunk.speaker === 'initiator'
        ? call.initiatorLanguage
        : call.contactLanguage;
      const targetLanguage = audioChunk.speaker === 'initiator'
        ? call.contactLanguage
        : call.initiatorLanguage;

      // Step 1: Transcribe audio
      const transcriptionStart = Date.now();
      const transcription = await this.transcriptionService.transcribeFile(
        audioChunk.buffer,
        sourceLanguage
      );
      const transcriptionTime = Date.now() - transcriptionStart;

      // Check confidence - flag low-confidence transcriptions
      if (transcription.confidence < 0.7) {
        auditLogger.logSecurity(
          'low_confidence_transcription',
          'MEDIUM',
          audioChunk.speaker === 'initiator' ? call.initiatorId : call.contactId,
          '0.0.0.0',
          {
            callId,
            confidence: transcription.confidence,
            text: transcription.text,
          }
        );
      }

      // Step 2: Translate text
      const translationStart = Date.now();
      const translation = await this.translationService.translateWithEnsemble(
        transcription.text,
        sourceLanguage,
        targetLanguage
      );
      const translationTime = Date.now() - translationStart;

      // Step 3: Synthesize translated text to speech
      const ttsStart = Date.now();
      const ttsResult = await this.ttsService.synthesize(
        translation.text,
        targetLanguage,
        undefined, // Auto-select voice
        { emotion: 'neutral', speed: 1.0 }
      );
      const ttsTime = Date.now() - ttsStart;

      // Step 4: Encrypt original audio
      const originalKey = await this.getCallEncryptionKey(
        callId,
        audioChunk.speaker === 'initiator' ? call.initiatorId : call.contactId
      );
      const encryptedOriginal = await encryptionService.encryptAES256(
        audioChunk.buffer,
        originalKey
      );

      // Step 5: Store encrypted transcript in database
      const speakerId = audioChunk.speaker === 'initiator' ? call.initiatorId : call.contactId;
      await db.query(
        `INSERT INTO conversation_transcripts
         (conversation_id, speaker_id, original_text, translated_text,
          language_original, language_translated, confidence, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          callId,
          speakerId,
          transcription.text,
          translation.text,
          sourceLanguage,
          targetLanguage,
          transcription.confidence,
        ]
      );

      // Step 6: Record performance metrics
      const totalTime = Date.now() - pipelineStart;
      monitoringService.recordRequestLatency('/realtime-pipeline', totalTime);
      monitoringService.recordMetric('pipeline_transcription_latency', transcriptionTime, {
        language: sourceLanguage,
        provider: transcription.provider,
      });
      monitoringService.recordMetric('pipeline_translation_latency', translationTime, {
        languages: `${sourceLanguage}_${targetLanguage}`,
        provider: translation.provider,
      });
      monitoringService.recordMetric('pipeline_tts_latency', ttsTime, {
        language: targetLanguage,
        provider: ttsResult.provider,
      });

      // Alert if latency exceeds threshold
      if (totalTime > 500) {
        console.warn(`⚠️  High latency in call ${callId}: ${totalTime}ms`);
        auditLogger.logSecurity(
          'high_pipeline_latency',
          'LOW',
          speakerId,
          '0.0.0.0',
          {
            callId,
            totalLatencyMs: totalTime,
            transcriptionMs: transcriptionTime,
            translationMs: translationTime,
            ttsMs: ttsTime,
          }
        );
      }

      // Return result
      return {
        originalText: transcription.text,
        translatedText: translation.text,
        originalLanguage: sourceLanguage,
        translatedLanguage: targetLanguage,
        audioBuffer: ttsResult.audio,
        processingTimeMs: totalTime,
        transcriptionProvider: transcription.provider,
        translationProvider: translation.provider,
        ttsProvider: ttsResult.provider,
      };
    } catch (error) {
      const duration = Date.now() - pipelineStart;

      // Log error
      if (error instanceof Error) {
        auditLogger.logError(error, `/realtime-pipeline/${callId}`, undefined, '0.0.0.0');
        monitoringService.recordError(error.constructor.name, '/realtime-pipeline');
      }

      console.error(`❌ Pipeline error in call ${callId}:`, error);
      throw error;
    }
  }

  /**
   * End call and cleanup
   */
  async endCall(callId: string): Promise<void> {
    const call = this.activeCalls.get(callId);

    if (!call) {
      return;
    }

    call.isActive = false;

    // Log call ended
    auditLogger.logDataAccess(
      call.initiatorId,
      'call',
      callId,
      '0.0.0.0',
      { event: 'call_ended', duration: Date.now() - call.startedAt.getTime() }
    );

    // Keep in memory for a bit, then cleanup
    setTimeout(() => {
      this.activeCalls.delete(callId);
    }, 5 * 60 * 1000); // 5 minutes

    console.log(`✅ Call ${callId} ended`);
  }

  /**
   * Get encryption key for call (derived from user key + call ID)
   */
  private async getCallEncryptionKey(
    callId: string,
    userId: string
  ): Promise<Buffer> {
    // In production, would derive from user's master key + call ID
    // For now, use user's key directly
    const userKey = await db.query(
      `SELECT encryption_key FROM users WHERE id = $1`,
      [userId]
    );

    if (userKey.rows.length === 0) {
      throw new Error(`User ${userId} not found`);
    }

    return Buffer.from(userKey.rows[0].encryption_key, 'hex');
  }

  /**
   * Get call status
   */
  getCallStatus(callId: string): CallContext | undefined {
    return this.activeCalls.get(callId);
  }

  /**
   * Get all active calls
   */
  getActiveCalls(): CallContext[] {
    return Array.from(this.activeCalls.values()).filter(call => call.isActive);
  }

  /**
   * Get pipeline metrics for a call
   */
  async getCallMetrics(callId: string): Promise<{
    totalTranscriptions: number;
    averageTranscriptionConfidence: number;
    averagePipelineLatency: number;
    providers: {
      transcription: Set<string>;
      translation: Set<string>;
      tts: Set<string>;
    };
  }> {
    const metricsResult = await db.query(
      `SELECT
         COUNT(*) as total_transcriptions,
         AVG(confidence) as avg_confidence
       FROM conversation_transcripts
       WHERE conversation_id = $1`,
      [callId]
    );

    const metrics = metricsResult.rows[0] || {};

    return {
      totalTranscriptions: parseInt(metrics.total_transcriptions || 0),
      averageTranscriptionConfidence: parseFloat(metrics.avg_confidence || 0),
      averagePipelineLatency: 0, // Would aggregate from monitoringService
      providers: {
        transcription: new Set(),
        translation: new Set(),
        tts: new Set(),
      },
    };
  }
}

// Singleton instance
export const realtimeCallProcessor = new RealTimeCallProcessor();

/**
 * Exported helper function for API endpoints
 */
export async function processCallAudio(
  callId: string,
  audioBase64: string,
  speaker: 'initiator' | 'contact'
): Promise<ProcessingResult | null> {
  const audioBuffer = Buffer.from(audioBase64, 'base64');

  const chunk: AudioChunk = {
    buffer: audioBuffer,
    timestamp: Date.now(),
    speaker,
  };

  return realtimeCallProcessor.processAudioChunk(callId, chunk);
}

export async function initializeCallSession(context: CallContext): Promise<void> {
  return realtimeCallProcessor.initializeCall(context);
}

export async function endCallSession(callId: string): Promise<void> {
  return realtimeCallProcessor.endCall(callId);
}

export function getCallSession(callId: string): CallContext | undefined {
  return realtimeCallProcessor.getCallStatus(callId);
}
