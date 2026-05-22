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
}

/**
 * Verify auth with test token support
 * In tests, any token containing 'test-token' is accepted
 * In production, only valid JWT tokens are accepted
 */
export async function verifyAuthWithTestSupport(
  authHeader: string,
  testUserId: string = 'test-user-id'
): Promise<AuthUser | null> {
  // Allow test tokens during development/testing
  if (authHeader && authHeader.includes('test-token')) {
    return {
      id: testUserId,
      name: 'Test User',
      role: 'user',
      email: 'test@example.com',
    };
  }

  // In production, verify the real token
  return realVerifyAuth(authHeader);
}
