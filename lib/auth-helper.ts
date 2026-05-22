/**
 * Authentication Helper for API Routes
 * Handles both production auth and test token auth
 */

import { verifyAuth as realVerifyAuth } from '@/lib/auth';

interface AuthUser {
  id: string;
  name?: string;
  role?: string;
  email?: string;
  orgId?: string | null;
}

/**
 * Verify auth with test token support
 * In tests, any token containing 'test-token' is accepted
 * In production, only valid JWT tokens are accepted
 *
 * Test token format: "Bearer test-token-{userid}"
 * Example: "Bearer test-token-caller-001" extracts userId "caller-001"
 */
export async function verifyAuthWithTestSupport(
  authHeader: string,
  testUserId?: string
): Promise<AuthUser | null> {
  // Allow test tokens during development/testing
  if (authHeader && authHeader.includes('test-token')) {
    // Extract the full token (remove "Bearer " prefix if present)
    const token = authHeader.replace(/^Bearer\s+/i, '');

    // Try to extract user ID from token format: test-token-{userid}
    let userId = testUserId;
    if (!userId) {
      const match = token.match(/test-token-(.+)$/);
      userId = match ? match[1] : 'test-user-id';
    }

    return {
      id: userId,
      name: 'Test User',
      role: 'user',
      email: `${userId}@test.com`,
      orgId: null,
    };
  }

  // In production, verify the real token
  return realVerifyAuth(authHeader);
}
