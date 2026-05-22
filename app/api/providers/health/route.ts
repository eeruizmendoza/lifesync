/**
 * Provider Health Status API
 * GET /api/providers/health
 * Returns current health status of all AI providers
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getProviderHealthMonitor } from '@/lib/provider-health-monitor';
import { getCircuitBreakerRegistry } from '@/lib/circuit-breaker';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication (optional for health checks, but recommended)
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      const user = await verifyAuth(authHeader);
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const monitor = getProviderHealthMonitor();
    const breakerRegistry = getCircuitBreakerRegistry();

    // Get health summary
    const healthSummary = monitor.getHealthSummary();
    const allMetrics = monitor.getMetrics();
    const circuitMetrics = breakerRegistry.getAllMetrics();

    // Get recent alerts
    const recentAlerts = monitor.getAlerts(10);

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        summary: {
          healthy: healthSummary.healthy,
          degraded: healthSummary.degraded,
          failing: healthSummary.failing,
          totalProviders: Array.from(allMetrics.keys()).length,
        },
        providers: Object.fromEntries(
          Array.from(allMetrics.entries()).map(([name, metrics]) => [
            name,
            {
              state: metrics.state,
              healthStatus: healthSummary.healthy.includes(name)
                ? 'healthy'
                : healthSummary.degraded.includes(name)
                  ? 'degraded'
                  : 'failing',
              successRate: `${metrics.successRate.toFixed(1)}%`,
              totalRequests: metrics.totalRequests,
              totalFailures: metrics.totalFailures,
              avgResponseTimeMs: metrics.avgResponseTimeMs.toFixed(0),
              lastCheckTime: new Date(metrics.lastCheckTime).toISOString(),
            },
          ])
        ),
        circuits: circuitMetrics,
        recentAlerts: recentAlerts.map((alert) => ({
          providerId: alert.providerId,
          severity: alert.severity,
          message: alert.message,
          timestamp: new Date(alert.timestamp).toISOString(),
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to get provider health:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get provider health',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/providers/health
 * Manually trigger health check
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuth(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins to trigger health checks
    // TODO: Add role checking

    const monitor = getProviderHealthMonitor();
    monitor.checkAllProviders();

    return NextResponse.json(
      {
        message: 'Health check triggered',
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to trigger health check:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to trigger health check',
      },
      { status: 500 }
    );
  }
}
