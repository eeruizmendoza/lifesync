/**
 * Real-Time Call Pipeline V2
 * Phase 13.7: Streaming orchestration for ultra-low latency
 * Integrates streaming transcription, translation, and TTS
 */

import { getStreamingTranscriptionManager } from './streaming-transcription';
import { getStreamingTranslationManager } from './streaming-translation';
import { getStreamingTTSManager } from './streaming-tts';
import { AdaptiveBuffer, NetworkMetrics } from './adaptive-buffering';
import { transcribeAudio } from './providers/transcription-providers';
import { translateText } from './providers/translation-providers';
import { synthesizeAudio } from './providers/tts-providers';

export interface StreamingCallConfig {
  callId: string;
  callerId: string;
  receiverId: string;
  sourceLanguage: string;
  targetLanguage: string;
  voiceId: string;
  emotion?: string;
  speed?: number;
}

export interface StreamingCallMetrics {
  transcriptionLatencyMs: number;
  translationLatencyMs: number;
  synthesisLatencyMs: number;
  endToEndLatencyMs: number;
  networkLatencyMs: number;
  jitterMs: number;
  packetLossPercent: number;
  bufferSizeMs: number;
  bufferFillPercent: number;
}

/**
 * Real-time streaming call processor
 */
export class StreamingCallProcessor {
  private config: StreamingCallConfig;
  private transcriptionManager = getStreamingTranscriptionManager();
  private translationManager = getStreamingTranslationManager();
  private ttsManager = getStreamingTTSManager();
  private adaptiveBuffer: AdaptiveBuffer;
  private metrics: StreamingCallMetrics = {
    transcriptionLatencyMs: 0,
    translationLatencyMs: 0,
    synthesisLatencyMs: 0,
    endToEndLatencyMs: 0,
    networkLatencyMs: 0,
    jitterMs: 0,
    packetLossPercent: 0,
    bufferSizeMs: 0,
    bufferFillPercent: 0,
  };
  private callStartTime: number;
  private isActive: boolean = false;

  constructor(config: StreamingCallConfig) {
    this.config = config;
    this.adaptiveBuffer = new AdaptiveBuffer({
      baseBufferMs: 200,
      minBufferMs: 100,
      maxBufferMs: 800,
    });
    this.callStartTime = Date.now();
  }

  /**
   * Start the streaming call pipeline
   */
  start(): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;

    // Initialize streaming sessions
    this.transcriptionManager.startSession(
      this.config.callId,
      this.config.sourceLanguage,
      'deepgram' // Default provider
    );

    this.translationManager.startSession(
      this.config.callId,
      this.config.sourceLanguage,
      this.config.targetLanguage,
      'deepl' // Default provider
    );

    this.ttsManager.startSession(
      this.config.callId,
      this.config.targetLanguage,
      this.config.voiceId,
      'elevenlabs' // Default provider
    );

