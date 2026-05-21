/**
 * Unit Tests: Translation Service
 * Tests core translation logic and multi-provider support
 */

import { benchmarkTranslationModel, compareSpeechModels } from '@/lib/model-benchmarking';

describe('Translation Service', () => {
  describe('Model Benchmarking', () => {
    test('benchmarkTranslationModel returns valid BLEU metrics', async () => {
      const metrics = await benchmarkTranslationModel(
        'deepl-v3',
        'en',
        'es'
      );

      expect(metrics).toBeDefined();
      expect(metrics.modelName).toBe('deepl-v3');
      expect(metrics.metric).toBe('bleu');
      // BLEU scores typically 0.4-0.7
      expect(metrics.score).toBeGreaterThanOrEqual(0);
      expect(metrics.score).toBeLessThanOrEqual(1);
      expect(metrics.confidence).toBeGreaterThan(0);
      expect(metrics.confidence).toBeLessThanOrEqual(1);
      expect(metrics.sampleCount).toBeGreaterThan(0);
      expect(metrics.language).toBe('en-es');
    });

    test('benchmarkTranslationModel supports multiple language pairs', async () => {
      const esEN = await benchmarkTranslationModel(
        'deepl-v3',
        'es',
        'en'
      );
      const zhEN = await benchmarkTranslationModel(
        'deepl-v3',
        'zh',
        'en'
      );

      expect(esEN.language).toBe('es-en');
      expect(zhEN.language).toBe('zh-en');
      expect(esEN.score).toBeDefined();
      expect(zhEN.score).toBeDefined();
    });

    test('benchmarkTranslationModel supports ensemble translation', async () => {
      const deepl = await benchmarkTranslationModel('deepl-v3', 'en', 'es');
      const seamless = await benchmarkTranslationModel('seamless-m4t', 'en', 'es');

      // Both providers should work
      expect(deepl.score).toBeGreaterThan(0);
      expect(seamless.score).toBeGreaterThan(0);
      // Scores may differ between providers
      // (one might be better than the other)
    });
  });

  describe('Translation Quality Comparison', () => {
    test('compareSpeechModels for translation calculates improvement correctly', async () => {
      const result = await compareSpeechModels(
        'translation',
        'deepl-v3',
        'seamless-m4t',
        'es', // Spanish target language
        0.02 // 2% improvement threshold
      );

      expect(result).toBeDefined();
      expect(result.type).toBe('translation');
      expect(result.currentModel).toBe('deepl-v3');
      expect(result.newModel).toBe('seamless-m4t');
      expect(result.currentScore).toBeGreaterThan(0);
      expect(result.newScore).toBeGreaterThan(0);
      // For BLEU, higher is better, so improvement = (new - current) / current
      expect(result.improvement).toBeGreaterThanOrEqual(-1);
      expect(result.improvement).toBeLessThanOrEqual(1);
      expect(typeof result.shouldSwitch).toBe('boolean');
    });

    test('compareSpeechModels can recommend switching on improvement', async () => {
      const result = await compareSpeechModels(
        'translation',
        'deepl-v3',
        'seamless-m4t',
        'es',
        0.02 // Low threshold to make switching more likely
      );

      // Either switch or don't, but should be a valid decision
      expect(typeof result.shouldSwitch).toBe('boolean');
      if (result.shouldSwitch) {
        expect(result.improvement).toBeGreaterThanOrEqual(0.02);
      }
    });

    test('compareSpeechModels respects high improvement threshold', async () => {
      const result = await compareSpeechModels(
        'translation',
        'deepl-v3',
        'seamless-m4t',
        'es',
        0.5 // 50% improvement required (very high)
      );

      // With high threshold, switching should be rare
      if (result.shouldSwitch) {
        expect(result.improvement).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  describe('Language Support', () => {
    test('translation services support major language pairs', async () => {
      const languagePairs = [
        { source: 'en', target: 'es' },
        { source: 'en', target: 'zh' },
        { source: 'es', target: 'en' },
        { source: 'zh', target: 'en' },
        { source: 'en', target: 'fr' },
        { source: 'de', target: 'en' },
      ];

      for (const pair of languagePairs) {
        const metrics = await benchmarkTranslationModel(
          'deepl-v3',
          pair.source,
          pair.target
        );

        expect(metrics).toBeDefined();
        expect(metrics.language).toBe(`${pair.source}-${pair.target}`);
        expect(metrics.score).toBeGreaterThan(0);
      }
    });
  });
});
