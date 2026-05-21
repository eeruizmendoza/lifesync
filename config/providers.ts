/**
 * AI/ML Provider Configuration
 * Defines all available providers for speech, translation, and TTS
 * Auto-selects best provider based on language and performance metrics
 */

export interface AIProvider {
  name: string;
  type: 'speech' | 'translation' | 'tts';
  accuracy?: number; // 0-1 scale
  latency?: number; // milliseconds
  naturalness?: number; // 0-1 for TTS/voices
  languages: string[];
  costPerMinute?: number;
  costPerMillion?: number;
  specialization?: string;
  apiKey?: string;
  isActive: boolean;
  fallbackPriority: number; // Lower = preferred fallback
  lastUpdated: Date;
}

// ============================================================================
// SPEECH-TO-TEXT PROVIDERS
// ============================================================================

export const SPEECH_TO_TEXT_PROVIDERS: AIProvider[] = [
  {
    name: 'OpenAI-Whisper-v3',
    type: 'speech',
    accuracy: 0.987,
    latency: 250,
    languages: [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'ko',
      'ar', 'hi', 'pl', 'tr', 'nl', 'sv', 'no', 'da', 'fi', 'cs'
    ],
    costPerMinute: 0.0001,
    isActive: true,
    fallbackPriority: 1,
    lastUpdated: new Date('2026-05-15'),
  },
  {
    name: 'Deepgram-Nova-2',
    type: 'speech',
    accuracy: 0.985,
    latency: 180, // Faster for real-time
    languages: [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'ko'
    ],
    costPerMinute: 0.0043,
    isActive: true,
    fallbackPriority: 2,
    lastUpdated: new Date('2026-04-20'),
  },
  {
    name: 'Google-Speech-v2',
    type: 'speech',
    accuracy: 0.984,
    latency: 200,
    languages: [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'ko',
      'ar', 'hi', 'th', 'vi', 'tr', 'nl', 'pl', 'sv'
    ],
    costPerMinute: 0.00144,
    isActive: true,
    fallbackPriority: 3,
    lastUpdated: new Date('2026-03-10'),
  },
  {
    name: 'Meta-Seamless-M4T-v2',
    type: 'speech',
    accuracy: 0.989,
    latency: 150, // Direct translation, very fast
    languages: [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'ko',
      'ar', 'hi', 'th', 'vi', 'tr', 'nl', 'pl', 'sv', 'no', 'da',
      'fi', 'cs', 'hu', 'el', 'he', 'id', 'ms', 'ro', 'sk', 'sl',
      'uk', 'bg', 'et', 'lt', 'lv'
    ],
    costPerMinute: 0,
    specialization: 'direct-speech-translation',
    isActive: true,
    fallbackPriority: 0, // Highest priority (open source)
    lastUpdated: new Date('2026-06-01'),
  },
];

// ============================================================================
// TRANSLATION PROVIDERS
// ============================================================================

export const TRANSLATION_PROVIDERS: AIProvider[] = [
  {
    name: 'DeepL-v3',
    type: 'translation',
    accuracy: 0.98,
    latency: 150,
    languages: [
      'en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'zh', 'ko'
    ],
    costPerMillion: 0.000015,
    specialization: 'high-quality',
    isActive: true,
    fallbackPriority: 1,
    lastUpdated: new Date('2026-05-20'),
  },
  {
    name: 'Meta-Seamless-M4T-v2',
    type: 'translation',
    accuracy: 0.94,
    latency: 120, // Direct speech-to-speech
    languages: Array.from({ length: 100 }, (_, i) => `lang${i}`), // 100+ languages
    costPerMillion: 0,
    specialization: 'multilingual-open-source',
    isActive: true,
    fallbackPriority: 0, // Preferred (open source)
    lastUpdated: new Date('2026-06-01'),
  },
  {
    name: 'Google-Translate-v5',
    type: 'translation',
    accuracy: 0.91,
    latency: 180,
    languages: Array.from({ length: 130 }, (_, i) => `lang${i}`), // 130+ languages
    costPerMillion: 0.000001,
    isActive: true,
    fallbackPriority: 2,
    lastUpdated: new Date('2026-04-15'),
  },
  {
    name: 'Argos-Translate',
    type: 'translation',
    accuracy: 0.85,
    latency: 80, // Fast local translation
    languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko'],
    costPerMillion: 0,
    specialization: 'open-source-lightweight',
    isActive: true,
    fallbackPriority: 3,
    lastUpdated: new Date('2026-02-01'),
  },
];

// ============================================================================
// TEXT-TO-SPEECH PROVIDERS
// ============================================================================

