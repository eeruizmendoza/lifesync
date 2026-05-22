/**
 * Provider Health Monitor
 * Phase 13.5: Real-time monitoring of AI provider health
 * Tracks metrics and alerts on degradation
 */

import { getCircuitBreakerRegistry } from '@/lib/circuit-breaker';
import { getProviderFailoverManager } from '@/lib/provider-failover';

export interface ProviderMetrics {
  name: string;
  state: string;
  successRate: number;
  totalRequests: number;
  totalFailures: number;
  avgResponseTimeMs: number;
  lastCheckTime: number;
  lastError?: string;
}

export interface HealthAlert {
  providerId: string;
  severity: 'warning' | 'critical';
  message: string;
  timestamp: number;
  metrics: Partial<ProviderMetrics>;
}

/**
 * Provider health monitor
 */
export class ProviderHealthMonitor {
  private metrics: Map<string, ProviderMetrics> = new Map();
  private alerts: HealthAlert[] = [];
  private alertCallbacks: Array<(alert: HealthAlert) => void> = [];
  private checkInterval: NodeJS.Timer | null = null;

  private breakerRegistry = getCircuitBreakerRegistry();
  private failoverManager = getProviderFailoverManager();

  private responseTimeMap: Map<string, number[]> = new Map();

  constructor() {
    this.initializeMetrics();
  }

  /**
   * Initialize metrics for all known providers
   */
  private initializeMetrics(): void {
    const chains = this.failoverManager.getChains();
    const allProviders = new Set<string>();

    chains.forEach((chain) => {
      chain.providers.forEach((provider) => {
        allProviders.add(provider);
      });
    });

    allProviders.forEach((provider) => {
      this.metrics.set(provider, {
        name: provider,
        state: 'unknown',
        successRate: 0,
        totalRequests: 0,
        totalFailures: 0,
        avgResponseTimeMs: 0,
        lastCheckTime: 0,
      });

      this.responseTimeMap.set(provider, []);
    });
  }

  /**
   * Record response time for a provider
   */
  recordResponseTime(providerName: string, responseTimeMs: number): void {
    const times = this.responseTimeMap.get(providerName) || [];
    times.push(responseTimeMs);

    // Keep only last 100 measurements
    if (times.length > 100) {
      times.shift();
    }

    this.responseTimeMap.set(providerName, times);

    // Update average
    const metrics = this.metrics.get(providerName);
    if (metrics && times.length > 0) {
      metrics.avgResponseTimeMs =
        times.reduce((a, b) => a + b, 0) / times.length;
    }
  }

  /**
   * Update provider metrics from circuit breaker
   */
  updateMetrics(providerName: string): void {
    const breaker = this.breakerRegistry.getBreaker(providerName);
    const breakerMetrics = breaker.getMetrics();

    const metrics: ProviderMetrics = {
      name: providerName,
      state: breaker.getState(),
      successRate: breakerMetrics.successRate,
      totalRequests: breakerMetrics.totalRequests,
      totalFailures: breakerMetrics.totalFailures,
      avgResponseTimeMs: this.responseTimeMap.get(providerName)?.[0] || 0,
      lastCheckTime: Date.now(),
    };

    this.metrics.set(providerName, metrics);

    // Check for alerts
    this.evaluateAlerts(providerName, metrics);
  }

  /**
   * Evaluate if metrics warrant an alert
   */
  private evaluateAlerts(providerName: string, metrics: ProviderMetrics): void {
    const alerts: HealthAlert[] = [];

    // Critical: Circuit is open
    if (metrics.state === 'open') {
      alerts.push({
        providerId: providerName,
        severity: 'critical',
        message: `Provider ${providerName} circuit breaker is OPEN - provider is unavailable`,
        timestamp: Date.now(),
        metrics,
      });
    }

    // Warning: Low success rate
    if (metrics.successRate < 80 && metrics.totalRequests > 10) {
      alerts.push({
        providerId: providerName,
        severity: 'warning',
        message: `Provider ${providerName} success rate dropped to ${metrics.successRate.toFixed(1)}%`,
        timestamp: Date.now(),
        metrics,
      });
    }

    // Warning: High response time
    if (metrics.avgResponseTimeMs > 5000) {
      alerts.push({
        providerId: providerName,
        severity: 'warning',
        message: `Provider ${providerName} response time is high: ${metrics.avgResponseTimeMs.toFixed(0)}ms`,
        timestamp: Date.now(),
        metrics,
      });
    }

    // Warning: Half-open (degraded)
    if (metrics.state === 'half-open') {
      alerts.push({
        providerId: providerName,
        severity: 'warning',
        message: `Provider ${providerName} is in degraded state (half-open)`,
        timestamp: Date.now(),
        metrics,
      });
    }

    // Fire alerts
    alerts.forEach((alert) => {
      this.fireAlert(alert);
    });
  }

