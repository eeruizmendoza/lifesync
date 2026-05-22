/**
 * Unit Tests for Call State Machine
 * Phase 13.3: State machine validation and call registry
 */

import { CallStateMachine, CallRegistry, CallStateContext, getCallRegistry } from '@/lib/call-state-machine';

describe('CallStateMachine', () => {
  let initialContext: CallStateContext;

  beforeEach(() => {
    initialContext = {
      callId: 'test-call-001',
      currentState: 'ringing',
      callerId: 'user-1',
      receiverId: 'user-2',
      sourceLanguage: 'es',
      targetLanguage: 'zh',
      callType: 'audio',
      createdAt: Date.now(),
    };
  });

  describe('State Transitions', () => {
    test('valid transition: ringing → connecting', () => {
      const machine = new CallStateMachine(initialContext);
      const validation = machine.canTransition('connecting');

      expect(validation.isValid).toBe(true);
      expect(validation.from).toBe('ringing');
      expect(validation.to).toBe('connecting');
    });

    test('invalid transition: ringing → connected (skip connecting)', () => {
      const machine = new CallStateMachine(initialContext);
      const validation = machine.canTransition('connected');

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('Cannot transition');
    });

    test('valid transition: connecting → connected', () => {
      initialContext.currentState = 'connecting';
      const machine = new CallStateMachine(initialContext);
      const validation = machine.canTransition('connected');

      expect(validation.isValid).toBe(true);
    });

    test('valid transition: connected → hold', () => {
      initialContext.currentState = 'connected';
      initialContext.connectedAt = Date.now() - 10000;
      const machine = new CallStateMachine(initialContext);
      const validation = machine.canTransition('hold');

      expect(validation.isValid).toBe(true);
    });

    test('valid transition: hold → connected (resume)', () => {
      initialContext.currentState = 'hold';
      const machine = new CallStateMachine(initialContext);
      const validation = machine.canTransition('connected');

      expect(validation.isValid).toBe(true);
    });

    test('valid transition: connected → ending', () => {
      initialContext.currentState = 'connected';
      const machine = new CallStateMachine(initialContext);
      const validation = machine.canTransition('ending');

      expect(validation.isValid).toBe(true);
    });

    test('valid transition: ending → ended', () => {
      initialContext.currentState = 'ending';
      const machine = new CallStateMachine(initialContext);
      const validation = machine.canTransition('ended');

      expect(validation.isValid).toBe(true);
    });
  });

  describe('Call Duration', () => {
    test('duration is 0 before connection', () => {
      const machine = new CallStateMachine(initialContext);
      expect(machine.getDuration()).toBe(0);
    });

    test('duration increases while connected', async () => {
      initialContext.currentState = 'connected';
      initialContext.connectedAt = Date.now() - 5000; // 5 seconds ago

      const machine = new CallStateMachine(initialContext);
      const duration = machine.getDuration();

      // Should be approximately 5000ms (with some tolerance for test execution)
      expect(duration).toBeGreaterThanOrEqual(4900);
      expect(duration).toBeLessThanOrEqual(5100);
    });

    test('duration is captured when call ends', () => {
      initialContext.currentState = 'connected';
      initialContext.connectedAt = Date.now() - 10000; // 10 seconds ago

      const machine = new CallStateMachine(initialContext);
      machine.transition('ending');
      machine.transition('ended');

      const context = machine.getContext();
      expect(context.duration).toBeGreaterThanOrEqual(9900);
      expect(context.duration).toBeLessThanOrEqual(10100);
    });
  });

  describe('Metrics Updates', () => {
    test('can update metrics', () => {
      const machine = new CallStateMachine(initialContext);

      machine.updateMetrics({
        latencyMs: 85,
        packetLossPercent: 0.5,
        audioQualityScore: 4.2,
        bandwidth: 512,
      });

      const context = machine.getContext();
      expect(context.metrics?.latencyMs).toBe(85);
      expect(context.metrics?.audioQualityScore).toBe(4.2);
    });

    test('can update metrics incrementally', () => {
      const machine = new CallStateMachine(initialContext);

      machine.updateMetrics({
        latencyMs: 85,
        audioQualityScore: 4.2,
      });

      machine.updateMetrics({
        packetLossPercent: 0.5,
      });

      const context = machine.getContext();
      expect(context.metrics?.latencyMs).toBe(85);
      expect(context.metrics?.audioQualityScore).toBe(4.2);
      expect(context.metrics?.packetLossPercent).toBe(0.5);
    });
  });

  describe('Terminal States', () => {
    test('ended is a terminal state', () => {
      initialContext.currentState = 'ended';
      const machine = new CallStateMachine(initialContext);

      expect(machine.isTerminal()).toBe(true);
      expect(machine.isActive()).toBe(false);
    });

    test('failed is a terminal state', () => {
      initialContext.currentState = 'failed';
      const machine = new CallStateMachine(initialContext);

      expect(machine.isTerminal()).toBe(true);
    });

    test('connected is not a terminal state', () => {
      initialContext.currentState = 'connected';
      const machine = new CallStateMachine(initialContext);

      expect(machine.isTerminal()).toBe(false);
      expect(machine.isActive()).toBe(true);
    });

    test('ringing is a pending state', () => {
      const machine = new CallStateMachine(initialContext);

      expect(machine.isPending()).toBe(true);
      expect(machine.isActive()).toBe(false);
    });
  });

  describe('Valid Next States', () => {
    test('from ringing state', () => {
      const machine = new CallStateMachine(initialContext);
      const nextStates = machine.getValidNextStates();

      expect(nextStates).toContain('connecting');
      expect(nextStates).toContain('rejected');
      expect(nextStates).toContain('failed');
      expect(nextStates).not.toContain('hold');
    });

    test('from connected state', () => {
      initialContext.currentState = 'connected';
      const machine = new CallStateMachine(initialContext);
      const nextStates = machine.getValidNextStates();

      expect(nextStates).toContain('hold');
      expect(nextStates).toContain('reconnecting');
      expect(nextStates).toContain('ending');
      expect(nextStates).not.toContain('ringing');
    });
  });

  describe('Serialization', () => {
    test('can serialize to JSON', () => {
      const machine = new CallStateMachine(initialContext);
      const json = machine.toJSON();

      expect(json.callId).toBe('test-call-001');
      expect(json.currentState).toBe('ringing');
      expect(json.callerId).toBe('user-1');
    });
  });
});

