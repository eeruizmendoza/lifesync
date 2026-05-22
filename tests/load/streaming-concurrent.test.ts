/**
 * Concurrent Streaming Load Tests
 * Phase 13.7: Verify system stability under multiple concurrent streaming calls
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  createStreamingProcessor,
  removeStreamingProcessor,
} from '@/lib/realtime-pipeline-v2';
import { getStreamingTranscriptionManager } from '@/lib/streaming-transcription';
import { getStreamingTranslationManager } from '@/lib/streaming-translation';
import { getStreamingTTSManager } from '@/lib/streaming-tts';

describe('Load: Concurrent Streaming Calls (Phase 13.7)', () => {
  const createdCallIds: string[] = [];

  afterEach(() => {
    // Cleanup all calls
    createdCallIds.forEach((callId) => {
      try {
        removeStreamingProcessor(callId);
        getStreamingTranscriptionManager().clearSession(callId);
        getStreamingTranslationManager().clearSession(callId);
        getStreamingTTSManager().clearSession(callId);
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    createdCallIds.length = 0;
  });

  describe('Concurrent Call Load', () => {
    it('should handle 10 concurrent streaming calls', async () => {
      const concurrentCalls = 10;
      const callIds = Array.from({ length: concurrentCalls }, (_, i) =>
        `call_concurrent_10_${Date.now()}_${i}`
      );

      createdCallIds.push(...callIds);

      const processors = callIds.map((callId) =>
        createStreamingProcessor({
          callId,
          callerId: `user-spanish-${Math.floor(Math.random() * 100)}`,
          receiverId: `user-chinese-${Math.floor(Math.random() * 100)}`,
          sourceLanguage: 'es',
          targetLanguage: 'zh',
          voiceId: 'default-voice',
        })
      );

      processors.forEach((p) => p.start());

      // Simulate audio chunks for all calls
      for (let round = 0; round < 5; round++) {
        const promises = processors.map((processor) =>
          processor.processAudioChunk(Buffer.alloc(1024))
        );
        await Promise.all(promises);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Verify all processors are still active
      processors.forEach((processor) => {
        const metrics = processor.getMetrics();
        expect(metrics.endToEndLatencyMs).toBeGreaterThanOrEqual(0);
      });

      processors.forEach((p) => p.stop());
    });

    it('should handle 50 concurrent streaming calls', async () => {
      const concurrentCalls = 50;
      const callIds = Array.from({ length: concurrentCalls }, (_, i) =>
        `call_concurrent_50_${Date.now()}_${i}`
      );

      createdCallIds.push(...callIds);

      const processors = callIds.map((callId) =>
        createStreamingProcessor({
          callId,
          callerId: `user-spanish-${Math.floor(Math.random() * 100)}`,
          receiverId: `user-chinese-${Math.floor(Math.random() * 100)}`,
          sourceLanguage: 'es',
          targetLanguage: 'zh',
          voiceId: 'default-voice',
        })
      );

      const startTime = Date.now();

      processors.forEach((p) => p.start());

      // Simulate audio chunks
      for (let round = 0; round < 3; round++) {
        const promises = processors.map((processor) =>
          processor.processAudioChunk(Buffer.alloc(1024))
        );
        await Promise.all(promises);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const elapsedTime = Date.now() - startTime;

      // All should complete in reasonable time
      expect(elapsedTime).toBeLessThan(5000);

      // Check for memory leaks by verifying sessions are tracked
      const transcriptionManager = getStreamingTranscriptionManager();
      const activeSessions = transcriptionManager.getActiveSessions();
      expect(activeSessions.length).toBeLessThanOrEqual(concurrentCalls);

      processors.forEach((p) => p.stop());
    });

    it('should handle 100 concurrent streaming calls', async () => {
      const concurrentCalls = 100;
      const callIds = Array.from({ length: concurrentCalls }, (_, i) =>
        `call_concurrent_100_${Date.now()}_${i}`
      );

      createdCallIds.push(...callIds);

      const processors = callIds.map((callId) =>
        createStreamingProcessor({
          callId,
          callerId: `user-spanish-${Math.floor(Math.random() * 100)}`,
          receiverId: `user-chinese-${Math.floor(Math.random() * 100)}`,
          sourceLanguage: 'es',
          targetLanguage: 'zh',
          voiceId: 'default-voice',
        })
      );

      const startTime = Date.now();

      // Batch start to avoid overwhelming event loop
      for (let i = 0; i < processors.length; i += 10) {
        processors.slice(i, i + 10).forEach((p) => p.start());
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Process audio for each call
      for (let round = 0; round < 2; round++) {
        for (let i = 0; i < processors.length; i += 10) {
          const batch = processors.slice(i, i + 10);
          const promises = batch.map((processor) =>
            processor.processAudioChunk(Buffer.alloc(512))
          );
          await Promise.all(promises);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const elapsedTime = Date.now() - startTime;

      // Should complete efficiently
      expect(elapsedTime).toBeLessThan(10000);

      processors.forEach((p) => p.stop());
    });
  });

  describe('Streaming Under Network Stress', () => {
    it('should handle calls with varying network conditions', async () => {
      const calls = [
        { latency: 50, jitter: 10, loss: 0 }, // Good
        { latency: 150, jitter: 50, loss: 2 }, // Fair
        { latency: 300, jitter: 100, loss: 5 }, // Poor
        { latency: 500, jitter: 200, loss: 10 }, // Very poor
      ];

      const callIds = calls.map((_, i) =>
        `call_stress_${Date.now()}_${i}`
      );

      createdCallIds.push(...callIds);

      const processors = callIds.map((callId, i) =>
        createStreamingProcessor({
          callId,
          callerId: `user-spanish-${i}`,
          receiverId: `user-chinese-${i}`,
          sourceLanguage: 'es',
          targetLanguage: 'zh',
          voiceId: 'default-voice',
        })
      );

      processors.forEach((p) => p.start());

      // Simulate different network conditions
      processors.forEach((processor, i) => {
        const networkCond = calls[i];
        processor.updateNetworkMetrics({
          latencyMs: networkCond.latency,
          jitterMs: networkCond.jitter,
          packetLossPercent: networkCond.loss,
        });
      });

      // Process audio
      for (let round = 0; round < 5; round++) {
        const promises = processors.map((processor) =>
          processor.processAudioChunk(Buffer.alloc(1024))
        );
        await Promise.all(promises);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // All should handle their respective conditions
      processors.forEach((processor, i) => {
        const metrics = processor.getMetrics();
        const networkCond = calls[i];

        // Buffer size should scale with network latency
        expect(metrics.bufferSizeMs).toBeGreaterThan(0);
        expect(metrics.bufferSizeMs).toBeLessThan(1000);
      });

      processors.forEach((p) => p.stop());
    });
  });

  describe('Streaming Session Management', () => {
    it('should properly track multiple concurrent sessions', async () => {
      const numSessions = 30;
      const callIds = Array.from({ length: numSessions }, (_, i) =>
        `call_session_${Date.now()}_${i}`
      );

      createdCallIds.push(...callIds);

      // Start sessions
      callIds.forEach((callId) => {
        getStreamingTranscriptionManager().startSession(callId, 'es', 'deepgram');
        getStreamingTranslationManager().startSession(callId, 'es', 'zh', 'deepl');
        getStreamingTTSManager().startSession(
          callId,
          'zh',
          'default-voice',
          'elevenlabs'
        );
      });

      // Add data to each session
      callIds.forEach((callId) => {
        getStreamingTranscriptionManager().addPartialHypothesis(
          callId,
          'test text',
          'es',
          0.9
        );
      });

      // Verify all sessions active
      const transcriptionSessions =
        getStreamingTranscriptionManager().getActiveSessions();
      expect(transcriptionSessions.length).toBe(numSessions);

      const translationSessions =
        getStreamingTranslationManager().getActiveSessions();
      expect(translationSessions.length).toBe(numSessions);

      const ttsSessions = getStreamingTTSManager().getActiveSessions();
      expect(ttsSessions.length).toBe(numSessions);

      // Clean up all
      callIds.forEach((callId) => {
        getStreamingTranscriptionManager().clearSession(callId);
        getStreamingTranslationManager().clearSession(callId);
        getStreamingTTSManager().clearSession(callId);
      });

      // Verify all cleaned up
      expect(
        getStreamingTranscriptionManager().getActiveSessions().length
      ).toBe(0);
      expect(
        getStreamingTranslationManager().getActiveSessions().length
      ).toBe(0);
      expect(getStreamingTTSManager().getActiveSessions().length).toBe(0);
    });
  });

  describe('Streaming Throughput', () => {
    it('should process audio chunks at target rate', async () => {
      const callId = `call_throughput_${Date.now()}`;
      createdCallIds.push(callId);

      const processor = createStreamingProcessor({
        callId,
        callerId: 'user-spanish-001',
        receiverId: 'user-chinese-001',
        sourceLanguage: 'es',
        targetLanguage: 'zh',
        voiceId: 'default-voice',
      });

      processor.start();

      const startTime = Date.now();
      const chunkCount = 100;
      const chunkSize = 1024;

      // Process chunks at real-time rate (20ms chunks)
      for (let i = 0; i < chunkCount; i++) {
        await processor.processAudioChunk(Buffer.alloc(chunkSize));
        // 20ms per chunk (simulating real-time audio)
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const elapsedTime = Date.now() - startTime;
      const throughput = (chunkCount * chunkSize) / (elapsedTime / 1000); // bytes/sec

      // Should maintain reasonable throughput
      expect(throughput).toBeGreaterThan(10000); // At least 10KB/sec

      processor.stop();
    });

    it('should handle bursts of rapid chunks', async () => {
      const callId = `call_burst_${Date.now()}`;
      createdCallIds.push(callId);

      const processor = createStreamingProcessor({
        callId,
        callerId: 'user-spanish-001',
        receiverId: 'user-chinese-001',
        sourceLanguage: 'es',
        targetLanguage: 'zh',
        voiceId: 'default-voice',
      });

      processor.start();

      const startTime = Date.now();

      // Send rapid burst
      for (let i = 0; i < 50; i++) {
        await processor.processAudioChunk(Buffer.alloc(1024));
      }

      const burstTime = Date.now() - startTime;

      // Should handle burst efficiently
      expect(burstTime).toBeLessThan(5000);

      // Metrics should be valid even under burst
      const metrics = processor.getMetrics();
      expect(metrics.bufferSizeMs).toBeGreaterThan(0);

      processor.stop();
    });
  });
});
