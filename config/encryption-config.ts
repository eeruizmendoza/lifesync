/**
 * Encryption Configuration
 * Centralized settings for all encryption operations
 */

export const ENCRYPTION_CONFIG = {
  // =========================================================================
  // KEY DERIVATION SETTINGS
  // =========================================================================

  keyDerivation: {
    // Argon2id parameters (most secure)
    argon2id: {
      algorithm: 'argon2id',
      timeCost: 4, // OPSLIMIT_SENSITIVE
      memoryCost: 536870912, // 512MB (MEMLIMIT_SENSITIVE)
      parallelism: 1,
      saltLength: 16,
      keyLength: 32, // 256-bit
      version: 19,
    },

    // PBKDF2 fallback (for Node.js without libsodium)
    pbkdf2: {
      algorithm: 'pbkdf2',
      iterations: 600_000, // 6x standard for better security
      digest: 'sha256',
      saltLength: 16,
      keyLength: 32, // 256-bit
    },

    // Default (use Argon2id when possible)
    default: 'argon2id',
  },

  // =========================================================================
  // SYMMETRIC ENCRYPTION SETTINGS
  // =========================================================================

  symmetric: {
    // XChaCha20-Poly1305 (modern, secure)
    xChaCha20Poly1305: {
      algorithm: 'chacha20-poly1305', // Node.js name
      keyLength: 32, // 256-bit
      nonceLength: 24, // 192-bit (XChaCha20)
      saltLength: 16,
      tagLength: 16,
      encoding: 'base64',
    },

    // ChaCha20-Poly1305 (Node.js native)
    chaChaPoly1305: {
      algorithm: 'chacha20-poly1305',
      keyLength: 32,
      nonceLength: 12, // 96-bit (standard ChaCha20)
      saltLength: 16,
      tagLength: 16,
      encoding: 'base64',
    },

    // Default
    default: 'xChaCha20Poly1305',
  },

  // =========================================================================
  // HASHING SETTINGS
  // =========================================================================

  hashing: {
    // For searchable encryption
    search: {
      algorithm: 'sha256',
      encoding: 'hex',
    },

    // For authentication
    authentication: {
      algorithm: 'sha256',
    },

    // Password hashing
    password: {
      algorithm: 'bcrypt',
      rounds: 10,
    },
  },

  // =========================================================================
  // FILE ENCRYPTION SETTINGS
  // =========================================================================

  files: {
    // Chunk size for large file encryption
    chunkSize: 1024 * 1024, // 1MB chunks

    // Maximum file size for encryption
    maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB

    // Supported file types
    supportedTypes: [
      // Audio
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',

      // Video
      'video/webm',
      'video/mp4',
      'video/quicktime',

      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

      // Generic
      'application/octet-stream',
    ],
  },

  // =========================================================================
  // PER-CONVERSATION KEY DERIVATION
  // =========================================================================

  perConversation: {
    // HKDF parameters for deriving per-conversation keys
    hkdf: {
      algorithm: 'sha256',
      keyLength: 32, // 256-bit
    },
  },

  // =========================================================================
  // SIGNAL PROTOCOL SETTINGS (Future)
  // =========================================================================

  signalProtocol: {
    enabled: false, // Enable when library is available
    doubleRatchetSteps: 100,
    chainKeyLength: 32,
    messageKeyLength: 32,
  },

  // =========================================================================
  // POST-QUANTUM CRYPTOGRAPHY (Future)
  // =========================================================================

  postQuantum: {
    enabled: false, // Enable when standard is finalized
    algorithm: 'kyber1024',
    keyLength: 3168,
    ciphertextLength: 3088,
  },

  // =========================================================================
  // ROTATION POLICIES
  // =========================================================================

  rotation: {
    // How often to rotate master key
    masterKeyRotationDays: 365,

    // How often to rotate per-user keys
    userKeyRotationDays: 180,

    // How often to rotate per-conversation keys
    conversationKeyRotationDays: 90,

    // Minimum time between rotations
    minimumRotationIntervalDays: 1,
  },

  // =========================================================================
  // PERFORMANCE SETTINGS
  // =========================================================================

  performance: {
    // Enable encryption caching (not recommended for all data)
    enableCache: false,
    cacheTTLSeconds: 3600,

    // Enable parallel encryption for large files
    parallelEncryption: true,
    maxParallelChunks: 4,

    // Streaming encryption for real-time data
    enableStreaming: true,
  },

  // =========================================================================
  // SECURITY LEVELS
  // =========================================================================

  securityLevels: {
    // Level 1: Standard (for non-sensitive data)
    standard: {
      keyDerivation: 'pbkdf2',
      iterations: 100_000,
      encryption: 'chaChaPoly1305',
    },

    // Level 2: High (default for user data)
    high: {
      keyDerivation: 'argon2id',
      encryption: 'xChaCha20Poly1305',
    },

    // Level 3: Maximum (for highly sensitive data)
    maximum: {
      keyDerivation: 'argon2id',
      encryption: 'xChaCha20Poly1305',
      additionalVerification: true,
      requiresSignalProtocol: true,
    },

    default: 'high',
  },

  // =========================================================================
  // ERROR HANDLING
  // =========================================================================

  errors: {
    // Throw on decryption failure
    throwOnDecryptionFailure: true,

    // Log decryption failures
    logFailures: true,

    // Return null instead of throwing
    gracefulFailure: false,
  },

  // =========================================================================
  // AUDIT & COMPLIANCE
  // =========================================================================

  audit: {
    // Log all encryption operations
    logOperations: true,

    // Audit level: 'none', 'basic', 'detailed'
    auditLevel: 'basic',

    // Retain logs for N days
    retentionDays: 90,
  },

  // =========================================================================
  // ENVIRONMENT-SPECIFIC SETTINGS
  // =========================================================================

  byEnvironment: {
    development: {
      securityLevel: 'standard',
      logEncryption: true,
      enableMocking: false,
    },

    staging: {
      securityLevel: 'high',
      logEncryption: true,
      enableMocking: false,
    },

    production: {
      securityLevel: 'maximum',
      logEncryption: true,
      enableMocking: false,
      auditLevel: 'detailed',
    },
  },
};

