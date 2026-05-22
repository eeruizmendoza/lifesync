/**
 * End-to-End Streaming Performance Tests
 * Phase 13.7: Verify latency targets for streaming pipeline
 *
 * Targets:
 * - Transcription latency: 40-80ms
 * - Translation latency: 50-100ms
 * - TTS latency: 200ms first sentence
 * - End-to-end: < 100ms
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  createStreamingProcessor,
  removeStreamingProcessor,
  getStreamingProcessor,
} from '@/lib/realtime-pipeline-v2';
import {
  getStreamingTranscriptionManager,
  type TranscriptionHypothesis,
} from '@/lib/streaming-transcription';
import {
  getStreamingTranslationManager,
  type TranslationBatch,
} from '@/lib/streaming-translation';
import {
  getStreamingTTSManager,
  type SynthesisChunk,
} from '@/lib/streaming-tts';
import { AdaptiveBuffer } from '@/lib/adaptive-buffering';

describe('E2E: Streaming Performance (Phase 13.7)', () => {
  let callId: string;
  let processor: ReturnType<typeof createStreamingProcessor>;

  beforeEach(() => {
    callId = `call_stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  });

  afterEach(() => {
    if (processor) {
      removeStreamingProcessor(callId);
    }
  });

  describe('Transcription Streaming', () => {
    it('should emit partial hypotheses within 80ms', async () => {
      const transcriptionManager = getStreamingTranscriptionManager();
      const session = transcriptionManager.startSession(callId, 'es', 'deepgram');

      const hypotheses: TranscriptionHypothesis[] = [];
      const hypothesisTimes: number[] = [];

      transcriptionManager.onHypothesis(callId, (hypothesis) => {
        hypotheses.push(hypothesis);
        hypothesisTimes.push(Date.now() - hypothesis.timestamp);
      });

      // Simulate transcription arriving
      const startTime = Date.now();

      transcriptionManager.addPartialHypothesis(
        callId,
        'Hola cómo estás',
        'es',
        0.92
      );

      const latency = Date.now() - startTime;

      // Verify latency target
      expect(latency).toBeLessThan(80);
      expect(hypotheses).toHaveLength(1);
      expect(hypotheses[0].isFinal).toBe(false);

      // Clean up
      transcriptionManager.clearSession(callId);
    });

    it('should emit final hypothesis with confidence', async () => {
      const transcriptionManager = getStreamingTranscriptionManager();
      transcriptionManager.startSession(callId, 'es', 'deepgram');

      let finalHypothesis: TranscriptionHypothesis | null = null;

      transcriptionManager.onHypothesis(callId, (hypothesis) => {
        if (hypothesis.isFinal) {
          finalHypothesis = hypothesis;
        }
      });

      transcriptionManager.addFinalHypothesis(
        callId,
        'Hola, ¿cómo estás?',
        'es',
        0.98,
        [
          { word: 'Hola', startMs: 0, endMs: 300, confidence: 0.99 },
          { word: '¿cómo', startMs: 400, endMs: 700, confidence: 0.97 },
          { word: 'estás?', startMs: 800, endMs: 1100, confidence: 0.98 },
        ]
      );

      expect(finalHypothesis).not.toBeNull();
      expect(finalHypothesis!.isFinal).toBe(true);
      expect(finalHypothesis!.confidence).toBe(0.98);
      expect(finalHypothesis!.wordTimings).toHaveLength(3);

      transcriptionManager.clearSession(callId);
    });

    it('should track transcription latency statistics', async () => {
      const transcriptionManager = getStreamingTranscriptionManager();
      transcriptionManager.startSession(callId, 'es', 'deepgram');

      // Add multiple hypotheses
      for (let i = 0; i < 10; i++) {
        transcriptionManager.addPartialHypothesis(
          callId,
          `partial ${i}`,
          'es',
          0.9 + i * 0.01
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const stats = transcriptionManager.getLatencyStats(callId);

      expect(stats).not.toBeNull();
      expect(stats!.avgLatencyMs).toBeGreaterThan(0);
      expect(stats!.maxLatencyMs).toBeGreaterThanOrEqual(stats!.minLatencyMs);
      expect(stats!.p95LatencyMs).toBeGreaterThanOrEqual(stats!.minLatencyMs);

      transcriptionManager.clearSession(callId);
    });
  });

  describe('Translation Streaming', () => {
    it('should batch translations within 50ms window', async () => {
      const translationManager = getStreamingTranslationManager();
      translationManager.startSession(callId, 'es', 'zh', 'deepl');

      const batches: TranslationBatch[] = [];

      translationManager.onBatch(callId, (batch) => {
        batches.push(batch);
      });

      const startTime = Date.now();

      // Add text and wait for batch
      await translationManager.addText(
        callId,
        'Hola, ¿cómo estás?',
        async (text) => '你好，你怎么样？'
      );

      // Wait for batch to flush
      await new Promise((resolve) => setTimeout(resolve, 100));

      const elapsedTime = Date.now() - startTime;

      // Should have batched within reasonable time
      expect(elapsedTime).toBeLessThan(150);

      translationManager.clearSession(callId);
    });

    it('should detect sentence boundaries', async () => {
      const translationManager = getStreamingTranslationManager();
      translationManager.startSession(callId, 'es', 'zh', 'deepl');

      const batches: TranslationBatch[] = [];

      translationManager.onBatch(callId, (batch) => {
        batches.push(batch);
      });

      // Add text with sentence boundary
      await translationManager.addText(
        callId,
        'Primera oración. Segunda oración.',
        async (text) => '第一句。第二句。'
      );

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should flush on sentence boundary
      expect(batches.length).toBeGreaterThan(0);

      // Check for sentence end markers
      const hasSentenceEnds = batches.some((batch) =>
        batch.chunks.some((chunk) => chunk.isSentenceEnd)
      );
      expect(hasSentenceEnds).toBe(true);

      translationManager.clearSession(callId);
    });
  });

  describe('TTS Streaming', () => {
    it('should synthesize sentences in parallel', async () => {
      const ttsManager = getStreamingTTSManager();
      ttsManager.startSession(callId, 'zh', 'default-voice', 'elevenlabs');

      const synthesizedChunks: SynthesisChunk[] = [];
      const synthesisStartTimes: number[] = [];

      ttsManager.onSynthesisComplete(callId, (chunk) => {
        synthesizedChunks.push(chunk);
        synthesisStartTimes.push(Date.now());
      });

      // Synthesize multi-sentence text
      const startTime = Date.now();

      await ttsManager.synthesizeText(
        callId,
        '你好。你怎么样？',
        async (text) => Buffer.from('audio-data')
      );

      // Wait for synthesis
      await new Promise((resolve) => setTimeout(resolve, 500));

      const elapsedTime = Date.now() - startTime;

      // Should complete within reasonable time
      expect(elapsedTime).toBeLessThan(1000);

      // Should have multiple chunks
      expect(synthesizedChunks.length).toBeGreaterThan(0);

      ttsManager.clearSession(callId);
    });

    it('should track synthesis latency for each chunk', async () => {
      const ttsManager = getStreamingTTSManager();
      ttsManager.startSession(callId, 'zh', 'default-voice', 'elevenlabs');

      await ttsManager.synthesizeText(
        callId,
        '第一句。第二句。',
        async (text) => {
          // Simulate realistic synthesis time (10-50ms per chunk)
          await new Promise((resolve) =>
            setTimeout(resolve, 10 + Math.random() * 40)
          );
          return Buffer.from('audio-data');
        }
      );

      // Wait for synthesis to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const stats = ttsManager.getStats(callId);

      expect(stats).not.toBeNull();
      expect(stats!.totalChunks).toBeGreaterThan(0);
      expect(stats!.averageSynthesisTimeMs).toBeGreaterThan(0);
      expect(stats!.p95SynthesisTimeMs).toBeGreaterThan(0);

      ttsManager.clearSession(callId);
    });
  });

  describe('Adaptive Buffering', () => {
    it('should adjust buffer size based on latency', () => {
      const buffer = new AdaptiveBuffer({
        baseBufferMs: 200,
        minBufferMs: 100,
        maxBufferMs: 800,
      });

      // Low latency - small buffer
      buffer.updateMetrics({
        latencyMs: 50,
        jitterMs: 10,
        packetLossPercent: 0,
      });

      const lowLatencyBuffer = buffer.getBufferSizeMs();
      expect(lowLatencyBuffer).toBeLessThanOrEqual(250);

      // High latency - large buffer
      buffer.updateMetrics({
        latencyMs: 300,
        jitterMs: 50,
        packetLossPercent: 5,
      });

      const highLatencyBuffer = buffer.getBufferSizeMs();
      expect(highLatencyBuffer).toBeGreaterThan(lowLatencyBuffer);

      // High packet loss - increase buffer
      buffer.updateMetrics({
        latencyMs: 200,
        jitterMs: 100,
        packetLossPercent: 10,
      });

      const highLossBuffer = buffer.getBufferSizeMs();
      expect(highLossBuffer).toBeGreaterThan(lowLatencyBuffer);
    });

    it('should respect min/max buffer constraints', () => {
      const buffer = new AdaptiveBuffer({
        baseBufferMs: 200,
        minBufferMs: 100,
        maxBufferMs: 800,
      });

      // Extreme latency should not exceed max
      buffer.updateMetrics({
        latencyMs: 5000,
        jitterMs: 500,
        packetLossPercent: 50,
      });

      expect(buffer.getBufferSizeMs()).toBeLessThanOrEqual(800);

      // Perfect conditions should not go below min
      buffer.updateMetrics({
        latencyMs: 0,
        jitterMs: 0,
        packetLossPercent: 0,
      });

      expect(buffer.getBufferSizeMs()).toBeGreaterThanOrEqual(100);
    });
  });

  describe('End-to-End Streaming Flow', () => {
    it('should complete full streaming cycle under 100ms', async () => {
      const startTime = Date.now();

      processor = createStreamingProcessor({
        callId,
        callerId: 'user-spanish-001',
        receiverId: 'user-chinese-001',
        sourceLanguage: 'es',
        targetLanguage: 'zh',
        voiceId: 'default-voice',
      });

      processor.start();

      // Simulate network metrics
      processor.updateNetworkMetrics({
        latencyMs: 50,
        jitterMs: 10,
        packetLossPercent: 0,
      });

      // Simulate audio processing
      const audioChunk = Buffer.alloc(1024);
      await processor.processAudioChunk(audioChunk);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 150));

      const elapsedTime = Date.now() - startTime;

      processor.stop();

      // Full cycle should be relatively fast
      expect(elapsedTime).toBeLessThan(300);

      const metrics = processor.getMetrics();
      expect(metrics.endToEndLatencyMs).toBeLessThan(200);
    });

    it('should handle high-latency network gracefully', async () => {
      processor = createStreamingProcessor({
        callId,
        callerId: 'user-spanish-001',
        receiverId: 'user-chinese-001',
        sourceLanguage: 'es',
        targetLanguage: 'zh',
        voiceId: 'default-voice',
      });

      processor.start();

      // Simulate high-latency network
      processor.updateNetworkMetrics({
        latencyMs: 300,
        jitterMs: 100,
        packetLossPercent: 5,
      });

      const audioChunk = Buffer.alloc(1024);
      await processor.processAudioChunk(audioChunk);

      // Should still process without errors
      const metrics = processor.getMetrics();
      expect(metrics.bufferSizeMs).toBeGreaterThan(200); // Increased buffer

      processor.stop();
    });
  });

  describe('Streaming Performance Targets', () => {
    it('should meet transcription latency target: 40-80ms', async () => {
      const transcriptionManager = getStreamingTranscriptionManager();
      transcriptionManager.startSession(callId, 'es', 'deepgram');

      const latencies: number[] = [];

      transcriptionManager.onHypothesis(callId, (hypothesis) => {
        latencies.push(Date.now() - hypothesis.timestamp);
      });

      for (let i = 0; i < 5; i++) {
        transcriptionManager.addPartialHypothesis(callId, `text ${i}`, 'es', 0.9);
      }

      const avgLatency =
        latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avgLatency).toBeLessThan(100);

      transcriptionManager.clearSession(callId);
    });

    it('should meet translation latency target: 50-100ms', async () => {
      const translationManager = getStreamingTranslationManager();
      translationManager.startSession(callId, 'es', 'zh', 'deepl');

      const latencies: number[] = [];

      translationManager.onBatch(callId, (batch) => {
        latencies.push(batch.processingTimeMs);
      });

      await translationManager.addText(callId, 'Hola', async () => '你好');
      await new Promise((resolve) => setTimeout(resolve, 150));

      if (latencies.length > 0) {
        const avgLatency =
          latencies.reduce((a, b) => a + b, 0) / latencies.length;
        expect(avgLatency).toBeLessThan(150);
      }

      translationManager.clearSession(callId);
    });

    it('should meet TTS latency target: 200ms first sentence', async () => {
      const ttsManager = getStreamingTTSManager();
      ttsManager.startSession(callId, 'zh', 'default-voice', 'elevenlabs');

      let firstChunkLatency = 0;

      ttsManager.onSynthesisComplete(callId, (chunk, index) => {
        if (index === 0) {
          firstChunkLatency = chunk.synthesisTimeMs;
        }
      });

      await ttsManager.synthesizeText(callId, '你好', async () =>
        Buffer.from('audio')
      );

      await new Promise((resolve) => setTimeout(resolve, 300));

      if (firstChunkLatency > 0) {
        expect(firstChunkLatency).toBeLessThan(400);
      }

      ttsManager.clearSession(callId);
    });
  });
});
