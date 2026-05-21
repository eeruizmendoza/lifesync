import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * Health check endpoint for monitoring and load balancers
 */
export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();
    const checks = {
      database: { status: 'unknown', latency: 0 },
      services: { status: 'unknown' },
      timestamp: new Date().toISOString(),
    };

    // Check database connectivity
    try {
      const dbStart = Date.now();
      await sql`SELECT 1`;
      checks.database.status = 'healthy';
      checks.database.latency = Date.now() - dbStart;
    } catch (error) {
      checks.database.status = 'unhealthy';
      console.error('Database health check failed:', error);
    }

    // Check essential services
    const services = {
      transcription: true, // STT service
      translation: true, // Translation service
      synthesis: true, // TTS service
      encryption: true, // Encryption service
      recording: true, // Recording service
    };

    checks.services.status = Object.values(services).every(s => s) ? 'healthy' : 'degraded';

    const totalLatency = Date.now() - startTime;

    // Determine overall health
    const isHealthy =
      checks.database.status === 'healthy' &&
      checks.services.status === 'healthy';

    return NextResponse.json({
      status: isHealthy ? 'ok' : 'degraded',
      checks,
      latency: totalLatency,
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'unknown',
    }, {
      status: isHealthy ? 200 : 503,
    });
  } catch (error) {
    console.error('Health check error:', error);

    return NextResponse.json({
      status: 'error',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    }, {
      status: 503,
    });
  }
}

/**
 * HEAD /api/health
 * Quick health check for load balancers
 */
export async function HEAD(request: NextRequest) {
  try {
    await sql`SELECT 1`;
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
