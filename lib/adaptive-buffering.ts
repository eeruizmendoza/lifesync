/**
 * Adaptive Jitter Buffer
 * Phase 13.7: Dynamically adjust buffer size based on network conditions
 */

export interface NetworkMetrics {
  latencyMs: number;
  packetLossPercent: number;
  jitterMs: number;
}

export interface BufferConfig {
  minBufferMs: number;
  maxBufferMs: number;
  baseBufferMs: number;
  latencyThresholds: {
    low: number; // < 100ms
    medium: number; // 100-200ms
    high: number; // 200-500ms
    veryHigh: number; // > 500ms
  };
  packetLossThresholds: {
    none: number; // 0%
    low: number; // 1-3%
    medium: number; // 3-5%
    high: number; // > 5%
  };
}

const DEFAULT_CONFIG: BufferConfig = {
  minBufferMs: 100,
  maxBufferMs: 1000,
  baseBufferMs: 200,
  latencyThresholds: {
    low: 100,
    medium: 200,
    high: 500,
    veryHigh: 1000,
  },
  packetLossThresholds: {
    none: 0.5,
    low: 3,
    medium: 5,
    high: 10,
  },
};

/**
 * Adaptive jitter buffer that adjusts size based on network conditions
 */
export class AdaptiveBuffer {
  private config: BufferConfig;
  private buffer: Buffer[] = [];
  private bufferSize: number;
  private metrics: NetworkMetrics = {
    latencyMs: 0,
    packetLossPercent: 0,
    jitterMs: 0,
  };
  private metricsHistory: NetworkMetrics[] = [];
  private readonly maxHistorySize = 100;

  constructor(config: Partial<BufferConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bufferSize = this.config.baseBufferMs;
  }

  /**
   * Update network metrics and recalculate buffer size
   */
  updateMetrics(metrics: NetworkMetrics): void {
    this.metrics = metrics;
    this.metricsHistory.push(metrics);

    // Keep history size bounded
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }

    // Recalculate buffer size based on new metrics
    this.recalculateBufferSize();
  }

  /**
   * Calculate recommended buffer size based on network conditions
   */
  private recalculateBufferSize(): void {
    let recommendedSize = this.config.baseBufferMs;

    // Add latency-based padding
    if (this.metrics.latencyMs < this.config.latencyThresholds.low) {
      recommendedSize += 0; // No additional padding
    } else if (this.metrics.latencyMs < this.config.latencyThresholds.medium) {
      recommendedSize += 100;
    } else if (this.metrics.latencyMs < this.config.latencyThresholds.high) {
      recommendedSize += 200;
    } else {
      recommendedSize += 300;
    }

    // Add jitter-based padding (2x jitter)
    recommendedSize += Math.min(this.metrics.jitterMs * 2, 200);

    // Add packet loss-based padding
    if (this.metrics.packetLossPercent > this.config.packetLossThresholds.high) {
      recommendedSize += 200;
    } else if (this.metrics.packetLossPercent > this.config.packetLossThresholds.medium) {
      recommendedSize += 150;
    } else if (this.metrics.packetLossPercent > this.config.packetLossThresholds.low) {
      recommendedSize += 100;
    }

    // Clamp to min/max
    this.bufferSize = Math.max(
      this.config.minBufferMs,
      Math.min(recommendedSize, this.config.maxBufferMs)
    );
  }

  /**
   * Add data to buffer
   */
  push(data: Buffer): void {
    this.buffer.push(data);
  }

  /**
   * Check if enough data accumulated to return
   */
  isReady(): boolean {
    const totalSize = this.buffer.reduce((sum, buf) => sum + buf.length, 0);
    return totalSize >= this.bufferSize;
  }

  /**
   * Get buffered data and clear buffer
   */
  flush(): Buffer | null {
    if (this.buffer.length === 0) {
      return null;
    }

    const combined = Buffer.concat(this.buffer);
    this.buffer = [];
    return combined;
  }

  /**
   * Get current buffer size in milliseconds
   */
  getBufferSizeMs(): number {
    return this.bufferSize;
  }

  /**
   * Get buffer fill percentage (0-100)
   */
  getFillPercentage(): number {
    const totalSize = this.buffer.reduce((sum, buf) => sum + buf.length, 0);
    return Math.min((totalSize / this.bufferSize) * 100, 100);
  }

  /**
   * Get average metrics over recent history
   */
  getAverageMetrics(): NetworkMetrics {
    if (this.metricsHistory.length === 0) {
      return this.metrics;
    }

    const latencies = this.metricsHistory.map((m) => m.latencyMs);
    const packetLosses = this.metricsHistory.map((m) => m.packetLossPercent);
    const jitters = this.metricsHistory.map((m) => m.jitterMs);

    return {
      latencyMs:
        latencies.reduce((a, b) => a + b, 0) / latencies.length,
      packetLossPercent:
        packetLosses.reduce((a, b) => a + b, 0) / packetLosses.length,
      jitterMs:
        jitters.reduce((a, b) => a + b, 0) / jitters.length,
    };
  }

  /**
   * Reset buffer and metrics
   */
  reset(): void {
    this.buffer = [];
    this.bufferSize = this.config.baseBufferMs;
    this.metricsHistory = [];
  }

  /**
   * Get diagnostic information
   */
  getDiagnostics(): {
    currentBufferSizeMs: number;
    bufferFillPercentage: number;
    currentMetrics: NetworkMetrics;
    averageMetrics: NetworkMetrics;
    bufferDataCount: number;
  } {
    return {
      currentBufferSizeMs: this.bufferSize,
      bufferFillPercentage: this.getFillPercentage(),
      currentMetrics: this.metrics,
      averageMetrics: this.getAverageMetrics(),
      bufferDataCount: this.buffer.length,
    };
  }
}
