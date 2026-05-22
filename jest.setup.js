// Jest setup file
// Add custom matchers, global test utilities, or environment setup here

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' })

// Set defaults for testing (use env vars if available, fall back to localhost)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost/lifesync_test'
process.env.POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL
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

// Mock fetch for integration tests
const originalFetch = global.fetch

global.fetch = async (input, init) => {
  // If absolute URL, use original fetch
  if (typeof input === 'string' && input.startsWith('http')) {
    return originalFetch(input, init)
  }

  // Convert relative URLs to absolute for testing
  const url = typeof input === 'string'
    ? `http://localhost:3000${input}`
    : input

  // Return mock response for tests
  return new Response(JSON.stringify({ error: 'Test mode' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
}

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
