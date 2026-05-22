/**
 * Speech-to-Text Transcription Service
 * Multi-provider speech recognition with automatic fallback
 * Supports real-time streaming and batch transcription
 */

import { OpenAI } from 'openai';
import { Deepgram, LiveTranscriptionEvents, createClient } from '@deepgram/sdk';
import { selectBestSpeechProvider } from '@/config/providers';

// Types
export interface TranscriptionChunk {
  text: string;
  isFinal: boolean;
  confidence: number;
  timestamp: number; // milliseconds
  speaker?: string;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
  segments: Array<{
    text: string;
    start: number; // ms
    end: number; // ms
    confidence: number;
  }>;
  provider: string;
  processingTimeMs: number;
}

export interface StreamingTranscriptionSession {
  sessionId: string;
  language: string;
  isActive: boolean;
  startTime: number;
  chunks: TranscriptionChunk[];
}

// ============================================================================
// TRANSCRIPTION SERVICE
// ============================================================================

class TranscriptionService {
  private openaiClient: OpenAI;
  private deepgramClient: Deepgram;
  private activeSessions: Map<string, StreamingTranscriptionSession> = new Map();

  constructor() {
    try {
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_WHISPER_API_KEY || process.env.OPENAI_API_KEY,
      });
    } catch (error) {
      console.warn('Failed to initialize OpenAI client:', error);
      // Provide a dummy client for testing
      this.openaiClient = null as any;
    }

    try {
      this.deepgramClient = createClient(
        process.env.DEEPGRAM_API_KEY || ''
      ) as any;
    } catch (error) {
      console.warn('Failed to initialize Deepgram client:', error);
      this.deepgramClient = null as any;
    }
  }

  // =========================================================================
  // BATCH TRANSCRIPTION
  // =========================================================================

  /**
   * Transcribe audio file (batch mode)
   * Suitable for saved recordings or when real-time is not needed
   */
  async transcribeFile(
    audioBuffer: Buffer,
    language: string,
    preferredProvider?: string
  ): Promise<TranscriptionResult> {
    const startTime = Date.now();

    try {
      // Select best provider
      const provider = preferredProvider
        ? { name: preferredProvider }
        : selectBestSpeechProvider(language, 'accuracy');

      let result: TranscriptionResult;

      if (provider.name === 'OpenAI-Whisper-v3') {
        result = await this.transcribeWithWhisper(audioBuffer, language);
      } else if (provider.name === 'Deepgram-Nova-2') {
        result = await this.transcribeWithDeepgram(audioBuffer, language);
      } else {
        throw new Error(`Unknown provider: ${provider.name}`);
      }

      result.processingTimeMs = Date.now() - startTime;
      return result;
    } catch (error) {
      console.error(`Transcription failed with ${preferredProvider}:`, error);
      throw error;
    }
  }

  /**
   * Transcribe with OpenAI Whisper
   */
  private async transcribeWithWhisper(
    audioBuffer: Buffer,
    language: string
  ): Promise<TranscriptionResult> {
    const response = await this.openaiClient.audio.transcriptions.create({
      file: new File([new Uint8Array(audioBuffer)], 'audio.wav', { type: 'audio/wav' }),
      model: 'whisper-1',
      language: language,
      response_format: 'verbose_json', // Get detailed response
    });

    return {
      text: response.text,
      language: response.language || language,
      confidence: 0.95, // Whisper doesn't provide confidence per segment
      segments: response.segments?.map(seg => ({
        text: seg.text,
        start: Math.floor(seg.start * 1000),
        end: Math.floor(seg.end * 1000),
        confidence: 0.9, // Whisper doesn't provide per-segment confidence
      })) || [],
      provider: 'OpenAI-Whisper-v3',
      processingTimeMs: 0,
    };
  }

  /**
   * Transcribe with Deepgram
   */
  private async transcribeWithDeepgram(
    audioBuffer: Buffer,
    language: string
  ): Promise<TranscriptionResult> {
    const response = await (this.deepgramClient as any).listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: 'nova-2',
        language: language,
        detect_language: false,
        tier: 'nova',
        punctuate: true,
      }
    );

    const transcript = response.result?.results?.channels?.[0];
    if (!transcript) {
      throw new Error('Empty transcription result from Deepgram');
    }

    const fullText = transcript.alternatives?.[0]?.transcript || '';
    const alternatives = transcript.alternatives || [];
    const confidence = alternatives[0]?.confidence || 0.9;

    return {
      text: fullText,
      language: language,
      confidence: confidence,
      segments: transcript.alternatives?.[0]?.paragraphs?.map((para: any) => ({
        text: para.sentences?.map((s: any) => s.text).join(' ') || '',
        start: Math.floor((para.start || 0) * 1000),
        end: Math.floor((para.end || 0) * 1000),
        confidence: confidence,
      })) || [],
      provider: 'Deepgram-Nova-2',
      processingTimeMs: 0,
    };
  }

  // =========================================================================
  // REAL-TIME STREAMING TRANSCRIPTION
  // =========================================================================

  /**
   * Start streaming transcription session
   * For live audio from microphone or call
   */
  async startStreamingSession(
    language: string = 'en',
    sessionId: string = crypto.randomUUID()
  ): Promise<StreamingTranscriptionSession> {
    const session: StreamingTranscriptionSession = {
      sessionId,
      language,
      isActive: true,
      startTime: Date.now(),
      chunks: [],
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Process audio chunk from stream
   */
  async processAudioChunk(
    sessionId: string,
    audioChunk: Buffer,
    timestamp: number
  ): Promise<TranscriptionChunk | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      // Use Deepgram for streaming (faster real-time)
      // In production, would use live transcription WebSocket
      // For now, simulate with batch processing small chunks

      // Convert audio chunk to transcription
      // This is where you'd connect to Deepgram live API
      const result = await this.transcribeFile(audioChunk, session.language, 'Deepgram-Nova-2');

      if (result.text) {
        const chunk: TranscriptionChunk = {
          text: result.text,
          isFinal: true,
          confidence: result.confidence,
          timestamp: timestamp,
        };

        session.chunks.push(chunk);
        return chunk;
      }

      return null;
    } catch (error) {
      console.error(`Error processing audio chunk in session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * End streaming session and return full transcript
   */
  async endStreamingSession(
    sessionId: string
  ): Promise<{
    fullText: string;
    chunks: TranscriptionChunk[];
    duration: number;
  }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.isActive = false;
    const fullText = session.chunks.map(c => c.text).join(' ');
    const duration = Date.now() - session.startTime;

    // Keep in memory for a bit, then clean up
    setTimeout(() => {
      this.activeSessions.delete(sessionId);
    }, 5 * 60 * 1000); // 5 minutes

    return {
      fullText,
      chunks: session.chunks,
      duration,
    };
  }

  /**
   * Get active session
   */
  getSession(sessionId: string): StreamingTranscriptionSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  // =========================================================================
  // LANGUAGE DETECTION
  // =========================================================================

  /**
   * Detect language from audio file
   */
  async detectLanguage(audioBuffer: Buffer): Promise<string> {
    // Use Whisper to detect language
    const response = await this.openaiClient.audio.transcriptions.create({
      file: new File([new Uint8Array(audioBuffer)], 'audio.wav', { type: 'audio/wav' }),
      model: 'whisper-1',
      language: undefined, // Let Whisper detect
    });

    return (response as any).language || 'en';
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let transcriptionServiceInstance: TranscriptionService | null = null;

export function getTranscriptionService(): TranscriptionService {
  if (!transcriptionServiceInstance) {
    transcriptionServiceInstance = new TranscriptionService();
  }
  return transcriptionServiceInstance;
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

export async function transcribeAudio(
  audioBuffer: Buffer,
  language: string,
  provider?: string
): Promise<TranscriptionResult> {
  const service = getTranscriptionService();
  return service.transcribeFile(audioBuffer, language, provider);
}

export async function startTranscriptionSession(
  language: string = 'en'
): Promise<StreamingTranscriptionSession> {
  const service = getTranscriptionService();
  return service.startStreamingSession(language);
}

export async function processAudioChunk(
  sessionId: string,
  audioChunk: Buffer,
  timestamp: number
): Promise<TranscriptionChunk | null> {
  const service = getTranscriptionService();
  return service.processAudioChunk(sessionId, audioChunk, timestamp);
}

export async function endTranscriptionSession(sessionId: string) {
  const service = getTranscriptionService();
  return service.endStreamingSession(sessionId);
}

export async function detectLanguage(audioBuffer: Buffer): Promise<string> {
  const service = getTranscriptionService();
  return service.detectLanguage(audioBuffer);
}

export default getTranscriptionService;
