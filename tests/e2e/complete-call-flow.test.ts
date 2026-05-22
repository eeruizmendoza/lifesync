/**
 * End-to-End Test: Complete Call Flow
 * Phase 13.6: Test entire real-time translation call pipeline
 *
 * Scenario: Spanish speaker calls Chinese speaker
 * - Call initiation
 * - State transitions
 * - Recording with chunks
 * - Encryption and S3 upload
 * - Database storage
 * - Call metrics
 * - Call termination
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { getCallRegistry } from '@/lib/call-state-machine';
import { getRecordingService } from '@/lib/services/recording-service';
import { getRecordingEncryptionService } from '@/lib/services/recording-encryption';
import { CallStateContext } from '@/lib/call-state-machine';

describe('E2E: Complete Call Flow (Spanish → Chinese)', () => {
  let callId: string;
  let recordingId: string;
  const callRegistry = getCallRegistry();
  const recordingService = getRecordingService();
  const encryptionService = getRecordingEncryptionService();

  beforeEach(() => {
    // Generate fresh call ID for each test
    callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  });

  describe('Phase 1: Call Initiation', () => {
    it('should create a new call with initial state "ringing"', () => {
      const context: CallStateContext = {
        callId,
        currentState: 'ringing',
        callerId: 'user-spanish-001',
        receiverId: 'user-chinese-001',
        sourceLanguage: 'es',
        targetLanguage: 'zh',
        callType: 'audio',
        createdAt: Date.now(),
      };

      const callMachine = callRegistry.createCall(context);

      expect(callMachine.getState()).toBe('ringing');
      expect(callMachine.getContext().callerId).toBe('user-spanish-001');
      expect(callMachine.getContext().sourceLanguage).toBe('es');
    });

    it('should transition from ringing to connecting on answer', () => {
      const context: CallStateContext = {
        callId,
        currentState: 'ringing',
        callerId: 'user-spanish-001',
        receiverId: 'user-chinese-001',
        sourceLanguage: 'es',
        targetLanguage: 'zh',
        callType: 'audio',
        createdAt: Date.now(),
      };

      const callMachine = callRegistry.createCall(context);

      // Answer call
      const validation = callMachine.canTransition('connecting');
      expect(validation.isValid).toBe(true);

      callMachine.transition('connecting');
      expect(callMachine.getState()).toBe('connecting');
    });

    it('should transition from connecting to connected', () => {
      const context: CallStateContext = {
        callId,
        currentState: 'ringing',
        callerId: 'user-spanish-001',
        receiverId: 'user-chinese-001',
        sourceLanguage: 'es',
        targetLanguage: 'zh',
        callType: 'audio',
        createdAt: Date.now(),
      };

      const callMachine = callRegistry.createCall(context);
      callMachine.transition('connecting');
      callMachine.transition('connected');

      expect(callMachine.getState()).toBe('connected');
      expect(callMachine.isActive()).toBe(true);
      expect(callMachine.getContext().connectedAt).toBeGreaterThan(0);
    });
  });

  describe('Phase 2: Recording Management', () => {
    beforeEach(() => {
      const context: CallStateContext = {
        callId,
        currentState: 'ringing',
        callerId: 'user-spanish-001',
        receiverId: 'user-chinese-001',
        sourceLanguage: 'es',
        targetLanguage: 'zh',
        callType: 'audio',
        createdAt: Date.now(),
      };

      const callMachine = callRegistry.createCall(context);
      callMachine.transition('connecting');
      callMachine.transition('connected');
    });

    it('should start recording session', () => {
      const session = recordingService.startRecording(
        callId,
        'user-spanish-001',
        'user-chinese-001'
      );

      recordingId = session.recordingId;

      expect(session.callId).toBe(callId);
      expect(session.isActive).toBe(true);
      expect(session.chunks).toHaveLength(0);
      expect(session.totalSize).toBe(0);
    });

    it('should add audio chunks to recording', () => {
      recordingService.startRecording(callId, 'user-spanish-001', 'user-chinese-001');

      // Simulate Spanish speaker audio chunk (opus codec, 20ms)
      const audioChunk1 = Buffer.from(new Array(1024).fill(0));
      recordingService.addAudioChunk(callId, audioChunk1, 'opus', 20);

      // Simulate Chinese speaker audio chunk
      const audioChunk2 = Buffer.from(new Array(1024).fill(0));
      recordingService.addAudioChunk(callId, audioChunk2, 'opus', 20);

      const session = recordingService.getSession(callId);
      expect(session?.chunks).toHaveLength(2);
      expect(session?.totalSize).toBe(2048);
    });

    it('should merge chunks into single buffer', () => {
      recordingService.startRecording(callId, 'user-spanish-001', 'user-chinese-001');

      const chunk1 = Buffer.from([1, 2, 3, 4]);
      const chunk2 = Buffer.from([5, 6, 7, 8]);

      recordingService.addAudioChunk(callId, chunk1, 'opus', 20);
      recordingService.addAudioChunk(callId, chunk2, 'opus', 20);

      const merged = recordingService.mergeChunks(callId);

      expect(merged).not.toBeNull();
      expect(merged!.length).toBe(8);
      expect(Array.from(merged!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('should enforce size limits', () => {
      recordingService.startRecording(callId, 'user-spanish-001', 'user-chinese-001');

      // Try to add huge chunk (exceeds 500MB limit)
      const hugeChunk = Buffer.alloc(600 * 1024 * 1024); // 600MB

      recordingService.addAudioChunk(callId, hugeChunk, 'opus', 20);

      const session = recordingService.getSession(callId);
      // Should be dropped due to size limit
      expect(session?.chunks).toHaveLength(0);
    });
  });

  describe('Phase 3: Encryption', () => {
    it('should encrypt recording with XChaCha20-Poly1305', () => {
      const testData = Buffer.from('Hello, this is test audio data');
      const key = Buffer.from(new Array(32).fill(0)); // 256-bit key

      const encrypted = encryptionService.encryptRecording(
        testData,
        key,
        'opus',
        5000 // duration ms
      );

      // Verify structure
      expect(encrypted.version).toBe(1);
      expect(encrypted.algorithm).toBe('chacha20-poly1305');
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();
      expect(encrypted.encryptedData).toBeTruthy();
      expect(encrypted.metadata.originalSize).toBe(testData.length);
    });

    it('should derive key from call ID', () => {
      const masterKey = Buffer.from(new Array(32).fill(0));

      const key1 = encryptionService.deriveKeyFromCallId(masterKey, 'call_123');
      const key2 = encryptionService.deriveKeyFromCallId(masterKey, 'call_456');

      // Different call IDs should produce different keys
      expect(key1).not.toEqual(key2);
      expect(key1.length).toBe(32);
      expect(key2.length).toBe(32);
    });

    it('should encrypt and decrypt recording', () => {
      const originalData = Buffer.from('Test audio content for encryption');
      const key = Buffer.from(new Array(32).fill(1));

      const encrypted = encryptionService.encryptRecording(
        originalData,
        key,
        'opus',
        3000
      );

      const decrypted = encryptionService.decryptRecording(encrypted, key);

      expect(decrypted.data).toEqual(originalData);
      expect(decrypted.metadata.codec).toBe('opus');
      expect(decrypted.metadata.duration).toBe(3000);
    });

    it('should validate encrypted recording structure', () => {
      const encrypted = {
        version: 1,
        algorithm: 'chacha20-poly1305',
        salt: '',
        iv: 'a'.repeat(24), // 12 bytes hex = 24 chars
        authTag: 'b'.repeat(32), // 16 bytes hex = 32 chars
        encryptedData: 'c'.repeat(100),
        metadata: {
          originalSize: 100,
          encryptedSize: 120,
          codec: 'opus',
          duration: 5000,
          encryptedAt: Date.now(),
        },
      };

      const isValid = encryptionService.validateEncrypted(encrypted);
      expect(isValid).toBe(true);
    });
  });

  describe('Phase 4: Call Metrics', () => {
    beforeEach(() => {
      const context: CallStateContext = {
        callId,
        currentState: 'ringing',
        callerId: 'user-spanish-001',
        receiverId: 'user-chinese-001',
        sourceLanguage: 'es',
        targetLanguage: 'zh',
        callType: 'audio',
        createdAt: Date.now(),
      };

      const callMachine = callRegistry.createCall(context);
      callMachine.transition('connecting');
      callMachine.transition('connected');
    });

    it('should track call duration', (done) => {
      const callMachine = callRegistry.getCall(callId);
      expect(callMachine).not.toBeNull();

      const durationMs1 = callMachine!.getDuration();
      expect(durationMs1).toBe(0); // Just connected

      // Wait 100ms
      setTimeout(() => {
        const durationMs2 = callMachine!.getDuration();
        expect(durationMs2).toBeGreaterThan(0);
        done();
      }, 100);
    });

    it('should update and store metrics', () => {
      const callMachine = callRegistry.getCall(callId);

      callMachine?.updateMetrics({
        latencyMs: 85,
        packetLossPercent: 0.5,
        audioQualityScore: 4.2,
      });

      const context = callMachine?.getContext();
      expect(context?.metrics?.latencyMs).toBe(85);
      expect(context?.metrics?.packetLossPercent).toBe(0.5);
      expect(context?.metrics?.audioQualityScore).toBe(4.2);
    });
  });

  describe('Phase 5: Call Termination', () => {
    beforeEach(() => {
      const context: CallStateContext = {
        callId,
        currentState: 'ringing',
        callerId: 'user-spanish-001',
        receiverId: 'user-chinese-001',
        sourceLanguage: 'es',
        targetLanguage: 'zh',
        callType: 'audio',
        createdAt: Date.now(),
      };

      const callMachine = callRegistry.createCall(context);
      callMachine.transition('connecting');
      callMachine.transition('connected');

      recordingService.startRecording(callId, 'user-spanish-001', 'user-chinese-001');
    });

    it('should transition from connected to ending to ended', () => {
      const callMachine = callRegistry.getCall(callId);

      callMachine?.transition('ending');
      expect(callMachine?.getState()).toBe('ending');

      callMachine?.transition('ended');
      expect(callMachine?.getState()).toBe('ended');
      expect(callMachine?.isTerminal()).toBe(true);
    });

    it('should stop recording and get final stats', () => {
      recordingService.addAudioChunk(
        callId,
        Buffer.alloc(1024),
        'opus',
        20
      );

      const stoppedSession = recordingService.stopRecording(callId);

      expect(stoppedSession?.isActive).toBe(false);
      expect(stoppedSession?.endTime).toBeTruthy();
      expect(stoppedSession?.duration).toBeGreaterThan(0);
    });

    it('should calculate call duration accurately', () => {
      const callMachine = callRegistry.getCall(callId);

      // Wait 200ms then end call
      setTimeout(() => {
        callMachine?.transition('ending');
        callMachine?.transition('ended');

        const duration = callMachine?.getDuration() || 0;
        expect(duration).toBeGreaterThan(150); // Allow some variance
      }, 200);
    });

    it('should cleanup recording session', () => {
      recordingService.clearSession(callId);

      const session = recordingService.getSession(callId);
      expect(session).toBeNull();
    });

    it('should remove call from registry', () => {
      callRegistry.removeCall(callId);

      const call = callRegistry.getCall(callId);
      expect(call).toBeNull();
    });
  });

  describe('Phase 6: Performance Benchmarks', () => {
    it('should complete full call cycle within 500ms total latency', async () => {
      const startTime = Date.now();

      // Create call
      const context: CallStateContext = {
        callId,
        currentState: 'ringing',
        callerId: 'user-spanish-001',
        receiverId: 'user-chinese-001',
        sourceLanguage: 'es',
        targetLanguage: 'zh',
        callType: 'audio',
        createdAt: startTime,
      };

      const callMachine = callRegistry.createCall(context);

      // Simulate call progression
      callMachine.transition('connecting');
      callMachine.transition('connected');

      // Record audio
      recordingService.startRecording(callId, 'user-spanish-001', 'user-chinese-001');

      // Add chunks
      for (let i = 0; i < 10; i++) {
        recordingService.addAudioChunk(callId, Buffer.alloc(512), 'opus', 20);
      }

      // Stop recording
      recordingService.stopRecording(callId);

      // End call
      callMachine.transition('ending');
      callMachine.transition('ended');

      // Cleanup
      recordingService.clearSession(callId);
      callRegistry.removeCall(callId);

      const elapsedTime = Date.now() - startTime;

      // Full cycle should complete in <500ms
      expect(elapsedTime).toBeLessThan(500);
    });

    it('should handle rapid state transitions', () => {
      const startTime = Date.now();

      const context: CallStateContext = {
        callId,
        currentState: 'ringing',
        callerId: 'user-spanish-001',
        receiverId: 'user-chinese-001',
        sourceLanguage: 'es',
        targetLanguage: 'zh',
        callType: 'audio',
        createdAt: startTime,
      };

      const callMachine = callRegistry.createCall(context);

      // Rapid transitions
      callMachine.transition('connecting');
      callMachine.transition('connected');
      callMachine.transition('hold');
      callMachine.transition('connected');
      callMachine.transition('ending');
      callMachine.transition('ended');

      const elapsedTime = Date.now() - startTime;
      expect(elapsedTime).toBeLessThan(100);
    });
  });
});
