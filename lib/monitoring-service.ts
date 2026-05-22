/**
 * Monitoring Service
 * Tracks metrics for performance, security, and compliance monitoring
 */

interface MetricPoint {
  timestamp: string;
  name: string;
  value: number;
  labels?: Record<string, string>;
}

interface HealthStatus {
  service: string;
  status: 'UP' | 'DOWN' | 'DEGRADED';
  responseTime: number;
  checkedAt: string;
}

class MonitoringService {
  private metrics: MetricPoint[] = [];
  private healthChecks: HealthStatus[] = [];

  /**
   * Record performance metric
   */
  recordMetric(
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    this.metrics.push({
      timestamp: new Date().toISOString(),
      name,
      value,
      labels
    });

    // Keep only last 10000 metrics in memory
    if (this.metrics.length > 10000) {
      this.metrics = this.metrics.slice(-10000);
    }
  }

  /**
   * Record request latency
   */
  recordRequestLatency(endpoint: string, latencyMs: number): void {
    this.recordMetric('request_latency_ms', latencyMs, { endpoint });

    // Alert if latency is abnormally high (>1s for normal requests)
    if (latencyMs > 1000 && !endpoint.includes('/api/transcription')) {
      this.recordMetric('latency_alert', 1, { endpoint });
    }
  }

  /**
   * Record error
   */
  recordError(errorType: string, endpoint?: string): void {
    this.recordMetric('error_count', 1, { errorType, endpoint });
  }

  /**
   * Record database query performance
   */
  recordQueryPerformance(query: string, durationMs: number): void {
    this.recordMetric('db_query_duration_ms', durationMs, {
      query: this.sanitizeQuery(query)
    });

    // Alert on slow queries (>500ms)
    if (durationMs > 500) {
      this.recordMetric('slow_query_alert', 1, {
        query: this.sanitizeQuery(query)
      });
    }
  }

  /**
   * Record cache hit/miss
   */
  recordCacheEvent(cacheKey: string, hit: boolean): void {
    this.recordMetric('cache_' + (hit ? 'hit' : 'miss'), 1, { cacheKey });
  }

  /**
   * Record authentication event
   */
  recordAuthEvent(
    eventType: 'login' | 'logout' | 'failed_login' | 'token_refresh',
    userId?: string
  ): void {
    this.recordMetric('auth_' + eventType, 1, { userId });
  }

  /**
   * Record security event
   */
  recordSecurityEvent(eventType: string, severity: string): void {
    this.recordMetric('security_' + eventType, 1, { severity });
  }

  /**
   * Record API quota usage
   */
  recordQuotaUsage(service: string, used: number, limit: number): void {
    const percentageUsed = (used / limit) * 100;
    this.recordMetric('quota_usage_percent', percentageUsed, { service });

    // Alert at 80% usage
    if (percentageUsed > 80) {
      this.recordMetric('quota_warning', 1, { service });
    }
  }

  /**
   * Record uptime/downtime
   */
  recordServiceHealth(status: HealthStatus): void {
    this.healthChecks.push(status);

    // Keep only last 100 health checks
    if (this.healthChecks.length > 100) {
      this.healthChecks = this.healthChecks.slice(-100);
    }

    this.recordMetric(
      `health_${status.service}`,
      status.status === 'UP' ? 1 : 0,
      { status: status.status }
    );
  }

  /**
   * Get metrics for export
   */
  getMetrics(timeWindow?: { start: Date; end: Date }): MetricPoint[] {
    if (!timeWindow) {
      return this.metrics;
    }

    return this.metrics.filter(m => {
      const metricTime = new Date(m.timestamp);
      return (
        metricTime >= timeWindow.start && metricTime <= timeWindow.end
      );
    });
  }

  /**
   * Get health status summary
   */
  getHealthStatus(): {
    overallStatus: 'UP' | 'DOWN' | 'DEGRADED';
    services: HealthStatus[];
  } {
    const services = this.healthChecks.slice(-this.getUniqueServices().length);

    const hasDown = services.some(s => s.status === 'DOWN');
    const hasDegraded = services.some(s => s.status === 'DEGRADED');

    return {
      overallStatus: hasDown ? 'DOWN' : hasDegraded ? 'DEGRADED' : 'UP',
      services
    };
  }

  /**
   * Get performance percentiles
   */
  getLatencyPercentiles(endpoint?: string): {
    p50: number;
    p95: number;
    p99: number;
  } {
    let latencies = this.metrics
      .filter(m => m.name === 'request_latency_ms')
      .map(m => m.value);

    if (endpoint) {
      latencies = latencies.filter(
        (_, i) =>
          this.metrics[this.metrics.findIndex(m => m.value === latencies[i])]
            ?.labels?.endpoint === endpoint
      );
    }

    latencies.sort((a, b) => a - b);

    return {
      p50: latencies[Math.floor(latencies.length * 0.5)] || 0,
      p95: latencies[Math.floor(latencies.length * 0.95)] || 0,
      p99: latencies[Math.floor(latencies.length * 0.99)] || 0
    };
  }

  /**
   * Get error rate
   */
  getErrorRate(timeWindowMinutes: number = 5): number {
    const since = new Date(Date.now() - timeWindowMinutes * 60000);

    const totalRequests = this.metrics.filter(
      m => m.name === 'request_latency_ms' && new Date(m.timestamp) >= since
    ).length;

    const errors = this.metrics.filter(
      m => m.name === 'error_count' && new Date(m.timestamp) >= since
    ).length;

    return totalRequests > 0 ? (errors / totalRequests) * 100 : 0;
  }

  /**
   * Sanitize query for logging (remove sensitive values)
   */
  private sanitizeQuery(query: string): string {
    // Remove parameter values
    return query.replace(/\$\d+/g, '?');
  }

  /**
   * Get unique services from health checks
   */
  private getUniqueServices(): string[] {
    const seen = new Set<string>();
    this.healthChecks.forEach(h => seen.add(h.service));
    return Array.from(seen);
  }

  /**
   * Export metrics for external monitoring system
   */
  async exportMetrics(): Promise<void> {
    // TODO: Send to monitoring service (Datadog, Prometheus, etc.)
    // Example:
    // await fetch('https://api.datadoghq.com/api/v2/timeseries', {
    //   method: 'POST',
    //   headers: { 'DD-API-KEY': process.env.DATADOG_API_KEY },
    //   body: JSON.stringify({ series: this.metrics })
    // });
  }
}

// Singleton instance
export const monitoringService = new MonitoringService();

/**
 * Middleware to automatically track request metrics
 */
export function withMetrics(handler: Function) {
  return async (request: Request, ...args: any[]) => {
    const start = Date.now();
    const pathname = new URL(request.url).pathname;

    try {
      const response = await handler(request, ...args);
      const duration = Date.now() - start;

      monitoringService.recordRequestLatency(pathname, duration);

      return response;
    } catch (error) {
      const duration = Date.now() - start;
      monitoringService.recordRequestLatency(pathname, duration);
      monitoringService.recordError(
        error instanceof Error ? error.constructor.name : 'Unknown',
        pathname
      );
      throw error;
    }
  };
}