  /**
   * Fire an alert
   */
  private fireAlert(alert: HealthAlert): void {
    this.alerts.push(alert);

    // Keep only last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts.shift();
    }

    // Call registered callbacks
    this.alertCallbacks.forEach((callback) => {
      try {
        callback(alert);
      } catch (error) {
        console.error('Error in alert callback:', error);
      }
    });

    // Log alert
    const emoji = alert.severity === 'critical' ? '🚨' : '⚠️ ';
    console.log(`${emoji} [${alert.providerId}] ${alert.message}`);
  }

  /**
   * Register alert callback
   */
  onAlert(callback: (alert: HealthAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Start periodic health checks
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      console.warn('Health monitoring already running');
      return;
    }

    console.log(`🏥 Starting provider health monitoring (interval: ${intervalMs}ms)`);

    this.checkInterval = setInterval(() => {
      this.checkAllProviders();
    }, intervalMs);

    // Run initial check immediately
    this.checkAllProviders();
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('Stopped provider health monitoring');
    }
  }

  /**
   * Check health of all providers
   */
  checkAllProviders(): void {
    const chains = this.failoverManager.getChains();
    const allProviders = new Set<string>();

    chains.forEach((chain) => {
      chain.providers.forEach((provider) => {
        allProviders.add(provider);
        this.updateMetrics(provider);
      });
    });

    console.log(`✓ Health check completed (${allProviders.size} providers)`);
  }

  /**
   * Get metrics for all providers
   */
  getMetrics(): Map<string, ProviderMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Get metrics for a specific provider
   */
  getProviderMetrics(providerName: string): ProviderMetrics | null {
    return this.metrics.get(providerName) || null;
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit: number = 50): HealthAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Get alerts for a specific provider
   */
  getProviderAlerts(
    providerName: string,
    limit: number = 50
  ): HealthAlert[] {
    return this.alerts
      .filter((a) => a.providerId === providerName)
      .slice(-limit);
  }

  /**
   * Get health summary
   */
  getHealthSummary(): {
    healthy: string[];
    degraded: string[];
    failing: string[];
  } {
    const summary = {
      healthy: [] as string[],
      degraded: [] as string[],
      failing: [] as string[],
    };

    this.metrics.forEach((metrics, name) => {
      if (metrics.state === 'closed' && metrics.successRate > 90) {
        summary.healthy.push(name);
      } else if (metrics.state === 'half-open' || metrics.successRate < 90) {
        summary.degraded.push(name);
      } else if (metrics.state === 'open') {
        summary.failing.push(name);
      }
    });

    return summary;
  }

  /**
   * Print health report
   */
  printHealthReport(): void {
    console.log('\n📊 Provider Health Report');
    console.log('═'.repeat(60));

    const summary = this.getHealthSummary();

    if (summary.healthy.length > 0) {
      console.log(`✓ Healthy (${summary.healthy.length}): ${summary.healthy.join(', ')}`);
    }

    if (summary.degraded.length > 0) {
      console.log(`⚠️  Degraded (${summary.degraded.length}): ${summary.degraded.join(', ')}`);
    }

    if (summary.failing.length > 0) {
      console.log(`🚨 Failing (${summary.failing.length}): ${summary.failing.join(', ')}`);
    }

    console.log('');

    // Print detailed metrics
    this.metrics.forEach((metrics) => {
      console.log(
        `  ${metrics.name.padEnd(20)} | ` +
          `State: ${metrics.state.padEnd(10)} | ` +
          `Success Rate: ${metrics.successRate.toFixed(1).padStart(5)}% | ` +
          `Avg Time: ${metrics.avgResponseTimeMs.toFixed(0).padStart(5)}ms`
      );
    });

    console.log('═'.repeat(60) + '\n');
  }
}

// Global instance
let monitorInstance: ProviderHealthMonitor | null = null;

/**
 * Get global provider health monitor
 */
export function getProviderHealthMonitor(): ProviderHealthMonitor {
  if (!monitorInstance) {
    monitorInstance = new ProviderHealthMonitor();
  }
  return monitorInstance;
}
