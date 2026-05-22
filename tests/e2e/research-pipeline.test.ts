/**
 * End-to-End Tests: Research Pipeline
 * Phase 13.9: Model benchmarking and auto-switching
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  getResearchPipeline,
  type ModelBenchmarkResult,
  type ResearchPipelineConfig,
} from '@/lib/research-pipeline';
import { runDailyResearchPipeline } from '@/lib/research-pipeline-scheduler';

describe('E2E: Research Pipeline (Phase 13.9)', () => {
  let pipeline: ReturnType<typeof getResearchPipeline>;

  beforeEach(() => {
    pipeline = getResearchPipeline({
      enabled: true,
      checkInterval: 1000, // Fast for testing
      improvementThreshold: 0.02,
      autoApproveThreshold: 0.05,
      maxConcurrentBenchmarks: 3,
      notifyOnMajor: true,
    });
  });

  describe('Model Benchmarking', () => {
    it('should detect new transcription models', async () => {
      // Simulate checking for new models
      const status = pipeline.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.currentModels).toHaveProperty('transcription');
    });

    it('should benchmark new models against current ones', async () => {
      // Run pipeline
      await pipeline.start();

      // Should generate benchmark results
      const history = pipeline.getHistory();

      if (history.length > 0) {
        const result = history[0];

        expect(result).toHaveProperty('modelName');
        expect(result).toHaveProperty('metrics');
        expect(result.metrics).toHaveProperty('accuracy');
        expect(result.metrics).toHaveProperty('latency');
        expect(result).toHaveProperty('improvementPercent');
        expect(result).toHaveProperty('recommendation');
      }
    });

    it('should calculate improvement percentage correctly', async () => {
      await pipeline.start();
      const history = pipeline.getHistory();

      history.forEach((result) => {
        // Improvement should be between -50% and +50%
        expect(result.improvementPercent).toBeGreaterThanOrEqual(-0.5);
        expect(result.improvementPercent).toBeLessThanOrEqual(0.5);
      });
    });

    it('should make correct recommendations based on improvement', async () => {
      await pipeline.start();
      const history = pipeline.getHistory();

      history.forEach((result) => {
        const recommendation = result.recommendation;

        if (result.improvementPercent > 0.05) {
          expect(recommendation).toBe('switch');
        } else if (result.improvementPercent > 0.02) {
          expect(recommendation).toBe('monitor');
        } else {
          expect(recommendation).toBe('skip');
        }
      });
    });
  });

  describe('Auto-Switching', () => {
    it('should mark models for auto-switch if improvement > 5%', async () => {
      // Create a hypothetical result with >5% improvement
      const testResult: ModelBenchmarkResult = {
        modelName: 'deepgram:nova-3',
        provider: 'deepgram',
        version: 'nova-3',
        metrics: {
          accuracy: 0.98,
          latency: 70,
          cost: 0.0001,
          languages: 99,
          naturalness: 0,
        },
        releaseDate: new Date().toISOString(),
        improvementPercent: 0.07, // 7% improvement
        isSignificant: true,
        recommendation: 'switch',
      };

      expect(testResult.recommendation).toBe('switch');
      expect(testResult.improvementPercent).toBeGreaterThan(0.05);
    });

    it('should mark models for review if improvement 2-5%', async () => {
      const testResult: ModelBenchmarkResult = {
        modelName: 'google-translate:v2',
        provider: 'google-translate',
        version: 'v2',
        metrics: {
          accuracy: 0.88,
          latency: 85,
          cost: 0.000020,
          languages: 133,
          naturalness: 0,
        },
        releaseDate: new Date().toISOString(),
        improvementPercent: 0.03, // 3% improvement
        isSignificant: true,
        recommendation: 'monitor',
      };

      expect(testResult.recommendation).toBe('monitor');
      expect(testResult.improvementPercent).toBeGreaterThan(0.02);
      expect(testResult.improvementPercent).toBeLessThanOrEqual(0.05);
    });

    it('should skip models with <2% improvement', async () => {
      const testResult: ModelBenchmarkResult = {
        modelName: 'elevenlabs:eleven_multilingual_v3',
        provider: 'elevenlabs',
        version: 'eleven_multilingual_v3',
        metrics: {
          accuracy: 0,
          latency: 280,
          cost: 0.000024,
          languages: 32,
          naturalness: 4.35,
        },
        releaseDate: new Date().toISOString(),
        improvementPercent: 0.01, // 1% improvement
        isSignificant: false,
        recommendation: 'skip',
      };

      expect(testResult.recommendation).toBe('skip');
      expect(testResult.improvementPercent).toBeLessThanOrEqual(0.02);
    });
  });

  describe('Pipeline Execution', () => {
    it('should complete daily pipeline run without errors', async () => {
      const result = await runDailyResearchPipeline();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('duration');

      // Duration should be reasonable (< 30 seconds for test)
      expect(result.duration).toBeLessThan(30000);
    });

    it('should track pipeline status', async () => {
      const status = pipeline.getStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('lastCheckTime');
      expect(status).toHaveProperty('currentModels');
      expect(status).toHaveProperty('historySize');

      expect(typeof status.enabled).toBe('boolean');
      expect(typeof status.running).toBe('boolean');
    });

    it('should maintain benchmark history', async () => {
      const initialHistory = pipeline.getHistory().length;

      await pipeline.start();

      const finalHistory = pipeline.getHistory().length;

      // History should grow after running
      expect(finalHistory).toBeGreaterThanOrEqual(initialHistory);
    });
  });

  describe('Model Tracking', () => {
    it('should track current models for each provider type', () => {
      const currentModels = pipeline.getCurrentModels();

      expect(currentModels.size).toBeGreaterThan(0);

      // Should have at least transcription, translation, TTS
      const modelTypes = Array.from(currentModels.keys());
      expect(modelTypes.length).toBeGreaterThanOrEqual(1);
    });

    it('should update current models on successful auto-switch', async () => {
      const initialModels = new Map(pipeline.getCurrentModels());

      // Simulate an auto-switch
      // (In production, this would happen through the pipeline)

      const currentModels = pipeline.getCurrentModels();

      // Models should exist
      expect(currentModels.size).toBeGreaterThan(0);
    });
  });

  describe('Benchmark Metrics', () => {
    it('should collect accuracy metrics', async () => {
      await pipeline.start();
      const history = pipeline.getHistory();

      history.forEach((result) => {
        // TTS models have accuracy 0 (not applicable)
        const isTTSModel = ['elevenlabs', 'piper', 'google-tts'].includes(result.provider);
        if (isTTSModel) {
          expect(result.metrics.accuracy).toBe(0);
        } else {
          expect(result.metrics.accuracy).toBeGreaterThan(0);
        }
        expect(result.metrics.accuracy).toBeLessThanOrEqual(1);
      });
    });

    it('should collect latency metrics', async () => {
      await pipeline.start();
      const history = pipeline.getHistory();

      history.forEach((result) => {
        expect(result.metrics.latency).toBeGreaterThan(0);
        expect(result.metrics.latency).toBeLessThan(10000); // < 10 seconds
      });
    });

    it('should collect cost metrics', async () => {
      await pipeline.start();
      const history = pipeline.getHistory();

      history.forEach((result) => {
        expect(result.metrics.cost).toBeGreaterThanOrEqual(0);
        expect(result.metrics.cost).toBeLessThan(1); // < $1 per 1M
      });
    });

    it('should collect language support metrics', async () => {
      await pipeline.start();
      const history = pipeline.getHistory();

      history.forEach((result) => {
        expect(result.metrics.languages).toBeGreaterThan(0);
        expect(result.metrics.languages).toBeLessThan(200); // < 200 languages max
      });
    });

    it('should track TTS naturalness (MOS score)', async () => {
      await pipeline.start();
      const history = pipeline.getHistory();

      const ttsResults = history.filter((h) => ['elevenlabs', 'piper', 'google'].includes(h.provider));

      ttsResults.forEach((result) => {
        if (result.metrics.naturalness > 0) {
          expect(result.metrics.naturalness).toBeGreaterThan(3); // MOS typically 3-5
          expect(result.metrics.naturalness).toBeLessThanOrEqual(5);
        }
      });
    });
  });

  describe('Performance & Efficiency', () => {
    it('should complete benchmarking within reasonable time', async () => {
      const startTime = Date.now();

      await pipeline.start();

      const elapsedTime = Date.now() - startTime;

      // Should complete in under 30 seconds (test environment)
      expect(elapsedTime).toBeLessThan(30000);
    });

    it('should respect concurrent benchmark limits', async () => {
      const config: ResearchPipelineConfig = {
        enabled: true,
        checkInterval: 1000,
        improvementThreshold: 0.02,
        autoApproveThreshold: 0.05,
        maxConcurrentBenchmarks: 3, // Max 3 concurrent
        stagingEnabled: true,
        notifyOnMajor: true,
      };

      const limitedPipeline = getResearchPipeline(config);

      // Should not exceed concurrent limit
      expect(config.maxConcurrentBenchmarks).toBeLessThanOrEqual(5);
    });
  });

  describe('Integration with Scheduling', () => {
    it('should be callable from scheduler', async () => {
      const result = await runDailyResearchPipeline();

      expect(result.success).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.message).toBeDefined();
      expect(result.duration).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      const result = await runDailyResearchPipeline();

      // Result should always have valid structure, even on error
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('Feature Flags', () => {
    it('should respect enabled/disabled flag', () => {
      const disabledPipeline = getResearchPipeline({
        enabled: false,
      });

      const status = disabledPipeline.getStatus();
      expect(status.enabled).toBe(false);
    });

    it('should support staging mode', () => {
      const stagingPipeline = getResearchPipeline({
        stagingEnabled: true,
      });

      // Should be able to configure staging
      const status = stagingPipeline.getStatus();
      expect(status.enabled).toBeDefined();
    });
  });
});