export const TEXT_TO_SPEECH_PROVIDERS: AIProvider[] = [
  {
    name: 'ElevenLabs-v3',
    type: 'tts',
    naturalness: 0.96,
    latency: 200,
    languages: [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'ko',
      'ar', 'hi', 'nl', 'pl', 'sv', 'tr'
    ],
    costPerMillion: 0.030,
    specialization: 'natural-voices',
    isActive: true,
    fallbackPriority: 0, // Best quality
    lastUpdated: new Date('2026-05-25'),
  },
  {
    name: 'Kokoro-TTS',
    type: 'tts',
    naturalness: 0.93,
    latency: 100, // Very fast
    languages: ['en', 'ja', 'zh'],
    costPerMillion: 0,
    specialization: 'open-source-fast',
    isActive: true,
    fallbackPriority: 1,
    lastUpdated: new Date('2026-06-01'),
  },
  {
    name: 'Piper-TTS',
    type: 'tts',
    naturalness: 0.88,
    latency: 150,
    languages: [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'ko',
      'nl', 'pl', 'tr'
    ],
    costPerMillion: 0,
    specialization: 'open-source',
    isActive: true,
    fallbackPriority: 2,
    lastUpdated: new Date('2026-03-15'),
  },
  {
    name: 'Google-Cloud-TTS-v3',
    type: 'tts',
    naturalness: 0.91,
    latency: 180,
    languages: Array.from({ length: 140 }, (_, i) => `lang${i}`), // 140+ languages
    costPerMillion: 0.016,
    isActive: true,
    fallbackPriority: 3,
    lastUpdated: new Date('2026-04-10'),
  },
];

// ============================================================================
// PROVIDER SELECTION UTILITIES
// ============================================================================

/**
 * Select best speech-to-text provider
 * Considers language, latency priority, and cost
 */
export function selectBestSpeechProvider(
  language: string,
  priority: 'accuracy' | 'latency' | 'cost' = 'latency'
): AIProvider {
  const compatible = SPEECH_TO_TEXT_PROVIDERS.filter(
    p => p.isActive && p.languages.includes(language)
  );

  if (compatible.length === 0) {
    throw new Error(`No speech provider available for language: ${language}`);
  }

  return compatible.sort((a, b) => {
    if (priority === 'accuracy') {
      return (b.accuracy || 0) - (a.accuracy || 0);
    } else if (priority === 'latency') {
      return (a.latency || 999) - (b.latency || 999);
    } else {
      return (a.costPerMinute || 0) - (b.costPerMinute || 0);
    }
  })[0];
}

/**
 * Select best translation provider
 */
export function selectBestTranslationProvider(
  sourceLang: string,
  targetLang: string,
  priority: 'accuracy' | 'latency' | 'cost' = 'accuracy'
): AIProvider {
  const compatible = TRANSLATION_PROVIDERS.filter(
    p => p.isActive && p.languages.includes(sourceLang) && p.languages.includes(targetLang)
  );

  if (compatible.length === 0) {
    throw new Error(
      `No translation provider available for pair: ${sourceLang}-${targetLang}`
    );
  }

  return compatible.sort((a, b) => {
    if (priority === 'accuracy') {
      return (b.accuracy || 0) - (a.accuracy || 0);
    } else if (priority === 'latency') {
      return (a.latency || 999) - (b.latency || 999);
    } else {
      return (a.costPerMillion || 0) - (b.costPerMillion || 0);
    }
  })[0];
}

/**
 * Select best TTS provider
 */
export function selectBestTTSProvider(
  language: string,
  priority: 'naturalness' | 'latency' | 'cost' = 'naturalness'
): AIProvider {
  const compatible = TEXT_TO_SPEECH_PROVIDERS.filter(
    p => p.isActive && p.languages.includes(language)
  );

  if (compatible.length === 0) {
    throw new Error(`No TTS provider available for language: ${language}`);
  }

  return compatible.sort((a, b) => {
    if (priority === 'naturalness') {
      return (b.naturalness || 0) - (a.naturalness || 0);
    } else if (priority === 'latency') {
      return (a.latency || 999) - (b.latency || 999);
    } else {
      return (a.costPerMillion || 0) - (b.costPerMillion || 0);
    }
  })[0];
}

/**
 * Get all providers with fallback order
 */
export function getProvidersWithFallback(
  type: 'speech' | 'translation' | 'tts'
): AIProvider[] {
  const all = type === 'speech'
    ? SPEECH_TO_TEXT_PROVIDERS
    : type === 'translation'
    ? TRANSLATION_PROVIDERS
    : TEXT_TO_SPEECH_PROVIDERS;

  return all
    .filter(p => p.isActive)
    .sort((a, b) => a.fallbackPriority - b.fallbackPriority);
}
