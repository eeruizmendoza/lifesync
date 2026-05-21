/**
 * Load Test: Concurrent Calls
 * 
 * Tests system under load:
 * - 100 concurrent calls
 * - Measure: latency, throughput, error rate, resource usage
 * - 30-second sustained load
 */

import axios from 'axios';

describe('Load Test: Concurrent Calls', () => {
  const CONCURRENT_CALLS = 100;
  const DURATION_SECONDS = 30;
  const BASE_URL = 'http://localhost:3000';

  interface LoadMetrics {
    successfulCalls: number;
    failedCalls: number;
    totalLatency: number;
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
    throughput: number;
    cpuUsage: number;
    memoryUsage: number;
  }

  let metrics: LoadMetrics = {
    successfulCalls: 0,
    failedCalls: 0,
    totalLatency: 0,
    avgLatency: 0,
    p95Latency: 0,
    p99Latency: 0,
    throughput: 0,
    cpuUsage: 0,
    memoryUsage: 0,
  };

  test('System handles 100 concurrent transcription requests', async () => {
    const latencies: number[] = [];
    const startTime = Date.now();

    // Create 100 concurrent requests
    const promises = Array.from({ length: CONCURRENT_CALLS }, async (_, i) => {
      const callStartTime = Date.now();

      try {
        const response = await axios.post(
          `${BASE_URL}/api/transcriptions/process-recording`,
          {
            audioBuffer: Buffer.alloc(32000).toString('base64'), // 1 second @ 32kHz
            language: 'en',
          },
          { timeout: 10000 }
        );

        const latency = Date.now() - callStartTime;
        latencies.push(latency);
        metrics.successfulCalls++;

        expect(response.status).toBe(200);
      } catch (error) {
        metrics.failedCalls++;
        console.error(`Request ${i} failed:`, error);
      }
    });

    await Promise.all(promises);
    const totalDuration = Date.now() - startTime;

    // Calculate metrics
    metrics.totalLatency = latencies.reduce((a, b) => a + b, 0);
    metrics.avgLatency = metrics.totalLatency / latencies.length;
    metrics.throughput = (CONCURRENT_CALLS / totalDuration) * 1000; // requests/sec

    latencies.sort((a, b) => a - b);
    metrics.p95Latency = latencies[Math.floor(latencies.length * 0.95)];
    metrics.p99Latency = latencies[Math.floor(latencies.length * 0.99)];

    // Verify system didn't degrade
    expect(metrics.failedCalls).toBeLessThan(CONCURRENT_CALLS * 0.05); // < 5% failure rate
    expect(metrics.avgLatency).toBeLessThan(1000); // < 1 second average
    expect(metrics.p99Latency).toBeLessThan(3000); // < 3 second p99
  });

  test('System handles 100 concurrent translation requests', async () => {
    const latencies: number[] = [];

    const promises = Array.from({ length: CONCURRENT_CALLS }, async (_, i) => {
      const callStartTime = Date.now();

      try {
        const response = await axios.post(
          `${BASE_URL}/api/translate/translate`,
          {
            text: 'Hello, how are you today?',
            sourceLang: 'en',
            targetLang: 'es',
          },
          { timeout: 10000 }
        );

        const latency = Date.now() - callStartTime;
        latencies.push(latency);
        metrics.successfulCalls++;

        expect(response.status).toBe(200);
      } catch (error) {
        metrics.failedCalls++;
      }
    });

    await Promise.all(promises);

    // Verify performance
    latencies.sort((a, b) => a - b);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p99Latency = latencies[Math.floor(latencies.length * 0.99)];

    expect(avgLatency).toBeLessThan(500); // < 500ms average
    expect(p99Latency).toBeLessThan(2000); // < 2 second p99
  });

  test('System handles 100 concurrent TTS requests', async () => {
    const latencies: number[] = [];

    const promises = Array.from({ length: CONCURRENT_CALLS }, async (_, i) => {
      const callStartTime = Date.now();

      try {
        const response = await axios.post(
          `${BASE_URL}/api/tts/synthesize`,
          {
            text: 'Hello, this is a test',
            language: 'en',
            voiceId: 'default-english-female',
          },
          { timeout: 10000 }
        );

        const latency = Date.now() - callStartTime;
        latencies.push(latency);
        metrics.successfulCalls++;

        expect(response.status).toBe(200);
      } catch (error) {
        metrics.failedCalls++;
      }
    });

    await Promise.all(promises);

    latencies.sort((a, b) => a - b);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    expect(avgLatency).toBeLessThan(1500); // < 1.5 second average for synthesis
  });

  test('System maintains performance under sustained load', async () => {
    const batches = Math.ceil(DURATION_SECONDS / 1); // 1 second batches
    let totalSuccessful = 0;
    let totalFailed = 0;

    for (let batch = 0; batch < batches; batch++) {
      const promises = Array.from({ length: CONCURRENT_CALLS / batches }, async () => {
        try {
          const response = await axios.post(
            `${BASE_URL}/api/translate/translate`,
            {
              text: `Batch ${batch} request`,
              sourceLang: 'en',
              targetLang: 'fr',
            },
            { timeout: 5000 }
          );

          if (response.status === 200) {
            totalSuccessful++;
          }
        } catch {
          totalFailed++;
        }
      });

      await Promise.all(promises);

      // Check that performance doesn't degrade over time
      const successRate = totalSuccessful / (totalSuccessful + totalFailed);
      expect(successRate).toBeGreaterThan(0.95); // > 95% success rate
    }
  });

  test('Metrics are within acceptable ranges', () => {
    console.log('\n=== Load Test Results ===');
    console.log(`Successful calls: ${metrics.successfulCalls}`);
    console.log(`Failed calls: ${metrics.failedCalls}`);
    console.log(`Success rate: ${((metrics.successfulCalls / CONCURRENT_CALLS) * 100).toFixed(1)}%`);
    console.log(`Average latency: ${metrics.avgLatency.toFixed(0)}ms`);
    console.log(`P95 latency: ${metrics.p95Latency}ms`);
    console.log(`P99 latency: ${metrics.p99Latency}ms`);
    console.log(`Throughput: ${metrics.throughput.toFixed(2)} req/sec`);

    // System should handle load gracefully
    expect(metrics.successfulCalls).toBeGreaterThan(CONCURRENT_CALLS * 0.95); // > 95% success
  });
});
