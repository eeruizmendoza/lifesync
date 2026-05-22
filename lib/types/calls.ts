/**
 * LifeSync Call System Types
 * Complete type definitions for real-time translation calls
 */

// Call state machine: idle → ringing → connecting → connected → [hold → reconnecting] → ending → ended
export type CallState = 'idle' | 'ringing' | 'connecting' | 'connected' | 'hold' | 'reconnecting' | 'ending' | 'ended' | 'failed';

export interface CallParticipant {
  id: string;
  name: string;
  language: string;
  avatar?: string;
  isInitiator: boolean;
  isMuted: boolean;
  volume: number; // 0-100
  connectionState: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed';
}

export interface TranscriptTurn {
  id: string;
  timestamp: number; // milliseconds since call start
  speaker: 'local' | 'remote';
  originalText: string;
  originalLanguage: string;
  translatedText: string;
  translatedLanguage: string;
  confidence: number; // 0-1
  transcriptionProvider: string;
  translationProvider: string;
  audioBuffer?: ArrayBuffer;
  wordTimings?: WordTiming[];
}

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface CallMetrics {
  latencyMs: number;
  transcriptionProvider: string;
  transcriptionLatencyMs: number;
  translationProvider: string;
  translationLatencyMs: number;
  ttsProvider: string;
  ttsLatencyMs: number;
  audioQualityScore: number; // 0-1
  packetLossPercent: number;
  jitterMs: number;
}

export interface Recording {
  id: string;
  callId: string;
  createdAt: string;
  durationSeconds: number;
  sizeBytes: number;
  isEncrypted: boolean;
  encryptionAlgorithm: string;
  format: 'mp3' | 'wav' | 'aac';
  sampleRate: number;
  channels: number;
}

export interface Conversation {
  id: string;
  participantIds: [string, string]; // [initiator, contact]
  sourceLanguage: string;
  targetLanguage: string;
  type: 'call' | 'message' | 'video';
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  contactName: string;
  lastMessage?: string;
  unreadCount: number;
  isPinned: boolean;
  isArchived: boolean;
  recordingIds: string[];
}

// WebSocket Message Types
export type WebSocketMessage =
  | TranscriptUpdateMessage
  | MetricUpdateMessage
  | CallStateChangeMessage
  | ErrorMessage
  | ConnectionStateMessage;

export interface TranscriptUpdateMessage {
  type: 'transcript_update';
  turn: TranscriptTurn;
}

export interface MetricUpdateMessage {
  type: 'metric_update';
  metrics: CallMetrics;
}

export interface CallStateChangeMessage {
  type: 'call_state_change';
  state: CallState;
  reason?: string;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
}

export interface ConnectionStateMessage {
  type: 'connection_state';
  connected: boolean;
  reconnectAttempt?: number;
  reconnectAttemptIn?: number; // milliseconds
}

// Context State
export interface CallContextState {
  callState: CallState;
  callId: string | null;
  localUser: CallParticipant | null;
  remoteUser: CallParticipant | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  transcriptTurns: TranscriptTurn[];
  currentMetrics: CallMetrics | null;
  wsConnected: boolean;
  error: string | null;
  callStartTime: number | null; // Unix timestamp
  callDurationMs: number;
}

// Action Types
export type CallAction =
  | { type: 'INITIATE_CALL'; payload: { contactId: string; sourceLanguage: string; targetLanguage: string } }
  | { type: 'CALL_RINGING'; payload: { callId: string; remoteUser: CallParticipant } }
  | { type: 'CALL_CONNECTING'; payload: { localStream: MediaStream; remoteStream?: MediaStream } }
  | { type: 'CALL_CONNECTED'; payload: { callStartTime: number } }
  | { type: 'CALL_ON_HOLD' }
  | { type: 'CALL_RECONNECTING' }
  | { type: 'CALL_ENDING' }
  | { type: 'CALL_ENDED' }
  | { type: 'CALL_FAILED'; payload: { error: string } }
  | { type: 'ADD_TRANSCRIPT_TURN'; payload: TranscriptTurn }
  | { type: 'UPDATE_METRICS'; payload: CallMetrics }
  | { type: 'SET_MUTED'; payload: { userId: string; muted: boolean } }
  | { type: 'SET_VOLUME'; payload: { userId: string; volume: number } }
  | { type: 'WS_CONNECTED' }
  | { type: 'WS_DISCONNECTED' }
  | { type: 'SET_ERROR'; payload: { error: string | null } }
  | { type: 'UPDATE_CALL_DURATION'; payload: number }
  | { type: 'RESET' };

// Component Props
export interface PhoneCallDialogProps {
  callId?: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  sourceLanguage: string;
  targetLanguage: string;
  isOpen?: boolean;
  onClose?: () => void;
  onEnd?: () => void;
}

export interface VideoCallDialogProps {
  callId?: string;
  contactId: string;
  contactName: string;
  sourceLanguage: string;
  targetLanguage: string;
  isOpen?: boolean;
  onClose?: () => void;
  onEnd?: () => void;
}

export interface RealTimeTranscriptProps {
  maxHeight?: string;
  showConfidence?: boolean;
  maxTurns?: number;
}

export interface CaptionOverlayProps {
  position?: 'top' | 'bottom' | 'center';
  fadeOutMs?: number;
}

export interface ConversationDetailProps {
  conversationId: string;
  onClose?: () => void;
}

export interface RecordingPlayerProps {
  recording: Recording;
  onDownload?: (recordingId: string) => void;
}

export interface TranscriptViewerProps {
  recording: Recording;
  className?: string;
}

export interface UnifiedInboxProps {
  onSelectConversation?: (id: string) => void;
  selectedConversationId?: string;
}

export interface CallProviderProps {
  children: React.ReactNode;
}
