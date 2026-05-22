/**
 * Provider Failover System
 * Phase 13.5: Automatic fallback when primary providers fail
 * Transcription, Translation, and TTS failover chains
 */

import { getCircuitBreakerRegistry } from '@/lib/circuit-breaker';

export interface ProviderChain {
  name: string;
  providers: string[]; // Ordered by preference
}

export interface FailoverResult<T> {
  success: boolean;
  data?: T;
  provider: string;
  error?: string;
  attemptedProviders: string[];
  fallbackUsed: boolean;
}

/**
 * Failover manager for handling provider chains
 */
export class ProviderFailoverManager {
  private chains: Map<string, ProviderChain> = new Map();
  private breakerRegistry = getCircuitBreakerRegistry();
  private executors: Map<
    string,
    (data: any) => Promise<any>
  > = new Map();

  /**
   * Register a provider chain (e.g., STT: [Deepgram, Whisper, Local])
   */
  registerChain(chain: ProviderChain): void {
    this.chains.set(chain.name, chain);
    console.log(
      `📋 Registered provider chain: ${chain.name} → [${chain.providers.join(', ')}]`
    );
  }

  /**
   * Register executor function for a provider
   */
  registerExecutor(
    providerName: string,
    executor: (data: any) => Promise<any>
  ): void {
    this.executors.set(providerName, executor);
  }

  /**
   * Execute with automatic failover
   */
  async executeWithFailover<T>(
    chainName: string,
    input: any
  ): Promise<FailoverResult<T>> {
    const chain = this.chains.get(chainName);
    if (!chain) {
      throw new Error(`Provider chain not found: ${chainName}`);
    }

    const attemptedProviders: string[] = [];
    let lastError: Error | null = null;
    let fallbackUsed = false;

    // Try each provider in chain
    for (let i = 0; i < chain.providers.length; i++) {
      const providerName = chain.providers[i];
      attemptedProviders.push(providerName);

      try {
        // Get circuit breaker for this provider
        const breaker = this.breakerRegistry.getBreaker(providerName);

        // Skip if circuit is open
        if (!breaker.isHealthy()) {
          console.warn(
            `⚠️  Provider "${providerName}" circuit is ${breaker.getState()}, skipping`
          );
          lastError = new Error(`Circuit breaker open for ${providerName}`);
          continue;
        }

        // Get executor for this provider
        const executor = this.executors.get(providerName);
        if (!executor) {
          throw new Error(`No executor registered for provider: ${providerName}`);
        }

        // Execute with circuit breaker protection
        console.log(`🔄 Attempting provider: ${providerName}`);
        const result = await breaker.execute(async () => {
          return await executor(input);
        });

        // Success!
        const isPrimary = i === 0;
        if (!isPrimary) {
          fallbackUsed = true;
          console.log(`⚠️  Using fallback provider: ${providerName}`);
        } else {
          console.log(`✓ Primary provider successful: ${providerName}`);
        }

        return {
          success: true,
          data: result as T,
          provider: providerName,
          attemptedProviders,
          fallbackUsed,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(
          `✗ Provider failed: ${providerName} - ${lastError.message}`
        );

        // Continue to next provider
      }
    }

    // All providers failed
    return {
      success: false,
      provider: '',
      error: lastError?.message || 'All providers failed',
      attemptedProviders,
      fallbackUsed,
    };
  }

  /**
   * Get status of all providers in a chain
   */
  getChainStatus(chainName: string): Record<string, string> {
    const chain = this.chains.get(chainName);
    if (!chain) {
      return { error: `Chain not found: ${chainName}` };
    }

    const status: Record<string, string> = {};
    for (const provider of chain.providers) {
      const breaker = this.breakerRegistry.getBreaker(provider);
      status[provider] = `${breaker.getState()} (${breaker.getMetrics().successRate.toFixed(0)}%)`;
    }

    return status;
  }

  /**
   * Get all registered chains
   */
  getChains(): ProviderChain[] {
    return Array.from(this.chains.values());
  }

  /**
   * Health check for all providers
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    this.executors.forEach((executor, providerName) => {
      const breaker = this.breakerRegistry.getBreaker(providerName);
      health[providerName] = breaker.isHealthy();
    });

    return health;
  }
}

/**
 * Pre-configured failover chains
 */
export const defaultChains = {
  // Speech-to-Text: Deepgram → OpenAI Whisper → Local Whisper.cpp
  transcription: {
    name: 'transcription',
    providers: ['deepgram', 'openai-whisper', 'local-whisper'],
  },

  // Translation: DeepL → Google Translate → Argos
  translation: {
    name: 'translation',
    providers: ['deepl', 'google-translate', 'argos'],
  },

  // Text-to-Speech: ElevenLabs → Piper → Google Cloud TTS
  textToSpeech: {
    name: 'textToSpeech',
    providers: ['elevenlabs', 'piper', 'google-cloud-tts'],
  },
};

// Global instance
let failoverManagerInstance: ProviderFailoverManager | null = null;

/**
 * Get global provider failover manager
 */
export function getProviderFailoverManager(): ProviderFailoverManager {
  if (!failoverManagerInstance) {
    failoverManagerInstance = new ProviderFailoverManager();

    // Register default chains
    Object.values(defaultChains).forEach((chain) => {
      failoverManagerInstance!.registerChain(chain);
    });
  }

  return failoverManagerInstance;
}
