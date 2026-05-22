/**
 * Provider Initialization
 * Phase 13.5: Initialize all providers and health monitoring
 */

import { getProviderHealthMonitor } from '@/lib/provider-health-monitor';
import { initializeTranscriptionProviders } from './transcription-providers';
import { initializeTranslationProviders } from './translation-providers';
import { initializeTTSProviders } from './tts-providers';

/**
 * Initialize all AI providers
 * Call this once on app startup
 */
export async function initializeAllProviders(): Promise<void> {
  console.log('🚀 Initializing AI providers...');

  try {
    // Initialize provider executors
    initializeTranscriptionProviders();
    initializeTranslationProviders();
    initializeTTSProviders();

    // Start health monitoring
    const monitor = getProviderHealthMonitor();
    monitor.startMonitoring(60000); // Check every 60 seconds

    // Register alert handler
    monitor.onAlert((alert) => {
      // TODO: Send alerts to monitoring system (Datadog, Sentry, etc.)
      console.warn(`[ALERT] ${alert.providerId}: ${alert.message}`);
    });

    console.log('✓ All providers initialized and monitoring started');
  } catch (error) {
    console.error('Failed to initialize providers:', error);
    throw error;
  }
}

/**
 * Shutdown all providers
 * Call on app shutdown
 */
export async function shutdownAllProviders(): Promise<void> {
  const monitor = getProviderHealthMonitor();
  monitor.stopMonitoring();
  console.log('✓ Provider monitoring stopped');
}

// Export all provider functions for easy access
export {
  transcribeAudio,
  initializeTranscriptionProviders,
  getTranscriptionProviderStatus,
  type TranscriptionRequest,
  type TranscriptionResult,
} from './transcription-providers';

export {
  translateText,
  initializeTranslationProviders,
  getTranslationProviderStatus,
  type TranslationRequest,
  type TranslationResult,
} from './translation-providers';

export {
  synthesizeAudio,
  initializeTTSProviders,
  getTTSProviderStatus,
  type TTSRequest,
  type TTSResult,
} from './tts-providers';

// Export monitoring utilities
export {
  getProviderHealthMonitor,
  type ProviderMetrics,
  type HealthAlert,
} from '@/lib/provider-health-monitor';

export {
  getProviderFailoverManager,
  getCircuitBreakerRegistry,
} from '@/lib/provider-failover';
