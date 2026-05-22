/**
 * Call State Machine
 * Enforces valid state transitions for real-time calls
 * State flow: idle → ringing → connecting → connected → [hold/reconnecting] → ending → ended
 */

export type CallState = 'idle' | 'ringing' | 'connecting' | 'connected' | 'hold' | 'reconnecting' | 'ending' | 'ended' | 'failed';

export interface CallStateTransition {
  from: CallState;
  to: CallState;
  isValid: boolean;
  reason?: string;
}

export interface CallStateContext {
  callId: string;
  currentState: CallState;
  callerId: string;
  receiverId: string;
  sourceLanguage: string;
  targetLanguage: string;
  callType: 'audio' | 'video';
  createdAt: number;
  connectedAt?: number;
  endedAt?: number;
  duration?: number;
  wsUrl?: string; // WebSocket URL for real-time updates
  metrics?: {
    latencyMs: number;
    packetLossPercent: number;
    audioQualityScore: number; // 0-1
    videoQualityScore?: number; // 0-1
    bandwidth: number; // kbps
  };
}

/**
 * Valid state transitions
 * Defines which states can transition to which other states
 */
const VALID_TRANSITIONS: Record<CallState, CallState[]> = {
  idle: ['ringing', 'failed'],
  ringing: ['connecting', 'ending', 'failed', 'ended'],
  connecting: ['connected', 'reconnecting', 'failed', 'ending'],
  connected: ['hold', 'reconnecting', 'ending', 'failed'],
  hold: ['connected', 'reconnecting', 'ending', 'failed'],
  reconnecting: ['connected', 'reconnecting', 'ending', 'failed'],
  ending: ['ended', 'failed'],
  ended: [], // Terminal state
  failed: [], // Terminal state
};

/**
 * State machine validator
 */
export class CallStateMachine {
  private context: CallStateContext;

  constructor(context: CallStateContext) {
    this.context = context;
  }

  /**
   * Check if a state transition is valid
   */
  canTransition(toState: CallState): CallStateTransition {
    const currentState = this.context.currentState;
    const validNextStates = VALID_TRANSITIONS[currentState];

    if (!validNextStates) {
      return {
        from: currentState,
        to: toState,
        isValid: false,
        reason: `Unknown state: ${currentState}`,
      };
    }

    if (!validNextStates.includes(toState)) {
      return {
        from: currentState,
        to: toState,
        isValid: false,
        reason: `Cannot transition from ${currentState} to ${toState}. Valid transitions: ${validNextStates.join(', ')}`,
      };
    }

    // Additional validation for specific transitions
    // When transitioning to 'connected', allow from: connecting, reconnecting, or hold (resume)
    if (toState === 'connected' && !this.context.connectedAt) {
      // First connection must come from connecting or reconnecting states
      if (currentState !== 'connecting' && currentState !== 'reconnecting' && currentState !== 'hold') {
        return {
          from: currentState,
          to: toState,
          isValid: false,
          reason: 'Cannot connect from current state without proper handshake',
        };
      }
    }

    // Also allow 'connected' transitions when resuming from hold (connectedAt already set)
    if (toState === 'connected' && this.context.connectedAt && currentState === 'hold') {
      // This is a valid resume operation
      return {
        from: currentState,
        to: toState,
        isValid: true,
      };
    }

    if (toState === 'ended' && !this.context.endedAt) {
      // Track end time
      this.context.endedAt = Date.now();
      if (this.context.connectedAt) {
        this.context.duration = this.context.endedAt - this.context.connectedAt;
      }
    }

    return {
      from: currentState,
      to: toState,
      isValid: true,
    };
  }

  /**
   * Perform state transition
   * Throws error if transition is invalid
   */
  transition(toState: CallState): void {
    const validation = this.canTransition(toState);

    if (!validation.isValid) {
      throw new Error(validation.reason || `Invalid transition from ${validation.from} to ${validation.to}`);
    }

    // Update context
    this.context.currentState = toState;

    // Side effects based on state
    if (toState === 'connected' && !this.context.connectedAt) {
      this.context.connectedAt = Date.now();
    }

    if (toState === 'ended') {
      this.context.endedAt = Date.now();
      if (this.context.connectedAt) {
        this.context.duration = this.context.endedAt - this.context.connectedAt;
      }
    }
  }

  /**
   * Get current state
   */
  getState(): CallState {
    return this.context.currentState;
  }

  /**
   * Get call context
   */
  getContext(): CallStateContext {
    return { ...this.context };
  }

