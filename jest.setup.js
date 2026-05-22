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
