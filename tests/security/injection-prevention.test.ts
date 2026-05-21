/**
 * Security Tests: SQL/XSS/CSRF Injection Prevention
 * 
 * Verifies:
 * - SQL injection is prevented
 * - XSS attacks are blocked
 * - CSRF tokens validated
 */

describe('Security: Injection Prevention', () => {
  test('SQL injection attempt is blocked', async () => {
    const maliciousInput = "' OR '1'='1";

    const response = await fetch('/api/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({
        email: `test${maliciousInput}@example.com`,
      }),
    });

    // Should either fail or sanitize the input
    expect(response.status).not.toBe(200);
  });

  test('SQL injection in contact search is blocked', async () => {
    const maliciousQuery = "'; DROP TABLE users; --";

    const response = await fetch('/api/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        query: maliciousQuery,
      }),
    });

    // Query should be treated as literal string
    expect(response.status).not.toBe(200);
  });

  test('XSS payload in transcription is sanitized', async () => {
    const xssPayload = '<img src=x onerror="alert(\'XSS\')">';

    const response = await fetch('/api/transcriptions/process-recording', {
      method: 'POST',
      body: JSON.stringify({
        transcribedText: xssPayload,
        language: 'en',
      }),
    });

    if (response.ok) {
      const data = await response.json();

      // XSS payload should be escaped or removed
      expect(data.text).not.toContain('onerror=');
      expect(data.text).not.toContain('alert');
    }
  });

  test('Script injection in translation text is blocked', async () => {
    const scriptPayload = '<script>alert("XSS")</script>';

    const response = await fetch('/api/translate/translate', {
      method: 'POST',
      body: JSON.stringify({
        text: scriptPayload,
        sourceLang: 'en',
        targetLang: 'es',
      }),
    });

    if (response.ok) {
      const data = await response.json();

      // Script tags should not be in response
      expect(data.text).not.toContain('<script>');
    }
  });

  test('CSRF token is required for state-changing requests', async () => {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      // No CSRF token provided
    });

    // Should require CSRF token
    expect(response.status).toBe(403);
  });

  test('Invalid CSRF token is rejected', async () => {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': 'invalid_token_12345',
      },
    });

    expect(response.status).toBe(403);
  });

  test('Authentication header injection is prevented', async () => {
    const maliciousHeader = 'Bearer valid_token\nX-Admin: true';

    const response = await fetch('/api/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': maliciousHeader,
      },
    });

    // Injection attempt should fail
    expect(response.status).not.toBe(200);
  });

  test('API endpoint is protected from unauthorized access', async () => {
    // Try to access without authentication
    const response = await fetch('/api/models/benchmark', {
      method: 'GET',
    });

    // Should require authentication
    expect(response.status).toBe(401);
  });

  test('Sensitive data not exposed in error messages', async () => {
    const response = await fetch('/api/database-query', {
      method: 'POST',
      body: JSON.stringify({ query: 'SELECT * FROM users' }),
    });

    const data = await response.json();

    // Error messages should not expose SQL or database details
    if (data.error) {
      expect(data.error).not.toContain('SQL');
      expect(data.error).not.toContain('table');
      expect(data.error).not.toContain('column');
    }
  });

  test('Rate limiting prevents brute force attacks', async () => {
    // Attempt many requests in short time
    const requests = Array.from({ length: 100 }, () =>
      fetch('/api/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      })
    );

    const responses = await Promise.all(requests);

    // Some requests should fail with rate limit
    const rateLimitedResponses = responses.filter(r => r.status === 429);
    expect(rateLimitedResponses.length).toBeGreaterThan(0);
  });

  test('Input validation prevents overflow attacks', async () => {
    // Send extremely large input
    const largeInput = 'a'.repeat(1000000); // 1MB string

    const response = await fetch('/api/translate/translate', {
      method: 'POST',
      body: JSON.stringify({
        text: largeInput,
        sourceLang: 'en',
        targetLang: 'es',
      }),
    });

    // Should reject or handle gracefully
    expect(response.status).not.toBe(200);
  });
});