    // Register callbacks
    this.setupCallbacks();
  }

  /**
   * Setup event callbacks
   */
  private setupCallbacks(): void {
    const callId = this.config.callId;

    // On transcription hypothesis
    this.transcriptionManager.onHypothesis(callId, (hypothesis) => {
      const transcriptionLatency = Date.now() - hypothesis.timestamp;
      this.metrics.transcriptionLatencyMs = transcriptionLatency;

      // Send partial hypothesis to client
      this.emitTranscriptionEvent({
        type: 'partial',
        text: hypothesis.text,
        isFinal: false,
      });

      // If final, start translation
      if (hypothesis.isFinal) {
        this.translateHypothesis(hypothesis.text).catch((error) => {
          console.error('Translation failed:', error);
        });
      }
    });

    // On translation batch
    this.translationManager.onBatch(callId, async (batch) => {
      const translationLatency = batch.batchTime - Date.now();
      this.metrics.translationLatencyMs = Math.abs(translationLatency);

      // Send translation to client
      for (const chunk of batch.chunks) {
        this.emitTranslationEvent({
          type: 'chunk',
          original: chunk.originalText,
          translated: chunk.translatedText,
          isSentenceEnd: chunk.isSentenceEnd,
        });

        // Synthesize translated chunk
        if (chunk.isSentenceEnd || batch.chunks.indexOf(chunk) === batch.chunks.length - 1) {
          await this.synthesizeTranslation(chunk.translatedText);
        }
      }
    });

    // On TTS synthesis complete
    this.ttsManager.onSynthesisComplete(callId, (chunk, index) => {
      this.metrics.synthesisLatencyMs = chunk.synthesisTimeMs;

      this.emitTTSEvent({
        type: 'chunk_ready',
        chunkIndex: index,
        durationMs: chunk.duration,
      });
    });

    // On playback ready
    this.ttsManager.onPlaybackStart(callId, (chunkIndex) => {
      this.emitTTSEvent({
        type: 'playback_start',
        chunkIndex,
      });

      const chunk = this.ttsManager.getChunk(callId, chunkIndex);
      if (chunk && chunk.audioBuffer) {
        this.emitAudioChunk(chunk.audioBuffer);
      }
    });
  }

  /**
   * Process incoming audio chunk
   */
  async processAudioChunk(audioData: Buffer): Promise<void> {
    const chunkStartTime = Date.now();

    // Add to adaptive buffer
    this.adaptiveBuffer.push(audioData);
    this.metrics.bufferFillPercent = this.adaptiveBuffer.getFillPercentage();

    // If buffer ready, transcribe
    if (this.adaptiveBuffer.isReady()) {
      const bufferData = this.adaptiveBuffer.flush();
      if (bufferData) {
        await this.transcribeAudio(bufferData);
      }
    }
  }

  /**
   * Transcribe audio and emit hypotheses
   */
  private async transcribeAudio(audioBuffer: Buffer): Promise<void> {
    const transcribeStartTime = Date.now();

    try {
      // Request streaming transcription
      const result = await transcribeAudio({
        audioBuffer,
        language: this.config.sourceLanguage,
        format: 'opus',
        codec: 'opus',
      });

      // Simulate streaming hypotheses (in production, provider would stream)
      // Add to session
      this.transcriptionManager.addPartialHypothesis(
        this.config.callId,
        result.text.slice(0, Math.floor(result.text.length * 0.7)),
        result.language,
        result.confidence * 0.8
      );

      // Final hypothesis
      this.transcriptionManager.addFinalHypothesis(
        this.config.callId,
        result.text,
        result.language,
        result.confidence
      );
    } catch (error) {
      console.error('Transcription failed:', error);
    }
  }

  /**
   * Translate transcribed text
   */
  private async translateHypothesis(text: string): Promise<void> {
    try {
      await this.translationManager.addText(
        this.config.callId,
        text,
        async (textToTranslate) => {
          const result = await translateText({
            text: textToTranslate,
            sourceLang: this.config.sourceLanguage,
            targetLang: this.config.targetLanguage,
          });
          return result.translatedText;
        }
      );
    } catch (error) {
      console.error('Translation failed:', error);
    }
  }

  /**
   * Synthesize translated text
   */
  private async synthesizeTranslation(text: string): Promise<void> {
    try {
      await this.ttsManager.synthesizeText(
        this.config.callId,
        text,
        async (textToSynthesize, language, voiceId) => {
          const result = await synthesizeAudio({
            text: textToSynthesize,
            language,
            voiceId,
            emotion: this.config.emotion,
            speed: this.config.speed,
          });
          return result.audioBuffer;
        }
      );
    } catch (error) {
      console.error('TTS synthesis failed:', error);
    }
  }

  /**
   * Update network metrics
   */
  updateNetworkMetrics(metrics: NetworkMetrics): void {
    this.metrics.networkLatencyMs = metrics.latencyMs;
    this.metrics.jitterMs = metrics.jitterMs;
    this.metrics.packetLossPercent = metrics.packetLossPercent;

    // Update adaptive buffer
    this.adaptiveBuffer.updateMetrics(metrics);
    this.metrics.bufferSizeMs = this.adaptiveBuffer.getBufferSizeMs();
  }

  /**
   * Calculate end-to-end latency
   */
  private calculateE2ELatency(): number {
    return (
      this.metrics.transcriptionLatencyMs +
      this.metrics.translationLatencyMs +
      this.metrics.synthesisLatencyMs
    );
  }

  /**
   * Get current metrics
   */
  getMetrics(): StreamingCallMetrics {
    this.metrics.endToEndLatencyMs = this.calculateE2ELatency();
    return { ...this.metrics };
  }

  /**
   * Stop the pipeline
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;

    // End all streaming sessions
    this.transcriptionManager.endSession(this.config.callId);
    this.translationManager.endSession(this.config.callId);
    this.ttsManager.endSession(this.config.callId);
  }

  /**
   * Clean up
   */
  cleanup(): void {
    this.stop();
    this.transcriptionManager.clearSession(this.config.callId);
    this.translationManager.clearSession(this.config.callId);
    this.ttsManager.clearSession(this.config.callId);
  }

  /**
   * Event emitters (to be connected to WebSocket/SSE)
   */
  private emitTranscriptionEvent(event: any): void {
    // Emit to client via WebSocket
    console.log('[Transcription]', event);
  }

  private emitTranslationEvent(event: any): void {
    // Emit to client via WebSocket
    console.log('[Translation]', event);
  }

  private emitTTSEvent(event: any): void {
    // Emit to client via WebSocket
    console.log('[TTS]', event);
  }

  private emitAudioChunk(audioBuffer: Buffer): void {
    // Send audio to contact's speakers
    console.log('[Audio] Chunk size:', audioBuffer.length);
  }
}

/**
 * Singleton instance per call
 */
const processors: Map<string, StreamingCallProcessor> = new Map();

export function createStreamingProcessor(
  config: StreamingCallConfig
): StreamingCallProcessor {
  const processor = new StreamingCallProcessor(config);
  processors.set(config.callId, processor);
  return processor;
}

export function getStreamingProcessor(callId: string): StreamingCallProcessor | null {
  return processors.get(callId) || null;
}

export function removeStreamingProcessor(callId: string): void {
  const processor = processors.get(callId);
  if (processor) {
    processor.cleanup();
    processors.delete(callId);
  }
}
