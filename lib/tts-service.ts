/**
 * Text-to-Speech Service
 * Multi-provider voice synthesis with streaming support
 * Auto-selects best TTS provider based on language and quality needs
 */

import { ElevenLabsClient } from 'elevenlabs';
import axios from 'axios';
import { selectBestTTSProvider } from '@/config/providers';

// Types
export interface TTSProvider {
  name: string;
  naturalness: number; // 0-1 (MOS score)
  latency: number; // milliseconds
  languages: string[];
  voices: Array<{
    id: string;
    name: string;
    gender: 'male' | 'female' | 'neutral';
    language: string;
    description?: string;
  }>;
  supportsStreaming: boolean;
  supportsEmotions: boolean;
  supportsSpeedControl: boolean;
  costPerMillion: number;
}

export interface SynthesisChunk {
  audio: Buffer; // Raw audio data
  isFinal: boolean;
  timestamp: number; // milliseconds
}

export interface SynthesisResult {
  audio: Buffer; // Full audio data
  duration: number; // milliseconds
  format: 'pcm' | 'mp3' | 'wav';
  sampleRate: number; // Hz
  channels: number;
  bitDepth: number;
  provider: string;
  voiceId: string;
  processingTimeMs: number;
}

export interface StreamingTTSSession {
  sessionId: string;
  language: string;
  voiceId: string;
  isActive: boolean;
  startTime: number;
  chunks: SynthesisChunk[];
}

export interface SynthesisOptions {
  emotion?: 'happy' | 'sad' | 'neutral' | 'excited' | 'calm';
  speed?: number; // 0.5 - 2.0 (1.0 = normal)
  pitch?: number; // -20 to +20 (semitones)
  streaming?: boolean;
}

// ============================================================================
// TEXT-TO-SPEECH SERVICE
// ============================================================================

class TextToSpeechService {
  private elevenLabsClient: ElevenLabsClient;
  private kokoroUrl = 'http://localhost:8081/synthesize'; // Self-hosted
  private piperUrl = 'http://localhost:5001/api/tts'; // Self-hosted
  private googleCloudUrl = 'https://texttospeech.googleapis.com/v1/text:synthesize';

  // Voice cache
  private voiceCache: Map<string, string> = new Map();
  private activeSessions: Map<string, StreamingTTSSession> = new Map();

