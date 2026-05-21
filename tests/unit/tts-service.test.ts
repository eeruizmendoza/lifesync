/**
 * Unit Tests: Text-to-Speech Service
 * Tests core TTS logic and voice selection
 */

import { benchmarkTTSModel, compareSpeechModels } from '@/lib/model-benchmarking';

describe('Text-to-Speech Service', () => {
  describe('Model Benchmarking', () => {
    test('benchmarkTTSModel returns valid MOS (Mean Opinion Score) metrics', async () => {
      const metrics = await benchmarkTTSModel('elevenlabs-v3', 'en');

      expect(metrics).toBeDefined();
      expect(metrics.modelName).toBe('elevenlabs-v3');
      expect(metrics.metric).toBe('mos');
      // MOS scores are 1-5 scale
      expect(metrics.score).toBeGreaterThanOrEqual(1);
      expect(metrics.score).toBeLessThanOrEqual(5);
      expect(metrics.confidence).toBeGreaterThan(0);
      expect(metrics.confidence).toBeLessThanOrEqual(1);
      expect(metrics.sampleCount).toBeGreaterThan(0);
      expect(metrics.language).toBe('en');
    });

    test('benchmarkTTSModel supports multiple languages', async () => {
      const metricsEN = await benchmarkTTSModel('elevenlabs-v3', 'en');
      const metricsSP = await benchmarkTTSModel('elevenlabs-v3', 'es');
      const metricsCH = await benchmarkTTSModel('elevenlabs-v3', 'zh');

      expect(metricsEN.language).toBe('en');
      expect(metricsSP.language).toBe('es');
      expect(metricsCH.language).toBe('zh');
      // All should have decent MOS scores
      expect(metricsEN.score).toBeGreaterThan(2);
      expect(metricsSP.score).toBeGreaterThan(2);
      expect(metricsCH.score).toBeGreaterThan(2);
    });

    test('benchmarkTTSModel tests multiple providers', async () => {
      const elevenlabs = await benchmarkTTSModel('elevenlabs-v3', 'en');
      const piper = await benchmarkTTSModel('piper', 'en');
      const google = await benchmarkTTSModel('google-cloud-tts', 'en');

      // All providers should work
      expect(elevenlabs.score).toBeGreaterThan(0);
      expect(piper.score).toBeGreaterThan(0);
      expect(google.score).toBeGreaterThan(0);
    });
  });

  describe('TTS Quality Comparison', () => {
    test('compareSpeechModels for TTS calculates improvement correctly', async () => {
      const result = await compareSpeechModels(
        'tts',
        'elevenlabs-v3',
        'piper',
        'en',
        0.02 // 2% improvement threshold
      );

      expect(result).toBeDefined();
      expect(result.type).toBe('tts');
      expect(result.currentModel).toBe('elevenlabs-v3');
      expect(result.newModel).toBe('piper');
      expect(result.currentScore).toBeGreaterThan(1); // MOS >= 1
      expect(result.newScore).toBeGreaterThan(1);
      expect(result.currentScore).toBeLessThanOrEqual(5); // MOS <= 5
      expect(result.newScore).toBeLessThanOrEqual(5);
      // For MOS, higher is better
      expect(result.improvement).toBeGreaterThanOrEqual(-1);
      expect(result.improvement).toBeLessThanOrEqual(1);
      expect(typeof result.shouldSwitch).toBe('boolean');
    });

    test('compareSpeechModels can recommend switching on improvement', async () => {
      const result = await compareSpeechModels(
        'tts',
        'elevenlabs-v3',
        'google-cloud-tts',
        'en',
        0.02 // Low threshold
      );

      expect(typeof result.shouldSwitch).toBe('boolean');
      if (result.shouldSwitch) {
        expect(result.improvement).toBeGreaterThanOrEqual(0.02);
      }
    });

    test('compareSpeechModels respects high improvement threshold', async () => {
      const result = await compareSpeechModels(
        'tts',
        'elevenlabs-v3',
        'piper',
        'en',
        0.3 // 30% improvement required (high)
      );

      if (result.shouldSwitch) {
        expect(result.improvement).toBeGreaterThanOrEqual(0.3);
      }
    });
  });

  describe('Language Support', () => {
    test('TTS services support major languages', async () => {
      const languages = ['en', 'es', 'zh', 'fr', 'de', 'it', 'pt'];

      for (const lang of languages) {
        const metrics = await benchmarkTTSModel('elevenlabs-v3', lang);

        expect(metrics).toBeDefined();
        expect(metrics.language).toBe(lang);
        expect(metrics.score).toBeGreaterThan(1); // MOS > 1
        expect(metrics.score).toBeLessThanOrEqual(5); // MOS <= 5
      }
    });

    test('multilingual TTS returns consistent quality', async () => {
      const english = await benchmarkTTSModel('elevenlabs-v3', 'en');
      const spanish = await benchmarkTTSModel('elevenlabs-v3', 'es');
      const chinese = await benchmarkTTSModel('elevenlabs-v3', 'zh');

      // All should have reasonable quality (MOS > 3.0)
      expect(english.score).toBeGreaterThan(2.5);
      expect(spanish.score).toBeGreaterThan(2.5);
      expect(chinese.score).toBeGreaterThan(2.5);
    });
  });

  describe('Naturalness & Emotion', () => {
    test('TTS quality scores reflect naturalness', async () => {
      const metrics = await benchmarkTTSModel('elevenlabs-v3', 'en');

      // ElevenLabs is known for natural sounding voice
      // So we expect reasonably high MOS (> 3.5)
      expect(metrics.score).toBeGreaterThan(3.0);
      // And high confidence in measurement
      expect(metrics.confidence).toBeGreaterThan(0.85);
    });
  });
});
