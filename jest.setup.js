// Jest setup file
// Add custom matchers, global test utilities, or environment setup here

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' })

// Initialize AI providers for testing
try {
  const { initializeTranscriptionProviders, initializeTranslationProviders, initializeTTSProviders } = require('./lib/providers/index.ts')
  initializeTranscriptionProviders()
  initializeTranslationProviders()
  initializeTTSProviders()
} catch (error) {
  // Providers may not be available in all test contexts
  // console.log('AI providers initialization skipped:', error.message)
}

// Set defaults for testing (use env vars if available, fall back to localhost)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost/lifesync_test'
process.env.POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-openai-main'
process.env.OPENAI_WHISPER_API_KEY = process.env.OPENAI_WHISPER_API_KEY || 'test-key-openai'
process.env.DEEPL_API_KEY = process.env.DEEPL_API_KEY || 'test-key-deepl'
process.env.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'test-key-elevenlabs'
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'fcfafc45ead1f13cbbd5d2a60182fe65c6546d78129ccd4c747e474e3d24ae20'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'xVAf+OQGPGOJfjZ4uPr0NsovjpVGS32qs5XntTbJJNU='
process.env.RESEARCH_PIPELINE_CRON_SECRET = process.env.RESEARCH_PIPELINE_CRON_SECRET || 'test-cron-secret'

// Set test environment
process.env.NODE_ENV = 'test'

// Global test configuration
global.testConfig = {
  baseURL: 'http://localhost:3000',
  apiTimeout: 5000,
}

// Mock fetch for integration tests (but allow API calls to pass through)
const originalFetch = global.fetch

global.fetch = async (input, init) => {
  // If absolute URL, use original fetch
  if (typeof input === 'string' && input.startsWith('http')) {
    return originalFetch(input, init)
  }

  // Allow API calls to pass through for testing
  if (typeof input === 'string' && input.startsWith('/api/')) {
    // For API calls, return a mock response or pass through
    // In test environment, we want real API responses for integration tests
    return originalFetch(`http://localhost:3000${input}`, init)
  }

  // For other relative URLs, convert to absolute
  const url = typeof input === 'string'
    ? `http://localhost:3000${input}`
    : input

  // Return mock response for non-API tests
  return new Response(JSON.stringify({ error: 'Test mode' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Mock realtime pipeline globally for integration tests
jest.mock('@/lib/realtime-pipeline', () => ({
  getRealtimePipeline: jest.fn(() => ({
    endCall: jest.fn(async (callId) => ({
      summary: {
        duration: 1000,
        totalChunks: 10,
        averageLatency: 85,
        successRate: 0.99,
      },
      transcripts: {
        original: [],
        translated: [],
      },
    })),
    initializeCall: jest.fn(),
    processAudioChunk: jest.fn(),
  })),
  initializeCall: jest.fn(),
  processAudioChunk: jest.fn(),
  endCall: jest.fn(async () => ({
    summary: { duration: 1000, totalChunks: 10, averageLatency: 85, successRate: 0.99 },
    transcripts: { original: [], translated: [] },
  })),
  getCallMetrics: jest.fn(() => []),
  isHealthy: jest.fn(() => true),
}))

// Mock mediasoup globally for integration tests
jest.mock('@/lib/mediasoup-handler', () => ({
  getMediasoupSFU: jest.fn(() => ({
    getRouterRtpCapabilities: jest.fn(() => ({
      codecs: [],
      headerExtensions: [],
    })),
    closeRoom: jest.fn(async () => {}),
  })),
}))

// Mock recording-announcement-service globally for integration tests
jest.mock('@/lib/recording-announcement-service', () => {
  const twoPartyConsentStates = ['CA', 'FL', 'PA', 'IL', 'NY', 'WA', 'HI', 'MD', 'MT', 'NH', 'NJ', 'VA', 'VT']

  const announcementTemplates = {
    'california': {
      'en': 'California law requires the consent of all parties to a conversation before it can be recorded. By continuing, you consent to this call being recorded.',
      'es': 'La ley de California requiere el consentimiento de todas las partes para grabar una conversación. Al continuar, usted consiente que esta llamada sea grabada.',
      'zh': '加州法律要求在录制对话前获得所有参与者的同意。继续进行，即表示您同意录制此通话。',
    },
    'florida': {
      'en': 'Florida law requires the consent of all parties to a conversation before it can be recorded. By continuing, you consent to this call being recorded.',
      'es': 'La ley de Florida requiere el consentimiento de todas las partes para grabar una conversación. Al continuar, usted consiente que esta llamada sea grabada.',
      'zh': '佛罗里达州法律要求在录制对话前获得所有参与者的同意。继续进行，即表示您同意录制此通话。',
    },
    'two-party-consent': {
      'en': 'This jurisdiction requires consent from all parties before recording. By continuing, you acknowledge that this call is being recorded.',
      'es': 'Esta jurisdicción requiere el consentimiento de todas las partes antes de grabar. Al continuar, usted reconoce que esta llamada está siendo grabada.',
      'zh': '此管辖区要求在录制前获得所有参与者的同意。继续进行，即表示您认可此通话正在录制。',
    },
    'one-party-consent': {
      'en': 'You are being notified that this call is being recorded.',
      'es': 'Se le notifica que esta llamada está siendo grabada.',
      'zh': '您正在被告知此通话正在录制。',
    },
  }

  // Create the mock service instance
  const mockService = {
    detectJurisdiction: jest.fn((state) => {
      if (!state) return 'one-party-consent'
      const upperState = state.toUpperCase()
      return twoPartyConsentStates.includes(upperState) ? 'two-party-consent' : 'one-party-consent'
    }),
    getAnnouncementText: jest.fn((jurisdiction, language = 'en') => {
      const template = announcementTemplates[jurisdiction] || announcementTemplates['one-party-consent']
      return template[language] || template['en']
    }),
    generateAnnouncement: jest.fn(async (config) => ({
      jurisdiction: config.jurisdiction,
      language: config.language,
      duration: 3.5,
      audioUrl: 'mock://announcement-audio',
    })),
    playRecordingAnnouncement: jest.fn(async (callId, config) => ({
      success: true,
      callId,
      jurisdiction: config.jurisdiction,
      language: config.language,
      duration: 3.5,
      audioBuffer: Buffer.from('mock-announcement-audio-data'),
    })),
  }

  return {
    getRecordingAnnouncementService: jest.fn(() => mockService),
    detectJurisdiction: mockService.detectJurisdiction,
    getAnnouncementText: mockService.getAnnouncementText,
    generateAnnouncement: mockService.generateAnnouncement,
    playRecordingAnnouncement: mockService.playRecordingAnnouncement,
  }
})

// Suppress console output during tests unless there's an error
const originalError = console.error
const originalLog = console.log
const originalWarn = console.warn

beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Not implemented: HTMLFormElement.prototype.submit') ||
        args[0].includes('Error: ENOENT') ||
        args[0].includes('Cannot find module'))
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
  console.log = originalLog
  console.warn = originalWarn
})