  constructor() {
    this.elevenLabsClient = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY || '',
    });
  }

  // =========================================================================
  // VOICE MANAGEMENT
  // =========================================================================

  /**
   * Select best voice for language and gender
   */
  async selectBestVoiceFor(
    language: string,
    gender?: 'male' | 'female' | 'neutral'
  ): Promise<string> {
    const cacheKey = `${language}-${gender || 'any'}`;

    // Check cache first
    if (this.voiceCache.has(cacheKey)) {
      return this.voiceCache.get(cacheKey)!;
    }

    // Get voices from ElevenLabs (primary provider)
    try {
      const voices = await this.getVoicesFromElevenLabs(language, gender);
      if (voices.length > 0) {
        const voiceId = voices[0].id;
        this.voiceCache.set(cacheKey, voiceId);
        return voiceId;
      }
    } catch (error) {
      console.warn(`Failed to get voices from ElevenLabs for ${language}:`, error);
    }

    // Fallback to default voice ID
    const defaultVoice = process.env.ELEVENLABS_DEFAULT_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
    this.voiceCache.set(cacheKey, defaultVoice);
    return defaultVoice;
  }

  /**
   * Get available voices from ElevenLabs
   */
  private async getVoicesFromElevenLabs(
    language: string,
    gender?: 'male' | 'female' | 'neutral'
  ): Promise<Array<{ id: string; name: string; gender: string }>> {
    try {
      const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      });

      let voices = response.data.voices || [];

      // Filter by language if provided
      if (language) {
        voices = voices.filter((v: any) =>
          v.language?.toLowerCase() === language.toLowerCase()
        );
      }

      // Filter by gender if provided
      if (gender) {
        voices = voices.filter((v: any) =>
          v.metadata?.gender?.toLowerCase() === gender.toLowerCase()
        );
      }

      return voices.map((v: any) => ({
        id: v.voice_id,
        name: v.name,
        gender: v.metadata?.gender || 'neutral',
      }));
    } catch (error) {
      console.error('Failed to fetch voices from ElevenLabs:', error);
      return [];
    }
  }

  // =========================================================================
  // BATCH SYNTHESIS
  // =========================================================================

  /**
   * Synthesize text to speech (batch mode)
   */
  async synthesize(
    text: string,
    language: string,
    voiceId?: string,
    options?: SynthesisOptions
  ): Promise<SynthesisResult> {
    const startTime = Date.now();

    try {
      // Select best provider
      const provider = selectBestTTSProvider(language, 'naturalness');

      // Select voice if not provided
      const selectedVoice = voiceId || (await this.selectBestVoiceFor(language));

      let result: SynthesisResult;

      if (provider.name === 'ElevenLabs-v3') {
        result = await this.synthesizeWithElevenLabs(
          text,
          language,
          selectedVoice,
          options
        );
      } else if (provider.name === 'Kokoro-TTS') {
        result = await this.synthesizeWithKokoro(text, language, selectedVoice);
      } else if (provider.name === 'Piper-TTS') {
        result = await this.synthesizeWithPiper(text, language, selectedVoice);
      } else if (provider.name === 'Google-Cloud-TTS-v3') {
        result = await this.synthesizeWithGoogleCloud(text, language);
      } else {
        throw new Error(`Unknown TTS provider: ${provider.name}`);
      }

      result.processingTimeMs = Date.now() - startTime;
      return result;
    } catch (error) {
      console.error(`TTS synthesis failed:`, error);
      throw error;
    }
  }

  /**
   * Synthesize with ElevenLabs (highest quality)
   */
  private async synthesizeWithElevenLabs(
    text: string,
    language: string,
    voiceId: string,
    options?: SynthesisOptions
  ): Promise<SynthesisResult> {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5, // 0-1, higher = more consistent
          similarity_boost: 0.75, // 0-1, higher = more similar to voice
          style: options?.emotion === 'excited' ? 1.0 : 0.5,
          use_speaker_boost: true,
        },
      },
      {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
        responseType: 'arraybuffer',
      }
    );

    const audio = Buffer.from(response.data);

    return {
      audio,
      duration: this.estimateDuration(text),
      format: 'mp3',
      sampleRate: 22050,
      channels: 1,
      bitDepth: 16,
      provider: 'ElevenLabs-v3',
      voiceId,
      processingTimeMs: 0,
    };
  }

  /**
   * Synthesize with Kokoro TTS (fastest, open-source)
   */
  private async synthesizeWithKokoro(
    text: string,
    language: string,
    voiceId: string
  ): Promise<SynthesisResult> {
    const response = await axios.post(this.kokoroUrl, {
      text,
      voice: voiceId,
      language,
      format: 'wav',
      speed: 1.0,
    });

    // Response should be audio buffer or base64
    const audio = Buffer.isBuffer(response.data)
      ? response.data
      : Buffer.from(response.data, 'base64');

    return {
      audio,
      duration: this.estimateDuration(text),
      format: 'wav',
      sampleRate: 24000,
      channels: 1,
      bitDepth: 16,
      provider: 'Kokoro-TTS',
      voiceId,
      processingTimeMs: 0,
    };
  }

  /**
   * Synthesize with Piper (open-source fallback)
   */
  private async synthesizeWithPiper(
    text: string,
    language: string,
    voiceId: string
  ): Promise<SynthesisResult> {
    const response = await axios.post(this.piperUrl, {
      text,
      voice: voiceId || 'en_US-lessac-medium',
      language,
      length_scale: 1.0,
    });

    const audio = Buffer.isBuffer(response.data)
      ? response.data
      : Buffer.from(response.data, 'base64');

    return {
      audio,
      duration: this.estimateDuration(text),
      format: 'wav',
      sampleRate: 22050,
      channels: 1,
      bitDepth: 16,
      provider: 'Piper-TTS',
      voiceId,
      processingTimeMs: 0,
    };
  }

  /**
   * Synthesize with Google Cloud TTS
   */
  private async synthesizeWithGoogleCloud(
    text: string,
    language: string
  ): Promise<SynthesisResult> {
    const response = await axios.post(
      `${this.googleCloudUrl}?key=${process.env.GOOGLE_CLOUD_TTS_API_KEY}`,
      {
        input: { text },
        voice: {
          languageCode: language,
          name: `${language}-Neural2-A`,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          sampleRateHertz: 24000,
        },
      }
    );

    const audio = Buffer.from(response.data.audioContent, 'base64');

    return {
      audio,
      duration: this.estimateDuration(text),
      format: 'mp3',
      sampleRate: 24000,
      channels: 1,
      bitDepth: 16,
      provider: 'Google-Cloud-TTS-v3',
      voiceId: response.data.voice?.name || 'unknown',
      processingTimeMs: 0,
    };
  }

  // =========================================================================
  // STREAMING SYNTHESIS
  // =========================================================================

  /**
   * Start streaming synthesis session
   * For real-time TTS during call
   */
  async startStreamingSession(
    language: string = 'en',
    voiceId?: string,
    sessionId: string = crypto.randomUUID()
  ): Promise<StreamingTTSSession> {
    const selectedVoice = voiceId || (await this.selectBestVoiceFor(language));

    const session: StreamingTTSSession = {
      sessionId,
      language,
      voiceId: selectedVoice,
      isActive: true,
      startTime: Date.now(),
      chunks: [],
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Synthesize text chunk in streaming session
   * Returns audio chunks as they're generated
   */
  async synthesizeChunk(
    sessionId: string,
    text: string,
    options?: SynthesisOptions
  ): Promise<AsyncIterable<SynthesisChunk>> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      // For real-time streaming, use ElevenLabs streaming if available
      // or synthesize in chunks and yield progressively
      const provider = selectBestTTSProvider(session.language, 'latency');

      if (provider.name === 'ElevenLabs-v3') {
        return this.synthesizeStreamingElevenLabs(sessionId, text, session.voiceId);
      } else {
        // Fallback: synthesize and yield in chunks
        return this.synthesizeProgressively(sessionId, text, session.language);
      }
    } catch (error) {
      console.error(`Streaming synthesis failed in session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * ElevenLabs streaming (chunks as they generate)
   */
  private async *synthesizeStreamingElevenLabs(
    sessionId: string,
    text: string,
    voiceId: string
  ): AsyncIterable<SynthesisChunk> {
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        },
        {
          headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
          responseType: 'stream',
        }
      );

      const session = this.activeSessions.get(sessionId);
      let chunkIndex = 0;

      for await (const chunk of response.data) {
        const audioChunk: SynthesisChunk = {
          audio: Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
          isFinal: false,
          timestamp: Date.now() - (session?.startTime || 0),
        };

        if (session) {
          session.chunks.push(audioChunk);
        }
        chunkIndex++;

        yield audioChunk;
      }

      // Mark final chunk
      if (session && session.chunks.length > 0) {
        const lastChunk = session.chunks[session.chunks.length - 1];
        lastChunk.isFinal = true;
      }
    } catch (error) {
      console.error('ElevenLabs streaming failed:', error);
      throw error;
    }
  }

  /**
   * Synthesize and yield progressively (fallback)
   */
  private async *synthesizeProgressively(
    sessionId: string,
    text: string,
    language: string
  ): AsyncIterable<SynthesisChunk> {
    const session = this.activeSessions.get(sessionId);

    // For progressive synthesis, split text into sentences
    const sentences = text.split(/(?<=[.!?])\s+/);

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      if (!sentence.trim()) continue;

      try {
        // Synthesize each sentence
        const result = await this.synthesize(
          sentence,
          language,
          session?.voiceId
        );

        const chunk: SynthesisChunk = {
          audio: result.audio,
          isFinal: i === sentences.length - 1,
          timestamp: Date.now() - (session?.startTime || 0),
        };

        if (session) {
          session.chunks.push(chunk);
        }

        yield chunk;
      } catch (error) {
        console.error(`Failed to synthesize sentence: ${sentence}`, error);
      }
    }
  }

  /**
   * End streaming session
   */
  async endStreamingSession(
    sessionId: string
  ): Promise<{
    fullAudio: Buffer;
    chunks: SynthesisChunk[];
    duration: number;
  }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.isActive = false;

    // Concatenate all chunks into single audio buffer
    const fullAudio = Buffer.concat(session.chunks.map(c => c.audio));
    const duration = Date.now() - session.startTime;

    // Cleanup
    setTimeout(() => {
      this.activeSessions.delete(sessionId);
    }, 5 * 60 * 1000); // 5 minutes

    return {
      fullAudio,
      chunks: session.chunks,
      duration,
    };
  }

  /**
   * Get active session
   */
  getSession(sessionId: string): StreamingTTSSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  // =========================================================================
  // UTILITIES
  // =========================================================================

  /**
   * Estimate audio duration from text
   * Average: 150 words per minute = 2.5 words per second
   */
  private estimateDuration(text: string): number {
    const words = text.trim().split(/\s+/).length;
    const wordsPerSecond = 2.5;
    return Math.ceil((words / wordsPerSecond) * 1000);
  }

  /**
   * Convert audio format
   */
  async convertAudioFormat(
    audioBuffer: Buffer,
    fromFormat: string,
    toFormat: string
  ): Promise<Buffer> {
    // In production, would use ffmpeg-wasm or similar
    // For now, pass through (most providers return MP3 or WAV)
    console.warn(
      `Audio format conversion not implemented: ${fromFormat} → ${toFormat}`
    );
    return audioBuffer;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let ttsServiceInstance: TextToSpeechService | null = null;

export function getTTSService(): TextToSpeechService {
  if (!ttsServiceInstance) {
    ttsServiceInstance = new TextToSpeechService();
  }
  return ttsServiceInstance;
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

export async function synthesizeText(
  text: string,
  language: string,
  voiceId?: string,
  options?: SynthesisOptions
): Promise<SynthesisResult> {
  const service = getTTSService();
  return service.synthesize(text, language, voiceId, options);
}

export async function selectVoiceFor(
  language: string,
  gender?: 'male' | 'female' | 'neutral'
): Promise<string> {
  const service = getTTSService();
  return service.selectBestVoiceFor(language, gender);
}

export async function startTTSSession(
  language: string = 'en',
  voiceId?: string
): Promise<StreamingTTSSession> {
  const service = getTTSService();
  return service.startStreamingSession(language, voiceId);
}

export async function synthesizeTTSChunk(
  sessionId: string,
  text: string,
  options?: SynthesisOptions
): Promise<AsyncIterable<SynthesisChunk>> {
  const service = getTTSService();
  return service.synthesizeChunk(sessionId, text, options);
}

export async function endTTSSession(sessionId: string) {
  const service = getTTSService();
  return service.endStreamingSession(sessionId);
}

export default getTTSService;
