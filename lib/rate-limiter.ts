/**
 * lib/rate-limiter.ts
 * Sliding window rate limiter backed by Neon PostgreSQL.
 *
 * Usage:
 *   const result = await rateLimit({ key: `ip:${ip}:send-code`, max: 5, windowSeconds: 60 });
 *   if (!result.allowed) {
 *     return NextResponse.json(
 *       { error: 'Too many requests', retryAfter: result.retryAfter },
 *       { status: 429, headers: { 'Retry-After': String(result.retryAfter) } }
 *     );
 *   }
 *
 * Key conventions:
 *   ip:<ip-address>:<action>   — anonymous rate limit by IP
 *   uid:<userId>:<action>      — authenticated rate limit by user
 *   org:<orgId>:<action>       — org-level rate limit
 */

import { neon } from '@neondatabase/serverless';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  max: number;
  remaining: number;
  retryAfter: number; // seconds until window resets (only meaningful when !allowed)
}

export interface RateLimitOptions {
  /** Unique identifier for this limit bucket (e.g. "ip:1.2.3.4:send-code") */
  key: string;
  /** Maximum requests allowed per window */
  max: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/**
 * Check and increment rate limit counter.
 * Uses a fixed-window approach: truncates the current time to the window size
 * and upserts a counter for that window.
 *
 * Non-blocking on database errors — if the DB call fails, returns allowed=true
 * (fail open) so users are never blocked by infrastructure issues.
 */
export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const { key, max, windowSeconds } = opts;

  // Calculate the start of the current window (fixed-window)
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Upsert: increment counter for this key+window
    const rows = await sql`
      INSERT INTO rate_limit_log (key, window_start, count, updated_at)
      VALUES (${key}, ${windowStart.toISOString()}, 1, NOW())
      ON CONFLICT (key, window_start)
        DO UPDATE SET
          count = rate_limit_log.count + 1,
          updated_at = NOW()
      RETURNING count
    `;

    const count = Number(rows[0]?.count ?? 1);
    const allowed = count <= max;
    const remaining = Math.max(0, max - count);

    // Calculate time until window resets
    const windowEnd = windowStart.getTime() + windowMs;
    const retryAfter = Math.ceil((windowEnd - now) / 1000);

    return { allowed, count, max, remaining, retryAfter };
  } catch {
    // Fail open — don't block users due to DB issues
    return { allowed: true, count: 0, max, remaining: max, retryAfter: 0 };
  }
}

/**
 * Extract client IP from Next.js request headers.
 * Checks x-forwarded-for (Vercel) then x-real-ip then falls back to 'unknown'.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Predefined rate limit presets for common endpoints.
 */
export const RATE_LIMITS = {
  /** SMS verification code: 5 per minute per IP */
  sendCode: { max: 5, windowSeconds: 60 },

  /** Login/verify: 10 per 5 minutes per IP */
  verifyCode: { max: 10, windowSeconds: 300 },

  /** Call initiation: 20 per minute per user */
  callInitiate: { max: 20, windowSeconds: 60 },

  /** API key access: 100 per minute per key */
  apiKey: { max: 100, windowSeconds: 60 },

  /** General API: 200 per minute per user */
  general: { max: 200, windowSeconds: 60 },

  /** Webhook delivery test: 5 per minute per endpoint */
  webhookTest: { max: 5, windowSeconds: 60 },

  /** Search: 30 per minute per user */
  search: { max: 30, windowSeconds: 60 },
} as const;
