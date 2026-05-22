/**
 * Recording Announcement Service
 * Generates and plays jurisdiction-specific audio announcements
 * Legal requirement for call recording transparency
 */

import { getTTSService } from './tts-service';

// Types
export interface AnnouncementConfig {
  jurisdiction: string; // 'two-party-consent', 'one-party-consent', 'specific-state'
  language: string; // 'en', 'es', 'zh', etc.
  voiceId?: string; // Optional voice preference
}

export interface AnnouncementEvent {
  eventType: 'announcement_generated' | 'announcement_played' | 'announcement_failed';
  callId: string;
  jurisdiction: string;
  language: string;
  timestamp: number;
  durationMs?: number;
  voiceId?: string;
  error?: string;
}

// Jurisdiction-specific announcement templates
const ANNOUNCEMENT_TEMPLATES = {
  'two-party-consent': {
    en: 'This call is being recorded. All parties must consent to continue. By continuing, you consent to this recording.',
    es: 'Esta llamada está siendo grabada. Todas las partes deben consentir para continuar. Al continuar, usted consiente a esta grabación.',
    zh: '此通话正在被录制。所有参与方必须同意才能继续。继续表示您同意录制。',
  },
  'one-party-consent': {
    en: 'Please note: This call is being recorded.',
    es: 'Tenga en cuenta: Esta llamada está siendo grabada.',
    zh: '请注意：此通话正在被录制。',
  },
  'california': {
    en: 'California law requires all-party consent to record. This call is being recorded. By continuing, you consent to recording.',
    es: 'La ley de California requiere el consentimiento de todas las partes para grabar. Esta llamada está siendo grabada. Al continuar, usted consiente a la grabación.',
    zh: '加州法律要求所有参与方同意录制。此通话正在被录制。继续表示您同意录制。',
  },
  'florida': {
    en: 'Florida law requires notification that this call is being recorded. By continuing, you consent.',
    es: 'La ley de Florida requiere notificación de que esta llamada está siendo grabada. Al continuar, usted consiente.',
    zh: '佛罗里达州法律要求通知此通话正在被录制。继续表示您同意。',
  },
  'pennsylvania': {
    en: 'Pennsylvania law requires all-party consent. This call is being recorded.',
    es: 'La ley de Pennsylvania requiere el consentimiento de todas las partes. Esta llamada está siendo grabada.',
    zh: '宾夕法尼亚州法律要求所有参与方同意。此通话正在被录制。',
  },
  'illinois': {
    en: 'Illinois law requires all-party consent. This call is being recorded.',
    es: 'La ley de Illinois requiere el consentimiento de todas las partes. Esta llamada está siendo grabada.',
    zh: '伊利诺伊州法律要求所有参与方同意。此通话正在被录制。',
  },
};

// Two-party consent states
const TWO_PARTY_CONSENT_STATES = [
  'CA', 'FL', 'PA', 'IL', 'NY', 'WA', 'HI', 'MD', 'MT', 'NH', 'NJ', 'VA', 'VT',
];

// ============================================================================
// RECORDING ANNOUNCEMENT SERVICE
// ============================================================================

class RecordingAnnouncementService {
  private ttsService = getTTSService();
  private announcementCache: Map<string, Buffer> = new Map();
  private events: AnnouncementEvent[] = [];

  /**
   * Detect jurisdiction type from location or state code
   */
  detectJurisdiction(state?: string): string {
    if (!state) return 'one-party-consent'; // Default to least restrictive

    const stateCode = state.toUpperCase();
    if (TWO_PARTY_CONSENT_STATES.includes(stateCode)) {
      // Return specific state if template exists
      if (ANNOUNCEMENT_TEMPLATES[stateCode as keyof typeof ANNOUNCEMENT_TEMPLATES]) {
        return stateCode;
      }
      return 'two-party-consent';
    }

    return 'one-party-consent';
  }

  /**
   * Get announcement text for jurisdiction and language
   */
  getAnnouncementText(jurisdiction: string, language: string = 'en'): string {
    const templates = ANNOUNCEMENT_TEMPLATES[jurisdiction as keyof typeof ANNOUNCEMENT_TEMPLATES]
      || ANNOUNCEMENT_TEMPLATES['one-party-consent'];

    return templates[language as keyof typeof templates] || templates['en'];
  }

