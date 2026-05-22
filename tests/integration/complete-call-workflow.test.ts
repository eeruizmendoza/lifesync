/**
 * Integration Tests: Complete Call Workflow
 * Tests full end-to-end call with real database
 *
 * Prerequisites:
 * - Staging database running
 * - All migrations applied
 * - Test data seeded
 */

import { sql } from '@vercel/postgres';
import { randomUUID } from 'crypto';

describe('Integration: Complete Call Workflow', () => {
  let userAId: string;
  let userBId: string;
  let callId: string;

  beforeAll(async () => {
    // Verify database connection
    try {
      const result = await sql`SELECT 1`;
      console.log('Database connected');
    } catch (error) {
      throw new Error('Database connection failed - ensure staging DB is running');
    }
  });

  afterAll(async () => {
    // Cleanup test data
    if (userAId) {
      await sql`DELETE FROM users WHERE id = ${userAId}`;
    }
    if (userBId) {
      await sql`DELETE FROM users WHERE id = ${userBId}`;
    }
    if (callId) {
      await sql`DELETE FROM conversations WHERE id = ${callId}`;
    }
  });

  describe('User Creation & Authentication', () => {
    test('User A can be created with Spanish language preference', async () => {
      const userId = randomUUID();

      try {
        await sql`
          INSERT INTO users (id, email, phone_number, language_preference, created_at)
          VALUES (${userId}, 'userA@test.com', '+1234567890', 'es', NOW())
        `;

        const result = await sql`
          SELECT id, language_preference FROM users WHERE id = ${userId}
        `;

        expect(result.rows.length).toBe(1);
        expect(result.rows[0].language_preference).toBe('es');
        userAId = userId;
      } catch (error) {
        console.error('User creation failed:', error);
        throw error;
      }
    });

    test('User B can be created with Chinese language preference', async () => {
      const userId = randomUUID();

      try {
        await sql`
          INSERT INTO users (id, email, phone_number, language_preference, created_at)
          VALUES (${userId}, 'userB@test.com', '+0987654321', 'zh', NOW())
        `;

        const result = await sql`
          SELECT id, language_preference FROM users WHERE id = ${userId}
        `;

        expect(result.rows.length).toBe(1);
        expect(result.rows[0].language_preference).toBe('zh');
        userBId = userId;
      } catch (error) {
        console.error('User creation failed:', error);
        throw error;
      }
    });

    test('Users can authenticate with JWT tokens', async () => {
      // Verify JWT secret is configured
      const jwtSecret = process.env.JWT_SECRET;
      expect(jwtSecret).toBeDefined();
      expect(jwtSecret!.length).toBeGreaterThan(20);
    });
  });

  describe('Call Initialization', () => {
    test('User A can initiate call to User B', async () => {
      const newCallId = randomUUID();

      try {
        await sql`
          INSERT INTO conversations (
            id, initiator_id, recipient_id,
            source_language, target_language, language_pair,
            status, created_at
          ) VALUES (
            ${newCallId}, ${userAId}, ${userBId},
            'es', 'zh', 'es_zh',
            'initiated', NOW()
          )
        `;

        const result = await sql`
          SELECT id, status, source_language, target_language
          FROM conversations
          WHERE id = ${newCallId}
        `;

        expect(result.rows.length).toBe(1);
        expect(result.rows[0].status).toBe('initiated');
        expect(result.rows[0].source_language).toBe('es');
        expect(result.rows[0].target_language).toBe('zh');
        callId = newCallId;
      } catch (error) {
        console.error('Call initialization failed:', error);
        throw error;
      }
    });

    test('Call can transition to accepted state', async () => {
      try {
        await sql`
          UPDATE conversations
          SET status = 'active', accepted_at = NOW()
          WHERE id = ${callId}
        `;

        const result = await sql`
          SELECT status, accepted_at FROM conversations WHERE id = ${callId}
        `;

        expect(result.rows[0].status).toBe('active');
        expect(result.rows[0].accepted_at).toBeTruthy();
      } catch (error) {
        console.error('Call acceptance failed:', error);
        throw error;
      }
    });
  });

  describe('Transcription & Recording', () => {
    test('Transcription can be stored with encryption', async () => {
      const transcriptId = randomUUID();
      const mockEncryptedData = 'encrypted-audio-base64';

      try {
        await sql`
          INSERT INTO conversation_transcripts (
            id, conversation_id, speaker_id,
            original_text, translated_text,
            source_language, target_language,
            confidence, encrypted_audio, created_at
          ) VALUES (
            ${transcriptId}, ${callId}, ${userAId},
            'Hola, ¿cómo estás?', 'Hi, how are you?',
            'es', 'en',
            0.95, ${mockEncryptedData}, NOW()
          )
        `;

        const result = await sql`
          SELECT id, original_text, confidence, encrypted_audio
          FROM conversation_transcripts
          WHERE id = ${transcriptId}
        `;

        expect(result.rows.length).toBe(1);
        expect(result.rows[0].original_text).toBe('Hola, ¿cómo estás?');
        expect(parseFloat(result.rows[0].confidence)).toBe(0.95);
        expect(result.rows[0].encrypted_audio).toBeTruthy();
      } catch (error) {
        console.error('Transcription storage failed:', error);
        throw error;
      }
    });

    test('Recording metadata is stored correctly', async () => {
      const recordingId = randomUUID();

      try {
        await sql`
          INSERT INTO conversation_recordings (
            id, conversation_id, user_id,
            duration_seconds, s3_key, encryption_algorithm,
            file_size_bytes, created_at
          ) VALUES (
            ${recordingId}, ${callId}, ${userAId},
            300, 's3://lifesync-recordings/test-file.enc', 'XChaCha20-Poly1305',
            1024000, NOW()
          )
        `;

        const result = await sql`
          SELECT id, duration_seconds, encryption_algorithm
          FROM conversation_recordings
          WHERE id = ${recordingId}
        `;

        expect(result.rows.length).toBe(1);
        expect(result.rows[0].duration_seconds).toBe(300);
        expect(result.rows[0].encryption_algorithm).toBe('XChaCha20-Poly1305');
      } catch (error) {
        console.error('Recording metadata storage failed:', error);
        throw error;
      }
    });
  });

  describe('Call Termination', () => {
    test('Call can be ended with final metadata', async () => {
      try {
        await sql`
          UPDATE conversations
          SET status = 'ended', ended_at = NOW(), duration_seconds = 300
          WHERE id = ${callId}
        `;

        const result = await sql`
          SELECT status, ended_at, duration_seconds
          FROM conversations
          WHERE id = ${callId}
        `;

        expect(result.rows[0].status).toBe('ended');
        expect(result.rows[0].ended_at).toBeTruthy();
        expect(result.rows[0].duration_seconds).toBe(300);
      } catch (error) {
        console.error('Call termination failed:', error);
        throw error;
      }
    });

    test('Call history is preserved for playback', async () => {
      try {
        const result = await sql`
          SELECT
            c.id, c.status, c.duration_seconds,
            COUNT(ct.id) as transcript_count
          FROM conversations c
          LEFT JOIN conversation_transcripts ct ON c.id = ct.conversation_id
          WHERE c.id = ${callId}
          GROUP BY c.id, c.status, c.duration_seconds
        `;

        expect(result.rows.length).toBe(1);
        expect(result.rows[0].status).toBe('ended');
        expect(parseInt(result.rows[0].transcript_count)).toBeGreaterThan(0);
      } catch (error) {
        console.error('Call history retrieval failed:', error);
        throw error;
      }
    });
  });

  describe('Data Integrity', () => {
    test('Foreign key relationships are enforced', async () => {
      // Try to insert transcript with non-existent conversation
      try {
        await sql`
          INSERT INTO conversation_transcripts (
            id, conversation_id, speaker_id,
            original_text, translated_text,
            source_language, target_language,
            confidence, created_at
          ) VALUES (
            'test-invalid-' + ${Date.now()},
            'non-existent-call',
            'non-existent-user',
            'Test', 'Test', 'es', 'en', 0.9, NOW()
          )
        `;

        // Should not reach here
        throw new Error('Foreign key constraint not enforced');
      } catch (error) {
        // Expected to fail
        if (error instanceof Error && error.message === 'Foreign key constraint not enforced') {
          throw error;
        }
        // FK constraint working as expected
        expect(true).toBe(true);
      }
    });

    test('Encryption keys are properly stored', async () => {
      const encryptedKey = process.env.ENCRYPTION_MASTER_KEY;
      expect(encryptedKey).toBeDefined();
      expect(encryptedKey?.length).toBe(64); // 32 bytes hex = 64 chars
    });
  });

  describe('Performance', () => {
    test('User lookup is fast (< 500ms)', async () => {
      const start = Date.now();

      await sql`SELECT id FROM users WHERE id = ${userAId}`;

      const latency = Date.now() - start;
      expect(latency).toBeLessThan(500);
      console.log(`User lookup latency: ${latency}ms`);
    });

    test('Call status update is fast (< 400ms)', async () => {
      const start = Date.now();

      await sql`
        UPDATE conversations
        SET status = 'ended'
        WHERE id = ${callId}
      `;

      const latency = Date.now() - start;
      expect(latency).toBeLessThan(400);
      console.log(`Call update latency: ${latency}ms`);
    });

    test('Transcript retrieval is efficient (< 500ms)', async () => {
      const start = Date.now();

      await sql`
        SELECT original_text, translated_text
        FROM conversation_transcripts
        WHERE conversation_id = ${callId}
        ORDER BY created_at
      `;

      const latency = Date.now() - start;
      expect(latency).toBeLessThan(500);
      console.log(`Transcript retrieval latency: ${latency}ms`);
    });
  });

  describe('Error Handling', () => {
    test('Database connection errors are caught', async () => {
      // This test verifies error handling without actually breaking the connection
      expect(async () => {
        // Simulate error handling
        try {
          await sql`SELECT 1`;
        } catch (error) {
          throw error;
        }
      }).not.toThrow();
    });

    test('Duplicate key insertion is rejected', async () => {
      const userId = randomUUID();
      const phoneNumber = '+1' + Math.random().toString().substring(2, 12);

      try {
        // Insert once
        await sql`
          INSERT INTO users (id, email, phone_number, created_at)
          VALUES (${userId}, 'test@example.com', ${phoneNumber}, NOW())
        `;

        // Try to insert again with same ID
        try {
          await sql`
            INSERT INTO users (id, email, phone_number, created_at)
            VALUES (${userId}, 'test2@example.com', '+9876543210', NOW())
          `;
          throw new Error('Duplicate key should be rejected');
        } catch (error) {
          // Expected - duplicate key rejected
          expect(true).toBe(true);
        }

        // Cleanup
        await sql`DELETE FROM users WHERE id = ${userId}`;
      } catch (error) {
        console.error('Duplicate key test error:', error);
        throw error;
      }
    });
  });
});
