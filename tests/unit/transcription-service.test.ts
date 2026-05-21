/**
 * Unit Tests: Transcription Service
 * Tests core transcription logic and provider health checks
 */

import { getActiveModel, checkModelHealth, logModelFallback } from '@/lib/model-switching';
import { benchmarkSTTModel, compareSpeechModels } from '@/lib/model-benchmarking';

describe('Transcription Service', () => {
  describe('Model Switching', () => {
    test('getActiveModel returns default fallback when config not found', async () => {
      const model = await getActiveModel('stt');
      // Should return either the active model or a default fallback
      expect(model).toBeDefined();
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    });

    test('checkModelHealth validates provider-specific checks', async () => {
      const status = await checkModelHealth('whisper-v3');

      expect(status).toBeDefined();
      expect(status.model).toBe('whisper-v3');
      expect(typeof status.isHealthy).toBe('boolean');
      expect(status.latencyMs).toBeGreaterThanOrEqual(0);
      expect(status.errorRate).toBeGreaterThanOrEqual(0);
      expect(status.errorRate).toBeLessThanOrEqual(1);
    });

    test('checkModelHealth handles unknown models gracefully', async () => {
      const status = await checkModelHealth('unknown-model-xyz');

      expect(status).toBeDefined();
      expect(status.model).toBe('unknown-model-xyz');
      // Unknown models default to healthy
      expect(status.isHealthy).toBe(true);
    });

    test('checkModelHealth returns latency metrics', async () => {
      const status = await checkModelHealth('deepgram-nova-2');

      expect(status.latencyMs).toBeGreaterThanOrEqual(0);
      expect(status.latencyMs).toBeLessThan(5000); // Should complete in < 5s
    });
  });

  describe('Model Benchmarking', () => {
    test('benchmarkSTTModel returns valid metrics', async () => {
      const metrics = await benchmarkSTTModel('whisper-v3', 'en');

      expect(metrics).toBeDefined();
      expect(metrics.modelName).toBe('whisper-v3');
      expect(metrics.metric).toBe('wer');
      expect(metrics.score).toBeGreaterThanOrEqual(0);
      expect(metrics.score).toBeLessThanOrEqual(1); // WER as 0-1 normalized
      expect(metrics.confidence).toBeGreaterThan(0);
      expect(metrics.confidence).toBeLessThanOrEqual(1);
      expect(metrics.sampleCount).toBeGreaterThan(0);
    });

    test('benchmarkSTTModel supports multiple languages', async () => {
      const metricsES = await benchmarkSTTModel('whisper-v3', 'es');
      const metricsFR = await benchmarkSTTModel('whisper-v3', 'fr');

      expect(metricsES.language).toBe('es');
      expect(metricsFR.language).toBe('fr');
      expect(metricsES.score).toBeDefined();
      expect(metricsFR.score).toBeDefined();
    });

    test('compareSpeechModels calculates improvement correctly', async () => {
      const result = await compareSpeechModels(
        'stt',
        'whisper-v3',
        'deepgram-nova-2',
        'en',
        0.02 // 2% threshold
      );

      expect(result).toBeDefined();
      expect(result.type).toBe('stt');
      expect(result.currentModel).toBe('whisper-v3');
      expect(result.newModel).toBe('deepgram-nova-2');
      expect(result.improvement).toBeGreaterThanOrEqual(-1);
      expect(result.improvement).toBeLessThanOrEqual(1);
      expect(typeof result.shouldSwitch).toBe('boolean');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    test('compareSpeechModels respects improvement threshold', async () => {
      const result = await compareSpeechModels(
        'stt',
        'whisper-v3',
        'deepgram-nova-2',
        'en',
        0.5 // 50% improvement required
      );

      // With high threshold, should rarely switch
      if (result.shouldSwitch) {
        expect(result.improvement).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  describe('Fallback Handling', () => {
    test('logModelFallback records fallback events', async () => {
      // This should not throw
      await expect(
        logModelFallback('primary-model', 'fallback-model')
      ).resolves.not.toThrow();
    });
  });
});