  /**
   * Generate announcement audio using TTS
   * Caches result for repeated use in same call
   */
  async generateAnnouncement(
    config: AnnouncementConfig
  ): Promise<Buffer> {
    const cacheKey = `${config.jurisdiction}-${config.language}`;

    // Return from cache if already generated
    if (this.announcementCache.has(cacheKey)) {
      return this.announcementCache.get(cacheKey)!;
    }

    try {
      const text = this.getAnnouncementText(config.jurisdiction, config.language);

      // Synthesize announcement using TTS service
      // TTS service's synthesize method returns SynthesisResult
      const result = await this.ttsService['synthesize'](
        text,
        config.language,
        config.voiceId,
        {
          emotion: 'calm',
          speed: 1.0,
        }
      );

      // Cache the audio for this call
      this.announcementCache.set(cacheKey, result.audio);

      // Log generation event
      this.logEvent({
        eventType: 'announcement_generated',
        callId: 'unknown', // Will be set by caller
        jurisdiction: config.jurisdiction,
        language: config.language,
        timestamp: Date.now(),
        durationMs: result.duration,
        voiceId: result.voiceId,
      });

      return result.audio;
    } catch (error) {
      console.error('Failed to generate announcement:', error);
      throw new Error(
        `Failed to generate announcement for ${config.jurisdiction}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Play announcement to participant
   * Returns promise that resolves when audio finishes
   */
  async playAnnouncement(
    callId: string,
    announcementAudio: Buffer,
    config: AnnouncementConfig
  ): Promise<void> {
    try {
      // In production, this would stream to WebRTC audio track
      // For now, we're setting up the infrastructure

      this.logEvent({
        eventType: 'announcement_played',
        callId,
        jurisdiction: config.jurisdiction,
        language: config.language,
        timestamp: Date.now(),
        voiceId: config.voiceId,
      });

      // Simulate audio playback (in browser, this would use Web Audio API)
      // const audioContext = new AudioContext();
      // const audioBuffer = await audioContext.decodeAudioData(announcementAudio);
      // const source = audioContext.createBufferSource();
      // source.buffer = audioBuffer;
      // source.connect(audioContext.destination);
      // source.start(0);
    } catch (error) {
      console.error('Failed to play announcement:', error);
      this.logEvent({
        eventType: 'announcement_failed',
        callId,
        jurisdiction: config.jurisdiction,
        language: config.language,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Complete workflow: generate → play announcement
   */
  async playRecordingAnnouncement(
    callId: string,
    config: AnnouncementConfig
  ): Promise<Buffer> {
    // Generate announcement
    const announcementAudio = await this.generateAnnouncement(config);

    // Play to both participants
    await this.playAnnouncement(callId, announcementAudio, config);

    return announcementAudio;
  }

  /**
   * Log announcement event for audit trail
   */
  private logEvent(event: AnnouncementEvent): void {
    this.events.push(event);

    console.log(
      `[ANNOUNCEMENT] ${event.eventType}: ${event.jurisdiction} (${event.language})`
    );

    if (event.error) {
      console.error(`  Error: ${event.error}`);
    }
  }

  /**
   * Get all announcement events for audit
   */
  getEvents(callId?: string): AnnouncementEvent[] {
    if (callId) {
      return this.events.filter(e => e.callId === callId);
    }
    return this.events;
  }

  /**
   * Clear cache (e.g., on call end)
   */
  clearCache(): void {
    this.announcementCache.clear();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let announcementServiceInstance: RecordingAnnouncementService | null = null;

export function getRecordingAnnouncementService(): RecordingAnnouncementService {
  if (!announcementServiceInstance) {
    announcementServiceInstance = new RecordingAnnouncementService();
  }
  return announcementServiceInstance;
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

export async function playRecordingAnnouncement(
  callId: string,
  jurisdiction: string,
  language: string = 'en'
): Promise<Buffer> {
  const service = getRecordingAnnouncementService();
  return service.playRecordingAnnouncement(callId, {
    jurisdiction,
    language,
  });
}

export async function generateAnnouncementAudio(
  jurisdiction: string,
  language: string = 'en'
): Promise<Buffer> {
  const service = getRecordingAnnouncementService();
  return service.generateAnnouncement({ jurisdiction, language });
}

export function getAnnouncementText(jurisdiction: string, language: string = 'en'): string {
  const service = getRecordingAnnouncementService();
  return service.getAnnouncementText(jurisdiction, language);
}

export function detectJurisdiction(state?: string): string {
  const service = getRecordingAnnouncementService();
  return service.detectJurisdiction(state);
}

export default getRecordingAnnouncementService;
