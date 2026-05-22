/**
 * Circuit Breaker Pattern
 * Phase 13.5: Provider resilience and automatic failover
 * Prevents cascading failures when AI providers are down
 */

export enum CircuitState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Failing, reject requests
  HALF_OPEN = 'half-open', // Testing recovery
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number; // # of failures before opening (default: 5)
  successThreshold: number; // # of successes in half-open to close (default: 2)
  timeout: number; // ms to wait before trying again (default: 30000)
  resetTimeout: number; // ms to wait in half-open state (default: 60000)
  onStateChange?: (state: CircuitState) => void;
}

interface CircuitBreakerMetrics {
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  successRate: number;
}

/**
 * Circuit Breaker for managing provider health
 * Prevents hitting providers that are experiencing issues
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private stateChangeTime: number = Date.now();

  private totalRequests: number = 0;
  private totalFailures: number = 0;

  private config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      name: config.name,
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 2,
      timeout: config.timeout || 30000,
      resetTimeout: config.resetTimeout || 60000,
      onStateChange: config.onStateChange || (() => {}),
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit should transition
    this.checkStateTransition();

    // If open, reject immediately
    if (this.state === CircuitState.OPEN) {
      throw new Error(
        `Circuit breaker for "${this.config.name}" is OPEN. Provider is unavailable.`
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Record successful execution
   */
  private recordSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.failureCount = 0;

    // If in half-open state, increment success counter
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      // Close circuit if threshold reached
      if (this.successCount >= this.config.successThreshold) {
        this.setState(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Record failed execution
   */
  private recordFailure(): void {
    this.lastFailureTime = Date.now();
    this.totalFailures++;
    this.failureCount++;
    this.successCount = 0; // Reset success counter

    // Open circuit if threshold reached
    if (this.failureCount >= this.config.failureThreshold) {
      this.setState(CircuitState.OPEN);
    }
  }

  /**
   * Check if state should transition (e.g., half-open to closed/open)
   */
  private checkStateTransition(): void {
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);

      // Transition to half-open after timeout
      if (timeSinceLastFailure >= this.config.resetTimeout) {
        this.setState(CircuitState.HALF_OPEN);
        this.successCount = 0;
      }
    }
  }

  /**
   * Manually set circuit state
   */
  private setState(newState: CircuitState): void {
    if (newState !== this.state) {
      const oldState = this.state;
      this.state = newState;
      this.stateChangeTime = Date.now();

      console.log(
        `⚡ Circuit breaker "${this.config.name}" state change: ${oldState} → ${newState}`
      );

      this.config.onStateChange?.(newState);
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is healthy (closed)
   */
  isHealthy(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  /**
   * Get circuit metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const successRate =
      this.totalRequests > 0
        ? ((this.totalRequests - this.totalFailures) / this.totalRequests) * 100
        : 0;

    return {
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      successRate,
    };
  }

  /**
   * Reset circuit to closed state (manual reset)
   */
  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.setState(CircuitState.CLOSED);
    console.log(`🔄 Circuit breaker "${this.config.name}" manually reset`);
  }

  /**
   * Get human-readable status
   */
  getStatus(): string {
    const metrics = this.getMetrics();
    return (
      `Circuit: ${this.config.name} | State: ${this.state} | ` +
      `Success Rate: ${metrics.successRate.toFixed(1)}% | ` +
      `Requests: ${metrics.totalRequests}`
    );
  }
}

/**
 * Circuit breaker registry for managing multiple providers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Create or get breaker for provider
   */
  getBreaker(providerName: string): CircuitBreaker {
    if (!this.breakers.has(providerName)) {
      const breaker = new CircuitBreaker({
        name: providerName,
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000,
        resetTimeout: 60000,
      });

      this.breakers.set(providerName, breaker);
    }

    return this.breakers.get(providerName)!;
  }

  /**
   * Get all breaker metrics
   */
  getAllMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};

    this.breakers.forEach((breaker, name) => {
      metrics[name] = {
        state: breaker.getState(),
        ...breaker.getMetrics(),
      };
    });

    return metrics;
  }

  /**
   * Get health status of all providers
   */
  getHealthStatus(): Record<string, 'healthy' | 'degraded' | 'failing'> {
    const status: Record<string, 'healthy' | 'degraded' | 'failing'> = {};

    this.breakers.forEach((breaker, name) => {
      const state = breaker.getState();
      if (state === CircuitState.CLOSED) {
        status[name] = 'healthy';
      } else if (state === CircuitState.HALF_OPEN) {
        status[name] = 'degraded';
      } else {
        status[name] = 'failing';
      }
    });

    return status;
  }

  /**
   * Print status of all breakers
   */
  printStatus(): void {
    console.log('\n📊 Circuit Breaker Status:');
    this.breakers.forEach((breaker, name) => {
      console.log(`  ${breaker.getStatus()}`);
    });
    console.log('');
  }
}

// Global registry instance
let registryInstance: CircuitBreakerRegistry | null = null;

/**
 * Get global circuit breaker registry
 */
export function getCircuitBreakerRegistry(): CircuitBreakerRegistry {
  if (!registryInstance) {
    registryInstance = new CircuitBreakerRegistry();
  }
  return registryInstance;
}