describe('CallRegistry', () => {
  let registry: CallRegistry;
  let initialContext: CallStateContext;

  beforeEach(() => {
    registry = new CallRegistry();
    initialContext = {
      callId: 'test-call-' + Math.random().toString(36).substr(2, 9),
      currentState: 'ringing',
      callerId: 'user-1',
      receiverId: 'user-2',
      sourceLanguage: 'es',
      targetLanguage: 'zh',
      callType: 'audio',
      createdAt: Date.now(),
    };
  });

  describe('Call Creation', () => {
    test('can create a call', () => {
      const machine = registry.createCall(initialContext);

      expect(machine).toBeInstanceOf(CallStateMachine);
      expect(machine.getState()).toBe('ringing');
    });

    test('duplicate call creation throws error', () => {
      registry.createCall(initialContext);

      expect(() => registry.createCall(initialContext)).toThrow();
    });
  });

  describe('Call Retrieval', () => {
    test('can retrieve a call by ID', () => {
      registry.createCall(initialContext);
      const retrieved = registry.getCall(initialContext.callId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.getState()).toBe('ringing');
    });

    test('returns null for non-existent call', () => {
      const retrieved = registry.getCall('non-existent-call-id');

      expect(retrieved).toBeNull();
    });
  });

  describe('Call Removal', () => {
    test('can remove a call', () => {
      registry.createCall(initialContext);
      registry.removeCall(initialContext.callId);

      const retrieved = registry.getCall(initialContext.callId);
      expect(retrieved).toBeNull();
    });
  });

  describe('Active Calls', () => {
    test('returns only active calls', () => {
      const call1Context = { ...initialContext, callId: 'call-1', currentState: 'connected' as const };
      const call2Context = { ...initialContext, callId: 'call-2', currentState: 'ringing' as const };
      const call3Context = { ...initialContext, callId: 'call-3', currentState: 'ended' as const };

      registry.createCall(call1Context).transition('connected');
      registry.createCall(call2Context);
      const m3 = registry.createCall(call3Context);
      m3.transition('ending');
      m3.transition('ended');

      const activeCalls = registry.getActiveCalls();

      // call-1 (connected) should be included
      // call-2 (ringing) should NOT be included (not active, just pending)
      // call-3 (ended) should NOT be included (terminal)
      expect(activeCalls.length).toBe(1);
      expect(activeCalls[0].getContext().callId).toBe('call-1');
    });
  });

  describe('User Calls', () => {
    test('can get calls for a specific user', () => {
      const call1 = { ...initialContext, callId: 'call-1', callerId: 'user-1' };
      const call2 = { ...initialContext, callId: 'call-2', callerId: 'user-2' };
      const call3 = { ...initialContext, callId: 'call-3', receiverId: 'user-1' };

      registry.createCall(call1);
      registry.createCall(call2);
      registry.createCall(call3);

      const userCalls = registry.getCallsForUser('user-1');

      expect(userCalls.length).toBe(2);
      expect(userCalls.map((c) => c.getContext().callId)).toEqual(['call-1', 'call-3']);
    });
  });

  describe('Registry Stats', () => {
    test('returns accurate stats', () => {
      const call1 = { ...initialContext, callId: 'call-1', currentState: 'ringing' as const };
      const call2 = { ...initialContext, callId: 'call-2', currentState: 'connected' as const };

      registry.createCall(call1);
      const m2 = registry.createCall(call2);
      m2.transition('connected');

      const stats = registry.getStats();

      expect(stats.totalCalls).toBe(2);
      expect(stats.activeCalls).toBe(1); // Only connected
      expect(stats.pendingCalls).toBe(1); // Only ringing
      expect(stats.stateDistribution.ringing).toBe(1);
      expect(stats.stateDistribution.connected).toBe(1);
    });
  });

  describe('Singleton Pattern', () => {
    test('getCallRegistry returns same instance', () => {
      const reg1 = getCallRegistry();
      const reg2 = getCallRegistry();

      expect(reg1).toBe(reg2);
    });
  });
});