/**
 * Get environment-specific config
 */
export function getEncryptionConfigForEnvironment(): typeof ENCRYPTION_CONFIG {
  const env = process.env.NODE_ENV || 'development';
  const envConfig = ENCRYPTION_CONFIG.byEnvironment[env as keyof typeof ENCRYPTION_CONFIG.byEnvironment];

  if (!envConfig) {
    console.warn(`Unknown environment: ${env}, using development config`);
    return ENCRYPTION_CONFIG;
  }

  return {
    ...ENCRYPTION_CONFIG,
    ...envConfig,
  };
}

/**
 * Validate encryption configuration
 */
export function validateEncryptionConfig(): boolean {
  const config = getEncryptionConfigForEnvironment();

  // Validate key lengths
  if (config.symmetric.xChaCha20Poly1305.keyLength !== 32) {
    throw new Error('XChaCha20-Poly1305 key must be 32 bytes');
  }

  // Validate nonce lengths
  if (config.symmetric.xChaCha20Poly1305.nonceLength < 12) {
    throw new Error('Nonce length must be at least 12 bytes');
  }

  // Validate salt lengths
  if (config.keyDerivation.pbkdf2.saltLength < 16) {
    throw new Error('Salt length must be at least 16 bytes');
  }

  return true;
}

/**
 * Get security level config
 */
export function getSecurityLevelConfig(level: 'standard' | 'high' | 'maximum' = 'high') {
  return ENCRYPTION_CONFIG.securityLevels[level];
}

/**
 * Default export
 */
export default ENCRYPTION_CONFIG;
