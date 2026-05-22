'use client';

import React, { createContext, useContext, useReducer, useRef, useEffect, useCallback, ReactNode } from 'react';
import useWebSocket from 'react-use-websocket';
import type {
  CallContextState,
  CallAction,
  CallParticipant,
  TranscriptTurn,
  CallMetrics,
  WebSocketMessage,
  CallState,
} from '@/lib/types/calls';

// Initial state
const initialState: CallContextState = {
  callState: 'idle',
  callId: null,
  localUser: null,
  remoteUser: null,
  localStream: null,
  remoteStream: null,
  transcriptTurns: [],
  currentMetrics: null,
  wsConnected: false,
  error: null,
  callStartTime: null,
  callDurationMs: 0,
};

// Reducer
function callReducer(state: CallContextState, action: CallAction): CallContextState {
  switch (action.type) {
    case 'INITIATE_CALL':
      return {
        ...state,
        callState: 'ringing',
        callId: `call_${Date.now()}`,
      };

    case 'CALL_RINGING':
      return {
        ...state,
        callState: 'ringing',
        callId: action.payload.callId,
        remoteUser: action.payload.remoteUser,
      };

    case 'CALL_CONNECTING':
      return {
        ...state,
        callState: 'connecting',
        localStream: action.payload.localStream,
        remoteStream: action.payload.remoteStream || null,
      };

    case 'CALL_CONNECTED':
      return {
        ...state,
        callState: 'connected',
        callStartTime: action.payload.callStartTime,
      };

    case 'CALL_ON_HOLD':
      return { ...state, callState: 'hold' };

    case 'CALL_RECONNECTING':
      return { ...state, callState: 'reconnecting' };

    case 'CALL_ENDING':
      return { ...state, callState: 'ending' };

    case 'CALL_ENDED':
      return {
        ...initialState,
      };

    case 'CALL_FAILED':
      return {
        ...state,
        callState: 'failed',
        error: action.payload.error,
      };

    case 'ADD_TRANSCRIPT_TURN':
      return {
        ...state,
        transcriptTurns: [...state.transcriptTurns, action.payload],
      };

    case 'UPDATE_METRICS':
      return {
        ...state,
        currentMetrics: action.payload,
      };

    case 'SET_MUTED':
      if (action.payload.userId === state.localUser?.id) {
        return {
          ...state,
          localUser: state.localUser ? { ...state.localUser, isMuted: action.payload.muted } : null,
        };
      }
      return state;

    case 'SET_VOLUME':
      if (action.payload.userId === state.localUser?.id) {
        return {
          ...state,
          localUser: state.localUser ? { ...state.localUser, volume: action.payload.volume } : null,
        };
      }
      return state;

    case 'WS_CONNECTED':
      return { ...state, wsConnected: true, error: null };

    case 'WS_DISCONNECTED':
      return { ...state, wsConnected: false };

    case 'SET_ERROR':
      return { ...state, error: action.payload.error };

    case 'UPDATE_CALL_DURATION':
      return { ...state, callDurationMs: action.payload };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// Context
interface CallContextType {
  state: CallContextState;
  dispatch: React.Dispatch<CallAction>;
  initiateCall: (contactId: string, sourceLanguage: string, targetLanguage: string) => Promise<void>;
  answerCall: (callId: string) => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  mute: () => void;
  unmute: () => void;
  setVolume: (level: number) => void;
}

const CallContext = createContext<CallContextType | null>(null);

// Provider Component
export function CallProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(callReducer, initialState);
  const wsUrlRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttemptsRef = useRef(5);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // WebSocket setup
  const { sendJsonMessage, readyState } = useWebSocket(
    wsUrlRef.current,
    {
      onOpen: () => dispatch({ type: 'WS_CONNECTED' }),
      onClose: () => dispatch({ type: 'WS_DISCONNECTED' }),
      onMessage: (event) => handleWebSocketMessage(event, dispatch),
      onError: (error) => {
        console.error('WebSocket error:', error);
        dispatch({ type: 'SET_ERROR', payload: { error: 'Connection error' } });
      },
      retryOnError: true,
      shouldReconnect: () => reconnectAttemptsRef.current < maxReconnectAttemptsRef.current,
      reconnectAttempts: maxReconnectAttemptsRef.current,
      reconnectInterval: (attemptNumber) => Math.min(1000 * Math.pow(2, attemptNumber), 30000),
    },
    wsUrlRef.current !== null
  );

  // Call timer
  useEffect(() => {
    if (state.callState === 'connected' && state.callStartTime) {
      callTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - state.callStartTime!;
        dispatch({ type: 'UPDATE_CALL_DURATION', payload: elapsed });
      }, 1000);

      return () => {
        if (callTimerRef.current) {
          clearInterval(callTimerRef.current);
        }
      };
    }
  }, [state.callState, state.callStartTime]);

  // Initiate call
  const initiateCall = useCallback(
    async (contactId: string, sourceLanguage: string, targetLanguage: string) => {
      try {
        const response = await fetch('/api/calls/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId, sourceLanguage, targetLanguage }),
        });

        if (!response.ok) throw new Error('Failed to initiate call');

        const data = await response.json();
        dispatch({ type: 'CALL_RINGING', payload: { callId: data.callId, remoteUser: data.remoteUser } });

        // Connect WebSocket
        wsUrlRef.current = `/api/calls/${data.callId}/status`;
      } catch (error) {
        dispatch({ type: 'CALL_FAILED', payload: { error: String(error) } });
      }
    },
    []
  );

  // Answer call
  const answerCall = useCallback(async (callId: string) => {
    try {
      const response = await fetch(`/api/calls/${callId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to accept call');

      dispatch({ type: 'CALL_CONNECTING', payload: { localStream: new MediaStream() } });
      wsUrlRef.current = `/api/calls/${callId}/status`;
    } catch (error) {
      dispatch({ type: 'CALL_FAILED', payload: { error: String(error) } });
    }
  }, []);

  // Reject call
  const rejectCall = useCallback(async () => {
    try {
      if (state.callId) {
        await fetch(`/api/calls/${state.callId}/reject`, { method: 'POST' });
      }
      dispatch({ type: 'RESET' });
    } catch (error) {
      console.error('Failed to reject call:', error);
    }
  }, [state.callId]);

  // End call
  const endCall = useCallback(async () => {
    try {
      if (state.callId) {
        await fetch(`/api/calls/${state.callId}/end`, { method: 'POST' });
      }
      dispatch({ type: 'CALL_ENDED' });
      wsUrlRef.current = null;
    } catch (error) {
      console.error('Failed to end call:', error);
    }
  }, [state.callId]);

  // Mute/unmute
  const mute = useCallback(() => {
    if (state.localUser?.id) {
      dispatch({ type: 'SET_MUTED', payload: { userId: state.localUser.id, muted: true } });
    }
  }, [state.localUser?.id]);

  const unmute = useCallback(() => {
    if (state.localUser?.id) {
      dispatch({ type: 'SET_MUTED', payload: { userId: state.localUser.id, muted: false } });
    }
  }, [state.localUser?.id]);

  // Volume control
  const setVolume = useCallback(
    (level: number) => {
      if (state.localUser?.id) {
        dispatch({ type: 'SET_VOLUME', payload: { userId: state.localUser.id, volume: Math.max(0, Math.min(100, level)) } });
      }
    },
    [state.localUser?.id]
  );

  const value: CallContextType = {
    state,
    dispatch,
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
    mute,
    unmute,
    setVolume,
  };

  return React.createElement(CallContext.Provider, { value }, children);
}

// Hook
export function useCallContext() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCallContext must be used within CallProvider');
  }
  return context;
}

// WebSocket message handler
function handleWebSocketMessage(event: MessageEvent, dispatch: React.Dispatch<CallAction>) {
  try {
    const message: WebSocketMessage = JSON.parse(event.data);

    switch (message.type) {
      case 'transcript_update':
        dispatch({ type: 'ADD_TRANSCRIPT_TURN', payload: message.turn });
        break;

      case 'metric_update':
        dispatch({ type: 'UPDATE_METRICS', payload: message.metrics });
        break;

      case 'call_state_change':
        const stateActionMap: Record<CallState, CallAction['type']> = {
          idle: 'RESET',
          ringing: 'CALL_RINGING',
          connecting: 'CALL_CONNECTING',
          connected: 'CALL_CONNECTED',
          hold: 'CALL_ON_HOLD',
          reconnecting: 'CALL_RECONNECTING',
          ending: 'CALL_ENDING',
          ended: 'CALL_ENDED',
          failed: 'CALL_FAILED',
        };

        const actionType = stateActionMap[message.state];
        if (actionType === 'CALL_CONNECTED') {
          dispatch({ type: 'CALL_CONNECTED', payload: { callStartTime: Date.now() } });
        } else if (actionType === 'CALL_FAILED') {
          dispatch({ type: 'CALL_FAILED', payload: { error: message.reason || 'Call failed' } });
        } else {
          dispatch({ type: actionType } as CallAction);
        }
        break;

      case 'error':
        console.error(`WebSocket error [${message.severity}]:`, message.message);
        if (message.severity === 'critical') {
          dispatch({ type: 'SET_ERROR', payload: { error: message.message } });
        }
        break;
    }
  } catch (error) {
    console.error('Failed to handle WebSocket message:', error);
  }
}
