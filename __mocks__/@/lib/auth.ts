/**
 * Manual mock for auth module
 * Used during testing to allow fake tokens
 */

export const verifyAuth = jest.fn((token: string) => {
  if (!token || token === 'invalid') {
    return null;
  }

  // Return mock user for any valid token during tests
  return {
    id: 'test-user-id',
    name: 'Test User',
    role: 'user',
    email: 'test@example.com',
  };
});

export const generateToken = jest.fn((user) => {
  return `token-for-${user.id}`;
});

export const refreshToken = jest.fn((token: string) => {
  return `refreshed-${token}`;
});

export const revokeToken = jest.fn((token: string) => {
  return true;
});