  /**
   * Update metrics
   */
  updateMetrics(metrics: Partial<CallStateContext['metrics']>): void {
    if (!this.context.metrics) {
      this.context.metrics = {
        latencyMs: 0,
        packetLossPercent: 0,
        audioQualityScore: 0,
        bandwidth: 0,
      };
    }

    this.context.metrics = {
      ...this.context.metrics,
      ...metrics,
    };
  }

  /**
   * Get call duration in milliseconds
   */
  getDuration(): number {
    if (this.context.currentState === 'ended' || this.context.currentState === 'failed') {
      return this.context.duration || 0;
    }

    if (this.context.connectedAt) {
      return Date.now() - this.context.connectedAt;
    }

    return 0;
  }

  /**
   * Get all valid next states
   */
  getValidNextStates(): CallState[] {
    return VALID_TRANSITIONS[this.context.currentState] || [];
  }

  /**
   * Check if call is in terminal state
   */
  isTerminal(): boolean {
    return this.context.currentState === 'ended' || this.context.currentState === 'failed';
  }

  /**
   * Check if call is active (connected or reconnecting)
   */
  isActive(): boolean {
    return this.context.currentState === 'connected' || this.context.currentState === 'reconnecting';
  }

  /**
   * Check if call is waiting for connection
   */
  isPending(): boolean {
    return this.context.currentState === 'ringing' || this.context.currentState === 'connecting';
  }

  /**
   * Serialize state for transmission
   */
  toJSON(): CallStateContext {
    return {
      ...this.context,
      duration: this.getDuration(),
    };
  }
}

/**
 * Global call registry to track active calls
 */
export class CallRegistry {
  private calls: Map<string, CallStateMachine> = new Map();
  private callTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Create a new call
   */
  createCall(context: CallStateContext): CallStateMachine {
    if (this.calls.has(context.callId)) {
      throw new Error(`Call ${context.callId} already exists`);
    }

    const machine = new CallStateMachine(context);
    this.calls.set(context.callId, machine);

    // Auto-expire ringing calls after 30 seconds
    this.setCallTimeout(context.callId, 30000);

    return machine;
  }

  /**
   * Get a call by ID
   */
  getCall(callId: string): CallStateMachine | null {
    return this.calls.get(callId) || null;
  }

  /**
   * Remove a call
   */
  removeCall(callId: string): void {
    this.calls.delete(callId);
    if (this.callTimeouts.has(callId)) {
      clearTimeout(this.callTimeouts.get(callId)!);
      this.callTimeouts.delete(callId);
    }
  }

  /**
   * Get all active calls
   */
  getActiveCalls(): CallStateMachine[] {
    return Array.from(this.calls.values()).filter((call) => !call.isTerminal());
  }

  /**
   * Get calls for a user
   */
  getCallsForUser(userId: string): CallStateMachine[] {
    return Array.from(this.calls.values()).filter((call) => {
      const ctx = call.getContext();
      return ctx.callerId === userId || ctx.receiverId === userId;
    });
  }

  /**
   * Set timeout for a call (auto-expire if not transitioned)
   */
  private setCallTimeout(callId: string, timeoutMs: number): void {
    const timeout = setTimeout(() => {
      const call = this.getCall(callId);
      if (call && call.getState() === 'ringing') {
        try {
          call.transition('failed');
          console.log(`📞 Call ${callId} expired (no answer after ${timeoutMs}ms)`);
        } catch (error) {
          console.warn(`Failed to auto-expire call: ${error}`);
        }
        this.removeCall(callId);
      }
    }, timeoutMs);

    this.callTimeouts.set(callId, timeout);
  }

  /**
   * Get registry stats
   */
  getStats() {
    const calls = Array.from(this.calls.values());
    const stateDistribution: Record<CallState, number> = {
      idle: 0,
      ringing: 0,
      connecting: 0,
      connected: 0,
      hold: 0,
      reconnecting: 0,
      ending: 0,
      ended: 0,
      failed: 0,
    };

    calls.forEach((call) => {
      const state = call.getState();
      stateDistribution[state]++;
    });

    return {
      totalCalls: calls.length,
      activeCalls: calls.filter((c) => c.isActive()).length,
      pendingCalls: calls.filter((c) => c.isPending()).length,
      stateDistribution,
    };
  }
}

// Singleton instance
let registryInstance: CallRegistry | null = null;

/**
 * Get global call registry
 */
export function getCallRegistry(): CallRegistry {
  if (!registryInstance) {
    registryInstance = new CallRegistry();
  }
  return registryInstance;
}
